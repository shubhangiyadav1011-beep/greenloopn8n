import { randomUUID } from 'node:crypto';

// Request-local model facade lets the existing synchronous business engine run
// unchanged inside a real PostgreSQL transaction. No process-wide data cache.
export function createSnapshotModels(context) {
  const state = () => {
    const current = context.getStore();
    if (!current) throw new Error('Database model used outside a transaction.');
    return current;
  };
  const rows = table => state().snapshot[table];
  const find = (table, field, value) => rows(table).find(row => row[field] === value);
  const remove = (table, predicate) => { state().snapshot[table] = rows(table).filter(row => !predicate(row)); };
  const toProfile = row => row && ({ id: row.id, email: row.email, ...JSON.parse(row.profile) });
  const userModel = {
    toProfile,
    findById: id => find('users', 'id', id),
    findByEmail: email => find('users', 'email', email),
    findProfileById: id => toProfile(find('users', 'id', id)),
    findProfileByEmail: email => toProfile(find('users', 'email', email)),
    hasEmail: email => Boolean(find('users', 'email', email)),
    create({ id, email, password, profile }) { rows('users').push({ id, email, password, profile: JSON.stringify(profile) }); },
    createGoogleIdentity(subject, input) { this.create({ ...input, password: null }); rows('google_identities').push({ subject, user_id: input.id }); },
    findByGoogleSubject: subject => find('users', 'id', find('google_identities', 'subject', subject)?.user_id),
    updateProfile(user) { const { id, email, ...fields } = user; find('users', 'id', id).profile = JSON.stringify(fields); },
    updatePassword(id, password) { find('users', 'id', id).password = password; },
    publicContact(id) { const row = find('users', 'id', id); return row && { email: row.email, profile: JSON.parse(row.profile) }; },
  };
  const sessionModel = {
    removeExpired: now => remove('sessions', row => row.expires < now),
    create: (token, user_id, expires) => rows('sessions').push({ token, user_id, expires }),
    findUser(token, now) { const session = find('sessions', 'token', token); return session?.expires > now ? find('users', 'id', session.user_id) : undefined; },
    delete: token => remove('sessions', row => row.token === token),
    deleteForUser: id => remove('sessions', row => row.user_id === id),
    createReset(token, user_id, expires) { this.deleteResetsForUser(user_id); rows('resets').push({ token, user_id, expires }); },
    findReset(token, now) { const row = find('resets', 'token', token); return row?.expires > now ? row : undefined; },
    deleteResetsForUser: id => remove('resets', row => row.user_id === id),
    createOAuthState(stateHash, verifier, expires) { remove('oauth_states', row => row.expires < Date.now()); rows('oauth_states').push({ state: stateHash, verifier, expires }); },
    findOAuthState(hash, now) { const row = find('oauth_states', 'state', hash); return row?.expires > now ? row : undefined; },
    deleteOAuthState: hash => remove('oauth_states', row => row.state === hash),
  };
  const datasetModel = {
    initialize() {},
    load: () => structuredClone(state().snapshot.dataset),
    save: dataset => { state().snapshot.dataset = structuredClone(dataset); },
    ownerId: id => state().snapshot.owners[id],
    assignOwner: (id, userId) => { state().snapshot.owners[id] = userId; },
    deleteOwner: id => { delete state().snapshot.owners[id]; },
    transaction(operation) {
      const current = state();
      const savepoint = structuredClone(current.snapshot);
      try { return operation(); } catch (error) { current.snapshot = savepoint; throw error; }
    },
  };
  const uploadModel = {
    ownerId: id => find('uploads', 'id', id)?.user_id,
    totalBytesForUser: id => rows('uploads').filter(row => row.user_id === id).reduce((sum, row) => sum + row.size_bytes, 0),
    create({ id, userId, name, mime, content }) {
      rows('uploads').push({ id, user_id: userId, name, mime, size_bytes: content.length, storage_path: `${userId}/${id}`, content });
    },
    findById: id => find('uploads', 'id', id),
  };

  const messageFromRow = row => ({
    id: row.id,
    senderRole: row.sender_role,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  });

  const proposalFromRow = row => ({
    id: row.id,
    version: Number(row.version),
    proposedBy: row.proposed_by,
    status: row.status,
    quantityT: Number(row.quantity_t),
    pricePerT: Number(row.price_per_t),
    destination: row.destination,
    slotId: row.slot_id,
    ...(row.provider_approved_at ? { providerApprovedAt: row.provider_approved_at } : {}),
    ...(row.receiver_approved_at ? { receiverApprovedAt: row.receiver_approved_at } : {}),
    createdAt: row.created_at,
    ...(row.booking_id ? { bookingId: row.booking_id } : {}),
  });

  const negotiationModel = {
    ensure(offerId, providerUserId, receiverUserId, createdAt) {
      const exists = rows('negotiations').some(r => r.offer_id === offerId);
      if (!exists) {
        rows('negotiations').push({
          offer_id: offerId,
          provider_user_id: providerUserId,
          receiver_user_id: receiverUserId,
          created_at: createdAt,
        });
      }
    },
    participant(offerId, userId) {
      const row = rows('negotiations').find(r => r.offer_id === offerId && (r.provider_user_id === userId || r.receiver_user_id === userId));
      return row ? { ...row } : undefined;
    },
    addMessage({ offerId, senderUserId, senderRole, senderName, body, createdAt }) {
      const id = randomUUID();
      const row = {
        id,
        offer_id: offerId,
        sender_user_id: senderUserId,
        sender_role: senderRole,
        sender_name: senderName,
        body,
        created_at: createdAt,
      };
      rows('negotiation_messages').push(row);
      return messageFromRow(row);
    },
    messagesFor(offerId) {
      return rows('negotiation_messages')
        .filter(r => r.offer_id === offerId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .map(messageFromRow);
    },
    proposalsFor(offerId) {
      return rows('final_terms_proposals')
        .filter(r => r.offer_id === offerId)
        .sort((a, b) => Number(a.version) - Number(b.version))
        .map(proposalFromRow);
    },
    currentProposal(offerId) {
      const active = rows('final_terms_proposals')
        .filter(r => r.offer_id === offerId && r.status !== 'superseded')
        .sort((a, b) => Number(b.version) - Number(a.version));
      return active[0] ? proposalFromRow(active[0]) : undefined;
    },
    createProposal({ offerId, proposedBy, quantityT, pricePerT, destination, slotId, createdAt }) {
      const id = randomUUID();
      const existing = rows('final_terms_proposals').filter(r => r.offer_id === offerId);
      const nextVersion = existing.reduce((max, r) => Math.max(max, Number(r.version)), 0) + 1;
      const status = proposedBy === 'provider' ? 'awaiting_receiver_approval' : 'awaiting_provider_approval';
      for (const p of existing) {
        if (['awaiting_provider_approval', 'awaiting_receiver_approval', 'approved'].includes(p.status)) {
          p.status = 'superseded';
        }
      }
      const newProposal = {
        id,
        offer_id: offerId,
        version: nextVersion,
        proposed_by: proposedBy,
        status,
        quantity_t: quantityT,
        price_per_t: pricePerT,
        destination,
        slot_id: slotId,
        provider_approved_at: proposedBy === 'provider' ? createdAt : null,
        receiver_approved_at: proposedBy === 'receiver' ? createdAt : null,
        created_at: createdAt,
        booking_id: null,
      };
      rows('final_terms_proposals').push(newProposal);
      return proposalFromRow(newProposal);
    },
    approveProposal(offerId, proposalId, role, approvedAt) {
      const column = role === 'provider' ? 'provider_approved_at' : 'receiver_approved_at';
      const waiting = role === 'provider' ? 'awaiting_provider_approval' : 'awaiting_receiver_approval';
      const p = rows('final_terms_proposals').find(r => r.id === proposalId && r.offer_id === offerId && r.status === waiting && r[column] === null);
      if (!p) return false;
      p[column] = approvedAt;
      return true;
    },
    setProposalStatus(proposalId, status, bookingId) {
      const p = rows('final_terms_proposals').find(r => r.id === proposalId);
      if (p) {
        p.status = status;
        if (bookingId) p.booking_id = bookingId;
      }
    },
    listForUser(userId, offers) {
      const permittedIds = new Map(offers.map(offer => [offer.id, offer.status]));
      const rowsList = rows('negotiations').filter(r => r.provider_user_id === userId || r.receiver_user_id === userId);
      return rowsList.flatMap(({ offer_id: offerId }) => {
        const offerStatus = permittedIds.get(offerId);
        if (!offerStatus) return [];
        const proposals = this.proposalsFor(offerId);
        const current = proposals.at(-1);
        const status = offerStatus === 'declined' ? 'declined'
          : offerStatus === 'withdrawn' ? 'withdrawn'
            : offerStatus === 'accepted' ? 'confirmed'
              : current?.status ?? 'negotiating';
        return [{ offerId, status, messages: this.messagesFor(offerId), proposals }];
      });
    },
  };

  const paymentFromRow = (row, includeQr = false) => ({
    bookingId: row.booking_id,
    attemptId: row.id,
    provider: row.provider_name,
    providerReference: row.provider_reference,
    amountMinor: Number(row.amount_minor),
    currency: 'INR',
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.paid_at ? { paidAt: row.paid_at } : {}),
    ...(row.accepted_t !== null && row.accepted_t !== undefined ? { acceptedT: Number(row.accepted_t) } : {}),
    acceptedValueMinor: Number(row.accepted_value_minor ?? 0),
    commissionMinor: Number(row.commission_minor ?? 0),
    providerFeeMinor: Number(row.provider_fee_minor ?? 0),
    refundAmountMinor: Number(row.refund_amount_minor ?? 0),
    refundStatus: row.refund_status,
    payoutAmountMinor: Number(row.payout_amount_minor ?? 0),
    payoutStatus: row.payout_status,
    ...(row.payout_reference ? { payoutReference: row.payout_reference } : {}),
    ...(row.settled_at ? { settledAt: row.settled_at } : {}),
    ...(row.disputed_at ? { disputedAt: row.disputed_at } : {}),
    ...(row.dispute_reason ? { disputeReason: row.dispute_reason } : {}),
    ...(includeQr && row.payment_status === 'pending' ? { qrPayload: row.qr_payload } : {}),
  });

  const paymentModel = {
    createAttempt({ bookingId, payerUserId, providerUserId, providerName, providerReference, qrPayload, amountMinor, createdAt }) {
      const id = `PAY-${randomUUID()}`;
      const row = {
        id,
        booking_id: bookingId,
        payer_user_id: payerUserId,
        provider_user_id: providerUserId,
        provider_name: providerName,
        provider_reference: providerReference,
        qr_payload: qrPayload,
        amount_minor: amountMinor,
        currency: 'INR',
        payment_status: 'pending',
        created_at: createdAt,
        updated_at: createdAt,
        paid_at: null,
        accepted_t: null,
        accepted_value_minor: 0,
        commission_minor: 0,
        provider_fee_minor: 0,
        refund_amount_minor: 0,
        refund_status: 'not_required',
        payout_amount_minor: 0,
        payout_status: 'held',
        payout_reference: null,
        settled_at: null,
        disputed_at: null,
        dispute_reason: null,
      };
      rows('payment_attempts').push(row);
      return paymentFromRow(row, true);
    },
    latestForBooking(bookingId) {
      const attempts = rows('payment_attempts')
        .filter(r => r.booking_id === bookingId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return attempts[0] ? paymentFromRow(attempts[0], true) : undefined;
    },
    adminSummaryForBooking(bookingId) {
      const attempts = rows('payment_attempts')
        .filter(r => r.booking_id === bookingId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return attempts[0] ? paymentFromRow(attempts[0], false) : undefined;
    },
    byProviderReference(providerReference) {
      const row = rows('payment_attempts').find(r => r.provider_reference === providerReference);
      return row ? { ...paymentFromRow(row), payerUserId: row.payer_user_id, providerUserId: row.provider_user_id } : undefined;
    },
    listForBookings(bookingIds, userId) {
      if (!bookingIds.length) return [];
      const matching = rows('payment_attempts')
        .filter(r => bookingIds.includes(r.booking_id) && (r.payer_user_id === userId || r.provider_user_id === userId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return matching.map(row => paymentFromRow(row, row.payer_user_id === userId));
    },
    update(attemptId, updates) {
      const allowed = new Set(['payment_status', 'updated_at', 'paid_at', 'accepted_t', 'accepted_value_minor', 'commission_minor', 'provider_fee_minor', 'refund_amount_minor', 'refund_status', 'payout_amount_minor', 'payout_status', 'payout_reference', 'settled_at', 'disputed_at', 'dispute_reason']);
      const row = rows('payment_attempts').find(r => r.id === attemptId);
      if (!row) return false;
      let changed = false;
      for (const [key, val] of Object.entries(updates)) {
        if (allowed.has(key)) {
          row[key] = val;
          changed = true;
        }
      }
      return changed;
    },
    prepareSettlement(attemptId, updates) {
      const row = rows('payment_attempts').find(r => r.id === attemptId && r.payment_status === 'paid' && r.payout_status === 'held');
      if (!row) return false;
      const allowed = new Set(['payment_status', 'updated_at', 'accepted_t', 'accepted_value_minor', 'commission_minor', 'provider_fee_minor', 'refund_amount_minor', 'refund_status', 'payout_amount_minor', 'payout_status']);
      for (const [key, val] of Object.entries(updates)) {
        if (allowed.has(key)) row[key] = val;
      }
      return true;
    },
    markDisputed(attemptId, updates) {
      const row = rows('payment_attempts').find(r => r.id === attemptId && ['paid', 'adjustment'].includes(r.payment_status) && r.payout_status === 'held');
      if (!row) return false;
      row.payment_status = 'disputed';
      row.payout_status = 'disputed';
      row.disputed_at = updates.disputed_at;
      row.dispute_reason = updates.dispute_reason;
      row.updated_at = updates.updated_at;
      return true;
    },
    recordWebhookEvent({ eventId, providerName, providerReference, eventType, receivedAt, payloadSha256 }) {
      if (rows('payment_webhook_events').some(r => r.event_id === eventId)) return false;
      rows('payment_webhook_events').push({
        event_id: eventId,
        provider_name: providerName,
        provider_reference: providerReference,
        event_type: eventType,
        received_at: receivedAt,
        payload_sha256: payloadSha256,
      });
      return true;
    },
    bookingPayer(bookingId) {
      const attempts = rows('payment_attempts')
        .filter(r => r.booking_id === bookingId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return attempts[0]?.payer_user_id;
    },
    latestRaw(bookingId) {
      const attempts = rows('payment_attempts')
        .filter(r => r.booking_id === bookingId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      return attempts[0] ? { ...attempts[0] } : undefined;
    },
    publicAttempt: paymentFromRow,
  };

  return { datasetModel, userModel, sessionModel, uploadModel, negotiationModel, paymentModel };
}
