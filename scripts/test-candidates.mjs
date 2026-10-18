// Tests of the candidate list logic with made-up data (no network). Run: npm run test:candidates
import assert from 'node:assert/strict';
import {
  collect,
  distanceKm,
  mergeCandidates,
  normalize,
  parseCoord,
  renderFile,
  rowToItem,
  slugify,
  viewsPeriod,
} from './build-candidates.mjs';

let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('ok  ' + name);
};

const row = (qid, name, title, sitelinks, wkt, country = 'France', area = 'Paris') => ({
  item: { value: 'http://www.wikidata.org/entity/' + qid },
  itemLabel: { value: name },
  title: { value: title },
  sitelinks: { value: String(sitelinks) },
  coord: { value: wkt },
  countryLabel: { value: country },
  areaLabel: { value: area },
});

test('parseCoord reads WKT points (longitude first) and rejects nonsense', () => {
  assert.deepEqual(parseCoord('Point(2.2945 48.8584)'), { lat: 48.8584, lng: 2.2945 });
  assert.deepEqual(parseCoord('Point(-79.0747 43.0799)'), { lat: 43.0799, lng: -79.0747 });
  assert.equal(parseCoord('Point(200 10)'), null);
  assert.equal(parseCoord('nope'), null);
});

test('slugify and normalize drop accents and punctuation', () => {
  assert.equal(slugify('Sagrada Família'), 'sagrada-familia');
  assert.equal(slugify("St. Peter's Square"), 'st-peter-s-square');
  assert.equal(normalize('The Eiffel Tower!'), 'theeiffeltower');
});

test('distanceKm: Eiffel Tower to Notre-Dame is about 4 km', () => {
  const d = distanceKm({ lat: 48.8584, lng: 2.2945 }, { lat: 48.853, lng: 2.3499 });
  assert.ok(d > 3.5 && d < 4.5, String(d));
});

test('rowToItem refuses rows without a name, an article or coordinates', () => {
  assert.equal(rowToItem(row('Q1', 'Q1', 'X', 50, 'Point(1 1)'), 'tower'), null); // label is just the id
  assert.equal(rowToItem(row('Q2', 'Name', '', 50, 'Point(1 1)'), 'tower'), null);
  assert.equal(rowToItem(row('Q3', 'Name', 'Name', 50, 'bad'), 'tower'), null);
  assert.equal(rowToItem(row('Q4', 'Name', 'Name', 50, 'Point(1 1)', 'Q5', 'Q6'), 'tower').country, ''); // unlabelled ids are dropped
});

test('collect merges a place that comes back as two kinds and fills empty fields', () => {
  const a = row('Q243', 'Eiffel Tower', 'Eiffel Tower', 200, 'Point(2.2945 48.8584)', '', '');
  const b = row('Q243', 'Eiffel Tower', 'Eiffel Tower', 200, 'Point(2.2945 48.8584)', 'France', 'Paris');
  const items = collect([
    { cls: 'tower', rows: [a] },
    { cls: 'tourist attraction', rows: [b] },
  ]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].classes, ['tower', 'tourist attraction']);
  assert.equal(items[0].country, 'France');
  assert.equal(items[0].area, 'Paris');
});

const item = (qid, name, views, sitelinks = 100, coords = { lat: 10, lng: 10 }) => ({
  qid,
  name,
  enwiki: name,
  country: 'X',
  area: '',
  coords,
  classes: ['tower'],
  sitelinks,
  views12m: views,
});
const published = [
  { slug: 'eiffel-tower', landmark: 'Eiffel Tower', coords: { lat: 48.8584, lng: 2.2945 } },
  { slug: 'niagara-falls', landmark: 'Niagara Falls', coords: { lat: 43.0799, lng: -79.0747 } },
];

test('merge: places that match a view on the site become published with its slug', () => {
  const out = mergeCandidates({
    fresh: [item('Q243', 'Eiffel Tower', 9000000, 250, { lat: 48.8584, lng: 2.2945 }), item('Q2', 'Big Ben', 5000000)],
    previous: null,
    publishedViews: published,
  });
  const eiffel = out.find((c) => c.qid === 'Q243');
  assert.equal(eiffel.status, 'published');
  assert.equal(eiffel.slug, 'eiffel-tower');
  assert.equal(out.find((c) => c.qid === 'Q2').status, 'new');
});

test('merge: a place within 3 km of a published view is flagged "near"', () => {
  const out = mergeCandidates({
    fresh: [item('Q9', 'Champ de Mars', 100, 50, { lat: 48.8556, lng: 2.2986 })],
    previous: null,
    publishedViews: published,
  });
  assert.deepEqual(out[0].near, ['eiffel-tower']);
});

