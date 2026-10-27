import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createBackend } from '../backend/src/app.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'greenloop-public-site-'));
const backend = createBackend({ dataDir: directory, databaseProvider: 'sqlite' });
let vite;
try {
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  vite = await createServer({ root: resolve(root, 'frontend'), configFile: resolve(root, 'frontend/vite.config.ts'),
    logLevel: 'error', server: { port: 0, host: '127.0.0.1', strictPort: false } });
  await vite.listen();
  for (const [label, port] of [['production', backend.address().port], ['development', vite.httpServer.address().port]]) {
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200, label);
    assert.match(response.headers.get('content-type'), /text\/html/);
    const html = await response.text();
    assert.equal([...html.matchAll(/<section[^>]+data-index="(\d+)"/g)].length, 13, label);
    assert.match(html, /class="hero-wordmark">GREEN<span>LOOP<\/span>/, `${label}: greenloop-story hero`);
    assert.ok(!html.includes('id="market-search"'), `${label}: greenloop-story marketplace`);
    assert.match(html, /class="india-outline"/);
    assert.ok(!html.includes("ENTER PLATFORM"), `${label}: removed platform button`);
    assert.ok(!html.includes('class="platform-button'), `${label}: removed platform button styling hook`);
    for (const section of [html.match(/<header\b[\s\S]*?<\/header>/)?.[0], html.match(/<section id="network"[\s\S]*?<\/section>/)?.[0]]) {
      assert.ok(section, `${label}: header and final chapter must exist`);
      assert.match(section, /href="\/sign-in">Sign in<\/a>/);
      assert.match(section, /href="\/sign-up">Create account/);
    }
    assert.ok(!html.includes('<div id="root"></div>'), `${label}: public page must not be the old SPA`);
    const head = await fetch(`${base}/`, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    const assets = new Set([...html.matchAll(/(?:src|href)="(\/landing\/[^\"]+)"/g)].map(match => match[1]));
    for (const asset of assets) {
      const result = await fetch(`${base}${asset}`);
      assert.equal(result.status, 200, `${label}: ${asset}`);
      assert.ok((await result.arrayBuffer()).byteLength > 0, asset);
    }
    for (const path of ['/sign-in', '/sign-up', '/onboarding', '/app', '/app/bookings-deliveries']) {
      const result = await fetch(`${base}${path}`);
      assert.equal(result.status, 200, `${label}: ${path}`);
      assert.match(await result.text(), /<div id="root"><\/div>/, `${label}: ${path} must retain the React app`);
    }
    console.log(`PASS ${label}: 13 chapters, inline map, account links, ${assets.size} local assets, HEAD, and auth/workspace routes.`);
  }
  const health = await fetch(`http://127.0.0.1:${backend.address().port}/api/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });
  // Check JavaScript syntax without running the DOM/WebGL controller in Node.
  new Function(readFileSync(resolve(root, 'frontend/public/landing/app.js'), 'utf8'));
  console.log('PASS backend API and bundled presentation JavaScript syntax.');
} finally {
  if (vite) await vite.close();
  await new Promise(resolve => backend.close(resolve));
  assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
  rmSync(directory, { recursive: true, force: true });
}
