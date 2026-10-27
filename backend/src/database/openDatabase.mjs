import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, "greenloop.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT, profile TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS resets (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS owners (entity_id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, content BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS google_identities (subject TEXT PRIMARY KEY, user_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS negotiations (
      offer_id TEXT PRIMARY KEY,
      provider_user_id TEXT NOT NULL,
      receiver_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS negotiation_messages (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL REFERENCES negotiations(offer_id),
      sender_user_id TEXT NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('provider', 'receiver')),
      sender_name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS negotiation_messages_offer_time ON negotiation_messages(offer_id, created_at, id);
    CREATE TABLE IF NOT EXISTS final_terms_proposals (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL REFERENCES negotiations(offer_id),
      version INTEGER NOT NULL,
      proposed_by TEXT NOT NULL CHECK(proposed_by IN ('provider', 'receiver')),
      status TEXT NOT NULL CHECK(status IN ('awaiting_provider_approval', 'awaiting_receiver_approval', 'approved', 'confirmed', 'superseded')),
      quantity_t REAL NOT NULL,
      price_per_t REAL NOT NULL,
      destination TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      provider_approved_at TEXT,
      receiver_approved_at TEXT,
      created_at TEXT NOT NULL,
      booking_id TEXT,
      UNIQUE(offer_id, version)
    );
    CREATE INDEX IF NOT EXISTS final_terms_offer_version ON final_terms_proposals(offer_id, version DESC);
    CREATE TABLE IF NOT EXISTS payment_attempts (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      payer_user_id TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      provider_reference TEXT NOT NULL UNIQUE,
      qr_payload TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      currency TEXT NOT NULL CHECK(currency = 'INR'),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('pending', 'paid', 'failed', 'adjustment', 'disputed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      paid_at TEXT,
      accepted_t REAL,
      accepted_value_minor INTEGER NOT NULL DEFAULT 0,
      commission_minor INTEGER NOT NULL DEFAULT 0,
      provider_fee_minor INTEGER NOT NULL DEFAULT 0,
      refund_amount_minor INTEGER NOT NULL DEFAULT 0,
      refund_status TEXT NOT NULL CHECK(refund_status IN ('not_required', 'pending', 'refunded', 'failed')),
      payout_amount_minor INTEGER NOT NULL DEFAULT 0,
      payout_status TEXT NOT NULL CHECK(payout_status IN ('held', 'pending', 'settled', 'failed', 'disputed', 'not_eligible')),
      payout_reference TEXT,
      settled_at TEXT,
      disputed_at TEXT,
      dispute_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS payment_attempts_booking_time ON payment_attempts(booking_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS payment_webhook_events (
      event_id TEXT PRIMARY KEY,
      provider_name TEXT NOT NULL,
      provider_reference TEXT NOT NULL,
      event_type TEXT NOT NULL,
      received_at TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payment_webhook_reference ON payment_webhook_events(provider_reference, received_at);
    CREATE TABLE IF NOT EXISTS admin_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('super_admin', 'support_admin', 'operations_admin')),
      assigned_by TEXT,
      assigned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_controls (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
      updated_at TEXT NOT NULL,
      updated_by TEXT,
      reason TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      actor_role TEXT NOT NULL CHECK(actor_role IN ('super_admin', 'support_admin', 'operations_admin')),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT
    );
    CREATE TRIGGER IF NOT EXISTS admin_audit_no_update
      BEFORE UPDATE ON admin_audit_log BEGIN SELECT RAISE(ABORT, 'admin audit is append-only'); END;
    CREATE TRIGGER IF NOT EXISTS admin_audit_no_delete
      BEFORE DELETE ON admin_audit_log BEGIN SELECT RAISE(ABORT, 'admin audit is append-only'); END;
    CREATE TABLE IF NOT EXISTS admin_incidents (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      method TEXT NOT NULL,
      route TEXT NOT NULL,
      category TEXT NOT NULL,
      status_code INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_incidents_time ON admin_incidents(occurred_at DESC);
    CREATE TABLE IF NOT EXISTS support_ticket_meta (
      ticket_id TEXT PRIMARY KEY,
      requester_user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'in_review', 'waiting', 'resolved')),
      assigned_admin_user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS support_ticket_status_time ON support_ticket_meta(status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS support_internal_notes (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES support_ticket_meta(ticket_id),
      author_user_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS support_internal_notes_ticket_time ON support_internal_notes(ticket_id, created_at);
    CREATE TABLE IF NOT EXISTS auctions (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      quantity_t REAL NOT NULL CHECK(quantity_t > 0),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      minimum_increment_minor INTEGER NOT NULL CHECK(minimum_increment_minor > 0),
      reserve_price_minor INTEGER,
      status TEXT NOT NULL CHECK(status IN ('scheduled','open','closed','awarded','award_expired','no_sale','completed','cancelled')),
      winner_user_id TEXT,
      winning_bid_id TEXT,
      negotiation_offer_id TEXT,
      booking_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS auctions_status_end ON auctions(status, ends_at);
    CREATE INDEX IF NOT EXISTS auctions_material ON auctions(material_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS auctions_one_active_material ON auctions(material_id) WHERE status IN ('scheduled','open','closed','awarded','award_expired');
    CREATE TABLE IF NOT EXISTS auction_bids (
      id TEXT PRIMARY KEY,
      auction_id TEXT NOT NULL REFERENCES auctions(id),
      receiver_user_id TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      placed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auction_bids_highest ON auction_bids(auction_id, amount_minor DESC, placed_at ASC);
    CREATE TRIGGER IF NOT EXISTS auction_bids_no_update
      BEFORE UPDATE ON auction_bids BEGIN SELECT RAISE(ABORT, 'auction bids are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS auction_bids_no_delete
      BEFORE DELETE ON auction_bids BEGIN SELECT RAISE(ABORT, 'auction bids are immutable'); END;
    CREATE TABLE IF NOT EXISTS auction_awards (
      id TEXT PRIMARY KEY,
      auction_id TEXT NOT NULL REFERENCES auctions(id),
      receiver_user_id TEXT NOT NULL,
      bid_id TEXT NOT NULL REFERENCES auction_bids(id),
      status TEXT NOT NULL CHECK(status IN ('awarded','expired','completed')),
      negotiation_offer_id TEXT,
      booking_id TEXT,
      awarded_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auction_awards_auction ON auction_awards(auction_id, awarded_at DESC);
    CREATE TABLE IF NOT EXISTS monetization_payment_attempts (
      id TEXT PRIMARY KEY, payer_user_id TEXT NOT NULL, product_type TEXT NOT NULL CHECK(product_type IN ('premium_subscription','sponsored_listing','auction_hosting','auction_participation')),
      target_id TEXT, amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), currency TEXT NOT NULL CHECK(currency='INR'),
      provider_name TEXT NOT NULL, provider_reference TEXT NOT NULL UNIQUE, qr_payload TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','paid','failed','refund_pending','refunded')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT, refunded_at TEXT
    );
    CREATE INDEX IF NOT EXISTS monetization_attempt_user_time ON monetization_payment_attempts(payer_user_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS monetization_attempt_target ON monetization_payment_attempts(product_type,target_id,status);
    CREATE TABLE IF NOT EXISTS monetization_webhook_events (
      event_id TEXT PRIMARY KEY, provider_name TEXT NOT NULL, provider_reference TEXT NOT NULL, event_type TEXT NOT NULL,
      received_at TEXT NOT NULL, payload_sha256 TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS premium_entitlements (
      user_id TEXT PRIMARY KEY, source TEXT NOT NULL CHECK(source IN ('purchase','admin_grant')), status TEXT NOT NULL CHECK(status IN ('active','revoked')),
      starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, payment_attempt_id TEXT, granted_by TEXT, reason TEXT, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sponsored_placements (
      id TEXT PRIMARY KEY, material_id TEXT NOT NULL, provider_user_id TEXT NOT NULL, payment_attempt_id TEXT NOT NULL,
      starts_at TEXT NOT NULL, expires_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','expired','cancelled')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sponsored_active_time ON sponsored_placements(status,expires_at);
    CREATE TABLE IF NOT EXISTS auction_participants (
      auction_id TEXT NOT NULL REFERENCES auctions(id), receiver_user_id TEXT NOT NULL, payment_attempt_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','paid','failed')), joined_at TEXT NOT NULL, paid_at TEXT,
      PRIMARY KEY(auction_id,receiver_user_id)
    );
  `);
  const auctionColumns = new Set(db.prepare('PRAGMA table_info(auctions)').all().map(column => column.name));
  if (!auctionColumns.has('hosting_payment_status')) db.exec("ALTER TABLE auctions ADD COLUMN hosting_payment_status TEXT NOT NULL DEFAULT 'paid' CHECK(hosting_payment_status IN ('pending','paid','refunded'))");
  if (!auctionColumns.has('hosting_refundable')) db.exec('ALTER TABLE auctions ADD COLUMN hosting_refundable INTEGER NOT NULL DEFAULT 0 CHECK(hosting_refundable IN (0,1))');
  return db;
}
