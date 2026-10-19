// Tests of the view writer's checks with made-up and real data (no network). Run: npm run test:views
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkView, checkEvidence, parseTranscript, urlKey, norm, isBookingHost, isBookingLabel, hostOf } from './lib/view-check.mjs';
import { buildPrompt, checkDraft, gateDecision, lastResult, notesProblems, resultHint, patchCandidateText, patchPublishedViews, pickCandidate, readSiteViews, researchSection, verifyPhotos, waitingDrafts } from './view-tools.mjs';

let n = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const clone = (x) => JSON.parse(JSON.stringify(x));
const has = (problems, text) => problems.some((p) => p.includes(text));

const site = readSiteViews();
const goIds = Object.values(JSON.parse(readFileSync(new URL('../data/accounts.json', import.meta.url), 'utf8')).accounts).map((a) => a.go);
const hagia = site.find((v) => v.slug === 'hagia-sophia');
const others = (v) => site.filter((o) => o.slug !== v.slug);

// ---- evidence made up from a view: one entry per fact, each quote holds its value; every page "opened" ----
function makeEvidence(view) {
  const evidence = [];
  const pages = new Map();
  const say = (url, text) => pages.set(url, (pages.get(url) ?? '') + ' ' + text);
  for (const h of view.hotels) {
    const bookings = h.sources.filter((s) => isBookingLabel(s.label)).map((s) => `https://www.${s.label.toLowerCase().replace(/[^a-z0-9.]/g, '')}${s.label.includes('.') ? '' : '.com'}/h/${h.id}`);
    const guide = h.sources.find((s) => s.url && !isBookingLabel(s.label));
    let turn = 0; // a hotel that names two booking sites needs evidence from each: the facts are shared out between them
    const base = () => bookings.length ? bookings[turn++ % bookings.length] : guide?.url ?? 'https://www.example-hotel.test/rooms';
    const add = (field, value, quote, url = base()) => {
      evidence.push({ hotel: h.id, field, value, url, quote });
      say(url, quote);
    };
    add('hotel.name', h.name, `Welcome to ${h.name}.`);
    add('hotel.where', h.where, `Address: ${h.where}.`);
    if (h.stars !== undefined) add('hotel.stars', String(h.stars), `A ${h.stars}-star hotel.`);
    if (h.distance !== undefined) add('hotel.distance', h.distance, `Distance: ${h.distance}.`);
    for (const r of h.book) add('room.book', r.room, `Room category: ${r.room}`);
    for (const r of h.skip ?? []) add('room.skip', r.room, `Room category: ${r.room}`);
    if (h.level === 'listed') add('hotel.level', 'listed', `${h.book[0].room} - the ${view.landmark} view`);
    if (h.level === 'pictured') add('hotel.level', 'pictured', `${h.book[0].room}: photo from the room`);
    if (h.level === 'reported') add('hotel.level', 'reported', `Guests report the view of ${view.landmark}.`, guide?.url ?? 'https://guide.example.test/x');
    for (const s of h.sources) if (s.url) say(s.url, 'opened');
  }
  return { evidence, fetches: [...pages].map(([url, text]) => ({ url, text })) };
}

// ---- the real views are the yardstick ----

test('every view on the site passes the view check', () => {
  assert.ok(site.length >= 11);
  for (const v of site) assert.deepEqual(checkView(v, { others: others(v), goIds, allowExtras: true }), [], v.slug);
});

test('evidence made up from every view on the site passes, with every page opened', () => {
  for (const v of site) {
    const { evidence, fetches } = makeEvidence(v);
    assert.deepEqual(checkEvidence(v, evidence, fetches), [], v.slug);
    assert.deepEqual(checkEvidence(v, evidence, null), [], v.slug + ' (shape only)');
  }
});

// ---- the view check refuses what it must refuse ----

const bad = (mutate, ctx = {}) => {
  const v = clone(hagia);
  v.slug = 'hagia-two';
  mutate(v);
  return checkView(v, { others: site.filter((o) => o.slug !== 'hagia-sophia'), goIds, ...ctx });
};

