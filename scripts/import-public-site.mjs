import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const source = new URL('../greenloop-story/dist/', import.meta.url);
const destination = new URL('../frontend/public/landing/', import.meta.url);
const accountLinks = '<a class="auth-link auth-link-secondary" href="/sign-in">Sign in</a><a class="auth-link auth-link-primary" href="/sign-up">Create account</a>';
await mkdir(destination, { recursive: true });
await cp(new URL('assets/', source), new URL('assets/', destination), { recursive: true });
for (const name of ['index.html', 'app.js', 'styles.css']) {
  let text = (await readFile(new URL(name, source), 'utf8')).replaceAll('./assets/', '/landing/assets/');
  if (name === 'index.html') {
    text = text.replaceAll('./styles.css', '/landing/styles.css').replaceAll('./app.js', '/landing/app.js')
      .replace(/<a href="#marketplace" data-go="6" class="platform-button[^>]*>[\s\S]*?<\/a>/, `<nav class="header-auth" aria-label="Account">${accountLinks}</nav>`)
      .replace(/<header\b[^>]*>[\s\S]*?<\/header>/, header => header.includes('class="header-auth"')
        ? header
        : header.replace('</header>', `<nav class="header-auth" aria-label="Account">${accountLinks}</nav></header>`))
      .replace(/(<section id="network"[\s\S]*?<div class="scene-copy[^>]*>)([\s\S]*?)(<\/div>)/, `$1$2<nav class="chapter-auth" aria-label="Join GreenLoop">${accountLinks}</nav>$3`)
      .replace(/<a href="\.\/greenloop-source\.zip"[^>]*>[\s\S]*?<\/a>/, '');
  }
  if (name === 'styles.css') {
    text += '\n' + await readFile(new URL('./public-site-auth.css', import.meta.url), 'utf8');
  }
  await writeFile(new URL(name, destination), text);
}
await cp(new URL('../greenloop-story/ASSETS.md', import.meta.url), new URL('ASSETS.md', destination));
console.log(`Imported the public experience into ${fileURLToPath(destination)}`);
