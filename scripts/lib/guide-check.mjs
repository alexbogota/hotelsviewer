// Checks for a guide draft written by the guide writer (no AI in here).
// A guide is a news hook plus room advice. Facts about our hotels come from the view data; facts from outside must have a quote
// that was found on a page the writer really opened in the run.
import { norm, hostOf, isBookingHost, isBookingLabel, urlKey } from './view-check.mjs';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PRICE = /(?:[€$£¥]\s?\d|\d\s?(?:€|\$|£|usd|eur|euros|dollars)\b|\bper night\b|\bcheapest\b|\blowest ever\b|\bbest price\b)/i;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);

export function checkGuide(guide, evidence, ctx) {
  const { views, existing = [], fetches = null, today, newsDays = 90 } = ctx;
  const problems = [];
  const add = (m) => problems.push(m);

  const text = (...a) => a.filter((x) => typeof x === 'string' && x.trim()).length === a.length;
  for (const k of ['slug', 'view', 'date', 'checked', 'title', 'description', 'dek']) if (!text(guide?.[k])) add(`guide.json: "${k}" is missing or empty.`);
  if (problems.length) return { problems };

  if (!SLUG.test(guide.slug) || guide.slug.length > 60) add('slug must be kebab-case, at most 60 characters.');
  if (existing.some((g) => g.slug === guide.slug)) add(`slug "${guide.slug}" is already a guide.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(guide.date)) add('date must be YYYY-MM-DD.');
  if (!/^\d{4}-\d{2}$/.test(guide.checked)) add('checked must be YYYY-MM.');
  if (guide.title.length > 110) add('title is longer than 110 characters.');
  if (guide.description.length > 160) add('description is longer than 160 characters.');
  if (guide.dek.length > 220) add('dek is longer than 220 characters.');

  const view = views.find((v) => v.slug === guide.view);
  if (!view) add(`view "${guide.view}" is not one of our views.`);
  const hotelIds = new Set((view?.hotels ?? []).map((h) => h.id));
  if (!Array.isArray(guide.hotels) || guide.hotels.length < 2 || guide.hotels.length > 4) add('hotels must list 2 to 4 hotel ids.');
  else for (const id of guide.hotels) if (!hotelIds.has(id)) add(`hotel "${id}" is not a hotel of the view "${guide.view}".`);
  if (!guide.cta || guide.cta.href !== `/views/${guide.view}/` || !text(guide.cta.label)) add(`cta must lead to /views/${guide.view}/ and have a label.`);

  if (!Array.isArray(guide.sections) || guide.sections.length < 4) add('sections: at least 4 are needed.');
  let total = 0;
  for (const [i, s] of (guide.sections ?? []).entries()) {
    if (!text(s?.h) || !Array.isArray(s?.p) || !s.p.length || s.p.some((t) => typeof t !== 'string' || !t.trim())) {
      add(`section ${i + 1}: a heading and at least one paragraph are needed.`);
      continue;
    }
    total += s.p.reduce((n, t) => n + words(t), 0);
  }
  if (total < 350) add(`the text has ${total} words: at least 350 are needed.`);
  if (total > 900) add(`the text has ${total} words: at most 900.`);

  const all = [guide.title, guide.description, guide.dek, ...(guide.sections ?? []).flatMap((s) => [s?.h, ...(s?.p ?? [])])].join('\n');
  const m = all.match(PRICE);
  if (m) add(`no prices or price claims: found "${m[0]}".`);

  // Room names in the text must be real: every quoted-looking room phrase is not checkable, but a room that the view data
  // sells is fine, so we only demand that at least one real room name from the listed hotels appears in the text.
  if (view) {
    const rooms = (view.hotels ?? []).filter((h) => (guide.hotels ?? []).includes(h.id)).flatMap((h) => [...h.book, ...(h.skip ?? [])].map((r) => norm(r.room)));
    if (rooms.length && !rooms.some((r) => norm(all).includes(r))) add('the text names none of the rooms of the listed hotels (copy room names exactly from the view data).');
  }

  // sources
  const srcs = Array.isArray(guide.sources) ? guide.sources : [];
  if (srcs.length < 2) add('sources: at least 2 are needed.');
  for (const s of srcs) {
    if (!text(s?.label)) add('a source has no label.');
    else if (s.url && isBookingHost(s.url)) add(`booking sites are not linked: ${s.url}`);
    else if (!s.url && !isBookingLabel(s.label) && !/named, not linked/i.test(s.label)) add(`source "${s.label}" has no url (only booking sites may be named without a link).`);
  }

  // evidence for the facts from outside
  const items = Array.isArray(evidence?.items) ? evidence.items : [];
  if (items.length < 2) add('evidence.json: at least 2 items are needed.');
  const srcKeys = new Set(srcs.filter((s) => s.url).map((s) => urlKey(s.url)));
  for (const [i, it] of items.entries()) {
    const tag = `evidence ${i + 1}`;
    if (!text(it?.claim, it?.quote, it?.url, it?.published)) {
      add(`${tag}: claim, quote, url and published are needed.`);
      continue;
    }
    if (isBookingHost(it.url)) add(`${tag}: a booking site cannot be the source of a news fact.`);
    if (!srcKeys.has(urlKey(it.url))) add(`${tag}: its url is not in the guide's sources.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.published)) add(`${tag}: published must be YYYY-MM-DD.`);
    else if (daysBetween(it.published, today) > newsDays) add(`${tag}: the page is from ${it.published}, older than ${newsDays} days.`);
    else if (daysBetween(today, it.published) > 1) add(`${tag}: published ${it.published} is in the future.`);
    if (fetches) {
      const f = fetches.find((x) => !x.error && urlKey(x.url) === urlKey(it.url));
      if (!f) add(`${tag}: the page ${hostOf(it.url)} was not opened with WebFetch in this run.`);
      else if (!norm(f.text).includes(norm(it.quote))) add(`${tag}: the quote was not found in the page ${hostOf(it.url)}.`);
    }
  }
  return { problems, words: total, view };
}
