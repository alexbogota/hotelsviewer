// npm run test:posts: the thread checks accept good threads and refuse bad ones; the RSS reader reads a feed.
import { readFileSync, readdirSync } from 'node:fs';
import { checkThreads, graphemes } from './lib/post-check.mjs';
import { parseRss } from './lib/rss.mjs';
import { makeLinkBuilder } from './post-tools.mjs';

const views = readdirSync('src/data/views').map((f) => JSON.parse(readFileSync(`src/data/views/${f}`, 'utf8')));
const A = 'https://www.euronews.com/2026/10/21/airbnb-bans-check-out-chores';
const B = 'https://www.atlasobscura.com/places/pdx-carpet-memorial-sign';
const C = 'https://www.euronews.com/2026/10/21/greece-tourism-august-2026';
const items = [
  { feed: 'Euronews', link: A, title: 'Airbnb' },
  { feed: 'Atlas Obscura', link: B, title: 'PDX carpet' },
  { feed: 'Euronews', link: C, title: 'Greece' },
];
const good = {
  threads: [
    { format: 'question', source: A, posts: ['Airbnb hosts can no longer ask for chores that take "significant effort or time", Euronews reports. #travel', 'What is the strangest check-out rule you have had?'], link: { type: 'source' }, linkText: 'Source: Euronews', evidence: [{ quote: 'significant effort or time', url: A }] },
    { format: 'gem', source: B, posts: ['On the side of a Hampton Inn in downtown Portland there is a memorial to an airport carpet. #Portland #travel', 'It was designed in 1987. (via Atlas Obscura)'], link: { type: 'search', place: 'Portland, Oregon' }, linkText: 'Hotels near it, with photos and prices:', evidence: [{ quote: 'designed by SRG Partnerships in 1987', url: B }] },
    { format: 'news', source: C, posts: ['Greece had 7.43 million arrivals in August 2026, Euronews reports. #Athens #travel', 'At Hotel Grande Bretagne book "Deluxe Acropolis, Guest room, 1 King, Acropolis view", not "Deluxe, Guest room, 1 King, City view".'], link: { type: 'view', slug: 'acropolis' }, linkText: 'All the Athens hotels we checked:', evidence: [{ quote: 'Arrivals reached 7.43 million', url: C }] },
  ],
};
const fetches = [
  { url: A, error: false, text: 'tasks that involve significant effort or time, or would' },
  { url: B, error: false, text: 'The carpet was designed by SRG Partnerships in 1987.' },
  { url: C, error: false, text: 'Arrivals reached 7.43 million and overnight stays' },
];
const build = makeLinkBuilder('2026-10-22')('bluesky');
const ctx = { formats: ['question', 'gem', 'news'], items, views, guides: [], maxTags: 3, fetches, buildLink: build };
const run = (d, c = ctx) => checkThreads(structuredClone(d), c).problems;
const has = (ps, re) => ps.some((p) => re.test(p));
const edit = (fn) => {
  const d = structuredClone(good);
  fn(d);
  return d;
};

let failed = 0;
const t = (name, ok) => {
  console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
};
const p0 = run(good);
t('good threads pass' + (p0.length ? ': ' + p0.join(' | ') : ''), p0.length === 0);
t('the link is made by the program, with our mark', build(good.threads[1], items[1]) === 'https://hotelsviewer.com/hotels/?q=Portland%2C%20Oregon&utm_source=bluesky&utm_medium=social&utm_campaign=2026-10-22-gem');
t('a URL in the text is refused', has(run(edit((d) => (d.threads[0].posts[1] += ' https://x.com'))), /no URLs/));
t('a post over 300 characters is refused', has(run(edit((d) => (d.threads[0].posts[1] = 'a'.repeat(301)))), /limit is 300/));
t('an invented room name in quotes is refused', has(run(edit((d) => (d.threads[2].posts[1] = 'Book "Royal Acropolis Panorama Suite". (Euronews)'))), /neither an evidence quote/));
t('a quote that is not on the page is refused', has(run(edit((d) => (d.threads[1].evidence[0].quote = 'made of gold'))), /not found on the page/));
t('an unopened page is refused', has(run(good, { ...ctx, fetches: [] }), /not opened/));
t('a source outside the feeds is refused', has(run(edit((d) => (d.threads[0].source = 'https://example.com/x'))), /one of today's feed items/));
t('a price is refused', has(run(edit((d) => (d.threads[2].posts[0] += ' Rooms from €90.'))), /no prices/));
t('too many hashtags are refused', has(run(edit((d) => (d.threads[1].posts[0] += ' #a #b'))), /hashtags/));
t('a missing credit is refused', has(run(edit((d) => (d.threads[1].posts[1] = 'It was designed in 1987.'))), /credit the source/));
t('a view that we do not have is refused', has(run(edit((d) => (d.threads[2].link = { type: 'view', slug: 'big-ben' }))), /not one of our views/));
t('two threads of one format are refused', has(run(edit((d) => (d.threads[1].format = 'question'))), /used twice/));
t('graphemes count an emoji as one', graphemes('a🧺') === 2);
const rss = parseRss('<rss><channel><item><title><![CDATA[A &amp; B]]></title><link>https://e.com/a</link><pubDate>Wed, 21 Oct 2026 16:24:00 +0200</pubDate><description>&lt;p&gt;Hi&lt;/p&gt;</description></item></channel></rss>');
t('the RSS reader reads title, link, date and description', rss.length === 1 && rss[0].title === 'A & B' && rss[0].link === 'https://e.com/a' && rss[0].date === '2026-10-21T14:24:00.000Z' && rss[0].description === 'Hi');
process.exit(failed ? 1 : 0);
