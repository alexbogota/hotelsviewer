// Writes dist/go/.htaccess: one short address per hotel (hotelsviewer.com/go/<hotel-id>/),
// sending the visitor to the booking site set in src/data/links.json.
// Why: every "Check prices" button points at our own address, so switching to an affiliate link
// (Stay22, Booking via CJ, Expedia) means changing one template, not every page.
// Runs automatically after `astro build` (see "build" in package.json).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const links = JSON.parse(readFileSync(join(root, 'src/data/links.json'), 'utf8'));
const viewsDir = join(root, 'src/data/views');

if (!links.template || !links.template.includes('{query}')) {
  throw new Error('src/data/links.json: "template" must contain {query}');
}

const hotels = [];
for (const file of readdirSync(viewsDir).filter((f) => f.endsWith('.json')).sort()) {
  const view = JSON.parse(readFileSync(join(viewsDir, file), 'utf8'));
  for (const h of view.hotels) hotels.push({ id: h.id, query: h.query, view: view.slug });
}

const seen = new Set();
for (const h of hotels) {
  if (!/^[a-z0-9-]+$/.test(h.id)) throw new Error(`Hotel id must be lowercase letters, digits and dashes: "${h.id}"`);
  if (seen.has(h.id)) throw new Error(`The same hotel id is used twice: "${h.id}"`);
  if (!h.query) throw new Error(`Hotel "${h.id}" has no "query" for the price link`);
  seen.add(h.id);
}

const lines = hotels.map((h) => {
  const target = links.template.replace('{query}', encodeURIComponent(h.query));
  if (/["\s$]/.test(target)) throw new Error(`Link for "${h.id}" contains a character that would break .htaccess: ${target}`);
  return `  RedirectMatch 302 ^/go/${h.id}/?$ "${target}"`;
});

const out = [
  '# Made by scripts/build-go.mjs from src/data/links.json and src/data/views/*.json. Do not edit by hand.',
  `# ${hotels.length} hotels. Current target: ${links.provider}. 302 (not 301), so a changed link is never stuck in a browser.`,
  '<IfModule mod_alias.c>',
  ...lines,
  '</IfModule>',
  '',
].join('\n');

mkdirSync(join(root, 'dist/go'), { recursive: true });
writeFileSync(join(root, 'dist/go/.htaccess'), out);
console.log(`build-go: wrote dist/go/.htaccess with ${hotels.length} links to ${links.provider}`);
