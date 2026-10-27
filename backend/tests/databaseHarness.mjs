import { readFileSync } from 'node:fs';
import { createBackend as backend } from '../src/app.mjs';

const databases = new Map();

export async function embeddedDatabase() {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = new PGlite();
  await database.exec(readFileSync(new URL('../../supabase/migrations/001_initial_schema.sql', import.meta.url), 'utf8'));
  await database.exec(readFileSync(new URL('../../supabase/migrations/002_facility_website.sql', import.meta.url), 'utf8'));
  await database.exec(readFileSync(new URL('../../supabase/migrations/003_facility_research_history.sql', import.meta.url), 'utf8'));
  await database.exec(readFileSync(new URL('../../supabase/migrations/004_negotiations_and_payments.sql', import.meta.url), 'utf8'));
  await database.exec(readFileSync(new URL('../../supabase/migrations/005_material_listing_status.sql', import.meta.url), 'utf8'));
  await database.exec(readFileSync(new URL('../../supabase/migrations/006_material_passport_verification.sql', import.meta.url), 'utf8'));
  // PGlite has one embedded connection. A lease serializes transactions, while
  // production pg pools use PostgreSQL's cross-process advisory transaction lock.
  let queue = Promise.resolve();
  const pool = {
    async connect() {
      const previous = queue;
      let release;
      queue = new Promise(resolve => { release = resolve; });
      await previous;
      return { query: (sql, values) => database.query(sql, values), release };
    },
    async end() {},
  };
  const files = new Map();
  const storage = {
    async put(row) { if (files.has(row.storage_path)) throw new Error('No overwrites'); files.set(row.storage_path, Buffer.from(row.content)); },
    async get(path) { if (!files.has(path)) throw new Error('File missing'); return files.get(path); },
    async remove(paths) { for (const path of paths) files.delete(path); },
  };
  return { pool, storage, database, files };
}

export function createBackend(options) {
  if (process.env.GREENLOOP_TEST_POSTGRES !== 'embedded') return backend({ ...options, databaseProvider: 'sqlite' });
  // All tests use their own temp directory, never the configured live database.
  if (!databases.has(options.dataDir)) databases.set(options.dataDir, embeddedDatabase());
  const ready = databases.get(options.dataDir);
  return backend({ ...options, databaseProvider: 'postgres', postgres: {
    pool: { connect: async () => (await ready).pool.connect(), end: async () => {} },
    storage: Object.fromEntries(['put', 'get', 'remove'].map(method => [method, async (...args) => (await ready).storage[method](...args)])),
  } });
}

export async function expirePostgresSlots(directory) {
  const { database } = await databases.get(directory);
  await database.query("UPDATE greenloop.receiver_capacity SET date=('2020-01-01'::date + position)::text");
}
