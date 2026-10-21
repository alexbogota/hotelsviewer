// The post writer's tools (no AI in here), used by .github/workflows/post-writer.yml.
//   node scripts/post-tools.mjs sources              read the feeds, keep fresh unused items -> drafts/posts-sources.json, step outputs
//   node scripts/post-tools.mjs prompt               build drafts/posts-prompt.txt for the writer
//   node scripts/post-tools.mjs check <file> [--transcript file]   strict check of drafts/posts/posts.json
//   node scripts/post-tools.mjs finish               check, add the links with our mark, write drafts/posts/<date>.md and the Summary
//   node scripts/post-tools.mjs save                 put the day's threads and the list of used items on the drafts branch
// Rules for the writer: docs/post-writer.md. Settings: data/post-writer.json. Links: scripts/lib/accounts.mjs (never by hand).
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRss } from './lib/rss.mjs';
import { checkThreads } from './lib/post-check.mjs';
import { parseTranscript, urlKey } from './lib/view-check.mjs';
import { loadAccounts, postLink, searchLink } from './lib/accounts.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DRAFTS = join(ROOT, 'drafts');
const today = () => new Date().toISOString().slice(0, 10);
const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
};
const settings = async () => ({ enabled: true, model: 'sonnet', maxTurns: 40, freshDays: 3, account: 'bluesky', formats: ['question', 'gem', 'news'], maxTags: 3, branch: 'drafts', feeds: [], ...(await readJson(join(ROOT, 'data/post-writer.json'), {})) });
const loadDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : []);
const siteViews = () => loadDir(join(ROOT, 'src/data/views'));
const siteGuides = () => loadDir(join(ROOT, 'src/data/guides'));
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const out = (k, v) => {
  console.log(`${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
};
const summary = (md) => {
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n\n');
};
const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};

function usedOnBranch(branch) {
  try {
    git(['fetch', '--quiet', 'origin', branch]);
    return JSON.parse(git(['show', 'FETCH_HEAD:posts/used.json']));
  } catch {
    return { items: [] };
  }
}

export function makeLinkBuilder(date) {
  const { links, list } = loadAccounts();
  return (accountKey) => {
    const a = list.find((x) => x.key === accountKey);
    if (!a) throw new Error(`account "${accountKey}" is not in data/accounts.json`);
    return (t, item) => {
      const campaign = `${date}-${t.format}`;
      const l = t.link ?? {};
      if (l.type === 'view') return postLink(links, a, `/views/${l.slug}/`, campaign);
      if (l.type === 'guide') return postLink(links, a, `/guides/${l.slug}/`, campaign);
      if (l.type === 'search') return searchLink(links, a, l.place, campaign);
      if (l.type === 'source') return item.link;
      throw new Error(`unknown link type ${l.type}`);
    };
  };
}

async function cmdSources() {
  const s = await settings();
  await mkdir(DRAFTS, { recursive: true });
  if (!s.enabled) {
    summary('## Автор постов выключен (enabled: false в data/post-writer.json)');
    return out('run', 'false');
  }
  const used = new Set((usedOnBranch(s.branch).items ?? []).map((u) => urlKey(u.link)));
  const since = Date.now() - s.freshDays * 86400000;
  const items = [];
  const notes = [];
  for (const f of s.feeds) {
    try {
      const r = await fetch(f.url, { headers: { 'user-agent': 'hotelsviewer-post-writer/1.0 (+https://hotelsviewer.com)' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const got = parseRss(await r.text()).filter((i) => i.date && Date.parse(i.date) >= since && !used.has(urlKey(i.link))).slice(0, 15);
      items.push(...got.map((i) => ({ feed: f.name, feedId: f.id, ...i })));
      notes.push(`${f.name}: ${got.length}`);
    } catch (e) {
      notes.push(`${f.name}: not read (${e.message})`);
    }
  }
  await writeFile(join(DRAFTS, 'posts-sources.json'), JSON.stringify({ date: today(), items }, null, 2));
  console.log(`Fresh unused items: ${notes.join('; ')}`);
  const run = items.length >= s.formats.length;
  if (!run) summary(`## Автор постов: сегодня мало свежих пунктов\n\n${notes.join('; ')}`);
  out('run', String(run));
  out('model', s.model);
  out('maxTurns', String(s.maxTurns));
}

async function cmdPrompt() {
  const s = await settings();
  const rules = await readFile(join(ROOT, 'docs/post-writer.md'), 'utf8');
  const src = await readJson(join(DRAFTS, 'posts-sources.json'), { items: [] });
  const views = siteViews()
    .map((v) => `- ${v.slug}: ${v.landmark}, ${v.city}, ${v.country}\n${v.hotels.map((h) => `    - ${h.name}. BOOK: ${h.book.map((r) => r.room).join(' | ')}${h.skip?.length ? ` . SKIP: ${h.skip.map((r) => r.room).join(' | ')}` : ''}`).join('\n')}`)
    .join('\n');
  const guides = siteGuides().map((g) => `- ${g.slug}: ${g.title} (view: ${g.view})`).join('\n') || '(none)';
  const items = src.items.map((i, n) => `${n + 1}. [${i.feed}] ${i.title} (${i.date?.slice(0, 10)})\n   ${i.link}\n   ${i.description}`).join('\n');
  const prompt = [
    `Today is ${today()}. Write today's ${s.formats.length} Bluesky threads (${s.formats.join(', ')}) following the rules below. At most ${s.maxTags} hashtags per thread.`,
    '',
    "TODAY'S FEED ITEMS (the only allowed sources):",
    items,
    '',
    'OUR VIEWS (the only source for hotel and room names):',
    views,
    '',
    'OUR GUIDES:',
    guides,
    '',
    'RULES:',
    rules,
  ].join('\n');
  await writeFile(join(DRAFTS, 'posts-prompt.txt'), prompt);
  console.log(`Prompt written: ${prompt.length} characters, ${src.items.length} items.`);
}

async function runCheck(file, transcript) {
  const s = await settings();
  const data = await readJson(file, null);
  if (!data) return { problems: [`${file} is missing or not valid JSON.`] };
  const src = await readJson(join(DRAFTS, 'posts-sources.json'), { items: [] });
  const date = src.date ?? today();
  const build = makeLinkBuilder(date)(s.account);
  const fetches = transcript && existsSync(transcript) ? parseTranscript(readFileSync(transcript, 'utf8')) : null;
  const r = checkThreads(data, { formats: s.formats, items: src.items, views: siteViews(), guides: siteGuides(), maxTags: s.maxTags, fetches, buildLink: build });
  return { ...r, data, src, date, build };
}

async function cmdCheck() {
  const file = process.argv[3];
  if (!file || file.startsWith('--')) throw new Error('Usage: node scripts/post-tools.mjs check <drafts/posts/posts.json> [--transcript file]');
  const r = await runCheck(resolve(ROOT, file), flag('--transcript'));
  if (r.problems.length) {
    console.log(`${r.problems.length} problem(s):`);
    for (const p of r.problems) console.log(' - ' + p);
    process.exit(1);
  }
  console.log('OK');
}

const FORMAT_RU = { question: 'вопрос', gem: 'необычное место', news: 'новость с выводом' };

async function cmdFinish() {
  const file = join(DRAFTS, 'posts/posts.json');
  const r = await runCheck(file, join(DRAFTS, 'posts-transcript.jsonl'));
  if (r.problems.length) {
    await writeFile(join(DRAFTS, 'posts-run.json'), JSON.stringify({ outcome: 'failed', problems: r.problems }, null, 2));
    summary(`## Автор постов: треды не прошли проверку\n\n${r.problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  const blocks = [`# Bluesky threads for ${r.date}`, '', 'Post 1, then post 2 as a reply to post 1, then the next as a reply to it. The link is always the last post.', ''];
  const ru = [`## Посты на ${r.date}: ${r.data.threads.length} треда для Bluesky`, 'Публиковать так: первый пост, второй ответом на первый, и так далее. Ссылка всегда в последнем посте. Каждый факт сверен с открытой страницей источника.', ''];
  for (const [i, t] of r.data.threads.entries()) {
    const item = r.src.items.find((x) => urlKey(x.link) === urlKey(t.source));
    const posts = [...t.posts.map((p) => p.trim()), `${t.linkText.trim()} ${r.build(t, item)}`];
    const head = `### Тред ${i + 1}: ${FORMAT_RU[t.format] ?? t.format} (источник: ${item.feed}, «${item.title}»)`;
    blocks.push(`## Thread ${i + 1}: ${t.format}`, `Source: ${item.link}`, '', ...posts.flatMap((p) => ['```', p, '```']), '');
    ru.push(head, ...posts.flatMap((p) => ['```', p, '```']), '');
  }
  await writeFile(join(DRAFTS, `posts/${r.date}.md`), blocks.join('\n'));
  await writeFile(join(DRAFTS, 'posts-run.json'), JSON.stringify({ outcome: 'drafted', date: r.date, used: r.data.threads.map((t) => t.source) }, null, 2));
  summary(ru.join('\n'));
}

async function cmdSave() {
  const s = await settings();
  const run = await readJson(join(DRAFTS, 'posts-run.json'), null);
  if (run?.outcome !== 'drafted') return console.log('No threads to save.');
  const wt = await mkdtemp(join(tmpdir(), 'posts-'));
  try {
    git(['fetch', '--quiet', 'origin', s.branch]);
    try {
      git(['branch', '-D', s.branch]);
    } catch {}
    git(['worktree', 'add', '--quiet', '-B', s.branch, wt, 'FETCH_HEAD']);
    await mkdir(join(wt, 'posts'), { recursive: true });
    const usedFile = join(wt, 'posts/used.json');
    const used = existsSync(usedFile) ? JSON.parse(readFileSync(usedFile, 'utf8')) : { items: [] };
    used.items = [...run.used.map((link) => ({ date: run.date, link })), ...(used.items ?? [])].slice(0, 500);
    await writeFile(usedFile, JSON.stringify(used, null, 2) + '\n');
    await writeFile(join(wt, `posts/${run.date}.md`), await readFile(join(DRAFTS, `posts/${run.date}.md`), 'utf8'));
    git(['add', '-A'], wt);
    git(['-c', 'user.name=hotelsviewer-bot', '-c', 'user.email=bot@hotelsviewer.com', 'commit', '--quiet', '-m', `Post writer: threads for ${run.date}`], wt);
    git(['push', '--quiet', 'origin', s.branch], wt);
    console.log(`Saved to the ${s.branch} branch: posts/${run.date}.md`);
  } finally {
    try {
      git(['worktree', 'remove', '--force', wt]);
    } catch {}
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commands = { sources: cmdSources, prompt: cmdPrompt, check: cmdCheck, finish: cmdFinish, save: cmdSave };
  const cmd = commands[process.argv[2]];
  if (!cmd) {
    console.error('Usage: node scripts/post-tools.mjs sources|prompt|check|finish|save');
    process.exit(2);
  }
  cmd().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
