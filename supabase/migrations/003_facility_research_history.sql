BEGIN;
ALTER TABLE greenloop.receiver_facilities
  ADD COLUMN IF NOT EXISTS "researchHistory" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "manualDetails" jsonb,
  ADD COLUMN IF NOT EXISTS "manualDetailsHistory" jsonb NOT NULL DEFAULT '[]'::jsonb;
INSERT INTO greenloop.schema_migrations(version) VALUES (3) ON CONFLICT (version) DO NOTHING;
COMMIT;
