import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, 'dist'), { recursive: true });
const result = spawnSync(process.execPath, [
  join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
  '-i', join(root, 'src/style-entry.css'), '-o', join(root, 'dist/styles.css'), '--minify'
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
const map=await readFile(join(root,'src/network-map.svg'),'utf8');
const html=(await readFile(join(root,'src/index.html'),'utf8')).replace(/(<div id="network-map-host"[^>]*>)(<\/div>)/,`$1${map}$2`);
await writeFile(join(root,'dist/index.html'),html);
await build({entryPoints:[join(root,'src/app.js')],outfile:join(root,'dist/app.js'),bundle:true,minify:true,format:'iife',platform:'browser',target:['es2022'],legalComments:'eof'});
for (const asset of ['hero-v2','assets-v2','recovery-v2','identify-v2','inspection-v2','logistics-v2','network-v2','beam-product','opportunity','matching']) {
  await access(join(root, `dist/assets/${asset}.webp`));
}
for(const asset of ['inter-latin.woff2','passport-qr.svg','favicon.svg'])await access(join(root,'dist/assets',asset));
console.log('Built dist/ — 13 chapters, compiled Tailwind CSS, bundled Three.js, inline network map and local assets.');
