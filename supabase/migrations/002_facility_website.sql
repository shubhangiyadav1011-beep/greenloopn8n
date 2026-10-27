BEGIN;
ALTER TABLE greenloop.receiver_facilities ADD COLUMN IF NOT EXISTS "websiteUrl" text;
INSERT INTO greenloop.schema_migrations(version) VALUES (2) ON CONFLICT (version) DO NOTHING;
COMMIT;
