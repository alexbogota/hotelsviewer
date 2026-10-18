// Checks data/view-candidates.json before it is saved: structure, statuses, no duplicates, sorted by page views.
// Run: npm run check:candidates. Exits with an error (so the workflow saves nothing) if something is wrong.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'data/view-candidates.json');
const viewsDir = join(root, 'src/data/views');
const STATUSES = ['new', 'drafted', 'published', 'rejected'];

const problems = [];
const bad = (msg) => problems.push(msg);

if (!existsSync(file)) {
  console.error('check-candidates: data/view-candidates.json does not exist.');
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error('check-candidates: the file is not valid JSON:', e.message);
  process.exit(1);
}

const siteSlugs = readdirSync(viewsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(viewsDir, f), 'utf8')).slug);

if (!/^\d{4}-\d{2}-\d{2}$/.test(data.generated || '')) bad('"generated" must be a date YYYY-MM-DD');
if (!data.viewsPeriod) bad('"viewsPeriod" is missing');
if (!Array.isArray(data.publishedViews)) bad('"publishedViews" must be a list');
else if (JSON.stringify([...data.publishedViews].sort()) !== JSON.stringify([...siteSlugs].sort()))
  bad(`"publishedViews" (${data.publishedViews.join(', ')}) does not match src/data/views (${siteSlugs.join(', ')})`);
if (!Array.isArray(data.candidates) || data.candidates.length === 0) bad('"candidates" must be a non-empty list');

const seen = new Set();
const slugs = new Set();
let lastViews = Infinity;
for (const [i, c] of (data.candidates || []).entries()) {
  const where = `candidate ${i + 1} (${c.name || c.qid || '?'})`;
  if (!/^Q\d+$/.test(c.qid || '')) bad(`${where}: qid must look like Q123`);
  if (seen.has(c.qid)) bad(`${where}: qid ${c.qid} appears twice`);
  seen.add(c.qid);
  for (const key of ['name', 'enwiki', 'slug']) if (!c[key] || typeof c[key] !== 'string') bad(`${where}: "${key}" is missing`);
  if (typeof c.country !== 'string' || typeof c.area !== 'string') bad(`${where}: country and area must be text (may be empty)`);
  if (!(Math.abs(c.coords?.lat) <= 90 && Math.abs(c.coords?.lng) <= 180)) bad(`${where}: coords are not valid`);
  if (!Array.isArray(c.classes) || c.classes.length === 0) bad(`${where}: "classes" must be a non-empty list`);
  if (!Number.isInteger(c.sitelinks) || c.sitelinks < 1) bad(`${where}: "sitelinks" must be a whole number`);
  if (c.views12m !== null && !(Number.isInteger(c.views12m) && c.views12m >= 0)) bad(`${where}: "views12m" must be a whole number or null`);
  if (!STATUSES.includes(c.status)) bad(`${where}: status "${c.status}" is not one of ${STATUSES.join(', ')}`);
  if (c.status === 'published' && !siteSlugs.includes(c.slug)) bad(`${where}: published but no view "${c.slug}" in src/data/views`);
  if (c.status === 'rejected' && !c.note) bad(`${where}: rejected places need a "note" with the reason`);
  if (c.status !== 'published' && slugs.has(c.slug)) bad(`${where}: slug "${c.slug}" is used twice`);
  slugs.add(c.slug);
  const v = c.views12m ?? -1;
  if (v > lastViews) bad(`${where}: list is not sorted by page views`);
  lastViews = v;
}

if (problems.length) {
  console.error(`check-candidates: ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 30)) console.error(' - ' + p);
  // Also as annotations on the GitHub run page (the run log is not always reachable).
  if (process.env.GITHUB_ACTIONS) for (const p of problems.slice(0, 9)) console.error(`::error::${p}`);
  process.exit(1);
}
const count = (s) => data.candidates.filter((c) => c.status === s).length;
console.log(
  `check-candidates: ${data.candidates.length} candidates OK (new ${count('new')}, drafted ${count('drafted')}, published ${count('published')}, rejected ${count('rejected')})`,
);
