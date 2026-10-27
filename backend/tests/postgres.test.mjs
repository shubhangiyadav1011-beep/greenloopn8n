import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createBackend } from '../src/app.mjs';
import { embeddedDatabase } from './databaseHarness.mjs';
import { readSqliteSnapshot, importSnapshot } from '../scripts/migrate-sqlite.mjs';
import { readTables, hydrate } from '../src/database/relational.mjs';

const listen = async server => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
const close = server => new Promise(resolve => server.close(resolve));
function client(base) {
  let cookie = '';
  return async (path, method = 'GET', body, expected = 200) => {
    const response = await fetch(`${base}/api${path}`, { method, headers: { 'X-GreenLoop-Client': 'web', 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
}
const action = (request, name, ...args) => request('/actions', 'POST', { action: name, args });
const materialInput = projectId => ({ projectId, type: 'concrete', quantityT: 10, quantityRangeT: [9, 11], condition: 'good', grade: 'A', confidence: 0.9, evidence: [] });

test('PostgreSQL: two API instances share data and cannot overbook; SQL guard rolls back', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-pg-'));
  const postgres = await embeddedDatabase();
  const servers = [createBackend({ dataDir: directory, databaseProvider: 'postgres', postgres }), createBackend({ dataDir: directory, databaseProvider: 'postgres', postgres })];
  try {
    const [first, second] = await Promise.all(servers.map(listen));
    const receiver = client(first), p1 = client(first), p2 = client(second);
    await receiver('/auth/register', 'POST', { email: 'yard@example.com', password: 'password123' }, 201);
    const facility = (await receiver('/profile', 'PATCH', { workspaces: ['receiver'] })).user.receiverId;
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const slot = (await action(receiver, 'addCapacityAction', { receiverId: facility, date, materialType: 'concrete', capacityT: 10 })).result;
    const passports = [];
    for (const [index, provider] of [p1, p2].entries()) {
      await provider('/auth/register', 'POST', { email: `p${index}@example.com`, password: 'password123' }, 201);
      await provider('/profile', 'PATCH', { workspaces: ['provider'] });
      const project = (await action(provider, 'addProjectAction', { name: 'Demo', location: 'Delhi', status: 'active' })).result;
      passports.push((await action(provider, 'addMaterialAction', materialInput(project.id))).result);
    }
    await Promise.all([p1, p2].map((request, index) => action(request, 'requestCapacityAction', { materialId: passports[index].id, receiverId: facility, slotId: slot.id, tonnesT: 6 })));
    const bookings = (await receiver('/dataset')).dataset.bookings;
    assert.deepEqual(bookings.map(item => item.status).sort(), ['confirmed', 'hold']);
    assert.equal(bookings.filter(item => item.status === 'confirmed').reduce((sum, item) => sum + item.tonnesT, 0), 6);
    const connection = await postgres.pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('UPDATE greenloop.bookings SET "tonnesT"=11 WHERE status=$1', ['confirmed']);
      await assert.rejects(connection.query('COMMIT'), /exceed receiver capacity/);
      await connection.query('ROLLBACK');
    } finally { connection.release(); }
    assert.equal((await receiver('/dataset')).dataset.bookings.find(item => item.status === 'confirmed').tonnesT, 6);
    const tables = await readTables(postgres.database);
    assert.equal(tables.organizations.length, 3);
    assert.equal((await postgres.database.query("SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='greenloop'")).rows[0].count, 0);
  } finally { await Promise.all(servers.map(close)); await postgres.database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('PostgreSQL: read-only SQLite import preserves sessions, IDs, evidence and ownership; refuses overwrite', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'greenloop-import-'));
  const oldServer = createBackend({ dataDir: directory, databaseProvider: 'sqlite' });
  const postgres = await embeddedDatabase();
  let stopped = false;
  try {
    const request = client(await listen(oldServer));
    const user = (await request('/auth/register', 'POST', { email: 'migrate@example.com', password: 'password123', organization: 'Builder' }, 201)).user;
    await request('/profile', 'PATCH', { workspaces: ['provider', 'receiver'], activeWorkspace: 'provider' });
    const project = (await action(request, 'addProjectAction', { name: 'Migration', location: 'Delhi', status: 'active' })).result;
    const bytes = Buffer.from('%PDF-1.4\nMigration evidence');
    const upload = await request('/uploads', 'POST', { name: 'proof.pdf', data: `data:application/pdf;base64,${bytes.toString('base64')}` }, 201);
    await action(request, 'addMaterialAction', { ...materialInput(project.id), evidence: [{ kind: 'survey-sheet', label: 'Proof', ref: upload.ref }] });
    const expected = (await request('/dataset')).dataset;
    await close(oldServer); stopped = true;
    const source = join(directory, 'greenloop.sqlite');
    const digest = () => createHash('sha256').update(readFileSync(source)).digest('hex');
    const before = digest();
    const snapshot = readSqliteSnapshot(source);
    const counts = await importSnapshot(snapshot, postgres.pool, postgres.storage);
    assert.equal(counts.users, 1);
    assert.equal(counts.material_evidence, 1);
    const restored = hydrate(await readTables(postgres.database));
    assert.deepEqual(restored.dataset.materials, expected.materials);
    assert.equal(restored.owners[project.id], user.id);
    assert.equal(restored.sessions[0].token, snapshot.sessions[0].token);
    assert.deepEqual(await postgres.storage.get(snapshot.uploads[0].storage_path), bytes);
    assert.equal(digest(), before);
    await assert.rejects(importSnapshot(snapshot, postgres.pool, postgres.storage), /not empty/);
    assert.equal((await readTables(postgres.database)).users.length, 1);
  } finally { if (!stopped) await close(oldServer); await postgres.database.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('PostgreSQL: failed import rolls back rows and compensates storage writes', async () => {
  const postgres = await embeddedDatabase();
  try {
    const bad = { users: [], sessions: [], resets: [], google_identities: [], oauth_states: [], owners: {},
      dataset: { projects: [{ id: 'PR-1', name: 'Orphan', location: 'Delhi', status: 'active', surveyedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }], receivers: [], materials: [], slots: [], allocations: [], bookings: [], verifications: [], demands: [], offers: [], events: [], supportRequests: [] },
      uploads: [{ id: 'cdd7365c-f9db-4d24-92e5-822bf3a30640', user_id: '31a3115c-4bb6-4e88-81a7-5da1a939f35b', name: 'proof.pdf', mime: 'application/pdf', size_bytes: 6, storage_path: 'orphan/proof', content: Buffer.from('%PDF-1') }] };
    await assert.rejects(importSnapshot(bad, postgres.pool, postgres.storage));
    assert.equal(postgres.files.size, 0);
    assert.equal((await readTables(postgres.database)).projects.length, 0);
  } finally { await postgres.database.close(); }
});

test('private bucket migration blocks anonymous access despite broad existing storage policies', async () => {
  const postgres = await embeddedDatabase();
  try {
    await postgres.database.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id integer PRIMARY KEY, bucket_id text NOT NULL);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO anon, authenticated;
      GRANT ALL ON storage.objects TO anon, authenticated;
      CREATE POLICY broad_policy ON storage.objects TO anon, authenticated USING(true) WITH CHECK(true);
      INSERT INTO storage.objects VALUES (1, 'material-evidence'), (2, 'other-bucket');
    `);
    const migration = readFileSync(new URL('../../supabase/migrations/002_private_evidence_bucket.sql', import.meta.url), 'utf8');
    await postgres.database.exec(migration);
    await postgres.database.exec(migration); // Safe to reapply bucket configuration.
    for (const role of ['anon', 'authenticated']) {
      await postgres.database.exec(`SET ROLE ${role}`);
      assert.deepEqual((await postgres.database.query('SELECT id FROM storage.objects')).rows, [{ id: 2 }]);
      await assert.rejects(postgres.database.query("INSERT INTO storage.objects VALUES (3, 'material-evidence')"), /row-level security/);
      await postgres.database.exec('RESET ROLE');
    }
    assert.equal((await postgres.database.query("SELECT public FROM storage.buckets WHERE id='material-evidence'")).rows[0].public, false);
  } finally { await postgres.database.close(); }
});
