// Checks for the daily Bluesky threads written by the post writer (no AI in here).
// The writer gives the text; the program adds the link with our mark, so a post never carries a hand-made URL.
import { norm, urlKey } from './view-check.mjs';

export const LIMIT = 300; // Bluesky: 300 characters (graphemes) per post
const PRICE = /(?:[€$£¥]\s?\d|\d\s?(?:€|\$|£|usd|eur|euros|dollars)\b|\bper night\b|\bcheapest\b|\blowest ever\b|\bbest price\b)/i;
const URL_RE = /(https?:\/\/|www\.)\S+/i;
const QUOTED = /["“”«»]([^"“”«»]{3,})["“”«»]/g;
export const graphemes = (s) => [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(String(s))].length;

/** ctx: { formats, items: [{link, feed}], views, guides, maxTags, fetches (null = skip quote check), buildLink(thread) -> url } */
export function checkThreads(data, ctx) {
  const problems = [];
  const add = (m) => problems.push(m);
  const threads = Array.isArray(data?.threads) ? data.threads : [];
  const want = ctx.formats ?? ['question', 'gem', 'news'];
  if (threads.length !== want.length) add(`posts.json: ${threads.length} threads, ${want.length} are needed (${want.join(', ')}).`);
  const seen = new Set();
  const rooms = (ctx.views ?? []).flatMap((v) => [...v.hotels.flatMap((h) => [h.name, ...h.book.map((r) => r.room), ...(h.skip ?? []).map((r) => r.room)]), v.landmark]).map(norm);
  const usedSources = new Set();

  for (const [i, t] of threads.entries()) {
    const tag = `thread ${i + 1} (${t?.format ?? '?'})`;
    if (!want.includes(t?.format)) add(`${tag}: format must be one of ${want.join(', ')}.`);
    else if (seen.has(t.format)) add(`${tag}: format ${t.format} is used twice.`);
    seen.add(t?.format);

    const item = (ctx.items ?? []).find((x) => urlKey(x.link) === urlKey(t?.source ?? ''));
    if (!item) {
      add(`${tag}: source must be the link of one of today's feed items.`);
      continue;
    }
    if (usedSources.has(urlKey(item.link))) add(`${tag}: the same feed item is used by two threads.`);
    usedSources.add(urlKey(item.link));

    const posts = Array.isArray(t.posts) ? t.posts : [];
    if (posts.length < 1 || posts.length > 3 || posts.some((p) => typeof p !== 'string' || !p.trim())) {
      add(`${tag}: 1 to 3 non-empty posts are needed (the link post is added by the program).`);
      continue;
    }
    const all = posts.join('\n');
    for (const [k, p] of posts.entries()) {
      if (graphemes(p) > LIMIT) add(`${tag}, post ${k + 1}: ${graphemes(p)} characters, the limit is ${LIMIT}.`);
      if (URL_RE.test(p)) add(`${tag}, post ${k + 1}: no URLs in the text, the program adds the link.`);
    }
    const m = all.match(PRICE);
    if (m) add(`${tag}: no prices or price claims, found "${m[0]}".`);
    const tags = all.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.length > (ctx.maxTags ?? 3)) add(`${tag}: ${tags.length} hashtags, at most ${ctx.maxTags ?? 3}.`);
    if (!norm(all).includes(norm(item.feed))) add(`${tag}: credit the source in the text ("${item.feed}").`);

    // Anything in quotation marks must be copied: from the page (an evidence quote) or a hotel or room name of our views.
    const ev = Array.isArray(t.evidence) ? t.evidence : [];
    const quotes = ev.map((e) => norm(e?.quote ?? ''));
    for (const q of all.matchAll(QUOTED)) {
      const n = norm(q[1]);
      if (!quotes.some((x) => x.includes(n)) && !rooms.some((r) => r.includes(n))) add(`${tag}: "${q[1]}" is in quotation marks but is neither an evidence quote nor a hotel or room name of our views.`);
    }

    if (!ev.length) add(`${tag}: at least one evidence item (quote and url) is needed.`);
    for (const [k, e] of ev.entries()) {
      if (!e?.quote || !e?.url) {
        add(`${tag}, evidence ${k + 1}: quote and url are needed.`);
        continue;
      }
      if (urlKey(e.url) !== urlKey(item.link)) add(`${tag}, evidence ${k + 1}: the url must be the thread's source.`);
      if (ctx.fetches) {
        const f = ctx.fetches.find((x) => !x.error && urlKey(x.url) === urlKey(e.url));
        if (!f) add(`${tag}, evidence ${k + 1}: the source page was not opened with WebFetch in this run.`);
        else if (!norm(f.text).includes(norm(e.quote))) add(`${tag}, evidence ${k + 1}: the quote was not found on the page.`);
      }
    }

    const l = t.link ?? {};
    if (l.type === 'view' && !(ctx.views ?? []).some((v) => v.slug === l.slug)) add(`${tag}: link view "${l.slug}" is not one of our views.`);
    else if (l.type === 'guide' && !(ctx.guides ?? []).some((g) => g.slug === l.slug)) add(`${tag}: link guide "${l.slug}" is not one of our guides.`);
    else if (l.type === 'search' && (typeof l.place !== 'string' || l.place.trim().length < 2 || l.place.length > 80)) add(`${tag}: link search needs a place name (2 to 80 characters).`);
    else if (!['view', 'guide', 'search', 'source'].includes(l.type)) add(`${tag}: link type must be view, guide, search or source.`);
    if (typeof t.linkText !== 'string' || !t.linkText.trim() || URL_RE.test(t.linkText)) add(`${tag}: linkText is needed, without a URL.`);
    else if (ctx.buildLink && !problems.some((p) => p.startsWith(tag + ': link'))) {
      try {
        const url = ctx.buildLink(t, item);
        const last = `${t.linkText.trim()} ${url}`;
        if (graphemes(last) > LIMIT) add(`${tag}: the link post would have ${graphemes(last)} characters; shorten linkText.`);
      } catch (e) {
        add(`${tag}: ${e.message}`);
      }
    }
  }
  return { problems };
}
