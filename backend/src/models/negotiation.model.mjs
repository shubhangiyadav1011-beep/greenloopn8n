import { randomUUID } from 'node:crypto';

const messageFromRow = row => ({
  id: row.id,
  senderRole: row.sender_role,
  senderName: row.sender_name,
  body: row.body,
  createdAt: row.created_at,
});

const proposalFromRow = row => ({
  id: row.id,
  version: row.version,
  proposedBy: row.proposed_by,
  status: row.status,
  quantityT: row.quantity_t,
  pricePerT: row.price_per_t,
  destination: row.destination,
  slotId: row.slot_id,
  ...(row.provider_approved_at ? { providerApprovedAt: row.provider_approved_at } : {}),
  ...(row.receiver_approved_at ? { receiverApprovedAt: row.receiver_approved_at } : {}),
  createdAt: row.created_at,
  ...(row.booking_id ? { bookingId: row.booking_id } : {}),
});

export function createNegotiationModel(db) {
  const messagesFor = offerId => db.prepare('SELECT * FROM negotiation_messages WHERE offer_id=? ORDER BY created_at, id').all(offerId).map(messageFromRow);
  const proposalsFor = offerId => db.prepare('SELECT * FROM final_terms_proposals WHERE offer_id=? ORDER BY version').all(offerId).map(proposalFromRow);

  return {
    ensure(offerId, providerUserId, receiverUserId, createdAt) {
      db.prepare('INSERT OR IGNORE INTO negotiations VALUES (?, ?, ?, ?)').run(offerId, providerUserId, receiverUserId, createdAt);
    },
    participant(offerId, userId) {
      return db.prepare('SELECT * FROM negotiations WHERE offer_id=? AND (provider_user_id=? OR receiver_user_id=?)').get(offerId, userId, userId);
    },
    addMessage({ offerId, senderUserId, senderRole, senderName, body, createdAt }) {
      const id = randomUUID();
      db.prepare('INSERT INTO negotiation_messages VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, offerId, senderUserId, senderRole, senderName, body, createdAt);
      return messageFromRow({ id, sender_role: senderRole, sender_name: senderName, body, created_at: createdAt });
    },
    messagesFor,
    proposalsFor,
    currentProposal(offerId) {
      const row = db.prepare("SELECT * FROM final_terms_proposals WHERE offer_id=? AND status!='superseded' ORDER BY version DESC LIMIT 1").get(offerId);
      return row ? proposalFromRow(row) : undefined;
    },
    createProposal({ offerId, proposedBy, quantityT, pricePerT, destination, slotId, createdAt }) {
      const id = randomUUID();
      const nextVersion = Number(db.prepare('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM final_terms_proposals WHERE offer_id=?').get(offerId).version);
      const status = proposedBy === 'provider' ? 'awaiting_receiver_approval' : 'awaiting_provider_approval';
      db.prepare("UPDATE final_terms_proposals SET status='superseded' WHERE offer_id=? AND status IN ('awaiting_provider_approval', 'awaiting_receiver_approval', 'approved')").run(offerId);
      db.prepare(`INSERT INTO final_terms_proposals
        (id, offer_id, version, proposed_by, status, quantity_t, price_per_t, destination, slot_id, provider_approved_at, receiver_approved_at, created_at, booking_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
        .run(id, offerId, nextVersion, proposedBy, status, quantityT, pricePerT, destination, slotId,
          proposedBy === 'provider' ? createdAt : null,
          proposedBy === 'receiver' ? createdAt : null,
          createdAt);
      return this.currentProposal(offerId);
    },
    approveProposal(offerId, proposalId, role, approvedAt) {
      const column = role === 'provider' ? 'provider_approved_at' : 'receiver_approved_at';
      const waiting = role === 'provider' ? 'awaiting_provider_approval' : 'awaiting_receiver_approval';
      const result = db.prepare(`UPDATE final_terms_proposals SET ${column}=? WHERE id=? AND offer_id=? AND status=? AND ${column} IS NULL`)
        .run(approvedAt, proposalId, offerId, waiting);
      return Number(result.changes) === 1;
    },
    setProposalStatus(proposalId, status, bookingId) {
      if (bookingId) db.prepare('UPDATE final_terms_proposals SET status=?, booking_id=? WHERE id=?').run(status, bookingId, proposalId);
      else db.prepare('UPDATE final_terms_proposals SET status=? WHERE id=?').run(status, proposalId);
    },
    listForUser(userId, offers) {
      const permittedIds = new Map(offers.map(offer => [offer.id, offer.status]));
      const rows = db.prepare('SELECT offer_id FROM negotiations WHERE provider_user_id=? OR receiver_user_id=?').all(userId, userId);
      return rows.flatMap(({ offer_id: offerId }) => {
        const offerStatus = permittedIds.get(offerId);
        if (!offerStatus) return [];
        const proposals = proposalsFor(offerId);
        const current = proposals.at(-1);
        const status = offerStatus === 'declined' ? 'declined'
          : offerStatus === 'withdrawn' ? 'withdrawn'
            : offerStatus === 'accepted' ? 'confirmed'
              : current?.status ?? 'negotiating';
        return [{ offerId, status, messages: messagesFor(offerId), proposals }];
      });
    },
  };
}