test('a draft may not bring extras or unknown fields', () => {
  assert.ok(has(bad((v) => (v.extras = [])), '"extras" is not a field'));
  assert.ok(has(bad((v) => (v.rating = 5)), '"rating" is not a field'));
  assert.ok(has(bad((v) => (v.hotels[0].reviews = 3)), '"reviews" is not a field of a hotel'));
});

test('prices, Cyrillic, emoji, unfinished text and double spaces are refused anywhere', () => {
  assert.ok(has(bad((v) => (v.hotels[0].notes = ['From $120 a night.'])), 'no prices'));
  assert.ok(has(bad((v) => (v.faq[0].a += ' It costs 90 EUR per night in October, which is well under the average for the area.')), 'no prices'));
  assert.ok(has(bad((v) => (v.dek = 'Отели с видом на Айя-Софию, которые мы проверили лично для вас, номера и категории номеров.')), 'English only'));
  assert.ok(has(bad((v) => (v.teaser = 'Rooms with a view ✨ of the dome and the city around it')), 'no emoji'));
  assert.ok(has(bad((v) => (v.teaser = 'TODO write the teaser for this page properly')), 'unfinished'));
  assert.ok(has(bad((v) => (v.dek = v.dek.replace(' ', '  '))), 'extra spaces'));
});

test('lengths, month and coordinates are checked', () => {
  assert.ok(has(bad((v) => (v.title = 'Short')), '"title" has 5 characters'));
  assert.ok(has(bad((v) => (v.metaDescription = v.metaDescription.repeat(2))), '"metaDescription" has'));
  assert.ok(has(bad(() => {}, { month: '2026-11' }), 'is 2026-10, but the check is made in 2026-11'));
  assert.deepEqual(bad(() => {}, { month: '2026-10' }), []);
  const candidate = { slug: 'hagia-two', coords: { lat: 41.0086, lng: 28.9802 } };
  assert.deepEqual(bad(() => {}, { candidate }), []);
  assert.ok(has(bad((v) => (v.coords = { lat: 48.85, lng: 2.29 }), { candidate }), 'km from the point in the candidate list'));
  assert.ok(has(bad(() => {}, { candidate: { slug: 'other', coords: candidate.coords } }), "the candidate's slug is"));
});

test('slug, hotel ids and photo files must be new', () => {
  assert.ok(has(checkView(clone(hagia), { others: site, goIds }), 'is already on the site'));
  assert.ok(has(bad((v) => (v.hotels[0].id = site[0].hotels[0].id)), 'is already used on the site'));
  assert.ok(has(bad((v) => (v.hotels[1].id = v.hotels[0].id)), 'is used twice'));
  assert.ok(has(bad((v) => (v.hotels[0].id = 'bsky')), 'is already used on the site'));
  assert.ok(has(bad((v) => (v.photo.commons[0].file = site[0].photo.commons[0].file)), 'already used by another view'));
  assert.ok(has(bad((v) => (v.photo.commons[0].file = 'File:Hagia Sophia at night.jpg')), 'night photos'));
  assert.ok(has(bad((v) => (v.photo.commons[0].file = 'File:Dome.png')), 'JPEG only'));
});

test('hotels: count, levels, stars, distance, sources', () => {
  assert.ok(has(bad((v) => (v.hotels = v.hotels.slice(0, 2))), 'it must have 3 to 8'));
  assert.ok(has(bad((v) => (v.hotels[0].level = 'great')), '"level" must be one of'));
  assert.ok(has(bad((v) => (v.hotels[0].stars = 6)), '"stars" must be a number from 1 to 5'));
  assert.deepEqual(bad((v) => (v.hotels[0].stars = 3.5)), []);
  assert.ok(has(bad((v) => (v.hotels[0].distance = 'very close')), '"distance" must be short text with the number'));
  assert.ok(has(bad((v) => (v.hotels[0].book = [])), '"book" must list 1 to 10'));
  assert.ok(has(bad((v) => (v.hotels[0].sources = [])), '"sources" must list 1 to 6'));
  assert.ok(has(bad((v) => v.hotels[0].sources.push({ label: 'Expedia', url: 'https://www.expedia.com/h' })), 'booking sites are named but not linked'));
  assert.ok(has(bad((v) => v.hotels[0].sources.push({ label: 'A page', url: 'https://www.booking.com/hotel/x' })), 'booking sites are named but not linked'));
  assert.ok(has(bad((v) => v.hotels[0].sources.push({ label: 'A page', url: 'http://plain.test/x' })), 'full https address'));
  assert.ok(has(bad((v) => (v.hotels[0].book[1].room = v.hotels[0].book[0].room)), 'appears twice'));
});

