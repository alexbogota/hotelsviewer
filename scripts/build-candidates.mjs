// Builds data/view-candidates.json: landmarks that could become a new view, ranked by interest.
// Runs on GitHub once a week (.github/workflows/candidates.yml), because the chat workspace can't reach Wikimedia.
//
// How it works:
// 1. Wikidata (SPARQL): landmarks of the kinds listed in CLASSES that have coordinates, an English Wikipedia
//    article and many language editions (the number of editions is the first measure of how well known a place is).
// 2. Wikipedia page views (REST API): English article views of the last 12 full months for the best-known ones.
// 3. Ranking by those views. Status of every place (new / drafted / published / rejected) is kept between runs,
//    so work already done is never lost. The three views on the site are marked published.
//
// A candidate is only a name on a list. Nothing here says that hotels with that view exist: the view writer
// researches that, and drops the place (status rejected, with a note) when it finds nothing to verify.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewsDir = join(root, 'src/data/views');
const outPath = join(root, 'data/view-candidates.json');
const UA = 'HotelsViewerBot/1.0 (https://hotelsviewer.com; contact@hotelsviewer.com)';

export const KEEP = 200; // how many places with status "new" stay on the list
export const FETCH_VIEWS_FOR = 600; // page views are asked only for the best-known places (by language editions)
export const STATUSES = ['new', 'drafted', 'published', 'rejected'];

// Kinds of landmark a hotel room can face. `labels` is the English Wikidata label we expect for the id:
// if Wikidata says something else, the kind is skipped and a warning is printed (protects against a wrong id).
// `min` = fewest language editions of a place of this kind (big kinds need a higher bar to stay fast).
export const CLASSES = [
  { q: 'Q12518', labels: ['tower'], min: 50 },
  { q: 'Q11303', labels: ['skyscraper'], min: 40 },
  { q: 'Q12280', labels: ['bridge'], min: 60 },
  { q: 'Q34038', labels: ['waterfall'], min: 30 },
  { q: 'Q23413', labels: ['castle'], min: 60 },
  { q: 'Q16560', labels: ['palace'], min: 60 },
  { q: 'Q2977', labels: ['cathedral'], min: 60 },
  { q: 'Q163687', labels: ['basilica'], min: 60 },
  { q: 'Q44539', labels: ['temple'], min: 60 },
  { q: 'Q32815', labels: ['mosque'], min: 60 },
  { q: 'Q16970', labels: ['church building'], min: 100 },
  { q: 'Q4989906', labels: ['monument'], min: 80 },
  { q: 'Q483453', labels: ['fountain'], min: 30 },
  { q: 'Q8072', labels: ['volcano'], min: 60 },
  { q: 'Q8502', labels: ['mountain'], min: 120 },
  { q: 'Q23397', labels: ['lake'], min: 120 },
  { q: 'Q40080', labels: ['beach'], min: 40 },
  { q: 'Q39594', labels: ['bay'], min: 100 },
  { q: 'Q23442', labels: ['island'], min: 150 },
  { q: 'Q39715', labels: ['lighthouse'], min: 40 },
  { q: 'Q153562', labels: ['opera house'], min: 40 },
  { q: 'Q483110', labels: ['stadium'], min: 60 },
  { q: 'Q174782', labels: ['square', 'town square'], min: 50 },
  { q: 'Q22698', labels: ['park'], min: 100 },
  { q: 'Q46169', labels: ['national park'], min: 60 },
  { q: 'Q35666', labels: ['glacier'], min: 60 },
  { q: 'Q839954', labels: ['archaeological site'], min: 60 },
  { q: 'Q179700', labels: ['statue'], min: 60 },
  { q: 'Q150784', labels: ['canyon'], min: 40 },
  { q: 'Q45776', labels: ['fjord'], min: 40 },
  { q: 'Q570116', labels: ['tourist attraction'], min: 100 },
];

// A place that is one of these (or a kind of one) is not a landmark you can see from a window:
// countries and other political territories, administrative areas, cities, towns and villages.
// Island nations, Greenland, Athens and ancient cities all fall out here.
export const EXCLUDED_TYPES = [
  { q: 'Q6256', labels: ['country'] },
  { q: 'Q1048835', labels: ['political territorial entity'] },
  { q: 'Q56061', labels: ['administrative territorial entity'] },
  { q: 'Q486972', labels: ['human settlement'] },
];

