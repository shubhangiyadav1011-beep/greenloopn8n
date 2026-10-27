import { createBackend } from '../backend/src/app.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dataDir = mkdtempSync(join(tmpdir(), 'greenloop-live-audit-'));
const server = createBackend({ dataDir, origins: ['http://localhost:5174'] });
server.listen(3101, '127.0.0.1', () => console.log('Audit backend ready; isolated temporary database'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());

