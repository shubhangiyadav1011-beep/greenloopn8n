import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Read-only checks against an already running frontend and its API proxy.
const base = process.env.AUDIT_ORIGIN ?? 'http://localhost:5174';
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(tsx?|css|json)$/.test(entry.name)) files.push(path);
  }
}
const frontendRoot = 'frontend';
const sourceRoot = join(frontendRoot, 'src');
const publicRoot = join(frontendRoot, 'public');
walk(sourceRoot);
const failures = [], missingAssets = [], responses = [];
for (const [path, status] of [['/', 200], ['/app/projects', 200], ['/app/materials?project=P-001', 200], ['/api/health', 200], ['/api/config', 200], ['/api/auth/me', 200], ['/api/dataset', 401]]) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, status, path);
  responses.push({ path, status });
}
for (let i = 0; i < files.length; i += 6) {
  await Promise.all(files.slice(i, i + 6).map(async file => {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/["'`](\/(?:images|videos|fonts)\/[^"'`\s${}]+)["'`]/g)) {
      if (!existsSync(join(publicRoot, match[1]))) missingAssets.push({ file, asset: match[1] });
    }
    if (/\.(tsx?|css)$/.test(file)) {
      const response = await fetch(`${base}/${relative(frontendRoot, file).replaceAll('\\', '/')}`);
      if (!response.ok) failures.push({ file, status: response.status });
    }
  }));
}
const report = { base, sourceFilesInspected: files.length, moduleFailures: failures, missingAssets, responses, limitation: 'HTTP serving/module transforms only; no browser rendering or UI interaction.' };
writeFileSync('docs/audits/http-results-latest.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
assert.equal(failures.length, 0, 'Frontend module failures');
assert.equal(missingAssets.length, 0, 'Missing local assets');