// ---------- small pure helpers (tested in scripts/test-candidates.mjs) ----------

export function parseCoord(wkt) {
  const m = /Point\(\s*(-?[\d.]+(?:e-?\d+)?)\s+(-?[\d.]+(?:e-?\d+)?)\s*\)/i.exec(wkt || '');
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
}

export function normalize(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function slugify(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const isQid = (s) => /^Q\d+$/.test(s || '');
const val = (row, key) => {
  const v = row?.[key]?.value;
  return v && !isQid(v) ? v : '';
};

// One SPARQL result row -> a plain item, or null when the row is unusable.
export function rowToItem(row, cls) {
  const qid = (row.item?.value || '').split('/').pop();
  const name = val(row, 'itemLabel');
  const enwiki = row.title?.value || '';
  const coords = parseCoord(row.coord?.value);
  const sitelinks = Number(row.sitelinks?.value);
  if (!isQid(qid) || !name || !enwiki || !coords || !Number.isFinite(sitelinks)) return null;
  if (normalize(name) === normalize(val(row, 'countryLabel'))) return null; // "Japan" in Japan: a country, not a landmark
  return { qid, name, enwiki, coords, sitelinks, country: val(row, 'countryLabel'), area: val(row, 'areaLabel'), classes: [cls] };
}

// Rows of all kinds -> one item per place (a place can come back several times: other kind, other country or area).
export function collect(rowsByClass) {
  const items = new Map();
  for (const { cls, rows } of rowsByClass) {
    for (const row of rows) {
      const item = rowToItem(row, cls);
      if (!item) continue;
      const have = items.get(item.qid);
      if (!have) {
        items.set(item.qid, item);
        continue;
      }
      if (!have.classes.includes(cls)) have.classes.push(cls);
      if (!have.country && item.country) have.country = item.country;
      if (!have.area && item.area) have.area = item.area;
    }
  }
  return [...items.values()];
}

// Merges fresh items with the previous file. Rules:
// - the status (and note, slug) of a place seen before is kept; a place that matches a view on the site is "published";
// - every place with a status other than "new" stays on the list, even if it fell out of the ranking;
// - of the "new" places only the best `keep` by page views stay.
export function mergeCandidates({ fresh, previous, publishedViews, keep = KEEP }) {
  const prevByQid = new Map((previous?.candidates || []).map((c) => [c.qid, c]));
  const freshQids = new Set(fresh.map((i) => i.qid));
  const publishedByName = new Map();
  for (const v of publishedViews) {
    publishedByName.set(normalize(v.landmark), v.slug);
    publishedByName.set(normalize(v.slug), v.slug);
  }

  const build = (item) => {
    const prev = prevByQid.get(item.qid);
    const publishedSlug = publishedByName.get(normalize(item.name)) || publishedByName.get(normalize(item.enwiki));
    let status = prev?.status && STATUSES.includes(prev.status) ? prev.status : 'new';
    let slug = prev?.slug || slugify(item.name);
    if (publishedSlug) {
      status = 'published';
      slug = publishedSlug;
    }
    const views12m = item.views12m ?? prev?.views12m ?? null;
    const near = publishedViews
      .filter((v) => v.coords && distanceKm(item.coords, v.coords) <= 3 && v.slug !== slug)
      .map((v) => v.slug);
    const out = {
      qid: item.qid,
      name: item.name,
      enwiki: item.enwiki,
      country: item.country,
      area: item.area,
      coords: item.coords,
      classes: item.classes,
      sitelinks: item.sitelinks,
      views12m,
      status,
      slug,
    };
    if (near.length) out.near = near;
    if (prev?.note) out.note = prev.note;
    return out;
  };

  const list = fresh.map(build);
  for (const prev of prevByQid.values()) {
    if (!freshQids.has(prev.qid) && prev.status && prev.status !== 'new') list.push(prev); // keep work already done
  }

  const rank = (a, b) => (b.views12m ?? -1) - (a.views12m ?? -1) || b.sitelinks - a.sitelinks || a.qid.localeCompare(b.qid);
  const worked = list.filter((c) => c.status !== 'new');
  const fresh_new = list.filter((c) => c.status === 'new' && c.views12m !== null).sort(rank).slice(0, keep);
  const result = [...worked, ...fresh_new].sort(rank);
  makeSlugsUnique(result, publishedViews);
  return result;
}

// A slug is a suggested file name for the view (src/data/views/<slug>.json), so every candidate needs its own.
// Published places keep theirs; then places already worked on; the rest by rank. A clash gets the country, then the id.
export function makeSlugsUnique(list, publishedViews = []) {
  const taken = new Set(publishedViews.map((v) => v.slug));
  const priority = (c) => (c.status === 'published' ? 0 : c.status === 'new' ? 2 : 1);
  const order = [...list].sort((a, b) => priority(a) - priority(b)); // stable: rank order inside each group
  for (const c of order) {
    if (c.status === 'published') {
      taken.add(c.slug);
      continue;
    }
    const base = c.slug || slugify(c.name) || c.qid.toLowerCase();
    const options = [base, `${base}-${slugify(c.country)}`.replace(/-$/, ''), `${base}-${c.qid.toLowerCase()}`];
    c.slug = options.find((s) => s && !taken.has(s)) || `${c.qid.toLowerCase()}`;
    taken.add(c.slug);
  }
}

// ---------- network (GitHub only) ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "::warning::" lines show up as annotations on the GitHub run page; locally they are just printed.
const warn = (msg) => console.warn(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `WARNING: ${msg}`);
const notice = (msg) => console.log(process.env.GITHUB_ACTIONS ? `::notice::${msg}` : msg);

async function sparql(query, attempts = 2) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query, format: 'json' }),
        signal: AbortSignal.timeout(80000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`Wikidata answered ${res.status}`);
      if (!res.ok) throw new Error(`Wikidata answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()).results.bindings;
    } catch (e) {
      lastError = e;
      await sleep(4000 * i);
    }
  }
  throw lastError;
}

function classQuery(q, min) {
  return `SELECT ?item ?itemLabel ?sitelinks ?coord ?countryLabel ?areaLabel ?title WHERE {
  ?item wdt:P31 ?cls . ?cls wdt:P279* wd:${q} .
  ?item wikibase:sitelinks ?sitelinks . FILTER(?sitelinks >= ${min})
  ?item wdt:P625 ?coord .
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?item wdt:P17 ?country . }
  OPTIONAL { ?item wdt:P131 ?area . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 1500`;
}

// Which of these places are countries, administrative areas or settlements? Asked only for the places already
// found (a few hundred), in small groups: that is light work for Wikidata, unlike a filter inside the big queries.
export function exclusionQuery(qids, excluded) {
  return `SELECT DISTINCT ?item WHERE {
  VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} }
  ?item wdt:P31 ?type . ?type wdt:P279* ?bad .
  VALUES ?bad { ${excluded.map((e) => 'wd:' + e.q).join(' ')} }
}`;
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function notLandmarks(qids, excluded) {
  const bad = new Set();
  for (const part of chunk(qids, 100)) {
    const rows = await sparql(exclusionQuery(part, excluded), 3);
    for (const r of rows) bad.add(r.item.value.split('/').pop());
  }
  return bad;
}

// Asks Wikidata for the English names of all ids we use and keeps only those that match what we expect.
async function checkedIds() {
  const all = [...CLASSES, ...EXCLUDED_TYPES];
  const query = `SELECT ?c ?cLabel WHERE { VALUES ?c { ${all.map((c) => 'wd:' + c.q).join(' ')} } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const rows = await sparql(query);
  const labels = new Map(rows.map((r) => [r.c.value.split('/').pop(), (r.cLabel?.value || '').toLowerCase()]));
  const keep = (list) =>
    list.filter((c) => {
      const got = labels.get(c.q);
      if (got && c.labels.includes(got)) return true;
      warn(`${c.q} is "${got ?? 'unknown'}" in Wikidata, expected ${c.labels.join(' / ')}: skipped.`);
      return false;
    });
  return { classes: keep(CLASSES), excluded: keep(EXCLUDED_TYPES) };
}

