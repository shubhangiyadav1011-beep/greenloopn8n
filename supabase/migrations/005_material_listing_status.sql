BEGIN;
ALTER TABLE greenloop.material_passports ADD COLUMN IF NOT EXISTS "listingStatus" text CHECK("listingStatus" IN ('draft','published','paused','archived'));
INSERT INTO greenloop.schema_migrations(version) VALUES (5) ON CONFLICT (version) DO NOTHING;
COMMIT;