test('a note may only credit a source the hotel really has', () => {
  assert.ok(has(bad((v) => (v.hotels[0].notes = ['Hotels.com says every room has the view.'])), 'which is not one of this hotel\'s sources'));
  assert.deepEqual(bad((v) => (v.hotels[0].notes = ['Expedia says every room has the view.'])), []);
});

test('shortAnswer must point at a real "book" room; faq and decoder have their shape', () => {
  assert.ok(has(bad((v) => (v.shortAnswer[0].room = 'Invented Suite')), 'is not in the "book" list'));
  assert.ok(has(bad((v) => (v.shortAnswer[0].hotel = 'nowhere')), 'is not in "hotels"'));
  assert.ok(has(bad((v) => (v.faq[0].q = 'Which room')), 'must end with "?"'));
  assert.ok(has(bad((v) => (v.faq = v.faq.slice(0, 1))), '"faq" must have 3 to 5'));
  assert.ok(has(bad((v) => (v.decoder = [])), '"decoder" must have 2 to 4'));
});

// ---- the evidence check ----

const evBase = () => {
  const v = clone(hagia);
  return { view: v, ...makeEvidence(v) };
};
const evMinus = (evidence, pred) => evidence.filter((e) => !pred(e));

test('every room, name, address and level needs an evidence entry', () => {
  const { view, evidence, fetches } = evBase();
  assert.ok(has(checkEvidence(view, evMinus(evidence, (e) => e.field === 'room.book' && e.value === view.hotels[0].book[0].room), fetches), 'has no evidence entry'));
  assert.ok(has(checkEvidence(view, evMinus(evidence, (e) => e.field === 'hotel.where' && e.hotel === view.hotels[1].id), fetches), 'hotel.where'));
  assert.ok(has(checkEvidence(view, evMinus(evidence, (e) => e.field === 'hotel.level' && e.hotel === view.hotels[2].id), fetches), 'hotel.level'));
  assert.ok(has(checkEvidence(view, [], fetches), 'non-empty list'));
});

test('a room name that is not in its quote is caught, letter for letter', () => {
  const { view, evidence, fetches } = evBase();
  const e = clone(evidence);
  const i = e.findIndex((x) => x.field === 'room.book');
  e[i].quote = e[i].quote.replace('Suite', 'Room');
  const p = checkEvidence(view, e, fetches);
  assert.ok(has(p, 'does not contain the room name'));
});

test('a quote that is not on the page, or a page that was not opened, is caught', () => {
  const { view, evidence, fetches } = evBase();
  const e = clone(evidence);
  e[0].quote = e[0].quote + ' with a pool on the roof';
  assert.ok(has(checkEvidence(view, e, fetches), 'is not in the text that came back'));
  const e2 = clone(evidence);
  e2[1].url = 'https://never-opened.test/page';
  assert.ok(has(checkEvidence(view, e2, fetches), 'was not opened in this run'));
  const f2 = fetches.filter((f) => !f.url.includes('megivorera'));
  assert.ok(has(checkEvidence(view, evidence, f2), 'was not opened in this run'));
});

test('stars and distance must come from the quote', () => {
  const v = clone(site.find((x) => x.slug === 'eiffel-tower'));
  const withBoth = v.hotels.find((h) => h.stars && h.distance);
  assert.ok(withBoth, 'the Eiffel Tower view has a hotel with stars and a distance');
  const { evidence, fetches } = makeEvidence(v);
  const e = clone(evidence);
  e.find((x) => x.hotel === withBoth.id && x.field === 'hotel.stars').quote = 'A hotel in Paris.';
  assert.ok(has(checkEvidence(v, e, null), 'does not say'));
  const e2 = clone(evidence);
  const d = e2.find((x) => x.hotel === withBoth.id && x.field === 'hotel.distance');
  d.quote = 'Walk to the tower: 50 minutes.';
  assert.ok(has(checkEvidence(v, e2, null), 'is not in the quote'));
  const noStars = clone(v);
  noStars.hotels.find((h) => h.id === withBoth.id).stars = 5;
  assert.ok(has(checkEvidence(noStars, evidence, fetches), 'does not say 5 stars') || has(checkEvidence(noStars, evidence, fetches), 'evidence for'));
});