async function fetchClass(c) {
  for (const min of [c.min, c.min * 2]) {
    try {
      const rows = await sparql(classQuery(c.q, min));
      console.log(`${c.labels[0]}: ${rows.length} rows (min ${min} language editions)`);
      return rows;
    } catch (e) {
      warn(`${c.labels[0]} with min ${min} failed: ${e.message}`);
    }
  }
  return [];
}

export function viewsPeriod(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)); // last day of the previous month
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return { start: ymd(start), end: ymd(end), label: `${start.toISOString().slice(0, 7)}..${end.toISOString().slice(0, 7)}` };
}

async function pageViews(title, period) {
  const url =
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' +
    `${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${period.start}/${period.end}`;
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return 0; // no data for the period
      if (res.status === 429 || res.status >= 500) throw new Error(`answered ${res.status}`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json.items || []).reduce((sum, it) => sum + (it.views || 0), 0);
    } catch {
      await sleep(1500 * i);
    }
  }
  return null; // unknown: the previous number (if any) is kept
}

async function addViews(items, period) {
  let next = 0;
  let failed = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      item.views12m = await pageViews(item.enwiki, period);
      if (item.views12m === null) failed++;
      await sleep(60);
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  if (failed) warn(`page views missing for ${failed} places.`);
}

// ---------- files ----------

