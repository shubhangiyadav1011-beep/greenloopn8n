BEGIN;
-- Supabase only. Kept separate so the relational migration can also be tested
-- against standard PostgreSQL without Supabase's managed storage schema.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('material-evidence', 'material-evidence', false, 4194304,
  ARRAY['image/png','image/jpeg','image/webp','application/pdf'])
ON CONFLICT(id) DO UPDATE SET public=false, file_size_limit=EXCLUDED.file_size_limit,
  allowed_mime_types=EXCLUDED.allowed_mime_types;
-- Intentionally no anon/authenticated object policies. Backend service key only.
-- A restrictive guard also blocks this bucket when the project already has
-- broad permissive policies for unrelated buckets. Service role bypasses RLS.
DROP POLICY IF EXISTS greenloop_private_evidence ON storage.objects;
CREATE POLICY greenloop_private_evidence ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id <> 'material-evidence')
WITH CHECK (bucket_id <> 'material-evidence');
COMMIT;
