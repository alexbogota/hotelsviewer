// Writes dist/go/.htaccess: one short address per hotel (hotelsviewer.com/go/<hotel-id>/),
// sending the visitor to the booking site set in src/data/links.json.
// Why: every "Check prices" button points at our own address, so switching to an affiliate link
// (Stay22, Booking via CJ, Expedia) means changing one template, not every page.
// The ticket and transport rows ("extras" of a view) work the same way, but each one goes to its own
// Travelpayouts partner link from src/data/partner-links.json (made by scripts/make-partner-links.mjs).
// A row without a partner link gets no address here, and the page does not show it.
// Runs automatically after `astro build` (see "build" in package.json).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const links = JSON.parse(readFileSync(join(root, 'src/data/links.json'), 'utf8'));
const partnerPath = join(root, 'src/data/partner-links.json');
const partnerLinks = existsSync(partnerPath) ? JSON.parse(readFileSync(partnerPath, 'utf8')) : {};
const viewsDir = join(root, 'src/data/views');

if (!links.template || !links.template.includes('{query}')) {
  throw new Error('src/data/links.json: "template" must contain {query}');
}

const hotels = [];
const extras = [];
for (const file of readdirSync(viewsDir).filter((f) => f.endsWith('.json')).sort()) {
  const view = JSON.parse(readFileSync(join(viewsDir, file), 'utf8'));
  for (const h of view.hotels) hotels.push({ id: h.id, query: h.query, view: view.slug });
  for (const e of view.extras ?? []) extras.push({ ...e, view: view.slug });
}

const seen = new Set();
for (const h of hotels) {
  if (!/^[a-z0-9-]+$/.test(h.id)) throw new Error(`Hotel id must be lowercase letters, digits and dashes: "${h.id}"`);
  if (seen.has(h.id)) throw new Error(`The same hotel id is used twice: "${h.id}"`);
  if (!h.query) throw new Error(`Hotel "${h.id}" has no "query" for the price link`);
  seen.add(h.id);
}
for (const e of extras) {
  if (!/^[a-z0-9-]+$/.test(e.id)) throw new Error(`Extra id must be lowercase letters, digits and dashes: "${e.id}"`);
  if (seen.has(e.id)) throw new Error(`An extra uses an id that is already taken: "${e.id}"`);
  for (const field of ['kind', 'title', 'partner', 'url', 'checked']) {
    if (!e[field]) throw new Error(`Extra "${e.id}" (${e.view}) has no "${field}"`);
  }
  if (!/^https:\/\//.test(e.url)) throw new Error(`Extra "${e.id}": "url" must start with https://`);
  if (!/^\d{4}-\d{2}$/.test(e.checked)) throw new Error(`Extra "${e.id}": "checked" must look like 2026-10`);
  seen.add(e.id);
}

const lines = hotels.map((h) => {
  const target = links.template.replace('{query}', encodeURIComponent(h.query));
  if (/["\s$]/.test(target)) throw new Error(`Link for "${h.id}" contains a character that would break .htaccess: ${target}`);
  return `  RedirectMatch 302 ^/go/${h.id}/?$ "${target}"`;
});

// Only extras whose partner link was made for the same seller address are live.
const live = extras.filter((e) => partnerLinks[e.id]?.url === e.url);
const extraLines = live.map((e) => {
  const target = partnerLinks[e.id].partner_url;
  if (!/^https:\/\/[^\s"$]+$/.test(target)) throw new Error(`Partner link for "${e.id}" is not a plain https address: ${target}`);
  return `  RedirectMatch 302 ^/go/${e.id}/?$ "${target}"`;
});

const out = [
  '# Made by scripts/build-go.mjs from src/data/links.json, src/data/partner-links.json and src/data/views/*.json. Do not edit by hand.',
  `# ${hotels.length} hotels. Current target: ${links.provider}. 302 (not 301), so a changed link is never stuck in a browser.`,
  `# ${live.length} ticket and transport links (of ${extras.length} written in the view files) go to Travelpayouts partner links.`,
  '<IfModule mod_alias.c>',
  ...lines,
  ...extraLines,
  '</IfModule>',
  '',
].join('\n');

mkdirSync(join(root, 'dist/go'), { recursive: true });
writeFileSync(join(root, 'dist/go/.htaccess'), out);
console.log(
  `build-go: wrote dist/go/.htaccess with ${hotels.length} links to ${links.provider}` +
    ` and ${live.length} of ${extras.length} partner links`,
);
