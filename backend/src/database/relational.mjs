// Explicit relational mapping. JSONB is limited to structured values (coordinates,
// estimate ranges and ranked matching explanations), never an entity/dataset blob.
export const entities = [
  ['projects', 'projects', 'name location status surveyedAt lastActivityAt geo', true],
  ['receivers', 'receiver_facilities', 'name location websiteUrl researchHistory manualDetails manualDetailsHistory dailyIntakeT currentStockT acceptedTypes distanceKm distanceKnown geo', true],
  ['materials', 'material_passports', 'projectId type quantityT originalUnit originalQuantity conversionFactor quantityRangeT condition grade surveyedAt status confidence surveyNotes pricePerT availableFrom geo archivedAt listingStatus name dimensions provenance verificationStatus verificationNotes rejectionReason verifiedAt verifiedBy reviewedAt reviewedBy verificationAudit', true],
  ['slots', 'receiver_capacity', 'receiverId date materialType capacityT'],
  ['demands', 'receiver_demands', 'receiverId materialType requiredT period location status createdAt notes budgetPerT geo targetProviderId targetProviderName targetMaterialId archivedAt', true],
  ['allocations', 'allocations', 'materialId receiverId slotId requestedT status holdReason capacityBeforeT capacityAfterT decidedAt updatedAt candidates'],
  ['offers', 'offers', 'demandId providerId passportId offeredQuantityT status createdAt pricePerT agreedPricePerT archivedAt'],
  ['bookings', 'bookings', 'allocationId slotId receiverId materialId tonnesT status holdReason capacityBeforeT capacityAfterT createdAt updatedAt demandId receiverAcceptedAt loadRef cancelledAt cancelledReason agreedPricePerT archivedAt'],
  ['verifications', 'verifications', 'bookingId loadRef materialId receiverId plannedT actualT acceptedT rejectedT rejectReason status verifiedAt'],
  ['events', 'audit_events', 'at kind actor summary detail subjectIds'],
  ['supportRequests', 'support_requests', 'email subject message submittedAt', true],
].map(([key, table, fields, owned]) => ({ key, table, fields: fields.split(' '), owned: Boolean(owned) }));

export const jsonFields = new Set(['geo', 'quantityRangeT', 'candidates', 'actor', 'researchHistory', 'manualDetails', 'manualDetailsHistory', 'provenance', 'verificationAudit', 'metadata']);
export const profileFields = 'name organization location vat phone workspaces activeWorkspace receiverId'.split(' ');
export const authTables = {
  users: ['id', 'email', 'password', ...profileFields],
  sessions: ['token', 'user_id', 'expires'],
  resets: ['token', 'user_id', 'expires'],
  google_identities: ['subject', 'user_id'],
  oauth_states: ['state', 'verifier', 'expires'],
};
export const quote = name => `"${name}"`;
export const emptyDataset = () => Object.fromEntries(entities.map(({ key }) => [key, []]));

