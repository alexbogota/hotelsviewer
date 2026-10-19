// Tests of the partner link script with made-up data and a pretend API (no network).
// Run: npm run test:partner-links
import assert from 'node:assert/strict';
import { buildBody, chunk, collectExtras, fetchBatch, pending, readResponse, run, safeLink, subId } from './make-partner-links.mjs';

let n = 0;
const test = async (name, fn) => {
  await fn();
  n++;
  console.log('ok  ' + name);
};

const account = { marker: 111, trs: 222 };
const views = [
  {
    slug: 'a',
    extras: [
      { id: 'a-tickets-tiqets', url: 'https://www.tiqets.com/en/x-l1' },
      { id: 'a-bus-klook', url: 'https://www.klook.com/activity/1-bus/' },
    ],
  },
  { slug: 'b' },
  { slug: 'c', extras: [{ id: 'c-ropeway-klook', url: 'https://www.klook.com/activity/2-ropeway/' }] },
];
const TOKEN = 'secret-token-123';

const okAnswer = (batch) => ({
  code: 200,
  status: 'success',
  result: {
    links: batch.map((l, i) => ({ url: l.url, code: 'success', partner_url: `https://brand.tp.st/code${i}` })),
  },
});

await test('collectExtras lists every extra and skips views without any', () => {
  assert.deepEqual(collectExtras(views).map((e) => e.id), ['a-tickets-tiqets', 'a-bus-klook', 'c-ropeway-klook']);
});

await test('pending asks only for links not made yet, or whose address changed', () => {
  const extras = collectExtras(views);
  const store = {
    'a-tickets-tiqets': { url: 'https://www.tiqets.com/en/x-l1', partner_url: 'https://t.tp.st/1' },
    'a-bus-klook': { url: 'https://www.klook.com/activity/OLD/', partner_url: 'https://t.tp.st/2' },
  };
  assert.deepEqual(pending(extras, store).map((e) => e.id), ['a-bus-klook', 'c-ropeway-klook']);
});

await test('chunk splits into groups of at most 10', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(chunk(Array.from({ length: 23 }, (_, i) => i), 10).length, 3);
});

await test('subId keeps letters and digits, everything else becomes one underscore', () => {
  assert.equal(subId('mount-fuji-bus-klook'), 'mount_fuji_bus_klook');
});

await test('buildBody matches the API format and carries no token', () => {
  const body = buildBody(account, collectExtras(views).slice(0, 2));
  assert.equal(body.trs, 222);
  assert.equal(body.marker, 111);
  assert.equal(body.shorten, true);
  assert.deepEqual(body.links[0], { url: 'https://www.tiqets.com/en/x-l1', sub_id: 'a_tickets_tiqets' });
  assert.ok(!JSON.stringify(body).includes('token'));
});

await test('safeLink accepts plain https addresses and refuses anything that could break .htaccess', () => {
  assert.equal(safeLink('https://tiqets.tp.st/abc?erid=2Vtz'), true);
  assert.equal(safeLink('http://x.com/'), false);
  assert.equal(safeLink('https://x.com/a b'), false);
  assert.equal(safeLink('https://x.com/"a'), false);
  assert.equal(safeLink('https://x.com/$1'), false);
  assert.equal(safeLink(undefined), false);
});

await test('readResponse maps answers by address, and reports failures with the API message', () => {
  const batch = collectExtras(views).slice(0, 2);
  const json = {
    result: {
      links: [
        { url: batch[1].url, code: 'failed', message: 'trs is not subscribed for brand' },
        { url: batch[0].url, code: 'success', partner_url: 'https://tiqets.tp.st/zzz' },
      ],
    },
  };
  const { made, failed } = readResponse(json, batch);
  assert.deepEqual(made, { 'a-tickets-tiqets': { url: batch[0].url, partner_url: 'https://tiqets.tp.st/zzz' } });
  assert.deepEqual(failed, { 'a-bus-klook': 'trs is not subscribed for brand' });
});

await test('readResponse rejects an answer with an unsafe partner link', () => {
  const batch = collectExtras(views).slice(0, 1);
  const json = { result: { links: [{ url: batch[0].url, code: 'success', partner_url: 'javascript:alert(1)' }] } };
  const { made, failed } = readResponse(json, batch);
  assert.deepEqual(made, {});
  assert.ok(failed['a-tickets-tiqets']);
});

await test('readResponse copes with an answer that is not what we expect', () => {
  const batch = collectExtras(views).slice(0, 2);
  const { made, failed } = readResponse({ message: 'nope' }, batch);
  assert.deepEqual(made, {});
  assert.deepEqual(Object.keys(failed), ['a-tickets-tiqets', 'a-bus-klook']);
});

await test('fetchBatch sends the token only in the header', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    const body = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => okAnswer(body.links) };
  };
  const batch = collectExtras(views).slice(0, 2);
  const { made } = await fetchBatch(batch, account, TOKEN, fetchImpl);
  assert.equal(seen.url, 'https://api.travelpayouts.com/links/v1/create');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['X-Access-Token'], TOKEN);
  assert.ok(!seen.init.body.includes(TOKEN));
  assert.equal(Object.keys(made).length, 2);
});

await test('fetchBatch turns a 401 or a network error into failures, without the token', async () => {
  const batch = collectExtras(views).slice(0, 2);
  const unauthorized = async () => ({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) });
  const r1 = await fetchBatch(batch, account, TOKEN, unauthorized);
  assert.deepEqual(r1.made, {});
  assert.match(r1.failed['a-tickets-tiqets'], /HTTP 401/);
  const broken = async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  };
  const r2 = await fetchBatch(batch, account, TOKEN, broken);
  assert.match(r2.failed['a-bus-klook'], /network problem/);
  assert.ok(!JSON.stringify([r1, r2]).includes(TOKEN));
});

await test('run asks in groups of 10 and keeps what already works', async () => {
  const many = [
    {
      slug: 'big',
      extras: Array.from({ length: 23 }, (_, i) => ({ id: `big-${i}`, url: `https://www.tiqets.com/en/p${i}` })),
    },
  ];
  const sizes = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    sizes.push(body.links.length);
    return { ok: true, status: 200, json: async () => okAnswer(body.links) };
  };
  const first = await run({ views: many, store: {}, account, token: TOKEN, fetchImpl });
  assert.deepEqual(sizes, [10, 10, 3]);
  assert.equal(Object.keys(first.store).length, 23);
  assert.ok(Object.values(first.status).every((s) => s === 'ok'));
  sizes.length = 0;
  const second = await run({ views: many, store: first.store, account, token: TOKEN, fetchImpl });
  assert.deepEqual(sizes, []);
  assert.equal(second.note, 'No new partner links needed.');
});

await test('run drops links of extras that no longer exist, and does nothing without a token', async () => {
  const store = { gone: { url: 'https://x.com/', partner_url: 'https://x.tp.st/1' } };
  const res = await run({ views, store, account, token: undefined, fetchImpl: async () => assert.fail('no call expected') });
  assert.deepEqual(res.store, {});
  assert.equal(res.status, null);
  assert.match(res.note, /not set/);
});

await test('run records a failure and leaves that row without a link', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const res = await run({ views, store: {}, account, token: TOKEN, fetchImpl });
  assert.deepEqual(res.store, {});
  assert.equal(res.status['a-tickets-tiqets'], 'HTTP 500');
});

console.log(`partner links: ${n} tests passed`);