test('levels: reported needs a guide naming the landmark, listed needs a room name, pictured needs a photo', () => {
  const { view, evidence, fetches } = evBase();
  const rep = view.hotels.find((h) => h.level === 'reported');
  assert.ok(rep);
  const e = clone(evidence);
  const lv = e.find((x) => x.hotel === rep.id && x.field === 'hotel.level');
  lv.url = e.find((x) => x.hotel === rep.id && x.field === 'hotel.name').url; // a booking site
  assert.ok(has(checkEvidence(view, e, null), 'not a booking site'));
  const e2 = clone(evidence);
  e2.find((x) => x.hotel === rep.id && x.field === 'hotel.level').quote = 'Guests like the breakfast here.';
  assert.ok(has(checkEvidence(view, e2, null), 'names the landmark'));
  const listed = view.hotels.find((h) => h.level === 'listed');
  const e3 = clone(evidence);
  e3.find((x) => x.hotel === listed.id && x.field === 'hotel.level').quote = 'A nice hotel in the old town.';
  assert.ok(has(checkEvidence(view, e3, null), 'needs a quote that holds one of its "book" room names'));
  const v4 = clone(view);
  v4.hotels[0].level = 'pictured';
  const ev4 = makeEvidence(v4);
  assert.deepEqual(checkEvidence(v4, ev4.evidence, ev4.fetches), []);
  ev4.evidence.find((x) => x.hotel === v4.hotels[0].id && x.field === 'hotel.level').quote = v4.hotels[0].book[0].room;
  assert.ok(has(checkEvidence(v4, ev4.evidence, null), 'the word photo'));
});

test('a booking site named as a source must be where the evidence came from; a linked source must have been opened', () => {
  const { view, evidence, fetches } = evBase();
  const v = clone(view);
  v.hotels[1].sources.push({ label: 'Agoda' });
  assert.ok(has(checkEvidence(v, evidence, fetches), 'the source "Agoda" has no evidence entry from that site'));
});

test('evidence about something that is not in view.json is caught', () => {
  const { view, evidence, fetches } = evBase();
  const e = clone(evidence);
  e.push({ hotel: view.hotels[0].id, field: 'room.book', value: 'Invented Suite', url: e[0].url, quote: 'Invented Suite' });
  assert.ok(has(checkEvidence(view, e, null), 'which is not in "book"'));
  const e2 = clone(evidence);
  e2.push({ hotel: 'nobody', field: 'hotel.name', value: 'X', url: e[0].url, quote: 'X is a hotel' });
  assert.ok(has(checkEvidence(view, e2, fetches), 'is not in view.json'));
  const e3 = clone(evidence);
  e3.push({ ...e3[0] });
  assert.ok(has(checkEvidence(view, e3, null), 'a second entry'));
});

// ---- the transcript ----

test('parseTranscript pairs each WebFetch call with its result', () => {
  const lines = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Looking' }, { type: 'tool_use', id: 'a1', name: 'WebFetch', input: { url: 'https://www.hotels.com/ho1/', prompt: 'x' } }, { type: 'tool_use', id: 'a2', name: 'WebSearch', input: { query: 'q' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a1', content: 'Room: **Deluxe Suite**' }, { type: 'tool_result', tool_use_id: 'a2', content: 'search text' }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'WebFetch', input: { url: 'https://guide.test/p?utm_source=x' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: [{ type: 'text', text: 'Guide text' }, { type: 'text', text: 'more' }] }] } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'c1', name: 'WebFetch', input: { url: 'https://lost.test/' } }] } },
  ];
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\nnot json\n';
  const f = parseTranscript(text);
  assert.equal(f.length, 2);
  assert.equal(f[0].url, 'https://www.hotels.com/ho1/');
  assert.ok(norm(f[0].text).includes('deluxe suite'));
  assert.ok(f[1].text.includes('Guide text') && f[1].text.includes('more'));
  assert.equal(urlKey('https://www.guide.test/p/?utm_source=x#top'), urlKey('https://guide.test/p'));
});

