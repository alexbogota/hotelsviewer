// Rules for a draft of a view page (src/data/views/<slug>.json) and for the evidence file that goes with it.
// No AI and no network in here: only checks that give the same answer every time. Used by scripts/view-tools.mjs
// (the view writer on GitHub) and tested by scripts/test-view-tools.mjs.
//
// Two files are checked:
//   view.json      the page data, in the same shape as src/data/views/*.json (see src/lib/views.ts)
//   evidence.json  one entry per fact: { field, hotel, value, url, quote }. The quote is a piece of text copied from the page at `url`.
// Why evidence: the site never invents a room name, an address, a star count or a distance. So the writer must show, for
// each of them, where it saw it. When the transcript of the run is at hand, the program also checks that the page was
// really opened in that run and that the quote is really in what came back.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const LEVELS = ['pictured', 'listed', 'reported'];
const TOP_REQUIRED = ['slug', 'order', 'landmark', 'city', 'country', 'coords', 'checked', 'title', 'metaDescription', 'h1', 'dek', 'teaser', 'photo', 'shortAnswer', 'decoder', 'hotels', 'faq'];
const TOP_OPTIONAL = ['landmarkInText', 'region', 'alternatives', 'askAtDesk'];
const HOTEL_KEYS = ['id', 'name', 'where', 'distance', 'stars', 'level', 'book', 'skip', 'notes', 'sources', 'query'];
export const EVIDENCE_FIELDS = ['hotel.name', 'hotel.where', 'hotel.stars', 'hotel.distance', 'hotel.level', 'room.book', 'room.skip'];

// Booking sites are named as sources but never linked (CLAUDE.md). Hosts and the names people write for them.
const BOOKING_HOST = /(^|\.)(booking\.com|expedia\.[a-z.]+|hotels\.com|travelocity\.com|agoda\.com|trip\.com|tripadvisor\.[a-z.]+|kayak\.[a-z.]+|priceline\.com|orbitz\.com|hotwire\.com|ebookers\.com|cheaptickets\.com|vio\.com|trivago\.[a-z.]+|travel\.rakuten\.[a-z.]+)$/;
const BOOKING_LABELS = ['booking', 'bookingcom', 'expedia', 'expediacom', 'hotels', 'hotelscom', 'travelocity', 'agoda', 'tripcom', 'tripadvisor', 'kayak', 'priceline', 'orbitz', 'hotwire', 'ebookers', 'cheaptickets', 'vio', 'viocom', 'trivago', 'rakutentravel'];

const CYRILLIC = /[Ѐ-ӿ]/;
const EMOJI = /\p{Extended_Pictographic}/u;
const PRICE = /[$€£¥₹]|\b(?:USD|EUR|GBP|CAD|AUD|JPY)\b|\bper night\b|\/night\b|\bnightly rate\b/i;
const UNFINISHED = /\b(?:TODO|TBD|FIXME|lorem ipsum|placeholder)\b|\?\?\?|<\/?[a-z][^>]*>/i;
const NIGHT = /\b(night|nighttime|nuit|nacht|noche|illuminated|illumination|at dusk)\b/i;

const isStr = (s) => typeof s === 'string' && s.trim() !== '';
const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);

// ---------- text helpers (also used for matching quotes) ----------

