import { randomUUID } from 'node:crypto';

const attempt = row => row && ({ id: row.id, payerUserId: row.payer_user_id, productType: row.product_type, targetId: row.target_id ?? undefined,
  amountMinor: row.amount_minor, currency: row.currency, provider: row.provider_name, providerReference: row.provider_reference, qrPayload: row.qr_payload,
  status: row.status, createdAt: row.created_at, updatedAt: row.updated_at, paidAt: row.paid_at ?? undefined, refundedAt: row.refunded_at ?? undefined });

export function createMonetizationModel(db) {
  const byId = id => attempt(db.prepare('SELECT * FROM monetization_payment_attempts WHERE id=?').get(id));
  return {
    createAttempt(input) {
      const id = `MON-${randomUUID()}`;
      db.prepare(`INSERT INTO monetization_payment_attempts (id,payer_user_id,product_type,target_id,amount_minor,currency,provider_name,provider_reference,qr_payload,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'INR',?,?,?,'pending',?,?)`).run(id,input.payerUserId,input.productType,input.targetId ?? null,input.amountMinor,input.providerName,input.providerReference,input.qrPayload,input.at,input.at);
      return byId(id);
    },
    byId,
    byProviderReference(reference) { return attempt(db.prepare('SELECT * FROM monetization_payment_attempts WHERE provider_reference=?').get(reference)); },
    update(id, status, at) {
      const paidAt = status === 'paid' ? at : undefined;
      const refundedAt = status === 'refunded' ? at : undefined;
      db.prepare('UPDATE monetization_payment_attempts SET status=?,updated_at=?,paid_at=COALESCE(?,paid_at),refunded_at=COALESCE(?,refunded_at) WHERE id=?').run(status,at,paidAt ?? null,refundedAt ?? null,id);
      return byId(id);
    },
    recordEvent(event) {
      return Number(db.prepare('INSERT OR IGNORE INTO monetization_webhook_events VALUES (?,?,?,?,?,?)').run(event.eventId,event.providerName,event.providerReference,event.eventType,event.receivedAt,event.payloadSha256).changes)===1;
    },
    entitlements() { return db.prepare('SELECT * FROM premium_entitlements ORDER BY updated_at DESC').all().map(row=>({userId:row.user_id,source:row.source,status:row.status,startsAt:row.starts_at,expiresAt:row.expires_at,paymentAttemptId:row.payment_attempt_id??undefined,grantedBy:row.granted_by??undefined,reason:row.reason??undefined,updatedAt:row.updated_at})); },
    entitlement(userId) { const row=db.prepare('SELECT * FROM premium_entitlements WHERE user_id=?').get(userId);return row&&({userId:row.user_id,source:row.source,status:row.status,startsAt:row.starts_at,expiresAt:row.expires_at,paymentAttemptId:row.payment_attempt_id??undefined,grantedBy:row.granted_by??undefined,reason:row.reason??undefined,updatedAt:row.updated_at}); },
    saveEntitlement(value) { db.prepare(`INSERT INTO premium_entitlements (user_id,source,status,starts_at,expires_at,payment_attempt_id,granted_by,reason,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET source=excluded.source,status=excluded.status,starts_at=excluded.starts_at,expires_at=excluded.expires_at,payment_attempt_id=excluded.payment_attempt_id,granted_by=excluded.granted_by,reason=excluded.reason,updated_at=excluded.updated_at`)
      .run(value.userId,value.source,value.status,value.startsAt,value.expiresAt,value.paymentAttemptId??null,value.grantedBy??null,value.reason??null,value.updatedAt);return this.entitlement(value.userId); },
    createPlacement(value) { const id=randomUUID();db.prepare(`INSERT INTO sponsored_placements (id,material_id,provider_user_id,payment_attempt_id,starts_at,expires_at,status,created_at) VALUES (?,?,?,?,?,?,'active',?)`).run(id,value.materialId,value.providerUserId,value.paymentAttemptId,value.startsAt,value.expiresAt,value.startsAt);return id; },
    activePlacement(materialId,at) { return db.prepare("SELECT * FROM sponsored_placements WHERE material_id=? AND status='active' AND starts_at<=? AND expires_at>? ORDER BY expires_at DESC LIMIT 1").get(materialId,at); },
    placements() { return db.prepare('SELECT * FROM sponsored_placements ORDER BY created_at DESC').all().map(row=>({id:row.id,materialId:row.material_id,providerUserId:row.provider_user_id,paymentAttemptId:row.payment_attempt_id,startsAt:row.starts_at,expiresAt:row.expires_at,status:row.status})); },
    activePlacements(at) { return db.prepare("SELECT * FROM sponsored_placements WHERE status='active' AND starts_at<=? AND expires_at>? ORDER BY id").all(at,at).map(row=>({id:row.id,materialId:row.material_id,providerUserId:row.provider_user_id,paymentAttemptId:row.payment_attempt_id,startsAt:row.starts_at,expiresAt:row.expires_at,status:row.status})); },
    expirePlacements(at) { db.prepare("UPDATE sponsored_placements SET status='expired' WHERE status='active' AND expires_at<=?").run(at); },
    placementForAttempt(attemptId) { return db.prepare('SELECT id FROM sponsored_placements WHERE payment_attempt_id=?').get(attemptId); },
    participant(auctionId,userId) { return db.prepare('SELECT * FROM auction_participants WHERE auction_id=? AND receiver_user_id=?').get(auctionId,userId); },
    saveParticipant(value) { db.prepare(`INSERT INTO auction_participants (auction_id,receiver_user_id,payment_attempt_id,status,joined_at,paid_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(auction_id,receiver_user_id) DO UPDATE SET payment_attempt_id=excluded.payment_attempt_id,status=excluded.status,paid_at=excluded.paid_at`)
      .run(value.auctionId,value.userId,value.attemptId,value.status,value.joinedAt,value.paidAt??null); },
    participantStatus(auctionId,userId) { return this.participant(auctionId,userId)?.status; },
    attemptForTarget(productType,targetId,userId) { const row=db.prepare('SELECT * FROM monetization_payment_attempts WHERE product_type=? AND target_id=? AND payer_user_id=? ORDER BY created_at DESC LIMIT 1').get(productType,targetId,userId);return attempt(row); },
    attempts() { return db.prepare('SELECT * FROM monetization_payment_attempts ORDER BY created_at DESC LIMIT 500').all().map(attempt); },
  };
}