test('helpers: booking hosts and labels, normalisation', () => {
  assert.ok(isBookingHost('https://www.expedia.co.uk/h') && isBookingHost('https://ca.hotels.com/ho1') && isBookingHost('https://www.booking.com/hotel/x'));
  assert.ok(!isBookingHost('https://megivorera.com/x') && !isBookingHost('https://trip101.com/x'));
  assert.ok(isBookingLabel('Hotels.com') && isBookingLabel('Trip.com') && !isBookingLabel('Trip101') && !isBookingLabel('Oyster'));
  assert.equal(hostOf('https://www.Oyster.com/x'), 'oyster.com');
  assert.equal(norm('  “Fountain”  View — King *'), '"fountain" view - king');
});

test('lastResult and resultHint read how the writer run ended', () => {
  const ok = [{ type: 'assistant' }, { type: 'result', subtype: 'success', is_error: false, num_turns: 41, result: 'Angkor Wat, 5 hotels' }].map((l) => JSON.stringify(l)).join('\n');
  assert.equal(lastResult(ok).num_turns, 41);
  assert.equal(resultHint(lastResult(ok)), '');
  assert.ok(resultHint(lastResult(JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true }))).includes('maxTurns'));
  assert.ok(resultHint({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid OAuth token' }).includes('setup-token'));
  assert.ok(resultHint({ type: 'result', subtype: 'error', is_error: true, result: 'Usage limit reached' }).includes('лимит'));
  assert.ok(resultHint(null).includes('не вернул итог'));
  assert.equal(lastResult('not json\n'), null);
});

// ---- the gate and the list ----

const cand = (qid, slug, views, status = 'new', extra = {}) => ({ qid, name: slug, enwiki: slug, slug, country: 'X', area: '', coords: { lat: 1, lng: 1 }, classes: ['tower'], sitelinks: 50, views12m: views, status, ...extra });
const list = [cand('Q1', 'a', 100), cand('Q2', 'b', 300), cand('Q3', 'c', 200, 'new', { near: ['colosseum'] }), cand('Q4', 'd', 400, 'rejected', { note: 'x' }), cand('Q5', 'e', 50)];
const settings = { enabled: true, maxPending: 2, expireDays: 14, skipNear: true, maxAttempts: 2 };

test('pickCandidate takes the most viewed new place, skips near ones and places tried too often', () => {
  assert.equal(pickCandidate(list).slug, 'b');
  assert.equal(pickCandidate(list, { attempts: { Q2: 2 } }).slug, 'a');
  assert.equal(pickCandidate(list, { attempts: { Q2: 1 } }).slug, 'b');
  assert.equal(pickCandidate(list, { skipNear: false }).slug, 'b');
  assert.equal(pickCandidate([cand('Q9', 'z', 1, 'drafted')]), null);
  assert.equal(pickCandidate(list, { only: 'c' }).slug, 'c');
  assert.equal(pickCandidate(list, { only: 'd' }), null);
});

test('gate: off, too many drafts waiting, nothing left, or go', () => {
  const state = { drafts: [], attempts: {} };
  const today = '2026-10-19';
  assert.equal(gateDecision({ settings: { ...settings, enabled: false }, state, candidates: list, siteSlugs: [], today }).run, false);
  const g = gateDecision({ settings, state, candidates: list, siteSlugs: [], today });
  assert.equal(g.run, true);
  assert.equal(g.candidate.slug, 'b');
  const waiting = [cand('Q1', 'a', 100, 'drafted'), cand('Q2', 'b', 300, 'drafted'), cand('Q5', 'e', 50)];
  const st = { drafts: [{ date: '2026-10-18', slug: 'a', qid: 'Q1', title: 'A' }, { date: '2026-10-19', slug: 'b', qid: 'Q2', title: 'B' }] };
  assert.equal(gateDecision({ settings, state: st, candidates: waiting, siteSlugs: [], today }).run, false);
  assert.equal(gateDecision({ settings, state: st, candidates: waiting, siteSlugs: ['a'], today }).run, true, 'one is published, a place frees up');
  assert.equal(gateDecision({ settings, state: st, candidates: waiting, siteSlugs: [], today: '2026-12-01' }).run, true, 'old drafts expire');
  assert.equal(waitingDrafts(st, [cand('Q1', 'a', 1, 'rejected'), cand('Q2', 'b', 1, 'drafted')], [], today, 14).length, 1, 'a rejected place is not waiting');
  assert.equal(gateDecision({ settings, state, candidates: [cand('Q1', 'a', 1, 'rejected')], siteSlugs: [], today }).run, false);
});

test('buildPrompt names the place, the output folder and the next order number', () => {
  const text = buildPrompt({ rules: 'RULES HERE', today: '2026-10-19', candidate: cand('Q7', 'angkor-wat', 5, 'new', { name: 'Angkor Wat', enwiki: 'Angkor Wat' }), views: site, month: '2026-10' });
  assert.ok(text.includes('Angkor Wat') && text.includes('drafts/views/angkor-wat/'));
  assert.ok(text.includes(`"order": ${Math.max(...site.map((v) => v.order)) + 1}`));
  assert.ok(text.includes('check drafts/views/angkor-wat') && text.trimEnd().endsWith('RULES HERE'));
  assert.ok(text.includes('hagia-sophia: Hagia Sophia, Istanbul, Turkey'));
});

test('notes.md needs the four Russian headings in order', () => {
  const ok = ['## Что за вид', 'Текст про вид, достаточно длинный, чтобы быть полезным владельцу. '.repeat(2), '## Откуда данные', 'Страницы и цитаты, откуда взяты названия номеров и адреса отелей. '.repeat(2), '## Что проверить владельцу', 'Ничего особенного, кроме того, что описано выше в заметках по отелям. ', '## Когда перепроверить', 'Через полгода.'].join('\n\n');
  assert.deepEqual(notesProblems(ok), []);
  assert.ok(has(notesProblems(ok.replace('## Откуда данные', '## Источники')), 'is missing or out of order'));
  assert.ok(has(notesProblems('## Что за вид\n## Откуда данные\n## Что проверить владельцу\n## Когда перепроверить\n' + 'English only text, long enough to pass the length rule ... '.repeat(6)), 'in Russian'));
});

// ---- the candidate list ----

test('patchCandidateText changes one line and keeps the rest of the real file', () => {
  const real = readFileSync(new URL('../data/view-candidates.json', import.meta.url), 'utf8');
  const first = JSON.parse(real).candidates.find((c) => c.status === 'new');
  const out = patchCandidateText(real, first.qid, { status: 'drafted' });
  const a = real.split('\n');
  const b = out.split('\n');
  assert.equal(a.length, b.length);
  assert.equal(a.filter((l, i) => l !== b[i]).length, 1);
  assert.equal(JSON.parse(out).candidates.find((c) => c.qid === first.qid).status, 'drafted');
  const rej = JSON.parse(patchCandidateText(real, first.qid, { status: 'rejected', note: 'no honest hotels' })).candidates.find((c) => c.qid === first.qid);
  assert.equal(rej.note, 'no honest hotels');
  assert.throws(() => patchCandidateText(real, 'Q0', {}), /not in/);
  const pub = patchPublishedViews(real, ['b-view', 'a-view']);
  assert.deepEqual(JSON.parse(pub).publishedViews, ['a-view', 'b-view']);
  assert.equal(JSON.parse(pub).candidates.length, JSON.parse(real).candidates.length);
});

// ---- photos ----

test('verifyPhotos: licence, night, JPEG and the landmark in the name', async () => {
  const info = (licence, mime = 'image/jpeg', desc = '') => ({ info: { mime, extmetadata: { LicenseShortName: { value: licence }, ImageDescription: { value: desc } } }, categories: ['Category:Hagia Sophia'] });
  const view = { slug: 'hagia-sophia', landmark: 'Hagia Sophia', photo: { commons: [{ file: 'File:A.jpg' }, { file: 'File:B.jpg' }, { file: 'File:C.jpg' }, { file: 'File:D.jpg' }, { file: 'File:E.jpg' }, { file: 'File:F.jpg' }] } };
  const table = {
    'File:A.jpg': info('CC BY-SA 4.0'),
    'File:B.jpg': info('CC BY-NC 4.0'),
    'File:C.jpg': info('CC BY 2.0', 'image/jpeg', 'Hagia Sophia at night'),
    'File:D.jpg': info('CC BY 2.0', 'image/png'),
    'File:E.jpg': { ...info('CC0'), categories: ['Category:Cats'] },
    'File:F.jpg': null,
  };
  const r = await verifyPhotos(view, async (f) => table[f]);
  assert.deepEqual(r.good, ['File:A.jpg']);
  assert.equal(r.notes.length, 5);
  assert.ok(r.notes.some((x) => x.includes('licence')) && r.notes.some((x) => x.includes('night')) && r.notes.some((x) => x.includes('JPEG')) && r.notes.some((x) => x.includes('do not mention')) && r.notes.some((x) => x.includes('not found')));
  const down = await verifyPhotos(view, async () => {
    throw new Error('offline');
  });
  assert.equal(down.good.length, 0);
  assert.equal(down.unreachable, 6);
});

// ---- a whole draft folder ----

test('checkDraft end to end: a good draft, a rejected one, and tampering', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'views-'));
  const slug = 'test-landmark';
  const folder = join(dir, slug);
  mkdirSync(folder);
  const v = clone(hagia);
  v.slug = slug;
  v.order = 99;
  v.landmark = 'Test Landmark';
  v.landmarkInText = 'Test Landmark';
  v.photo.commons = [{ file: 'File:Test Landmark day.jpg', alt: 'The Test Landmark in daylight' }];
  v.hotels.forEach((h) => (h.id = 'tl-' + h.id));
  v.shortAnswer.forEach((s) => (s.hotel = 'tl-' + s.hotel));
  // the hotels' evidence names the landmark, as a "reported" hotel needs
  const { evidence, fetches } = makeEvidence(v);
  const candidates = [{ qid: 'Q99', slug, name: 'Test Landmark', coords: hagia.coords, status: 'new' }];
  const notes = ['## Что за вид', 'Проверочный вид для тестов, он нигде не публикуется. Здесь достаточно текста. '.repeat(2), '## Откуда данные', 'Все данные выдуманы для теста программы проверки. '.repeat(2), '## Что проверить владельцу', 'Ничего: это тест. Но текст должен быть длиннее трёхсот знаков, поэтому он такой.', '## Когда перепроверить', 'Никогда.'].join('\n\n');
  writeFileSync(join(folder, 'view.json'), JSON.stringify(v));
  writeFileSync(join(folder, 'evidence.json'), JSON.stringify(evidence));
  writeFileSync(join(folder, 'notes.md'), notes);
  const ok = await checkDraft(folder, { fetches, candidates, month: '2026-10' });
  assert.deepEqual(ok.problems, []);
  assert.equal(ok.outcome, 'drafted');

  // tampering: a room name is changed in view.json but not in the evidence
  const t = clone(v);
  t.hotels[0].book[0].room = 'Penthouse With Everything';
  writeFileSync(join(folder, 'view.json'), JSON.stringify(t));
  const bad1 = await checkDraft(folder, { fetches, candidates, month: '2026-10' });
  assert.equal(bad1.outcome, 'failed');
  assert.ok(has(bad1.problems, 'Penthouse With Everything'));

  // an unknown place
  assert.ok(has((await checkDraft(join(dir, 'unknown-place'), { fetches, candidates })).problems, 'is not a slug'));

  // a rejected draft is one short paragraph
  writeFileSync(join(folder, 'rejected.md'), 'Only two hotels sell a room with this view, and a view needs at least three.');
  const rej = await checkDraft(folder, { candidates });
  assert.equal(rej.outcome, 'rejected');
  assert.ok(rej.reason.includes('Only two hotels'));
  writeFileSync(join(folder, 'rejected.md'), 'no');
  assert.equal((await checkDraft(folder, { candidates })).outcome, 'failed');
});

test('researchSection lists every page of every hotel', () => {
  const { evidence } = makeEvidence(hagia);
  const text = researchSection(hagia, evidence, '2026-10');
  assert.ok(text.startsWith('## Hagia Sophia (Istanbul, Turkey)'));
  for (const h of hagia.hotels) assert.ok(text.includes(h.name));
  assert.ok(text.includes('https://'));
});

for (const t of tests) {
  await t.fn();
  n++;
  console.log('ok  ' + t.name);
}
console.log(`\n${n} tests passed`);
