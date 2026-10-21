// Tests of the social account settings and the short profile links (made-up data, no network).
// Run: npm run test:accounts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROFILE_MARKER,
  assertNoClash,
  checkAccounts,
  loadAccounts,
  postLink,
  searchLink,
  profileBlock,
  profileRedirectLine,
  profileTarget,
  shortLink,
} from './lib/accounts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('ok  ' + name);
};

const links = { site: 'https://hotelsviewer.com', medium: 'social', profileCampaign: 'profile' };
const acc = (key, subid, go, extra = {}) => ({ key, enabled: true, name: key, handle: '', subid, go, ...extra });
const data = (accounts, l = links) => ({
  links: l,
  accounts: Object.fromEntries(accounts.map(({ key, ...rest }) => [key, rest])),
});

test('the real data/accounts.json is valid and the site address matches site.ts', () => {
  const real = loadAccounts();
  assert.ok(real.list.length >= 3, 'at least Bluesky, Mastodon and Quora');
  const siteTs = readFileSync(join(root, 'src/data/site.ts'), 'utf8');
  const url = siteTs.match(/url:\s*'([^']+)'/)?.[1];
  assert.equal(real.links.site, url, 'links.site in data/accounts.json must equal url in src/data/site.ts');
});

test('the profile address leads to the home page with the marks of the network', () => {
  const a = acc('bluesky', 'bluesky', 'bsky');
  assert.equal(profileTarget(links, a), 'https://hotelsviewer.com/?utm_source=bluesky&utm_medium=social&utm_campaign=profile');
  assert.equal(shortLink(links, a), 'https://hotelsviewer.com/go/bsky/');
});

test('the redirect is 302 and matches the short address with or without a slash, and nothing else', () => {
  const a = acc('bluesky', 'bluesky', 'bsky');
  const line = profileRedirectLine(links, a);
  assert.match(line, /^ {2}RedirectMatch 302 \^\/go\/bsky\/\?\$ "https:\/\/hotelsviewer\.com\/\?utm_source=bluesky&utm_medium=social&utm_campaign=profile"$/);
  const pattern = new RegExp(line.match(/RedirectMatch 302 (\S+) /)[1]);
  for (const ok of ['/go/bsky', '/go/bsky/']) assert.ok(pattern.test(ok), ok);
  for (const no of ['/go/bsky-retro/', '/go/bskyx', '/go/bsky/extra', '/go/', '/go/mastodon/']) assert.ok(!pattern.test(no), no);
});

test('a new network is one more block and adds exactly one line, the others stay the same', () => {
  const two = [acc('bluesky', 'bluesky', 'bsky'), acc('mastodon', 'mastodon', 'mastodon')];
  const three = [...two, acc('threads', 'threads', 'threads')];
  assert.deepEqual(checkAccounts(data(three)), []);
  const before = profileBlock(links, two);
  const after = profileBlock(links, three);
  const redirects = (b) => b.filter((l) => l.includes('RedirectMatch'));
  assert.equal(redirects(after).length, redirects(before).length + 1);
  assert.deepEqual(redirects(after).slice(0, 2), redirects(before));
  assert.match(redirects(after)[2], /\^\/go\/threads\/\?\$ .*utm_source=threads&/);
});

test('a switched-off network gets no line', () => {
  const list = [acc('bluesky', 'bluesky', 'bsky'), acc('pinterest', 'pinterest', 'pinterest', { enabled: false })];
  const block = profileBlock(links, list).join('\n');
  assert.ok(block.includes('/go/bsky/'));
  assert.ok(!block.includes('pinterest'));
});

test('the block starts with the marker that check-site splits the file at, and the marker is not used elsewhere', () => {
  const block = profileBlock(links, [acc('bluesky', 'bluesky', 'bsky')]);
  assert.ok(block[0].startsWith(PROFILE_MARKER));
  assert.equal(block.filter((l) => l.includes(PROFILE_MARKER)).length, 1);
  assert.match(profileBlock(links, [])[0], /none yet/);
});

test('bad settings are all reported: characters, duplicates, missing fields, site address', () => {
  const bad = (accounts, l) => checkAccounts(data(accounts, l)).join(' | ');
  assert.match(bad([acc('a', 'Bluesky', 'bsky')]), /"subid" must be lowercase/);
  assert.match(bad([acc('a', 'blue sky', 'bsky')]), /"subid" must be lowercase/);
  assert.match(bad([acc('a', 'x', 'bsky/../x')]), /"go" must be lowercase/);
  assert.match(bad([acc('a', 'x', '$1')]), /"go" must be lowercase/);
  assert.match(bad([acc('a', 'same', 'one'), acc('b', 'same', 'two')]), /subid "same" is already used by a/);
  assert.match(bad([acc('a', 'one', 'same'), acc('b', 'two', 'same')]), /go "same" is already used by a/);
  assert.match(bad([acc('a', 'x', 'y', { enabled: 'yes' })]), /"enabled" must be true or false/);
  assert.match(bad([acc('a', 'x', 'y', { name: '' })]), /"name" is missing/);
  assert.match(bad([acc('a', 'x', 'y')], { ...links, site: 'https://hotelsviewer.com/' }), /links\.site/);
  assert.match(bad([acc('a', 'x', 'y')], { ...links, site: 'http://hotelsviewer.com' }), /links\.site/);
  assert.match(bad([acc('a', 'x', 'y')], { ...links, medium: 'Social Media' }), /links\.medium/);
  assert.deepEqual(checkAccounts({}), ['"links" is missing']);
});

test('a short address that equals a hotel or extra id stops the build', () => {
  const list = [acc('a', 'a', 'bsky'), acc('b', 'b', 'quora', { enabled: false })];
  assert.doesNotThrow(() => assertNoClash(list, new Set(['four-seasons-hagia'])));
  assert.throws(() => assertNoClash(list, new Set(['bsky'])), /\/go\/bsky\//);
  assert.doesNotThrow(() => assertNoClash(list, new Set(['quora'])), 'a switched-off network does not block');
});

test('a post link carries the same mark as the profile link and refuses foreign or broken addresses', () => {
  const a = acc('mastodon', 'mastodon', 'mastodon');
  assert.equal(
    postLink(links, a, '/views/eiffel-tower/', 'eiffel-tower'),
    'https://hotelsviewer.com/views/eiffel-tower/?utm_source=mastodon&utm_medium=social&utm_campaign=eiffel-tower',
  );
  assert.ok(profileTarget(links, a).includes('utm_source=mastodon&'));
  for (const p of ['views/x/', '//evil.example/', 'https://evil.example/', '/views/x/?a=1', '/views/x y/']) {
    assert.throws(() => postLink(links, a, p, 'x'), /path must be/, p);
  }
  assert.throws(() => postLink(links, a, '/views/x/', 'Two Words'), /bad campaign/);
  assert.equal(searchLink(links, a, 'Portland, Oregon', 'gem'), `${links.site}/hotels/?q=Portland%2C%20Oregon&utm_source=${a.subid}&utm_medium=${links.medium}&utm_campaign=gem`);
  assert.throws(() => searchLink(links, a, 'x', 'gem'), /bad place/);
  assert.throws(() => searchLink(links, a, 'Rome', 'Two Words'), /bad campaign/);
});

console.log(`\n${n} tests passed`);
