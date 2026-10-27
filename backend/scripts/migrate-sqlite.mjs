import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createDatasetModel } from '../src/models/dataset.model.mjs';
import { createPostgresPool, createStorage, LOCK_KEY } from '../src/database/postgres.mjs';
import { entities, profileFields, primaryKeys, canonical, flatten, readTables, writeChanges } from '../src/database/relational.mjs';

export function readSqliteSnapshot(path) {
  if (!existsSync(path)) throw new Error('SQLite source does not exist. No file was created.');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA integrity_check').get();
    if (Object.values(check)[0] !== 'ok') throw new Error('SQLite integrity check failed.');
    const snapshot = { dataset: createDatasetModel(db).load(), owners: Object.fromEntries(db.prepare('SELECT * FROM owners').all().map(row => [row.entity_id, row.user_id])) };
    for (const table of ['users', 'sessions', 'resets', 'google_identities', 'oauth_states']) snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all();
    snapshot.uploads = db.prepare('SELECT * FROM uploads').all().map(row => ({ ...row, content: Buffer.from(row.content), storage_path: `${row.user_id}/${row.id}`, size_bytes: row.content.length }));
    // Refuse unknown dataset/profile fields rather than silently discarding data.
    for (const key of Object.keys(snapshot.dataset)) if (!entities.some(entity => entity.key === key)) throw new Error(`Unsupported dataset field: ${key}`);
    for (const { key } of entities) snapshot.dataset[key] ??= [];
    for (const entity of entities) for (const item of snapshot.dataset[entity.key] ?? []) {
      const allowed = new Set(['id', ...entity.fields, ...(entity.key === 'materials' || entity.key === 'verifications' ? ['evidence'] : []), ...(entity.key === 'offers' ? ['counters'] : [])]);
      for (const key of Object.keys(item)) if (!allowed.has(key)) throw new Error(`Unsupported ${entity.table} field: ${key}`);
      if (entity.owned && !snapshot.owners[item.id]) throw new Error(`Missing owner for ${entity.table} ${item.id}`);
    }
    for (const row of snapshot.users) for (const key of Object.keys(JSON.parse(row.profile))) {
      if (![...profileFields, 'readEventIds'].includes(key)) throw new Error(`Unsupported account profile field: ${key}`);
    }
    return snapshot;
  } finally { db.close(); }
}

export async function importSnapshot(snapshot, pool, storage) {
  const client = await pool.connect();
  const uploaded = [];
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [LOCK_KEY]);
    const before = await readTables(client);
    if (Object.values(before).some(rows => rows.length)) throw new Error('Target is not empty. Import refused; use a fresh Supabase project/database.');
    const after = flatten(snapshot);
    for (const upload of snapshot.uploads) { await storage.put(upload); uploaded.push(upload.storage_path); }
    await writeChanges(client, before, after);
    const actual = await readTables(client);
    for (const [table, rows] of Object.entries(after)) {
      if (actual[table].length !== rows.length) throw new Error(`Import row count mismatch: ${table}`);
      const pk = primaryKeys[table] ?? 'id';
      const restored = new Map(actual[table].map(row => [row[pk], row]));
      for (const row of rows) if (canonical(row) !== canonical(restored.get(row[pk]))) throw new Error(`Import value mismatch: ${table} ${row[pk]}`);
    }
    await client.query('COMMIT');
    return Object.fromEntries(Object.entries(after).map(([key, rows]) => [key, rows.length]));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await storage.remove(uploaded).catch(cleanup => console.error('Remove orphaned evidence paths:', uploaded, cleanup.message));
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = resolve(process.argv.find(arg => arg.startsWith('--source='))?.slice(9) ?? '../server/data/greenloop.sqlite');
  const snapshot = readSqliteSnapshot(source);
  if (!process.argv.includes('--apply')) {
    console.log('Read-only migration preview. Stop the old API and back up SQLite before using --apply.');
    console.log(JSON.stringify(Object.fromEntries(Object.entries(flatten(snapshot)).map(([key, rows]) => [key, rows.length])), null, 2));
  } else {
    const pool = createPostgresPool();
    try { console.log('Imported rows:', await importSnapshot(snapshot, pool, createStorage())); }
    finally { await pool.end(); }
  }
}
