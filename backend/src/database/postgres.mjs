import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createSnapshotModels } from './snapshotModels.mjs';
import { flatten, hydrate, readTables, writeChanges } from './relational.mjs';

export const LOCK_KEY = '7210462194301';

export function createPostgresPool(connectionString = process.env.SUPABASE_DB_URL) {
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for PostgreSQL. Use the Supabase direct or session pooler connection string.');
  const url = new URL(connectionString);
  // Strip URL SSL overrides so TLS certificate verification cannot be disabled.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  return new Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000,
    ssl: local ? false : { rejectUnauthorized: true, ...(process.env.SUPABASE_DB_CA_FILE ? { ca: readFileSync(process.env.SUPABASE_DB_CA_FILE, 'utf8') } : {}) } });
}

export function createStorage() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for private evidence storage.');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(15000), ...(init.signal ? [init.signal] : [])]) }) },
  });
  const bucket = client.storage.from('material-evidence');
  return {
    async put(row) {
      const { error } = await bucket.upload(row.storage_path, Buffer.from(row.content), { contentType: row.mime, upsert: false });
      if (error) throw new Error('Evidence storage upload failed.', { cause: error });
    },
    async get(path) {
      const { data, error } = await bucket.download(path);
      if (error) throw new Error('Evidence storage download failed.', { cause: error });
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(paths) {
      if (!paths.length) return;
      const { error } = await bucket.remove(paths);
      if (error) throw new Error('Evidence storage cleanup failed.', { cause: error });
    },
  };
}

export function openPostgres(options = {}) {
  const pool = options.pool ?? createPostgresPool();
  const storage = options.storage ?? createStorage();
  const context = new AsyncLocalStorage();
  const models = createSnapshotModels(context);
  return {
    ...models,
    async run(operation) {
      const client = await pool.connect();
      const uploaded = [];
      let committed = false;
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL lock_timeout = '20s'");
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [LOCK_KEY]);
        const before = await readTables(client);
        const current = { snapshot: hydrate(before) };
        return await context.run(current, async () => {
          const result = await operation();
          for (const upload of current.snapshot.uploads.filter(row => row.content)) {
            await storage.put(upload);
            uploaded.push(upload.storage_path);
            delete upload.content;
          }
          await writeChanges(client, before, flatten(current.snapshot));
          await client.query('COMMIT');
          committed = true;
          return result;
        });
      } catch (error) {
        if (!committed) {
          await client.query('ROLLBACK').catch(() => {});
          await storage.remove(uploaded).catch(cleanup => console.error('Remove orphaned evidence objects:', uploaded, cleanup.message));
        }
        throw error;
      } finally { client.release(); }
    },
    readUpload: upload => storage.get(upload.storage_path),
    close: () => pool.end(),
  };
}
