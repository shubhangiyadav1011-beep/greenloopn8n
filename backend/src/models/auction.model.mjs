import { randomUUID } from 'node:crypto';

const mapAuction = row => row && ({
  id: row.id, materialId: row.material_id, providerUserId: row.provider_user_id,
  quantityT: row.quantity_t, startsAt: row.starts_at, endsAt: row.ends_at,
  minimumIncrementMinor: row.minimum_increment_minor, reservePriceMinor: row.reserve_price_minor ?? undefined,
  status: row.status, winnerUserId: row.winner_user_id ?? undefined, winningBidId: row.winning_bid_id ?? undefined,
  negotiationOfferId: row.negotiation_offer_id ?? undefined, bookingId: row.booking_id ?? undefined,
  createdAt: row.created_at, updatedAt: row.updated_at, closedAt: row.closed_at ?? undefined, hostingPaymentStatus: row.hosting_payment_status ?? 'paid', hostingRefundable: Boolean(row.hosting_refundable),
});
const mapBid = row => row && ({ id: row.id, auctionId: row.auction_id, receiverUserId: row.receiver_user_id, amountMinor: row.amount_minor, placedAt: row.placed_at });
const mapAward = row => row && ({ id: row.id, auctionId: row.auction_id, receiverUserId: row.receiver_user_id, bidId: row.bid_id, status: row.status, negotiationOfferId: row.negotiation_offer_id ?? undefined, bookingId: row.booking_id ?? undefined, awardedAt: row.awarded_at, expiresAt: row.expires_at, updatedAt: row.updated_at });

export function createAuctionModel(db) {
  const byId = id => mapAuction(db.prepare('SELECT * FROM auctions WHERE id=?').get(id));
  const bidsFor = id => db.prepare('SELECT * FROM auction_bids WHERE auction_id=? ORDER BY amount_minor DESC, placed_at ASC, id ASC').all(id).map(mapBid);
  const awardsFor = id => db.prepare('SELECT * FROM auction_awards WHERE auction_id=? ORDER BY awarded_at DESC, id DESC').all(id).map(mapAward);
  return {
    create(input) {
      const id = randomUUID();
      db.prepare(`INSERT INTO auctions (id,material_id,provider_user_id,quantity_t,starts_at,ends_at,minimum_increment_minor,reserve_price_minor,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.materialId,input.providerUserId,input.quantityT,input.startsAt,input.endsAt,input.minimumIncrementMinor,input.reservePriceMinor ?? null,input.status,input.createdAt,input.createdAt);
      return byId(id);
    },
    byId,
    all() { return db.prepare('SELECT * FROM auctions ORDER BY ends_at DESC, created_at DESC').all().map(mapAuction); },
    reservedForMaterial(materialId,excludeId=null) { return Number(db.prepare("SELECT COALESCE(SUM(quantity_t),0) AS total FROM auctions WHERE material_id=? AND status IN ('scheduled','open','closed','awarded','award_expired') AND id!=COALESCE(?, '')").get(materialId,excludeId).total); },
    updateTerms(id,input) {
      const result=db.prepare(`UPDATE auctions SET quantity_t=?,starts_at=?,ends_at=?,minimum_increment_minor=?,reserve_price_minor=?,status=?,updated_at=? WHERE id=? AND status IN ('scheduled','open') AND NOT EXISTS (SELECT 1 FROM auction_bids WHERE auction_id=?)`).run(input.quantityT,input.startsAt,input.endsAt,input.minimumIncrementMinor,input.reservePriceMinor ?? null,input.status,input.updatedAt,id,id);
      return Number(result.changes)===1 ? byId(id) : undefined;
    },
    cancel(id,at) { return Number(db.prepare("UPDATE auctions SET status='cancelled',updated_at=? WHERE id=? AND status IN ('scheduled','open') AND NOT EXISTS (SELECT 1 FROM auction_bids WHERE auction_id=?)").run(at,id,id).changes)===1; },
    setStatus(id,status,at,closedAt=undefined) { db.prepare('UPDATE auctions SET status=?,updated_at=?,closed_at=COALESCE(?,closed_at) WHERE id=?').run(status,at,closedAt ?? null,id); return byId(id); },
    addBid({auctionId,receiverUserId,amountMinor,placedAt}) { const id=randomUUID(); db.prepare('INSERT INTO auction_bids VALUES (?,?,?,?,?)').run(id,auctionId,receiverUserId,amountMinor,placedAt); return mapBid({id,auction_id:auctionId,receiver_user_id:receiverUserId,amount_minor:amountMinor,placed_at:placedAt}); },
    bidsFor,
    highestBid(id) { return mapBid(db.prepare('SELECT * FROM auction_bids WHERE auction_id=? ORDER BY amount_minor DESC, placed_at ASC, id ASC LIMIT 1').get(id)); },
    createAward({auctionId,receiverUserId,bidId,awardedAt,expiresAt}) { const id=randomUUID(); db.prepare("INSERT INTO auction_awards (id,auction_id,receiver_user_id,bid_id,status,awarded_at,expires_at,updated_at) VALUES (?,?,?,?,'awarded',?,?,?)").run(id,auctionId,receiverUserId,bidId,awardedAt,expiresAt,awardedAt); return mapAward(db.prepare('SELECT * FROM auction_awards WHERE id=?').get(id)); },
    currentAward(id) { return mapAward(db.prepare("SELECT * FROM auction_awards WHERE auction_id=? AND status='awarded' ORDER BY awarded_at DESC LIMIT 1").get(id)); },
    awardsFor,
    expireAward(id,at) { db.prepare("UPDATE auction_awards SET status='expired',updated_at=? WHERE id=? AND status='awarded'").run(at,id); },
    completeAward(id,offerId,bookingId,at) { db.prepare("UPDATE auction_awards SET status='completed',negotiation_offer_id=COALESCE(?,negotiation_offer_id),booking_id=COALESCE(?,booking_id),updated_at=? WHERE id=? AND status='awarded'").run(offerId ?? null,bookingId ?? null,at,id); },
    linkNegotiation(id,offerId,at) { db.prepare("UPDATE auction_awards SET negotiation_offer_id=?,updated_at=? WHERE id=(SELECT id FROM auction_awards WHERE auction_id=? AND status='awarded' ORDER BY awarded_at DESC LIMIT 1)").run(offerId,at,id); db.prepare("UPDATE auctions SET negotiation_offer_id=?,updated_at=? WHERE id=?").run(offerId,at,id); },
    linkBooking(id,bookingId,at) { db.prepare('UPDATE auctions SET booking_id=?,status=\'completed\',updated_at=? WHERE id=?').run(bookingId,at,id); },
    setWinner(id,userId,bidId,at) { db.prepare("UPDATE auctions SET status='awarded',winner_user_id=?,winning_bid_id=?,updated_at=? WHERE id=?").run(userId,bidId,at,id); },
    setHostingPaymentStatus(id,status,at) { db.prepare('UPDATE auctions SET hosting_payment_status=?,updated_at=? WHERE id=?').run(status,at,id);return byId(id); },
    setHostingRefundable(id,refundable,at) { db.prepare('UPDATE auctions SET hosting_refundable=?,updated_at=? WHERE id=?').run(refundable?1:0,at,id);return byId(id); },
  };
}
