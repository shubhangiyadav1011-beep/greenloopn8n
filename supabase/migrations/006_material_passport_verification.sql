BEGIN;

ALTER TABLE greenloop.material_passports
  ADD COLUMN IF NOT EXISTS "name" text,
  ADD COLUMN IF NOT EXISTS "dimensions" text,
  ADD COLUMN IF NOT EXISTS "provenance" jsonb,
  ADD COLUMN IF NOT EXISTS "verificationStatus" text CHECK("verificationStatus" IN ('unverified','evidence-submitted','under-review','verified','rejected')),
  ADD COLUMN IF NOT EXISTS "verificationNotes" text,
  ADD COLUMN IF NOT EXISTS "rejectionReason" text,
  ADD COLUMN IF NOT EXISTS "verifiedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "verifiedBy" text,
  ADD COLUMN IF NOT EXISTS "reviewedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "reviewedBy" text,
  ADD COLUMN IF NOT EXISTS "verificationAudit" jsonb;

ALTER TABLE greenloop.material_evidence
  DROP CONSTRAINT IF EXISTS material_evidence_kind_check;

ALTER TABLE greenloop.material_evidence
  ADD CONSTRAINT material_evidence_kind_check CHECK(kind IN ('survey-sheet','site-photo','lab-report','weighbridge-ticket','certificate','test-report','chain-of-custody'));

ALTER TABLE greenloop.material_evidence
  ADD COLUMN IF NOT EXISTS "status" text CHECK(status IN ('valid','pending','rejected')),
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "rejection_reason" text,
  ADD COLUMN IF NOT EXISTS "verified_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "verified_by" text,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

INSERT INTO greenloop.schema_migrations(version) VALUES (6) ON CONFLICT (version) DO NOTHING;

COMMIT;
