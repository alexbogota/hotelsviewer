// Finds licensed photos of our hotels on Wikimedia Commons. A trial run: it only makes a list, nothing goes on the site.
// Runs on GitHub ("Find hotel photos" workflow), because the chat workspace can't reach Wikimedia.
//
// For every hotel in src/data/views/*.json:
//   1. Wikidata: the hotel's item (searched by name, accepted only within 3 km of the landmark) gives its main image (P18)
//      and its Commons category (P373).
//   2. Commons: files in that category, and files whose title or text holds the hotel's exact name.
// Each file is kept only if its licence allows commercial use (same rule as the landmark photos: CC0, public domain,
// CC BY, CC BY-SA), it is a JPEG or PNG at least 800 px wide, and it isn't a logo or a map.
// Night shots are refused for the Eiffel Tower view only (the tower's lights are copyrighted).
// "view-from" marks a photo whose title or description says it was taken from the hotel (room, terrace, balcony).
//
// Writes data/hotel-photo-candidates.json (every file found, with licence, author and link) and
// docs/hotel-photos-report.md (one line per hotel, for the owner). Never fails on one hotel: the error goes into the list.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenceOk, looksLikeNight } from './fetch-photos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'HotelsViewerBot/1.0 (https://hotelsviewer.com; contact@hotelsviewer.com)';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const MAX_PER_HOTEL = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) u.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    throw new Error(`${u.hostname} answered ${res.status}`);
  }
  throw new Error(`${u.hostname} did not answer`);
}

const strip = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const norm = (s = '') => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function distanceKm(a, b) {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2);
  const y = Math.sin(((b.lng - a.lng) * r) / 2);
  return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a.lat * r) * Math.cos(b.lat * r) * y * y));
}

const VIEW_FROM = /\b(view|views|vue|vista|blick|panorama)\b.{0,40}\b(from|depuis|desde|von|da)\b|\bfrom (the |a |our )?(room|suite|terrace|balcony|window|rooftop)\b|\b(room|suite|balcony|terrace|rooftop) view\b/i;
const NOT_PHOTO = /\b(logo|map|plan|carte|karte|mapa|diagram|icon|coat of arms|signature|svg)\b/i;

const STOP = new Set(['hotel', 'hotels', 'the', 'resort', 'spa', 'and', 'by', 'a', 'le', 'la', 'el', 'il']);
const toks = (s) => norm(s).split(' ').filter(Boolean);
// "Shangri-La Hotel, Paris" and "Shangri-La Paris" are the same name; "Hotel Paris" is not.
export function sameName(a, b) {
  const ta = toks(a), tb = toks(b);
  const sa = ta.filter((t) => !STOP.has(t)), sb = tb.filter((t) => !STOP.has(t));
  if (!sa.length || !sb.length) return false;
  // b is our hotel's name: all its meaningful words must be in the other name (a longer label is fine, a shorter one is not)
  return sb.every((t) => ta.includes(t)) && sa.length <= sb.length + 2;
}
// Does a long text (file title, description, categories) name the hotel: every meaningful word of the name is there.
export function mentions(text, name) {
  const tt = new Set(toks(text));
  const sn = toks(name).filter((t) => !STOP.has(t));
  return sn.length > 0 && sn.every((t) => tt.has(t));
}

// Which of two Wikidata hits is our hotel: near the landmark, and the name matches.
export function pickItem(entities, hotel, near) {
  let best = null;
  for (const e of entities) {
    const label = norm(e.labels?.en?.value || Object.values(e.labels || {})[0]?.value || '');
    const c = e.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (!c) continue;
    const km = distanceKm(near, { lat: c.latitude, lng: c.longitude });
    if (km > 3) continue;
    const names = [label, ...Object.values(e.labels || {}).map((l) => norm(l.value))];
    if (!names.some((n) => n && sameName(n, hotel.name))) continue;
    if (!best || km < best.km) best = { id: e.id, label, km, image: e.claims?.P18?.[0]?.mainsnak?.datavalue?.value, category: e.claims?.P373?.[0]?.mainsnak?.datavalue?.value };
  }
  return best;
}

async function wikidataFor(hotel, near) {
  const ids = new Set();
  for (const language of ['en', 'fr']) {
    const s = await api(WIKIDATA, { action: 'wbsearchentities', search: hotel.name, language, type: 'item', limit: 7 });
    for (const x of s.search || []) ids.add(x.id);
  }
  if (!ids.size) return null;
  const e = await api(WIKIDATA, { action: 'wbgetentities', ids: [...ids].join('|'), props: 'labels|claims', languages: 'en|fr|es|it|de' });
  return pickItem(Object.values(e.entities || {}), hotel, near);
}

async function filesFor(hotel, item) {
  const titles = new Map(); // title -> how it was found
  if (item?.image) titles.set(`File:${item.image}`, 'wikidata image');
  if (item?.category) {
    const c = await api(COMMONS, { action: 'query', list: 'categorymembers', cmtitle: `Category:${item.category}`, cmtype: 'file', cmlimit: 30 });
    for (const m of c.query?.categorymembers || []) if (!titles.has(m.title)) titles.set(m.title, `category ${item.category}`);
  }
  const s = await api(COMMONS, { action: 'query', list: 'search', srsearch: `"${hotel.name}"`, srnamespace: 6, srlimit: 20 });
  for (const m of s.query?.search || []) if (!titles.has(m.title)) titles.set(m.title, 'search by name');
  return titles;
}

