BEGIN;
-- Private schema: deliberately not exposed through Supabase's Data API.
CREATE SCHEMA IF NOT EXISTS greenloop;
CREATE TABLE greenloop.schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE greenloop.users (
  id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password text,
  name text, organization text, location text, vat text, phone text,
  workspaces text[] NOT NULL DEFAULT '{}', "activeWorkspace" text, "receiverId" text,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (workspaces <@ ARRAY['provider','receiver']::text[]),
  CHECK ("activeWorkspace" IS NULL OR "activeWorkspace" = ANY(workspaces))
);
CREATE TABLE greenloop.organizations (id uuid PRIMARY KEY, name text NOT NULL, inserted_at timestamptz NOT NULL DEFAULT now());
-- One organization per account preserves the current authorization model.
CREATE TABLE greenloop.user_organizations (
  user_id uuid PRIMARY KEY REFERENCES greenloop.users(id) DEFERRABLE INITIALLY DEFERRED,
  organization_id uuid NOT NULL UNIQUE REFERENCES greenloop.organizations(id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (user_id = organization_id)
);
CREATE TABLE greenloop.sessions (token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES greenloop.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, expires bigint NOT NULL);
CREATE TABLE greenloop.resets (token text PRIMARY KEY, user_id uuid NOT NULL UNIQUE REFERENCES greenloop.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED, expires bigint NOT NULL);
CREATE TABLE greenloop.google_identities (subject text PRIMARY KEY, user_id uuid NOT NULL REFERENCES greenloop.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE greenloop.oauth_states (state text PRIMARY KEY, verifier text NOT NULL, expires bigint NOT NULL);
CREATE TABLE greenloop.projects (
  id text PRIMARY KEY, position integer NOT NULL,
  organization_id uuid NOT NULL REFERENCES greenloop.organizations(id) DEFERRABLE INITIALLY DEFERRED,
  name text NOT NULL, location text NOT NULL, status text NOT NULL CHECK(status IN ('active','demolition','complete')),
  "surveyedAt" timestamptz NOT NULL, "lastActivityAt" timestamptz NOT NULL, geo jsonb
);
CREATE TABLE greenloop.receiver_facilities (
  id text PRIMARY KEY, position integer NOT NULL,
  organization_id uuid NOT NULL REFERENCES greenloop.organizations(id) DEFERRABLE INITIALLY DEFERRED,
  name text NOT NULL, location text NOT NULL,
  "dailyIntakeT" double precision NOT NULL CHECK("dailyIntakeT" >= 0),
  "currentStockT" double precision NOT NULL CHECK("currentStockT" >= 0),
  "acceptedTypes" text[] NOT NULL, "distanceKm" double precision NOT NULL CHECK("distanceKm" >= 0), "distanceKnown" boolean, geo jsonb
);
ALTER TABLE greenloop.users ADD FOREIGN KEY ("receiverId") REFERENCES greenloop.receiver_facilities(id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE greenloop.material_passports (
  id text PRIMARY KEY, position integer NOT NULL,
  organization_id uuid NOT NULL REFERENCES greenloop.organizations(id) DEFERRABLE INITIALLY DEFERRED,
  "projectId" text NOT NULL REFERENCES greenloop.projects(id) DEFERRABLE INITIALLY DEFERRED,
  type text NOT NULL CHECK(length(type) BETWEEN 2 AND 40),
  "quantityT" double precision NOT NULL CHECK("quantityT" >= 0),
  "originalUnit" text, "originalQuantity" double precision, "conversionFactor" double precision,
  "quantityRangeT" jsonb NOT NULL CHECK(jsonb_array_length("quantityRangeT") = 2),
  condition text NOT NULL CHECK(condition IN ('good','fair','poor')),
  grade text NOT NULL CHECK(grade IN ('A','B','C')),
  "surveyedAt" timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('surveyed','passport-ready','allocated','reserved','dispatched','verified','cancelled')),
  confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1), "surveyNotes" text,
  "pricePerT" double precision CHECK("pricePerT" >= 0), "availableFrom" text CHECK("availableFrom" ~ '^\d{4}-\d{2}-\d{2}$'), geo jsonb, "archivedAt" timestamptz
);
CREATE TABLE greenloop.receiver_capacity (
  id text PRIMARY KEY, position integer NOT NULL,
  "receiverId" text NOT NULL REFERENCES greenloop.receiver_facilities(id) DEFERRABLE INITIALLY DEFERRED,
  date text NOT NULL CHECK(date ~ '^\d{4}-\d{2}-\d{2}$'), "materialType" text NOT NULL,
  "capacityT" double precision NOT NULL CHECK("capacityT" > 0),
  UNIQUE("receiverId", date, "materialType"), UNIQUE(id, "receiverId")
);
CREATE TABLE greenloop.receiver_demands (
  id text PRIMARY KEY, position integer NOT NULL,
  organization_id uuid NOT NULL REFERENCES greenloop.organizations(id) DEFERRABLE INITIALLY DEFERRED,
  "receiverId" text NOT NULL REFERENCES greenloop.receiver_facilities(id) DEFERRABLE INITIALLY DEFERRED,
  "materialType" text NOT NULL, "requiredT" double precision NOT NULL CHECK("requiredT" > 0),
  period text NOT NULL CHECK(period ~ '^\d{4}-\d{2}-\d{2}$'), location text NOT NULL,
  status text NOT NULL CHECK(status IN ('DRAFT','OPEN','PARTIALLY_COVERED','COVERED','PAUSED','CANCELLED')),
  "createdAt" timestamptz NOT NULL, notes text, "budgetPerT" double precision CHECK("budgetPerT" >= 0), geo jsonb,
  "targetProviderId" text REFERENCES greenloop.users(email) DEFERRABLE INITIALLY DEFERRED, "targetProviderName" text,
  "targetMaterialId" text REFERENCES greenloop.material_passports(id) DEFERRABLE INITIALLY DEFERRED, "archivedAt" timestamptz
);
CREATE TABLE greenloop.allocations (
  id text PRIMARY KEY, position integer NOT NULL,
  "materialId" text NOT NULL REFERENCES greenloop.material_passports(id) DEFERRABLE INITIALLY DEFERRED,
  "receiverId" text NOT NULL REFERENCES greenloop.receiver_facilities(id) DEFERRABLE INITIALLY DEFERRED,
  "slotId" text NOT NULL REFERENCES greenloop.receiver_capacity(id) DEFERRABLE INITIALLY DEFERRED,
  "requestedT" double precision NOT NULL CHECK("requestedT" > 0),
  status text NOT NULL CHECK(status IN ('confirmed','hold','pending','cancelled')), "holdReason" text,
  "capacityBeforeT" double precision NOT NULL, "capacityAfterT" double precision NOT NULL,
  "decidedAt" timestamptz, "updatedAt" timestamptz NOT NULL, candidates jsonb NOT NULL
);
CREATE TABLE greenloop.offers (
  id text PRIMARY KEY, position integer NOT NULL,
  "demandId" text NOT NULL REFERENCES greenloop.receiver_demands(id) DEFERRABLE INITIALLY DEFERRED,
  "providerId" text NOT NULL REFERENCES greenloop.users(email) DEFERRABLE INITIALLY DEFERRED,
  "passportId" text NOT NULL REFERENCES greenloop.material_passports(id) DEFERRABLE INITIALLY DEFERRED,
  "offeredQuantityT" double precision NOT NULL CHECK("offeredQuantityT" > 0),
  status text NOT NULL CHECK(status IN ('draft','pending','accepted','declined','withdrawn')),
  "createdAt" timestamptz NOT NULL, "pricePerT" double precision CHECK("pricePerT" >= 0), "agreedPricePerT" double precision CHECK("agreedPricePerT" >= 0), "archivedAt" timestamptz
);
CREATE TABLE greenloop.bookings (
  id text PRIMARY KEY, position integer NOT NULL,
  "allocationId" text NOT NULL UNIQUE REFERENCES greenloop.allocations(id) DEFERRABLE INITIALLY DEFERRED,
  "slotId" text NOT NULL, "receiverId" text NOT NULL,
  FOREIGN KEY ("slotId", "receiverId") REFERENCES greenloop.receiver_capacity(id, "receiverId") DEFERRABLE INITIALLY DEFERRED,
  "materialId" text NOT NULL REFERENCES greenloop.material_passports(id) DEFERRABLE INITIALLY DEFERRED,
  "tonnesT" double precision NOT NULL CHECK("tonnesT" > 0),
  status text NOT NULL CHECK(status IN ('confirmed','hold','pending','cancelled')), "holdReason" text,
  "capacityBeforeT" double precision NOT NULL, "capacityAfterT" double precision NOT NULL,
  "createdAt" timestamptz NOT NULL, "updatedAt" timestamptz NOT NULL,
  "demandId" text REFERENCES greenloop.receiver_demands(id) DEFERRABLE INITIALLY DEFERRED,
  "receiverAcceptedAt" timestamptz, "loadRef" text UNIQUE, "cancelledAt" timestamptz, "cancelledReason" text,
  "agreedPricePerT" double precision CHECK("agreedPricePerT" >= 0), "archivedAt" timestamptz,
  CHECK("loadRef" IS NULL OR (status = 'confirmed' AND "receiverAcceptedAt" IS NOT NULL))
);
CREATE TABLE greenloop.verifications (
  id text PRIMARY KEY, position integer NOT NULL,
  "bookingId" text NOT NULL UNIQUE REFERENCES greenloop.bookings(id) DEFERRABLE INITIALLY DEFERRED,
  "loadRef" text NOT NULL REFERENCES greenloop.bookings("loadRef") DEFERRABLE INITIALLY DEFERRED,
  "materialId" text NOT NULL REFERENCES greenloop.material_passports(id) DEFERRABLE INITIALLY DEFERRED,
  "receiverId" text NOT NULL REFERENCES greenloop.receiver_facilities(id) DEFERRABLE INITIALLY DEFERRED,
  "plannedT" double precision NOT NULL CHECK("plannedT" >= 0), "actualT" double precision NOT NULL CHECK("actualT" >= 0),
  "acceptedT" double precision NOT NULL CHECK("acceptedT" >= 0), "rejectedT" double precision NOT NULL CHECK("rejectedT" >= 0), "rejectReason" text,
  status text NOT NULL CHECK(status IN ('pending','verified','rejected')), "verifiedAt" timestamptz,
  CHECK(status = 'pending' OR abs("acceptedT" + "rejectedT" - "actualT") < 0.001),
  CHECK("rejectedT" = 0 OR length(trim("rejectReason")) > 0 AND "rejectReason" IS NOT NULL)
);
CREATE TABLE greenloop.audit_events (
  id text PRIMARY KEY, position integer NOT NULL, at timestamptz NOT NULL, kind text NOT NULL,
  actor jsonb NOT NULL, summary text NOT NULL, detail text, "subjectIds" text[] NOT NULL
);
CREATE TABLE greenloop.support_requests (
  id text PRIMARY KEY, position integer NOT NULL,
  organization_id uuid NOT NULL REFERENCES greenloop.organizations(id) DEFERRABLE INITIALLY DEFERRED,
  email text NOT NULL, subject text NOT NULL, message text NOT NULL, "submittedAt" timestamptz NOT NULL
);
CREATE TABLE greenloop.uploads (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES greenloop.users(id) DEFERRABLE INITIALLY DEFERRED,
  name text NOT NULL, mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp','application/pdf')),
  size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 4194304), storage_path text NOT NULL UNIQUE
);
CREATE TABLE greenloop.material_evidence (
  id text PRIMARY KEY, material_id text REFERENCES greenloop.material_passports(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  verification_id text REFERENCES greenloop.verifications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  position integer NOT NULL, kind text NOT NULL CHECK(kind IN ('survey-sheet','site-photo','lab-report','weighbridge-ticket')),
  label text NOT NULL, ref text, recorded_at timestamptz NOT NULL,
  CHECK((material_id IS NULL) <> (verification_id IS NULL)),
  UNIQUE(material_id, position), UNIQUE(verification_id, position)
);
CREATE TABLE greenloop.offer_counters (
  id text PRIMARY KEY, offer_id text NOT NULL REFERENCES greenloop.offers(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  position integer NOT NULL, actor text NOT NULL CHECK(actor IN ('provider','receiver')),
  price_per_t double precision NOT NULL CHECK(price_per_t >= 0), at timestamptz NOT NULL, UNIQUE(offer_id, position)
);
CREATE TABLE greenloop.notifications (
  id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES greenloop.users(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  event_id text NOT NULL REFERENCES greenloop.audit_events(id) DEFERRABLE INITIALLY DEFERRED, UNIQUE(user_id, event_id)
);
-- Dispatch and inventory are projections of authoritative bookings/verifications.
-- Avoid duplicated stock or load records that can drift from the business engine.
CREATE VIEW greenloop.dispatches AS SELECT id AS booking_id, "loadRef" AS load_ref, "materialId" AS material_id, "receiverId" AS receiver_id, "tonnesT" AS tonnes FROM greenloop.bookings WHERE "loadRef" IS NOT NULL;
CREATE VIEW greenloop.inventory AS SELECT "receiverId" AS receiver_id, "materialId" AS material_id, sum("acceptedT") AS accepted_t FROM greenloop.verifications WHERE status = 'verified' GROUP BY "receiverId", "materialId";

CREATE INDEX ON greenloop.sessions(user_id);
CREATE INDEX ON greenloop.sessions(expires);
CREATE INDEX ON greenloop.resets(expires);
CREATE INDEX ON greenloop.projects(organization_id);
CREATE INDEX ON greenloop.material_passports(organization_id);
CREATE INDEX ON greenloop.material_passports("projectId");
CREATE INDEX ON greenloop.receiver_facilities(organization_id);
CREATE INDEX ON greenloop.receiver_demands(organization_id, status);
CREATE INDEX ON greenloop.receiver_demands("receiverId", period);
CREATE INDEX ON greenloop.offers("demandId", status);
CREATE INDEX ON greenloop.offers("passportId");
CREATE INDEX ON greenloop.bookings("slotId", status);
CREATE INDEX ON greenloop.bookings("materialId");
CREATE INDEX ON greenloop.bookings("receiverId");
CREATE INDEX ON greenloop.bookings("demandId");
CREATE INDEX ON greenloop.verifications("receiverId");
CREATE INDEX ON greenloop.audit_events USING gin("subjectIds");
CREATE INDEX ON greenloop.uploads(user_id);
CREATE INDEX ON greenloop.support_requests(organization_id);

-- Safety net in addition to application locking. Check final transaction state,
-- allowing cancellation, promotion and rescheduling within the same transaction.
CREATE FUNCTION greenloop.check_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(7210462194301);
  IF EXISTS (
    SELECT 1 FROM greenloop.receiver_capacity s JOIN greenloop.bookings b ON b."slotId"=s.id
    WHERE b.status='confirmed' GROUP BY s.id, s."capacityT"
    HAVING sum(b."tonnesT") > s."capacityT" + 0.001
  ) THEN RAISE EXCEPTION 'Confirmed reservations exceed receiver capacity' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER bookings_capacity AFTER INSERT OR UPDATE OR DELETE ON greenloop.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION greenloop.check_capacity();
CREATE CONSTRAINT TRIGGER slots_capacity AFTER UPDATE ON greenloop.receiver_capacity DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION greenloop.check_capacity();

-- No browser access: Node uses database credentials and enforces ownership.
-- RLS without policies denies access to unprivileged database roles.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='greenloop' LOOP
    EXECUTE format('ALTER TABLE greenloop.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA greenloop FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA greenloop FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA greenloop FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON SCHEMA greenloop FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA greenloop FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON SCHEMA greenloop FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA greenloop FROM authenticated;
  END IF;
END $$;
INSERT INTO greenloop.schema_migrations(version) VALUES (1);
COMMIT;
