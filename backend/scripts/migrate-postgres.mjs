import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPostgresPool } from '../src/database/postgres.mjs';

const pool = createPostgresPool();
const client = await pool.connect();
try {
  const exists = (await client.query("SELECT to_regclass('greenloop.schema_migrations') AS name")).rows[0].name;
  if (!exists) await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/001_initial_schema.sql', import.meta.url)), 'utf8'));
  else if (!(await client.query('SELECT 1 FROM greenloop.schema_migrations WHERE version=1')).rowCount) throw new Error('Unrecognized GreenLoop schema; migrate manually.');
  if (!(await client.query('SELECT 1 FROM greenloop.schema_migrations WHERE version=2')).rowCount) {
    await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/002_facility_website.sql', import.meta.url)), 'utf8'));
  }
  if (!(await client.query('SELECT 1 FROM greenloop.schema_migrations WHERE version=3')).rowCount) {
    await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/003_facility_research_history.sql', import.meta.url)), 'utf8'));
  }
  if (!(await client.query('SELECT 1 FROM greenloop.schema_migrations WHERE version=4')).rowCount) {
    await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/004_negotiations_and_payments.sql', import.meta.url)), 'utf8'));
  }
  if (!(await client.query('SELECT 1 FROM greenloop.schema_migrations WHERE version=5')).rowCount) {
    await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/005_material_listing_status.sql', import.meta.url)), 'utf8'));
  }
  if (!(await client.query('SELECT 1 FROM greenloop.schema_migrations WHERE version=6')).rowCount) {
    await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/006_material_passport_verification.sql', import.meta.url)), 'utf8'));
  }
  if ((await client.query("SELECT to_regclass('storage.buckets') AS name")).rows[0].name) {
    await client.query(readFileSync(fileURLToPath(new URL('../../supabase/migrations/002_private_evidence_bucket.sql', import.meta.url)), 'utf8'));
  }
  console.log('GreenLoop PostgreSQL schema ready.');
} finally { client.release(); await pool.end(); }