function readPublishedViews() {
  return readdirSync(viewsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(viewsDir, f), 'utf8')))
    .map((v) => ({ slug: v.slug, landmark: v.landmark, coords: v.coords }));
}

export function renderFile({ generated, period, publishedViews, candidates }) {
  const head = [
    `  "generated": ${JSON.stringify(generated)}`,
    `  "viewsPeriod": ${JSON.stringify(period)}`,
    `  "sources": "Wikidata (landmarks, coordinates, number of language editions) and Wikimedia pageviews (English Wikipedia, users, last 12 full months)"`,
    `  "statuses": "new = not started; drafted = draft waiting on branch drafts; published = on the site; rejected = not suitable, reason in note"`,
    `  "publishedViews": ${JSON.stringify(publishedViews.map((v) => v.slug))}`,
  ];
  const rows = candidates.map((c) => '    ' + JSON.stringify(c));
  return `{\n${head.join(',\n')},\n  "candidates": [\n${rows.join(',\n')}\n  ]\n}\n`;
}

async function main() {
  const publishedViews = readPublishedViews();
  const previous = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
  const period = viewsPeriod();
  console.log(`Page views period: ${period.label}. Views on the site: ${publishedViews.map((v) => v.slug).join(', ')}`);

  const { classes, excluded } = await checkedIds();
  if (excluded.length < EXCLUDED_TYPES.length) throw new Error('A type to exclude was not recognised, so countries and cities would leak into the list. Nothing is saved.');
  const rowsByClass = [];
  for (const c of classes) rowsByClass.push({ cls: c.labels[0], rows: await fetchClass(c) });

  const items = collect(rowsByClass);
  console.log(`Places found: ${items.length}`);
  notice(`Places found: ${items.length}. Rows per kind: ${rowsByClass.map((r) => `${r.cls} ${r.rows.length}`).join(', ')}`);
  if (items.length < 100) throw new Error('Far too few places came back from Wikidata. The old file is left as it is.');

  const pool = [...items].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, FETCH_VIEWS_FOR + 300);
  const notLandmark = await notLandmarks(pool.map((i) => i.qid), excluded);
  const best = pool.filter((i) => !notLandmark.has(i.qid)).slice(0, FETCH_VIEWS_FOR);
  notice(`Left out as countries, administrative areas or settlements: ${notLandmark.size} of ${pool.length}. Kept for page views: ${best.length}`);
  await addViews(best, period);
  const withViews = best.filter((i) => i.views12m !== null || previous?.candidates?.some((c) => c.qid === i.qid)).length;
  if (withViews < best.length / 2) throw new Error('Page views are missing for more than half of the places. The old file is left as it is.');

  const candidates = mergeCandidates({ fresh: best, previous, publishedViews });
  const generated = new Date().toISOString().slice(0, 10);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderFile({ generated, period: period.label, publishedViews, candidates }));
  console.log(`Wrote ${candidates.length} candidates to data/view-candidates.json`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const top = candidates.filter((c) => c.status === 'new').slice(0, 20);
    const lines = [
      `### View candidates, ${generated}`,
      `${candidates.length} places on the list (${candidates.filter((c) => c.status === 'new').length} new). Page views: ${period.label}.`,
      '',
      '| # | Place | Country | Kind | Views, 12 months | Editions |',
      '|---|-------|---------|------|-----------------:|---------:|',
      ...top.map((c, i) => `| ${i + 1} | ${c.name} | ${c.country || ''} | ${c.classes.join(', ')} | ${(c.views12m ?? 0).toLocaleString('en-US')} | ${c.sitelinks} |`),
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
}