test('merge: status, note and slug of earlier runs are kept', () => {
  const previous = {
    candidates: [
      { ...item('Q10', 'Matterhorn', 100), status: 'rejected', note: 'no hotel rooms are sold with this view', slug: 'matterhorn' },
      { ...item('Q11', 'Taj Mahal', 100), status: 'drafted', slug: 'taj-mahal-agra' },
    ],
  };
  const out = mergeCandidates({
    fresh: [item('Q10', 'Matterhorn', 800000), item('Q11', 'Taj Mahal', 3000000)],
    previous,
    publishedViews: [],
  });
  const m = out.find((c) => c.qid === 'Q10');
  assert.equal(m.status, 'rejected');
  assert.equal(m.note, 'no hotel rooms are sold with this view');
  assert.equal(m.views12m, 800000); // numbers are refreshed
  const t = out.find((c) => c.qid === 'Q11');
  assert.equal(t.status, 'drafted');
  assert.equal(t.slug, 'taj-mahal-agra');
});

test('merge: worked-on places stay even when they fall out of the fresh results', () => {
  const previous = { candidates: [{ ...item('Q20', 'Old Place', 500), status: 'drafted', slug: 'old-place' }] };
  const out = mergeCandidates({ fresh: [item('Q21', 'New Place', 900)], previous, publishedViews: [] });
  assert.ok(out.some((c) => c.qid === 'Q20' && c.status === 'drafted'));
});

test('merge: "new" places beyond the limit are dropped, the best stay, sorted by views', () => {
  const fresh = Array.from({ length: 10 }, (_, i) => item('Q' + (100 + i), 'Place ' + i, i * 1000));
  const out = mergeCandidates({ fresh, previous: null, publishedViews: [], keep: 3 });
  assert.deepEqual(out.map((c) => c.views12m), [9000, 8000, 7000]);
});

test('merge: places with no page views (unknown) are not listed, but an earlier number is reused', () => {
  const previous = { candidates: [{ ...item('Q30', 'Known', 700), status: 'new', slug: 'known' }] };
  const out = mergeCandidates({
    fresh: [item('Q30', 'Known', null), item('Q31', 'Unknown', null)],
    previous,
    publishedViews: [],
  });
  assert.equal(out.find((c) => c.qid === 'Q30').views12m, 700);
  assert.ok(!out.some((c) => c.qid === 'Q31'));
});

test('merge: two places with the same name get different slugs, the better-known keeps the plain one', () => {
  const a = { ...item('Q40', 'Cathedral', 900), country: 'Spain' };
  const b = { ...item('Q41', 'Cathedral', 100), country: 'Italy' };
  const c = { ...item('Q42', 'Cathedral', 50), country: 'Italy' };
  const out = mergeCandidates({ fresh: [a, b, c], previous: null, publishedViews: [] });
  const slugs = out.map((x) => x.slug);
  assert.equal(new Set(slugs).size, 3, slugs.join(', '));
  assert.equal(out.find((x) => x.qid === 'Q40').slug, 'cathedral');
  assert.equal(out.find((x) => x.qid === 'Q41').slug, 'cathedral-italy');
  assert.equal(out.find((x) => x.qid === 'Q42').slug, 'cathedral-q42');
});

test('merge: a name with no Latin letters still gets a usable slug, and no slug equals a published view', () => {
  const out = mergeCandidates({
    fresh: [item('Q50', '東京タワー', 800), item('Q51', 'Eiffel Tower', 700)],
    previous: null,
    publishedViews: [{ slug: 'eiffel-tower', landmark: 'Eiffel Tower' }].map((v) => ({ ...v, coords: { lat: 0, lng: 0 } })),
  });
  assert.equal(out.find((x) => x.qid === 'Q50').slug, 'q50');
  assert.equal(out.find((x) => x.qid === 'Q51').slug, 'eiffel-tower'); // it IS the published view
});

test('viewsPeriod: 12 full months before the current one', () => {
  const p = viewsPeriod(new Date('2026-10-18T12:00:00Z'));
  assert.equal(p.start, '20251001');
  assert.equal(p.end, '20260930');
  assert.equal(p.label, '2025-10..2026-09');
  assert.equal(viewsPeriod(new Date('2027-01-05T00:00:00Z')).start, '20260101');
});

test('renderFile writes valid JSON with one candidate per line', () => {
  const candidates = mergeCandidates({ fresh: [item('Q1', 'A', 5), item('Q2', 'B', 9)], previous: null, publishedViews: published });
  const text = renderFile({ generated: '2026-10-18', period: '2025-10..2026-09', publishedViews: published, candidates });
  const parsed = JSON.parse(text);
  assert.equal(parsed.candidates.length, 2);
  assert.deepEqual(parsed.publishedViews, ['eiffel-tower', 'niagara-falls']);
  assert.equal(text.split('\n').filter((l) => l.includes('"qid"')).length, 2);
});

console.log(`\n${n} tests passed.`);