export function flatten(snapshot) {
  const tables = {};
  for (const [table, fields] of Object.entries(authTables)) {
    tables[table] = snapshot[table].map(row => {
      if (table !== 'users') return { ...row };
      const profile = JSON.parse(row.profile);
      return Object.fromEntries(fields.map(field => [field, ['id', 'email', 'password'].includes(field) ? row[field] ?? null : profile[field] ?? null]));
    });
  }
  tables.organizations = snapshot.users.map(user => ({ id: user.id, name: JSON.parse(user.profile).organization || JSON.parse(user.profile).name || user.email }));
  tables.user_organizations = snapshot.users.map(user => ({ user_id: user.id, organization_id: user.id }));
  for (const { key, table, fields, owned } of entities) {
    tables[table] = snapshot.dataset[key].map((item, position) => ({
      id: item.id,
      position,
      ...Object.fromEntries(fields.map(field => {
        let val = item[field] ?? null;
        if (['researchHistory', 'manualDetailsHistory'].includes(field) && val === null) val = [];
        return [field, val];
      })),
      ...(owned ? { organization_id: snapshot.owners[item.id] } : {}),
    }));
  }
  tables.material_evidence = [];
  for (const key of ['materials', 'verifications']) {
    for (const parent of snapshot.dataset[key]) for (const [position, item] of (parent.evidence ?? []).entries()) {
      tables.material_evidence.push({
        id: item.id ?? `${parent.id}:${position}`,
        material_id: key === 'materials' ? parent.id : null,
        verification_id: key === 'verifications' ? parent.id : null,
        position,
        kind: item.kind,
        label: item.label,
        ref: item.ref ?? null,
        recorded_at: item.recordedAt,
        status: item.status ?? null,
        notes: item.notes ?? null,
        rejection_reason: item.rejectionReason ?? null,
        verified_at: item.verifiedAt ?? null,
        verified_by: item.verifiedBy ?? null,
        metadata: item.metadata ?? null,
      });
    }
  }
  tables.offer_counters = snapshot.dataset.offers.flatMap(offer => (offer.counters ?? []).map((item, position) => ({ id: `${offer.id}:${position}`, offer_id: offer.id, position, actor: item.actor, price_per_t: item.pricePerT, at: item.at })));
  tables.notifications = snapshot.users.flatMap(user => (JSON.parse(user.profile).readEventIds ?? []).map(event => ({ id: `${user.id}:${event}`, user_id: user.id, event_id: event })));
  tables.uploads = snapshot.uploads.map(({ content, ...row }) => row);
  tables.negotiations = (snapshot.negotiations ?? []).map(row => ({ ...row }));
  tables.negotiation_messages = (snapshot.negotiation_messages ?? []).map(row => ({ ...row }));
  tables.final_terms_proposals = (snapshot.final_terms_proposals ?? []).map(row => ({ ...row }));
  tables.payment_attempts = (snapshot.payment_attempts ?? []).map(row => ({ ...row }));
  tables.payment_webhook_events = (snapshot.payment_webhook_events ?? []).map(row => ({ ...row }));
  return tables;
}

export function hydrate(tables) {
  // Keep the baseline immutable; appending a session/upload must be detected
  // as an INSERT, and failed actions must never mutate the original rows.
  tables = structuredClone(tables);
  const snapshot = {
    dataset: emptyDataset(),
    owners: {},
    uploads: tables.uploads,
    negotiations: tables.negotiations ?? [],
    negotiation_messages: tables.negotiation_messages ?? [],
    final_terms_proposals: tables.final_terms_proposals ?? [],
    payment_attempts: tables.payment_attempts ?? [],
    payment_webhook_events: tables.payment_webhook_events ?? [],
  };
  for (const table of Object.keys(authTables)) snapshot[table] = tables[table];
  snapshot.users = tables.users.map(row => ({ id: row.id, email: row.email, password: row.password, profile: JSON.stringify({ ...Object.fromEntries(profileFields.filter(field => row[field] !== null).map(field => [field, row[field]])), readEventIds: tables.notifications.filter(item => item.user_id === row.id).map(item => item.event_id) }) }));
  for (const { key, table, fields, owned } of entities) {
    snapshot.dataset[key] = tables[table].map(row => {
      if (owned) snapshot.owners[row.id] = row.organization_id;
      const entity = { id: row.id, ...Object.fromEntries(fields.filter(field => row[field] !== null).map(field => [field, row[field]])) };
      if (key === 'receivers') {
        entity.researchHistory ??= [];
        entity.manualDetailsHistory ??= [];
      }
      return entity;
    });
  }
  for (const [key, parentField] of [['materials', 'material_id'], ['verifications', 'verification_id']]) {
    for (const parent of snapshot.dataset[key]) parent.evidence = tables.material_evidence.filter(item => item[parentField] === parent.id).map(item => ({
      ...(item.id && !item.id.startsWith(`${parent.id}:`) ? { id: item.id } : {}),
      kind: item.kind,
      label: item.label,
      ...(item.ref === null ? {} : { ref: item.ref }),
      recordedAt: item.recorded_at,
      ...(item.status ? { status: item.status } : {}),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.rejection_reason ? { rejectionReason: item.rejection_reason } : {}),
      ...(item.verified_at ? { verifiedAt: item.verified_at } : {}),
      ...(item.verified_by ? { verifiedBy: item.verified_by } : {}),
      ...(item.metadata ? { metadata: item.metadata } : {}),
    }));
  }
  for (const offer of snapshot.dataset.offers) offer.counters = tables.offer_counters.filter(item => item.offer_id === offer.id).map(item => ({ actor: item.actor, pricePerT: item.price_per_t, at: item.at }));
  return snapshot;
}

