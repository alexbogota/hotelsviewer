// npm run test:guides: the guide checks accept a good draft and refuse the bad ones.
import { readFileSync, readdirSync } from 'node:fs';
import { checkGuide } from './lib/guide-check.mjs';

const views = readdirSync('src/data/views').map((f) => JSON.parse(readFileSync(`src/data/views/${f}`, 'utf8')));
const good = JSON.parse(readFileSync('src/data/guides/sagrada-familia-tower-finished.json', 'utf8'));
const url = good.sources[0].url;
const quote = 'the Sagrada Família has completed the external works of its central tower';
const evidence = {
  items: [
    { claim: 'The central tower is finished outside.', quote, url, published: '2026-02-20' },
    { claim: 'The tower is 172.5 metres high.', quote: 'The tower is 172.5 metres', url, published: '2026-02-20' },
  ],
};
const fetches = [{ url, error: false, text: `x ${quote}. y The tower is 172.5 metres high. z` }];
const ctx = { views, existing: [], fetches, today: '2026-10-19', newsDays: 300 };

let failed = 0;
const t = (name, ok) => {
  console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
};
const run = (g, e = evidence, c = ctx) => checkGuide(structuredClone(g), structuredClone(e), c).problems;
const has = (ps, re) => ps.some((p) => re.test(p));

t('a good draft passes', run(good).length === 0);
t('a quote that is not on the page is refused', has(run(good, { items: [{ ...evidence.items[0], quote: 'a sentence nobody wrote' }, evidence.items[1]] }), /quote was not found/));
t('a page that was not opened is refused', has(run(good, evidence, { ...ctx, fetches: [] }), /was not opened/));
t('an old page is refused', has(run(good, evidence, { ...ctx, newsDays: 30 }), /older than/));
t('an evidence url outside the sources is refused', has(run(good, { items: [{ ...evidence.items[0], url: 'https://example.com/a' }, evidence.items[1]] }), /not in the guide's sources/));
t('one evidence item is not enough', has(run(good, { items: [evidence.items[0]] }), /at least 2 items/));
t('a price is refused', has(run({ ...good, dek: 'Rooms from €120 a night near the church, with a view of the towers.' }), /no prices/));
t('a hotel of another view is refused', has(run({ ...good, hotels: ['sercotel-rosellon', 'fouquets-paris'] }), /not a hotel of the view/));
t('an existing slug is refused', has(run(good, evidence, { ...ctx, existing: [good] }), /already a guide/));
t('a linked booking site is refused', has(run({ ...good, sources: [...good.sources, { label: 'Hotels.com', url: 'https://www.hotels.com/x' }] }), /booking sites are not linked/));
t('a text without any real room name is refused', has(run({ ...good, sections: good.sections.map((s) => ({ ...s, p: s.p.map((x) => x.replace(/Classic Double Room|Classic Twin Room|Double or Twin Sagrada Familia View|Junior Suite|Basic Room|Double Room, Terrace/g, 'a room')) })) }), /names none of the rooms/));
process.exit(failed ? 1 : 0);