async function infoFor(titles) {
  const out = [];
  const list = [...titles.keys()];
  for (let i = 0; i < list.length; i += 40) {
    const j = await api(COMMONS, { action: 'query', prop: 'imageinfo|categories', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 640, cllimit: 'max', titles: list.slice(i, i + 40).join('|') });
    for (const p of j.query?.pages || []) if (p.imageinfo?.[0]) out.push(p);
  }
  return out;
}

export function judge(page, hotel, viewSlug, how) {
  const ii = page.imageinfo[0];
  const m = ii.extmetadata || {};
  const licence = strip(m.LicenseShortName?.value);
  const desc = strip(m.ImageDescription?.value);
  const cats = (page.categories || []).map((c) => c.title.replace(/^Category:/, '')).join(' | ');
  const text = `${page.title} ${desc} ${cats}`;
  const why = [];
  if (!licenceOk(licence)) why.push(`licence ${licence || 'unknown'}`);
  if (!/^image\/(jpeg|png)$/.test(ii.mime)) why.push(`type ${ii.mime}`);
  if ((ii.width || 0) < 800) why.push(`small ${ii.width}px`);
  if (NOT_PHOTO.test(page.title)) why.push('logo or map');
  if (viewSlug === 'eiffel-tower' && looksLikeNight(page.title, desc)) why.push('night (Eiffel Tower lights)');
  // found by name search only: the name must really be in the title, description or categories
  if (how === 'search by name' && !mentions(text, hotel.name)) why.push('name only in the page text');
  return {
    file: page.title,
    ok: why.length === 0,
    why,
    kind: VIEW_FROM.test(`${page.title} ${desc}`) ? 'view-from' : 'hotel',
    how,
    licence,
    author: strip(m.Artist?.value) || 'unknown',
    source: ii.descriptionurl,
    thumb: ii.thumburl,
    width: ii.width,
    height: ii.height,
    description: desc.slice(0, 200),
  };
}

async function main() {
  const dir = join(root, 'src/data/views');
  const views = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const result = { checked: new Date().toISOString().slice(0, 10), hotels: {} };
  for (const v of views) {
    for (const h of v.hotels) {
      const entry = { name: h.name, view: v.slug, wikidata: null, good: [], refused: 0, error: null };
      try {
        const item = await wikidataFor(h, v.coords);
        entry.wikidata = item ? { id: item.id, category: item.category || null } : null;
        const titles = await filesFor(h, item);
        const pages = await infoFor(titles);
        const judged = pages.map((p) => judge(p, h, v.slug, titles.get(p.title)));
        // photos taken from the hotel first, then the Wikidata image, then the rest
        const rank = (x) => (x.kind === 'view-from' ? 0 : x.how === 'wikidata image' ? 1 : 2);
        entry.good = judged.filter((x) => x.ok).sort((a, b) => rank(a) - rank(b)).slice(0, MAX_PER_HOTEL);
        entry.refused = judged.filter((x) => !x.ok).length;
      } catch (e) {
        entry.error = e.message;
      }
      result.hotels[h.id] = entry;
      console.log(`${v.slug} / ${h.name}: ${entry.good.length} photos${entry.good.some((g) => g.kind === 'view-from') ? ' (one taken from the hotel)' : ''}${entry.error ? `, error: ${entry.error}` : ''}`);
      await sleep(300);
    }
  }
  writeFileSync(join(root, 'data/hotel-photo-candidates.json'), JSON.stringify(result, null, 2) + '\n');

  const all = Object.values(result.hotels);
  const withPhoto = all.filter((x) => x.good.length);
  const withView = all.filter((x) => x.good.some((g) => g.kind === 'view-from'));
  const lines = [
    '# Фото отелей с Wikimedia Commons: пробный поиск',
    '',
    `Проверено ${result.checked}. Это только список, на сайт ничего не попало. Делает \`scripts/find-hotel-photos.mjs\` (workflow «Find hotel photos»).`,
    '',
    `Итого: ${withPhoto.length} из ${all.length} отелей с подходящим фото; у ${withView.length} есть снимок, сделанный из самого отеля.`,
    '',
    '| Вид | Отель | Фото | Снято из отеля | Пример |',
    '|---|---|---|---|---|',
    ...all.map((x) => {
      const ex = x.good[0];
      return `| ${x.view} | ${x.name} | ${x.error ? 'ошибка' : x.good.length} | ${x.good.some((g) => g.kind === 'view-from') ? 'да' : ''} | ${ex ? `[${ex.file.replace(/^File:/, '').replace(/\|/g, ' ')}](${ex.source}) (${ex.licence})` : ''} |`;
    }),
    '',
  ];
  writeFileSync(join(root, 'docs/hotel-photos-report.md'), lines.join('\n'));
  console.log(`\n${withPhoto.length} of ${all.length} hotels have at least one usable photo; ${withView.length} have one taken from the hotel.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`find-hotel-photos: ${e.message}`);
    process.exit(1);
  });
}
