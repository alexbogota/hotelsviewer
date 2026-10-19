// Turns the ticket and transport links of each view (the "extras" in src/data/views/*.json) into
// Travelpayouts partner links with the Travelpayouts Links API, and saves them in src/data/partner-links.json.
// Runs on GitHub (step in .github/workflows/deploy.yml). The API token is the GitHub secret TRAVELPAYOUTS_TOKEN.
//
// Rules:
// - only links we have not made yet (or whose address changed) are requested; the others stay as they are;
// - the token goes into one request header and is never printed or saved;
// - never fails the deploy: problems are printed and saved in data/partner-links-status.json, and a row
//   without a partner link is simply not shown on the page (see liveExtras in src/lib/views.ts).
// Docs: https://support.travelpayouts.com/hc/en-us/articles/25289759198226-API-for-Travelpayouts-partner-links
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.travelpayouts.com/links/v1/create';
const MAX_PER_REQUEST = 10; // the API accepts up to 10 links per request

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const clip = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);

// Every extra of every view: { id, url, view }.
export function collectExtras(views) {
  const out = [];
  for (const view of views) {
    for (const e of view.extras ?? []) out.push({ id: e.id, url: e.url, view: view.slug });
  }
  return out;
}

// The ones that still need a partner link: never made, or the brand address was changed since.
export function pending(extras, store) {
  return extras.filter((e) => store[e.id]?.url !== e.url);
}

// Sub ID shows in the Travelpayouts statistics. Letters, digits and underscores only, to be safe.
export const subId = (id) => id.replace(/[^a-z0-9]+/gi, '_');

export function buildBody(account, batch) {
  return {
    trs: account.trs,
    marker: account.marker,
    shorten: true,
    links: batch.map((e) => ({ url: e.url, sub_id: subId(e.id) })),
  };
}

// A partner link ends up inside .htaccess, so it must be a plain https address.
export function safeLink(u) {
  return typeof u === 'string' && /^https:\/\/[^\s"$]+$/.test(u);
}

const allFailed = (batch, message) => ({
  made: {},
  failed: Object.fromEntries(batch.map((e) => [e.id, clip(message)])),
});

// Reads the API answer: { result: { links: [{ url, code, partner_url | message }] } }.
export function readResponse(json, batch) {
  const links = json?.result?.links;
  if (!Array.isArray(links)) return allFailed(batch, 'unexpected answer from the API');
  const byUrl = new Map(links.map((l) => [l.url, l]));
  const made = {};
  const failed = {};
  batch.forEach((e, i) => {
    const entry = byUrl.get(e.url) ?? (links.length === batch.length ? links[i] : undefined);
    if (!entry) failed[e.id] = 'no answer for this link';
    else if (entry.code === 'success' && safeLink(entry.partner_url)) made[e.id] = { url: e.url, partner_url: entry.partner_url };
    else failed[e.id] = clip(entry.message ?? entry.code ?? 'failed');
  });
  return { made, failed };
}

export async function fetchBatch(batch, account, token, fetchImpl = fetch) {
  let res;
  try {
    res = await fetchImpl(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Access-Token': token },
      body: JSON.stringify(buildBody(account, batch)),
    });
  } catch (e) {
    return allFailed(batch, `network problem: ${e.message}`);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    // not JSON: handled below
  }
  if (!res.ok) return allFailed(batch, `HTTP ${res.status}${json?.message ? ': ' + json.message : ''}`);
  return readResponse(json, batch);
}

// The whole job without any file access, so it can be tested.
export async function run({ views, store, account, token, fetchImpl }) {
  const extras = collectExtras(views);
  const known = new Set(extras.map((e) => e.id));
  const next = Object.fromEntries(Object.entries(store).filter(([id]) => known.has(id)));
  const todo = pending(extras, next);
  if (todo.length === 0) return { store: next, status: null, note: 'No new partner links needed.' };
  if (!token) return { store: next, status: null, note: 'TRAVELPAYOUTS_TOKEN is not set: skipped.' };

  const failed = {};
  for (const batch of chunk(todo, MAX_PER_REQUEST)) {
    const res = await fetchBatch(batch, account, token, fetchImpl);
    Object.assign(next, res.made);
    Object.assign(failed, res.failed);
  }
  const status = Object.fromEntries(
    extras.map((e) => [e.id, next[e.id]?.url === e.url ? 'ok' : failed[e.id] ?? 'not made']),
  );
  return { store: next, status, note: null };
}

const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const read = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);

async function main() {
  const viewsDir = join(root, 'src/data/views');
  const storePath = join(root, 'src/data/partner-links.json');
  const statusPath = join(root, 'data/partner-links-status.json');
  const views = readdirSync(viewsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(viewsDir, f), 'utf8')));
  const account = read(join(root, 'src/data/travelpayouts.json'), {});
  if (!Number.isInteger(account.marker) || !Number.isInteger(account.trs)) {
    console.log('make-partner-links: src/data/travelpayouts.json needs numbers "marker" and "trs". Skipped.');
    return;
  }
  const oldStore = read(storePath, {});
  const { store, status, note } = await run({
    views,
    store: oldStore,
    account,
    token: process.env.TRAVELPAYOUTS_TOKEN,
    fetchImpl: fetch,
  });
  if (note) console.log(note);
  if (status) {
    for (const [id, s] of Object.entries(status)) {
      console.log(`${id}: ${s}`);
      // The GitHub run log is not reachable from the chat workspace, but annotations are.
      if (s !== 'ok') console.log(`::warning::partner link ${id}: ${s}`);
    }
    const oldStatus = read(statusPath, null);
    if (JSON.stringify(oldStatus) !== JSON.stringify(sorted(status))) {
      writeFileSync(statusPath, JSON.stringify(sorted(status), null, 2) + '\n');
    }
  }
  const text = JSON.stringify(sorted(store), null, 2) + '\n';
  if (text !== JSON.stringify(sorted(oldStore), null, 2) + '\n') {
    writeFileSync(storePath, text);
    console.log('partner-links.json updated');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    // Never fail the deploy. The message cannot contain the token: it is only ever sent in a header.
    console.log(`make-partner-links: ${e.message}`);
  });
}