export const negotiationTables = ['negotiations', 'negotiation_messages', 'final_terms_proposals', 'payment_attempts', 'payment_webhook_events'];
export const tableOrder = ['users', 'organizations', 'user_organizations', 'sessions', 'resets', 'google_identities', 'oauth_states', ...entities.map(item => item.table), 'material_evidence', 'offer_counters', 'notifications', 'uploads', ...negotiationTables];
export const primaryKeys = {
  users: 'id',
  organizations: 'id',
  user_organizations: 'user_id',
  sessions: 'token',
  resets: 'token',
  google_identities: 'subject',
  oauth_states: 'state',
  negotiations: 'offer_id',
  negotiation_messages: 'id',
  final_terms_proposals: 'id',
  payment_attempts: 'id',
  payment_webhook_events: 'event_id',
};

export async function readTables(client) {
  // One round trip keeps five-second refresh practical over a remote database.
  // All identifiers come from the fixed mapping above, never request input.
  const selections = tableOrder.map(table => {
    const ordered = entities.some(item => item.table === table) || ['material_evidence', 'offer_counters'].includes(table);
    return `'${table}', (SELECT coalesce(jsonb_agg(to_jsonb(t)${ordered ? ' ORDER BY position' : ''}), '[]'::jsonb) FROM greenloop.${quote(table)} t)`;
  });
  const raw = (await client.query(`SELECT jsonb_build_object(${selections.join(',')}) AS tables`)).rows[0].tables;
  const tables = {};
  for (const table of tableOrder) {
    tables[table] = raw[table].map(row => {
      // pg returns timestamps as Date and bigint as strings; preserve API numbers/ISO strings.
      const clean = { ...row };
      delete clean.inserted_at;
      if (table !== 'payment_attempts') delete clean.updated_at;
      for (const [key, value] of Object.entries(clean)) {
        if (value instanceof Date) clean[key] = value.toISOString();
        else if (value !== null && (key.endsWith('At') || key === 'at' || key === 'recorded_at' || key.endsWith('_at'))) clean[key] = new Date(value).toISOString();
        if (value !== null && (key === 'expires' || key === 'size_bytes' || key.endsWith('_minor') || key === 'version' || key.endsWith('_t') || key === 'amount_minor')) clean[key] = Number(value);
      }
      return clean;
    });
  }
  return tables;
}

export async function writeChanges(client, before, after) {
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  for (const table of [...tableOrder].reverse()) {
    const pk = primaryKeys[table] ?? 'id';
    const remaining = new Set(after[table].map(row => row[pk]));
    for (const row of before[table]) if (!remaining.has(row[pk])) await client.query(`DELETE FROM greenloop.${quote(table)} WHERE ${quote(pk)}=$1`, [row[pk]]);
  }
  for (const table of tableOrder) {
    const pk = primaryKeys[table] ?? 'id';
    const old = new Map(before[table].map(row => [row[pk], row]));
    for (const row of after[table]) {
      if (canonical(old.get(row[pk])) === canonical(row)) continue;
      const fields = Object.keys(row);
      const values = fields.map(field => jsonFields.has(field) && (field !== 'actor' || table === 'audit_events') && row[field] !== null ? JSON.stringify(row[field]) : row[field]);
      const assignments = fields.filter(field => field !== pk).map(field => `${quote(field)}=EXCLUDED.${quote(field)}`).join(',');
      const onConflictClause = assignments.length ? `DO UPDATE SET ${assignments}` : 'DO NOTHING';
      await client.query(`INSERT INTO greenloop.${quote(table)} (${fields.map(quote).join(',')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(',')}) ON CONFLICT (${quote(pk)}) ${onConflictClause}`, values);
    }
  }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
