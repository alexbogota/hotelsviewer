// Social accounts of the project. ONE place for the mark (subid) of every network: data/accounts.json.
// The same mark goes into the short link of the profile (/go/<go>/), into the links of posts (utm_source)
// and into the partner network (sub ID). Nobody writes these links by hand: use the functions below.
//   profileTarget  where the short link of a profile leads (home page + marks)
//   profileBlock   the lines for dist/go/.htaccess, one per enabled account (used by scripts/build-go.mjs)
//   postLink       a link for a post: our own page + the marks of the account
// A new network = a new block in data/accounts.json. No code changes.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const ACCOUNTS_FILE = join(root, 'data/accounts.json');

// Written above the profile lines in dist/go/.htaccess; scripts/check-site.mjs splits the file at this text.
export const PROFILE_MARKER = '# Short links for social profiles';

// lowercase letters, digits and single dashes: safe inside .htaccess, a URL and a partner network sub ID
const WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CAMPAIGN = /^[a-z0-9][a-z0-9_-]*$/;

/** Returns a list of problems in the accounts data (empty = fine). Does not touch the disk. */
export function checkAccounts(data) {
  const problems = [];
  const links = data?.links;
  if (!links || typeof links !== 'object') return ['"links" is missing'];
  if (typeof links.site !== 'string' || !/^https:\/\/[a-z0-9.-]+$/.test(links.site)) {
    problems.push('links.site must look like https://hotelsviewer.com (no slash at the end)');
  }
  for (const f of ['medium', 'profileCampaign']) {
    if (typeof links[f] !== 'string' || !WORD.test(links[f])) problems.push(`links.${f} must be lowercase letters, digits and dashes`);
  }
  const accounts = data.accounts;
  if (!accounts || typeof accounts !== 'object' || Array.isArray(accounts)) return [...problems, '"accounts" is missing'];
  const subids = new Map();
  const gos = new Map();
  for (const [key, a] of Object.entries(accounts)) {
    const at = `accounts.${key}`;
    if (!WORD.test(key)) problems.push(`${at}: the key must be lowercase letters, digits and dashes`);
    if (!a || typeof a !== 'object') {
      problems.push(`${at}: must be an object`);
      continue;
    }
    if (typeof a.enabled !== 'boolean') problems.push(`${at}: "enabled" must be true or false`);
    if (typeof a.name !== 'string' || !a.name.trim()) problems.push(`${at}: "name" is missing`);
    if (typeof a.handle !== 'string') problems.push(`${at}: "handle" must be text (it may be empty)`);
    for (const f of ['subid', 'go']) {
      if (typeof a[f] !== 'string' || !WORD.test(a[f])) problems.push(`${at}: "${f}" must be lowercase letters, digits and dashes, got ${JSON.stringify(a[f])}`);
    }
    if (subids.has(a.subid)) problems.push(`${at}: subid "${a.subid}" is already used by ${subids.get(a.subid)}`);
    else subids.set(a.subid, key);
    if (gos.has(a.go)) problems.push(`${at}: go "${a.go}" is already used by ${gos.get(a.go)}`);
    else gos.set(a.go, key);
  }
  return problems;
}

/** Reads and checks data/accounts.json. Throws with all problems at once. */
export function loadAccounts(file = ACCOUNTS_FILE) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const problems = checkAccounts(data);
  if (problems.length) throw new Error(`data/accounts.json:\n - ${problems.join('\n - ')}`);
  return { links: data.links, list: Object.entries(data.accounts).map(([key, a]) => ({ key, ...a })) };
}

/** Throws when a short profile address equals a hotel or "After the window" id (they share /go/). */
export function assertNoClash(list, takenIds) {
  for (const a of list.filter((x) => x.enabled)) {
    if (takenIds.has(a.go)) throw new Error(`data/accounts.json: the short link /go/${a.go}/ (${a.name}) is already used by a hotel or an extra with that id`);
  }
}

const marks = (links, a, campaign) => `utm_source=${a.subid}&utm_medium=${links.medium}&utm_campaign=${campaign}`;

/** Where the short link of a profile leads. */
export const profileTarget = (links, a) => `${links.site}/?${marks(links, a, links.profileCampaign)}`;

/** The short link to put in a profile: https://hotelsviewer.com/go/bsky/ */
export const shortLink = (links, a) => `${links.site}/go/${a.go}/`;

/** One line for dist/go/.htaccess. 302, not 301, so a changed mark is never stuck in a browser. */
export const profileRedirectLine = (links, a) => `  RedirectMatch 302 ^/go/${a.go}/?$ "${profileTarget(links, a)}"`;

/** A link for a post of this account: our own page plus the marks. path starts with /, campaign is e.g. the view slug. */
export function postLink(links, a, path, campaign) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[?#\s]/.test(path)) {
    throw new Error(`postLink: path must be a page of our site like /views/eiffel-tower/, got ${JSON.stringify(path)}`);
  }
  if (typeof campaign !== 'string' || !CAMPAIGN.test(campaign)) throw new Error(`postLink: bad campaign ${JSON.stringify(campaign)}`);
  return `${links.site}${path}?${marks(links, a, campaign)}`;
}

/** The lines for dist/go/.htaccess (comment + one RedirectMatch per enabled account). */
export function profileBlock(links, list) {
  const on = list.filter((a) => a.enabled);
  return [
    `${PROFILE_MARKER} (${on.map((a) => `/go/${a.go}/`).join(', ') || 'none yet'}).`,
    `# Made from data/accounts.json: the mark of a network is its subid. Each address leads to the home page with that mark,`,
    `# so Google Analytics shows the source (for example bluesky / social, campaign profile).`,
    ...on.map((a) => profileRedirectLine(links, a)),
  ];
}