// The same text written in slightly different ways must compare equal: quotes, dashes, case, spaces, markdown stars.
export function norm(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/&amp;/g, '&')
    .replace(/[* ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const tokens = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const isBookingHost = (url) => BOOKING_HOST.test(hostOf(url));
export const isBookingLabel = (label) => BOOKING_LABELS.includes(String(label).toLowerCase().replace(/[^a-z0-9]/g, ''));

// Two addresses of the same page compare equal: no www, no #fragment, no trailing slash, no tracking parameters.
export function urlKey(url) {
  try {
    const u = new URL(url);
    const keep = [...u.searchParams.entries()].filter(([k]) => !/^(utm_.*|gclid|fbclid|ref)$/i.test(k)).sort(([a], [b]) => (a < b ? -1 : 1));
    const q = keep.map(([k, v]) => `${k}=${v}`).join('&');
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${q ? '?' + q : ''}`;
  } catch {
    return String(url);
  }
}

export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Every string of the draft with its place, except addresses and ids that are checked on their own.
function strings(obj, path = '', out = []) {
  if (typeof obj === 'string') out.push([path, obj]);
  else if (Array.isArray(obj)) obj.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (isObj(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (['url', 'file', 'id', 'slug', 'position'].includes(k)) continue;
      strings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

const roomsOf = (h, which) => (Array.isArray(h?.[which]) ? h[which] : []);

// ---------- the view itself ----------

// view: the parsed view.json. ctx (all optional):
//   others      the views already on the site (their ids and photos must not be reused)
//   candidate   the entry of data/view-candidates.json this draft is for (slug and place must match)
//   month       "YYYY-MM" of today: the draft must say it was checked this month
//   goIds       short profile addresses from data/accounts.json (a hotel id must not equal one)
//   allowExtras true for a view that is already on the site (a draft may not bring "extras": they need partner links)
export function checkView(view, ctx = {}) {
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!isObj(view)) return ['view.json must be a JSON object'];

  for (const k of TOP_REQUIRED) if (view[k] === undefined) bad(`"${k}" is missing`);
  for (const k of Object.keys(view)) {
    if (k === 'extras' && ctx.allowExtras) continue;
    if (!TOP_REQUIRED.includes(k) && !TOP_OPTIONAL.includes(k)) bad(`"${k}" is not a field of a view (extras are added later, by hand)`);
  }

  // identity
  if (!isStr(view.slug) || !SLUG.test(view.slug)) bad('"slug" must be lowercase words joined by hyphens');
  if (ctx.candidate && view.slug !== ctx.candidate.slug) bad(`"slug" is "${view.slug}", the candidate's slug is "${ctx.candidate.slug}"`);
  if ((ctx.others ?? []).some((v) => v.slug === view.slug)) bad(`a view with the slug "${view.slug}" is already on the site`);
  if (!Number.isInteger(view.order) || view.order < 1) bad('"order" must be a whole number, 1 or more (publishing sets the final number)');
  for (const k of ['landmark', 'city', 'country']) if (!isStr(view[k])) bad(`"${k}" must be text`);
  for (const k of ['landmarkInText', 'region']) if (view[k] !== undefined && !isStr(view[k])) bad(`"${k}" must be text when present`);
  if (!(isObj(view.coords) && Math.abs(view.coords.lat) <= 90 && Math.abs(view.coords.lng) <= 180 && typeof view.coords.lat === 'number' && typeof view.coords.lng === 'number')) {
    bad('"coords" must be { lat, lng } with numbers');
  } else if (ctx.candidate?.coords) {
    const km = distanceKm(view.coords, ctx.candidate.coords);
    if (km > 5) bad(`"coords" are ${km.toFixed(1)} km from the point in the candidate list: it must be the landmark itself`);
  }
  if (!MONTH.test(view.checked ?? '')) bad('"checked" must be a month, YYYY-MM');
  else if (ctx.month && view.checked !== ctx.month) bad(`"checked" is ${view.checked}, but the check is made in ${ctx.month}`);

  // the words on the page
  const lengths = { title: [25, 70], metaDescription: [90, 160], h1: [25, 90], dek: [80, 260], teaser: [30, 140] };
  for (const [k, [min, max]] of Object.entries(lengths)) {
    const s = view[k];
    if (!isStr(s)) bad(`"${k}" must be text`);
    else if (s.length < min || s.length > max) bad(`"${k}" has ${s.length} characters, it must have ${min} to ${max}`);
  }
  for (const [path, s] of strings(view)) {
    if (CYRILLIC.test(s)) bad(`${path}: the site text is English only`);
    if (EMOJI.test(s)) bad(`${path}: no emoji`);
    if (PRICE.test(s)) bad(`${path}: no prices on the site (found a currency sign or "per night")`);
    if (UNFINISHED.test(s)) bad(`${path}: unfinished text or markup`);
    if (s !== s.trim() || /\s{2,}/.test(s)) bad(`${path}: extra spaces`);
  }

  // photo
  const commons = view.photo?.commons;
  if (!Array.isArray(commons) || commons.length < 1 || commons.length > 5) bad('"photo.commons" must list 1 to 5 candidate files');
  else {
    const used = new Set((ctx.others ?? []).flatMap((v) => (v.photo?.commons ?? []).map((c) => c.file)));
    for (const [i, c] of commons.entries()) {
      const where = `photo.commons[${i}]`;
      if (!isStr(c?.file) || !/^File:.+\.jpe?g$/i.test(c.file)) bad(`${where}.file must be a Wikimedia Commons file name like "File:Name.jpg" (JPEG only)`);
      else {
        if (NIGHT.test(c.file)) bad(`${where}: night photos are not used`);
        if (used.has(c.file)) bad(`${where}: this file is already used by another view`);
      }
      if (!isStr(c?.alt) || c.alt.length < 15) bad(`${where}.alt must describe the picture (15 characters or more)`);
      if (c?.position !== undefined && !/^\d{1,3}% \d{1,3}%$/.test(c.position)) bad(`${where}.position must look like "35% 50%"`);
    }
  }

  // hotels
  const hotels = Array.isArray(view.hotels) ? view.hotels : [];
  if (hotels.length < 3 || hotels.length > 8) bad(`"hotels" has ${hotels.length} entries, it must have 3 to 8 (fewer honest hotels: do not write this view)`);
  const takenIds = new Set([...(ctx.others ?? []).flatMap((v) => [...(v.hotels ?? []).map((h) => h.id), ...(v.extras ?? []).map((e) => e.id)]), ...(ctx.goIds ?? [])]);
  const ids = new Set();
  for (const [i, h] of hotels.entries()) {
    const at = `hotels[${i}] (${h?.name ?? h?.id ?? '?'})`;
    if (!isObj(h)) {
      bad(`${at}: must be an object`);
      continue;
    }
    for (const k of Object.keys(h)) if (!HOTEL_KEYS.includes(k)) bad(`${at}: "${k}" is not a field of a hotel`);
    if (!isStr(h.id) || !SLUG.test(h.id)) bad(`${at}: "id" must be lowercase words joined by hyphens`);
    else if (ids.has(h.id)) bad(`${at}: id "${h.id}" is used twice`);
    else if (takenIds.has(h.id)) bad(`${at}: id "${h.id}" is already used on the site (hotel ids are the /go/ addresses and must be unique)`);
    ids.add(h.id);
    for (const k of ['name', 'where', 'query']) if (!isStr(h[k])) bad(`${at}: "${k}" must be text`);
    if (isStr(h.query) && h.query.length > 80) bad(`${at}: "query" is too long`);
    if (!LEVELS.includes(h.level)) bad(`${at}: "level" must be one of ${LEVELS.join(', ')}`);
    if (h.stars !== undefined && !(typeof h.stars === 'number' && h.stars >= 1 && h.stars <= 5 && h.stars * 2 === Math.round(h.stars * 2))) bad(`${at}: "stars" must be a number from 1 to 5 in steps of 0.5`);
    if (h.distance !== undefined && (!isStr(h.distance) || !/\d/.test(h.distance) || h.distance.length > 70)) bad(`${at}: "distance" must be short text with the number the source gives`);
    const book = roomsOf(h, 'book');
    if (book.length < 1 || book.length > 10) bad(`${at}: "book" must list 1 to 10 room categories`);
    if (roomsOf(h, 'skip').length > 8) bad(`${at}: "skip" lists more than 8 categories`);
    const seen = new Set();
    for (const which of ['book', 'skip']) {
      for (const [j, r] of roomsOf(h, which).entries()) {
        const rat = `${at}.${which}[${j}]`;
        if (!isObj(r) || !isStr(r.room)) {
          bad(`${rat}: needs a "room" name`);
          continue;
        }
        for (const k of Object.keys(r)) if (!['room', 'note'].includes(k)) bad(`${rat}: "${k}" is not a field of a room`);
        if (r.note !== undefined && (!isStr(r.note) || r.note.length > 400)) bad(`${rat}: "note" must be text of at most 400 characters`);
        if (seen.has(r.room)) bad(`${rat}: "${r.room}" appears twice in this hotel`);
        seen.add(r.room);
      }
    }
    if (h.notes !== undefined && (!Array.isArray(h.notes) || h.notes.length > 3 || h.notes.some((n) => !isStr(n) || n.length > 450))) bad(`${at}: "notes" must be up to 3 texts of at most 450 characters`);
    if (!Array.isArray(h.sources) || h.sources.length < 1 || h.sources.length > 6) bad(`${at}: "sources" must list 1 to 6 sources`);
    else {
      for (const [j, s] of h.sources.entries()) {
        const sat = `${at}.sources[${j}]`;
        if (!isObj(s) || !isStr(s.label)) {
          bad(`${sat}: needs a "label"`);
          continue;
        }
        if (s.url !== undefined) {
          if (!/^https:\/\/[^\s]+$/.test(s.url)) bad(`${sat}: "url" must be a full https address`);
          else if (isBookingHost(s.url) || isBookingLabel(s.label)) bad(`${sat}: booking sites are named but not linked`);
        }
      }
    }
  }

  // A note may credit a claim to a source ("Expedia says ...") only if that source is one of this hotel's sources.
  const known = new Set(['Booking.com', 'Expedia', 'Hotels.com', 'Travelocity', 'Agoda', 'Trip.com', 'Tripadvisor']);
  for (const v of [...(ctx.others ?? []), view]) for (const h of Array.isArray(v?.hotels) ? v.hotels : []) for (const s of Array.isArray(h?.sources) ? h.sources : []) if (isStr(s?.label) && s.label.length >= 5) known.add(s.label);
  const SAYS = '(?:says|reports|lists|tags|names|calls|notes|describes|mentions|writes|states|recommends|sells|adds|warns|rates|gives|shows)';
  for (const h of hotels) {
    const own = new Set((Array.isArray(h.sources) ? h.sources : []).map((s) => norm(s?.label)));
    const texts = [...(Array.isArray(h.notes) ? h.notes : []), ...['book', 'skip'].flatMap((w) => roomsOf(h, w).map((r) => r?.note))].filter(isStr);
    for (const label of known) {
      if (own.has(norm(label))) continue;
      const re = new RegExp(`(?:^|[^A-Za-z0-9])${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ${SAYS}\\b`);
      if (texts.some((t) => re.test(t))) bad(`${h.name}: a note credits a claim to "${label}", which is not one of this hotel's sources`);
    }
  }

  // everything that points at a room must name a real category of that hotel
  const byId = new Map(hotels.filter(isObj).map((h) => [h.id, h]));
  const sa = view.shortAnswer;
  if (!Array.isArray(sa) || sa.length < 2 || sa.length > 4) bad('"shortAnswer" must have 2 to 4 entries');
  else {
    for (const [i, s] of sa.entries()) {
      if (!isObj(s) || !isStr(s.label) || s.label.length > 40) bad(`shortAnswer[${i}]: needs a "label" of at most 40 characters`);
      const h = byId.get(s?.hotel);
      if (!h) bad(`shortAnswer[${i}]: hotel "${s?.hotel}" is not in "hotels"`);
      else if (!roomsOf(h, 'book').some((r) => r.room === s.room)) bad(`shortAnswer[${i}]: "${s.room}" is not in the "book" list of ${h.name}`);
    }
  }
  const dec = view.decoder;
  if (!Array.isArray(dec) || dec.length < 2 || dec.length > 4) bad('"decoder" must have 2 to 4 entries');
  else {
    for (const [i, d] of dec.entries()) {
      if (!isObj(d) || !isStr(d.left) || !isStr(d.right) || !isStr(d.text)) bad(`decoder[${i}]: needs "left", "right" and "text"`);
      else if (d.text.length < 60 || d.text.length > 300) bad(`decoder[${i}]: "text" has ${d.text.length} characters, it must have 60 to 300`);
    }
  }
  const faq = view.faq;
  if (!Array.isArray(faq) || faq.length < 3 || faq.length > 5) bad('"faq" must have 3 to 5 entries');
  else {
    for (const [i, f] of faq.entries()) {
      if (!isObj(f) || !isStr(f.q) || !isStr(f.a)) bad(`faq[${i}]: needs "q" and "a"`);
      else {
        if (!f.q.trim().endsWith('?')) bad(`faq[${i}]: the question must end with "?"`);
        if (f.a.length < 50 || f.a.length > 450) bad(`faq[${i}]: the answer has ${f.a.length} characters, it must have 50 to 450`);
      }
    }
  }
  if (view.alternatives !== undefined) {
    if (!Array.isArray(view.alternatives) || view.alternatives.length > 2 || view.alternatives.some((a) => !isObj(a) || !isStr(a.title) || !isStr(a.text))) bad('"alternatives" must be up to 2 entries with "title" and "text"');
  }
  if (view.askAtDesk !== undefined) {
    const a = view.askAtDesk;
    if (!isObj(a) || !isStr(a.title) || !Array.isArray(a.items) || a.items.length < 1 || a.items.some((x) => !isObj(x) || !isStr(x.name) || !isStr(x.text))) bad('"askAtDesk" must have a "title" and "items" with "name" and "text"');
  }
  return problems;
}

// ---------- the evidence ----------

const starsRe = (n) => new RegExp(`\\b(?:${String(n).replace('.', '\\.')}|${Number.isInteger(n) ? ['', 'one', 'two', 'three', 'four', 'five'][n] : n})[\\s-]*stars?\\b`, 'i');

// evidence: parsed evidence.json. fetches: the pages opened in the run, [{ url, text }], or null when no transcript is at hand
// (then only the shape is checked). Returns the list of problems.
export function checkEvidence(view, evidence, fetches = null) {
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!Array.isArray(evidence) || evidence.length === 0) return ['evidence.json must be a non-empty list'];

  const hotels = Array.isArray(view?.hotels) ? view.hotels.filter(isObj) : [];
  const byId = new Map(hotels.map((h) => [h.id, h]));
  const pages = fetches ? new Map() : null;
  if (pages) for (const f of fetches) pages.set(urlKey(f.url), [...(pages.get(urlKey(f.url)) ?? []), norm(f.text)]);

  const index = new Map(); // "hotel|field|value" -> entry
  for (const [i, e] of evidence.entries()) {
    const at = `evidence[${i}]`;
    if (!isObj(e)) {
      bad(`${at}: must be an object`);
      continue;
    }
    if (!EVIDENCE_FIELDS.includes(e.field)) {
      bad(`${at}: "field" must be one of ${EVIDENCE_FIELDS.join(', ')}`);
      continue;
    }
    if (!byId.has(e.hotel)) {
      bad(`${at}: hotel "${e.hotel}" is not in view.json`);
      continue;
    }
    if (!isStr(e.value) || !/^https:\/\/[^\s]+$/.test(e.url ?? '') || !isStr(e.quote)) {
      bad(`${at}: needs "value", a full https "url" and a "quote"`);
      continue;
    }
    if (e.quote.length < 8 || e.quote.length > 600) bad(`${at}: the quote has ${e.quote.length} characters, it must have 8 to 600`);
    const key = `${e.hotel}|${e.field}|${e.value}`;
    if (index.has(key)) bad(`${at}: a second entry for ${e.field} "${e.value}" of ${e.hotel}`);
    index.set(key, e);

    // is the quote really on that page?
    if (pages) {
      const texts = pages.get(urlKey(e.url));
      if (!texts) bad(`${at}: the page ${e.url} was not opened in this run`);
      else if (!texts.some((t) => t.includes(norm(e.quote)))) bad(`${at}: the quote for ${e.field} "${e.value}" is not in the text that came back from ${e.url}`);
    }
  }

  const need = (hotel, field, value, check) => {
    const e = index.get(`${hotel.id}|${field}|${value}`);
    const what = `${hotel.name}: ${field} "${value}"`;
    if (!e) {
      bad(`${what} has no evidence entry`);
      return null;
    }
    const q = norm(e.quote);
    const why = check?.(q, e);
    if (why) bad(`${what}: ${why}`);
    return e;
  };

  const landmarkWords = tokens(`${view?.landmark ?? ''} ${view?.landmarkInText ?? ''}`).filter((w) => w.length >= 4 && w !== 'the');

  for (const h of hotels) {
    need(h, 'hotel.name', h.name, (q) => (q.includes(norm(h.name)) ? '' : 'the quote does not contain the hotel name'));
    if (isStr(h.where)) {
      const street = tokens(h.where.split(',')[0]);
      need(h, 'hotel.where', h.where, (q) => {
        const have = new Set(tokens(q));
        const missing = street.filter((t) => !have.has(t));
        return missing.length ? `the quote does not contain "${missing.join(' ')}" from the address` : '';
      });
    }
    if (h.stars !== undefined) need(h, 'hotel.stars', String(h.stars), (q) => (starsRe(h.stars).test(q) ? '' : `the quote does not say ${h.stars} stars`));
    if (h.distance !== undefined) {
      need(h, 'hotel.distance', h.distance, (q) => {
        const have = new Set(q.match(/\d+(?:[.,]\d+)?/g) ?? []);
        const missing = (norm(h.distance).match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => !have.has(n));
        return missing.length ? `the number ${missing.join(', ')} is not in the quote: copy the figure the source gives` : '';
      });
    }
    for (const which of ['book', 'skip']) {
      for (const r of roomsOf(h, which)) {
        if (isStr(r?.room)) need(h, `room.${which}`, r.room, (q) => (q.includes(norm(r.room)) ? '' : 'the quote does not contain the room name, letter for letter'));
      }
    }
    const lv = need(h, 'hotel.level', h.level, (q, e) => {
      const rooms = roomsOf(h, 'book').map((r) => norm(r.room)).filter(Boolean);
      if (h.level === 'listed' && !rooms.some((r) => q.includes(r))) return 'a "listed" hotel needs a quote that holds one of its "book" room names';
      if (h.level === 'pictured' && !(rooms.some((r) => q.includes(r)) && /\b(photo|photos|picture|image)\b/.test(q))) return 'a "pictured" hotel needs a quote with a "book" room name and the word photo';
      if (h.level === 'reported' && isBookingHost(e.url)) return 'a "reported" hotel needs a guide or review page as evidence, not a booking site';
      if (h.level === 'reported' && !landmarkWords.some((w) => q.includes(w))) return `a "reported" hotel needs a quote that names the landmark (${landmarkWords.join(', ')})`;
      return '';
    });
    void lv;

    // every booking site named as a source must be a page this hotel's evidence really came from; a linked source must have been opened
    const evUrls = [...index.values()].filter((e) => e.hotel === h.id).map((e) => e.url);
    for (const s of Array.isArray(h.sources) ? h.sources : []) {
      if (!isObj(s) || !isStr(s.label)) continue;
      if (isBookingLabel(s.label)) {
        const core = s.label.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/com$/, '');
        if (!evUrls.some((u) => hostOf(u).replace(/[^a-z]/g, '').includes(core))) bad(`${h.name}: the source "${s.label}" has no evidence entry from that site`);
      }
      if (s.url && pages && !pages.has(urlKey(s.url))) bad(`${h.name}: the linked source "${s.label}" (${s.url}) was not opened in this run`);
    }
  }

  // nothing in the evidence that the page does not carry
  for (const e of index.values()) {
    const h = byId.get(e.hotel);
    if (e.field === 'hotel.name' && e.value !== h.name) bad(`evidence for the name "${e.value}" does not match the hotel "${h.name}"`);
    if (e.field === 'hotel.where' && e.value !== h.where) bad(`evidence for the address "${e.value}" does not match "${h.where}"`);
    if (e.field === 'hotel.stars' && e.value !== String(h.stars)) bad(`evidence for ${e.value} stars, but ${h.name} has ${h.stars ?? 'no stars'}`);
    if (e.field === 'hotel.distance' && e.value !== h.distance) bad(`evidence for the distance "${e.value}" does not match "${h.distance}"`);
    if (e.field === 'hotel.level' && e.value !== h.level) bad(`evidence for the level "${e.value}" does not match "${h.level}"`);
    if (e.field === 'room.book' && !roomsOf(h, 'book').some((r) => r.room === e.value)) bad(`evidence for the room "${e.value}", which is not in "book" of ${h.name}`);
    if (e.field === 'room.skip' && !roomsOf(h, 'skip').some((r) => r.room === e.value)) bad(`evidence for the room "${e.value}", which is not in "skip" of ${h.name}`);
  }
  return problems;
}

// ---------- the transcript of the run ----------

// `claude -p --output-format stream-json --verbose` writes one JSON object per line. The pages the writer opened are the
// WebFetch calls; what came back for each is the text the quotes must be found in.
export function parseTranscript(text) {
  const calls = new Map(); // tool_use id -> url
  const fetches = [];
  const results = new Map(); // tool_use id -> text
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch {
      continue;
    }
    const content = obj?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name === 'WebFetch' && typeof block.input?.url === 'string') calls.set(block.id, block.input.url);
      if (block?.type === 'tool_result') {
        const c = block.content;
        const body = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('\n') : '';
        results.set(block.tool_use_id, { text: body, error: block.is_error === true });
      }
    }
  }
  for (const [id, url] of calls) if (results.has(id)) fetches.push({ url, text: results.get(id).text, error: results.get(id).error });
  return fetches;
}

// What the writer searched for (WebSearch calls), in order. Only for the trace that is kept for diagnosis.
export function parseSearches(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const content = JSON.parse(t)?.message?.content;
      if (Array.isArray(content)) for (const b of content) if (b?.type === 'tool_use' && b.name === 'WebSearch' && typeof b.input?.query === 'string') out.push(b.input.query);
    } catch {}
  }
  return out;
}
