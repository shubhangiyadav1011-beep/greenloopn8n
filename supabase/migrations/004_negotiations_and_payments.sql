BEGIN;

-- Safe, non-destructive relational alignment for negotiations and payment records in PostgreSQL.
-- Matches existing SQLite table schemas in openDatabase.mjs.

CREATE TABLE IF NOT EXISTS greenloop.negotiations (
  offer_id text PRIMARY KEY,
  provider_user_id text NOT NULL,
  receiver_user_id text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS greenloop.negotiation_messages (
  id text PRIMARY KEY,
  offer_id text NOT NULL REFERENCES greenloop.negotiations(offer_id) ON DELETE CASCADE,
  sender_user_id text NOT NULL,
  sender_role text NOT NULL CHECK(sender_role IN ('provider', 'receiver')),
  sender_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS negotiation_messages_offer_time
  ON greenloop.negotiation_messages(offer_id, created_at, id);

CREATE TABLE IF NOT EXISTS greenloop.final_terms_proposals (
  id text PRIMARY KEY,
  offer_id text NOT NULL REFERENCES greenloop.negotiations(offer_id) ON DELETE CASCADE,
  version integer NOT NULL,
  proposed_by text NOT NULL CHECK(proposed_by IN ('provider', 'receiver')),
  status text NOT NULL CHECK(status IN ('awaiting_provider_approval', 'awaiting_receiver_approval', 'approved', 'confirmed', 'superseded')),
  quantity_t double precision NOT NULL CHECK(quantity_t > 0),
  price_per_t double precision NOT NULL CHECK(price_per_t > 0),
  destination text NOT NULL,
  slot_id text NOT NULL,
  provider_approved_at timestamptz,
  receiver_approved_at timestamptz,
  created_at timestamptz NOT NULL,
  booking_id text,
  UNIQUE(offer_id, version)
);

CREATE INDEX IF NOT EXISTS final_terms_offer_version
  ON greenloop.final_terms_proposals(offer_id, version DESC);

CREATE TABLE IF NOT EXISTS greenloop.payment_attempts (
  id text PRIMARY KEY,
  booking_id text NOT NULL,
  payer_user_id text NOT NULL,
  provider_user_id text NOT NULL,
  provider_name text NOT NULL,
  provider_reference text NOT NULL UNIQUE,
  qr_payload text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor > 0),
  currency text NOT NULL CHECK(currency = 'INR'),
  payment_status text NOT NULL CHECK(payment_status IN ('pending', 'paid', 'failed', 'adjustment', 'disputed')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  paid_at timestamptz,
  accepted_t double precision,
  accepted_value_minor bigint NOT NULL DEFAULT 0,
  commission_minor bigint NOT NULL DEFAULT 0,
  provider_fee_minor bigint NOT NULL DEFAULT 0,
  refund_amount_minor bigint NOT NULL DEFAULT 0,
  refund_status text NOT NULL CHECK(refund_status IN ('not_required', 'pending', 'refunded', 'failed')),
  payout_amount_minor bigint NOT NULL DEFAULT 0,
  payout_status text NOT NULL CHECK(payout_status IN ('held', 'pending', 'settled', 'failed', 'disputed', 'not_eligible')),
  payout_reference text,
  settled_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text
);

CREATE INDEX IF NOT EXISTS payment_attempts_booking_time
  ON greenloop.payment_attempts(booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS greenloop.payment_webhook_events (
  event_id text PRIMARY KEY,
  provider_name text NOT NULL,
  provider_reference text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL,
  payload_sha256 text NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_webhook_reference
  ON greenloop.payment_webhook_events(provider_reference, received_at);

INSERT INTO greenloop.schema_migrations(version) VALUES (4) ON CONFLICT (version) DO NOTHING;

COMMIT;
