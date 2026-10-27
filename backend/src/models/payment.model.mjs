import { randomUUID } from 'node:crypto';

const fromRow = (row, includeQr = false) => ({
  bookingId: row.booking_id,
  attemptId: row.id,
  provider: row.provider_name,
  providerReference: row.provider_reference,
  amountMinor: row.amount_minor,
  currency: 'INR',
  paymentStatus: row.payment_status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.paid_at ? { paidAt: row.paid_at } : {}),
  ...(row.accepted_t !== null ? { acceptedT: row.accepted_t } : {}),
  acceptedValueMinor: row.accepted_value_minor,
  commissionMinor: row.commission_minor,
  providerFeeMinor: row.provider_fee_minor,
  refundAmountMinor: row.refund_amount_minor,
  refundStatus: row.refund_status,
  payoutAmountMinor: row.payout_amount_minor,
  payoutStatus: row.payout_status,
  ...(row.payout_reference ? { payoutReference: row.payout_reference } : {}),
  ...(row.settled_at ? { settledAt: row.settled_at } : {}),
  ...(row.disputed_at ? { disputedAt: row.disputed_at } : {}),
  ...(row.dispute_reason ? { disputeReason: row.dispute_reason } : {}),
  ...(includeQr && row.payment_status === 'pending' ? { qrPayload: row.qr_payload } : {}),
});

export function createPaymentModel(db) {
  const latestRow = bookingId => db.prepare('SELECT * FROM payment_attempts WHERE booking_id=? ORDER BY created_at DESC, id DESC LIMIT 1').get(bookingId);
  return {
    createAttempt({ bookingId, payerUserId, providerUserId, providerName, providerReference, qrPayload, amountMinor, createdAt }) {
      const id = `PAY-${randomUUID()}`;
      db.prepare(`INSERT INTO payment_attempts
        (id, booking_id, payer_user_id, provider_user_id, provider_name, provider_reference, qr_payload, amount_minor, currency, payment_status, created_at, updated_at, refund_status, payout_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'INR', 'pending', ?, ?, 'not_required', 'held')`)
        .run(id, bookingId, payerUserId, providerUserId, providerName, providerReference, qrPayload, amountMinor, createdAt, createdAt);
      return fromRow(db.prepare('SELECT * FROM payment_attempts WHERE id=?').get(id), true);
    },
    latestForBooking: bookingId => {
      const row = latestRow(bookingId);
      return row ? fromRow(row, true) : undefined;
    },
    adminSummaryForBooking(bookingId) {
      const row = latestRow(bookingId);
      return row ? fromRow(row, false) : undefined;
    },
    byProviderReference: providerReference => {
      const row = db.prepare('SELECT * FROM payment_attempts WHERE provider_reference=?').get(providerReference);
      return row ? { ...fromRow(row), payerUserId: row.payer_user_id, providerUserId: row.provider_user_id } : undefined;
    },
    listForBookings(bookingIds, userId) {
      if (!bookingIds.length) return [];
      const placeholders = bookingIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT * FROM payment_attempts WHERE booking_id IN (${placeholders}) AND (payer_user_id=? OR provider_user_id=?) ORDER BY created_at DESC, id DESC`).all(...bookingIds, userId, userId);
      return rows.map(row => fromRow(row, row.payer_user_id === userId));
    },
    update(attemptId, updates) {
      const allowed = new Set(['payment_status', 'updated_at', 'paid_at', 'accepted_t', 'accepted_value_minor', 'commission_minor', 'provider_fee_minor', 'refund_amount_minor', 'refund_status', 'payout_amount_minor', 'payout_status', 'payout_reference', 'settled_at', 'disputed_at', 'dispute_reason']);
      const entries = Object.entries(updates).filter(([key]) => allowed.has(key));
      if (!entries.length) return false;
      const result = db.prepare(`UPDATE payment_attempts SET ${entries.map(([key]) => `${key}=?`).join(', ')} WHERE id=?`).run(...entries.map(([, value]) => value), attemptId);
      return Number(result.changes) === 1;
    },
    prepareSettlement(attemptId, updates) {
      const allowed = new Set(['payment_status', 'updated_at', 'accepted_t', 'accepted_value_minor', 'commission_minor', 'provider_fee_minor', 'refund_amount_minor', 'refund_status', 'payout_amount_minor', 'payout_status']);
      const entries = Object.entries(updates).filter(([key]) => allowed.has(key));
      if (!entries.length) return false;
      const result = db.prepare(`UPDATE payment_attempts SET ${entries.map(([key]) => `${key}=?`).join(', ')} WHERE id=? AND payment_status='paid' AND payout_status='held'`)
        .run(...entries.map(([, value]) => value), attemptId);
      return Number(result.changes) === 1;
    },
    markDisputed(attemptId, updates) {
      const result = db.prepare(`UPDATE payment_attempts SET payment_status='disputed',payout_status='disputed',disputed_at=?,dispute_reason=?,updated_at=?
        WHERE id=? AND payment_status IN ('paid','adjustment') AND payout_status='held'`)
        .run(updates.disputed_at, updates.dispute_reason, updates.updated_at, attemptId);
      return Number(result.changes) === 1;
    },
    recordWebhookEvent({ eventId, providerName, providerReference, eventType, receivedAt, payloadSha256 }) {
      const result = db.prepare('INSERT OR IGNORE INTO payment_webhook_events VALUES (?, ?, ?, ?, ?, ?)').run(eventId, providerName, providerReference, eventType, receivedAt, payloadSha256);
      return Number(result.changes) === 1;
    },
    bookingPayer(bookingId) {
      const row = latestRow(bookingId);
      return row ? row.payer_user_id : undefined;
    },
    latestRaw: latestRow,
    publicAttempt: fromRow,
  };
}
