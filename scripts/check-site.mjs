// Checks the built site in dist/ before it goes live: run `npm run build && npm run check:site`.
// - every page has a title, a description and exactly one h1;
// - every <img> has a non-empty alt (CLAUDE.md: alt text is the default everywhere);
// - every internal link and #anchor points at something that exists;
// - every /go/ link has a redirect in dist/go/.htaccess;
// - no unfinished text (TODO, lorem ipsum, coming soon).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(dist)) {
  console.error('No dist/ folder. Run npm run build first.');
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const htmlFiles = walk(dist).filter((p) => p.endsWith('.html'));
const goFile = join(dist, 'go/.htaccess');
const goIds = existsSync(goFile)
  ? [...readFileSync(goFile, 'utf8').matchAll(/\^\/go\/([a-z0-9-]+)\//g)].map((m) => m[1])
  : [];

const errors = [];
const idsByPage = new Map();
const pageOf = (file) => '/' + file.slice(dist.length + 1).replace(/index\.html$/, '').replace(/\\/g, '/');

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  idsByPage.set(pageOf(file), new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

function targetExists(path) {
  const clean = path.split('?')[0];
  if (clean.startsWith('/go/')) return goIds.includes(clean.split('/')[2]);
  const local = join(dist, decodeURI(clean));
  if (clean.endsWith('/')) return existsSync(join(local, 'index.html'));
  return existsSync(local);
}

for (const file of htmlFiles) {
  const page = pageOf(file);
  const html = readFileSync(file, 'utf8');
  const where = page;

  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${where}: no <title>`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) errors.push(`${where}: no meta description`);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`${where}: ${h1} h1 headings (should be 1)`);

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const alt = m[0].match(/\salt="([^"]*)"/);
    if (!alt || !alt[1].trim()) errors.push(`${where}: image without alt text: ${m[0].slice(0, 120)}`);
  }

  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const bad of [/\bTODO\b/, /lorem ipsum/i, /coming soon/i, /placeholder text/i]) {
    if (bad.test(visible)) errors.push(`${where}: unfinished text matches ${bad}`);
  }

  for (const m of html.matchAll(/\shref="([^"]+)"/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    if (href.startsWith('#')) {
      const id = href.slice(1);
      if (id && !idsByPage.get(page)?.has(id)) errors.push(`${where}: anchor #${id} not found on the page`);
      continue;
    }
    if (!href.startsWith('/')) continue;
    if (href.startsWith('/_astro/')) continue;
    const [path, anchor] = href.split('#');
    if (!targetExists(path)) {
      errors.push(`${where}: broken link ${href}`);
      continue;
    }
    if (anchor && path.endsWith('/') && !idsByPage.get(path)?.has(anchor)) {
      errors.push(`${where}: link ${href} points at a missing anchor`);
    }
  }
}

const needed = ['/', '/views/', '/about/', '/contact/', '/disclosure/', '/privacy/', '/terms/', '/404.html'];
for (const p of needed) {
  const ok = p.endsWith('.html') ? existsSync(join(dist, p)) : existsSync(join(dist, p, 'index.html'));
  if (!ok) errors.push(`missing page ${p}`);
}
for (const f of ['.htaccess', 'robots.txt', 'sitemap.xml', 'favicon.svg', 'og-image.png', 'go/.htaccess']) {
  if (!existsSync(join(dist, f))) errors.push(`missing file ${f}`);
}

if (errors.length) {
  console.error(`check-site: ${errors.length} problem(s)`);
  for (const e of errors) console.error(' - ' + e);
  process.exit(1);
}
console.log(`check-site: ${htmlFiles.length} pages OK, ${goIds.length} price links OK`);
