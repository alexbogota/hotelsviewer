// The guide writer's tools (no AI in here), used by .github/workflows/guide-writer.yml and by Claude in the chat.
//   node scripts/guide-tools.mjs gate                 is there room for a new draft? writes the step outputs
//   node scripts/guide-tools.mjs prompt               builds drafts/guides-prompt.txt for the writer
//   node scripts/guide-tools.mjs check <dir> [--transcript file]   strict check of one draft
//   node scripts/guide-tools.mjs finish               check the draft of this run, write drafts/guides-run.json and the Summary
//   node scripts/guide-tools.mjs list                 drafts on the branch that wait for the owner's ok
//   node scripts/guide-tools.mjs take <slug>          put a draft into src/data/guides/ (only after the owner's ok)
// Rules for the writer: docs/guide-writer.md. Settings: data/guide-writer.json.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { checkGuide } from './lib/guide-check.mjs';
import { parseTranscript } from './lib/view-check.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULTS = { enabled: true, model: 'haiku', maxTurns: 60, maxPending: 3, newsDays: 90, branch: 'drafts' };
const today = () => new Date().toISOString().slice(0, 10);

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
};
const settings = async () => ({ ...DEFAULTS, ...(await readJson(join(ROOT, 'data/guide-writer.json'), {})) });
const loadDir = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))) : []);
const siteViews = () => loadDir(join(ROOT, 'src/data/views'));
const siteGuides = () => loadDir(join(ROOT, 'src/data/guides'));
const git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
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

function waiting(branch) {
  try {
    git(['fetch', '--quiet', 'origin', branch]);
    const names = git(['ls-tree', '--name-only', 'FETCH_HEAD', 'guides/']).split('\n').filter(Boolean).map((n) => n.replace(/^guides\//, ''));
    const onSite = new Set(siteGuides().map((g) => g.slug));
    return names.filter((n) => !onSite.has(n));
  } catch {
    return [];
  }
}

async function cmdGate() {
  const s = await settings();
  await mkdir(join(ROOT, 'drafts'), { recursive: true });
  const only = process.env.ONLY_SLUG ?? '';
  let run = s.enabled;
  let reason = s.enabled ? 'ok' : 'The guide writer is switched off (enabled: false in data/guide-writer.json).';
  if (run && !only) {
    const w = waiting(s.branch);
    if (w.length >= s.maxPending) {
      run = false;
      reason = `${w.length} draft(s) wait for the owner's ok: ${w.join(', ')}. No new draft until one is published.`;
    }
  }
  console.log(reason);
  if (!run) summary(`## Автор статей: сегодня не пишет\n\n${reason}`);
  out('run', String(run));
  out('model', s.model);
  out('maxTurns', String(s.maxTurns));
}

async function cmdPrompt() {
  const s = await settings();
  const rules = await readFile(join(ROOT, 'docs/guide-writer.md'), 'utf8');
  const views = siteViews();
  const guides = siteGuides();
  const list = views
    .map((v) => {
      const hotels = v.hotels.map((h) => `    - ${h.id}: ${h.name} (${h.level}). BOOK: ${h.book.map((r) => r.room).join(' | ')}${h.skip?.length ? ` . SKIP: ${h.skip.map((r) => r.room).join(' | ')}` : ''}`).join('\n');
      return `- ${v.slug}: ${v.landmark}, ${v.city}, ${v.country}\n${hotels}`;
    })
    .join('\n');
  const only = process.env.ONLY_SLUG ? `\nThe owner asked for the view "${process.env.ONLY_SLUG}": write about that place.\n` : '';
  const prompt = [
    `Today is ${today()}. Write one guide following the rules below. Freshness limit for news pages: ${s.newsDays} days.${only}`,
    '',
    'EXISTING GUIDES (do not repeat their topic):',
    guides.length ? guides.map((g) => `- ${g.slug}: ${g.title}`).join('\n') : '(none)',
    '',
    'OUR VIEWS (the only source for hotel and room names):',
    list,
    '',
    'RULES:',
    rules,
  ].join('\n');
  await mkdir(join(ROOT, 'drafts'), { recursive: true });
  await writeFile(join(ROOT, 'drafts/guides-prompt.txt'), prompt);
  console.log(`Prompt written: ${prompt.length} characters, ${views.length} views, ${guides.length} existing guides.`);
}

async function checkDir(dir, transcriptFile) {
  const s = await settings();
  const guide = await readJson(join(dir, 'guide.json'), null);
  const evidence = await readJson(join(dir, 'evidence.json'), null);
  if (!guide) return { problems: [`${dir}/guide.json is missing or not valid JSON.`] };
  if (!evidence) return { problems: [`${dir}/evidence.json is missing or not valid JSON.`] };
  const fetches = transcriptFile && existsSync(transcriptFile) ? parseTranscript(readFileSync(transcriptFile, 'utf8')) : null;
  const r = checkGuide(guide, evidence, { views: siteViews(), existing: siteGuides(), fetches, today: today(), newsDays: s.newsDays });
  return { ...r, guide, evidence };
}

async function cmdCheck() {
  const dir = process.argv[3];
  if (!dir || dir.startsWith('--')) throw new Error('Usage: node scripts/guide-tools.mjs check <drafts/guides/slug> [--transcript file]');
  const r = await checkDir(resolve(ROOT, dir), flag('--transcript'));
  if (r.problems.length) {
    console.log(`${r.problems.length} problem(s):`);
    for (const p of r.problems) console.log(' - ' + p);
    process.exit(1);
  }
  console.log(`OK (${r.words} words${flag('--transcript') ? ', every quote found on a page opened in the run' : ''})`);
}

async function cmdFinish() {
  const base = join(ROOT, 'drafts/guides');
  const dirs = existsSync(base) ? readdirSync(base) : [];
  if (dirs.length !== 1) {
    const msg = dirs.length ? `The writer made ${dirs.length} folders in drafts/guides/ (one is needed).` : 'The writer did not create a guide in drafts/guides/.';
    await writeFile(join(ROOT, 'drafts/guides-run.json'), JSON.stringify({ outcome: 'failed', problems: [msg] }, null, 2));
    summary(`## Автор статей: черновика нет\n\n${msg}`);
    process.exit(1);
  }
  const slug = dirs[0];
  const r = await checkDir(join(base, slug), join(ROOT, 'drafts/guides-transcript.jsonl'));
  if (r.problems.length) {
    await writeFile(join(ROOT, 'drafts/guides-run.json'), JSON.stringify({ outcome: 'failed', slug, problems: r.problems }, null, 2));
    summary(`## Автор статей: черновик не прошёл проверку (${slug})\n\n${r.problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  const g = r.guide;
  await writeFile(join(ROOT, 'drafts/guides-run.json'), JSON.stringify({ outcome: 'drafted', slug, title: g.title, view: g.view, words: r.words }, null, 2));
  summary(
    [
      `## Статья готова: ${g.title}`,
      `Страница вида: ${g.view}. Слов: ${r.words}. Каждая цитата найдена на странице, которую автор открыл в этом запуске.`,
      `Чтобы выложить, скажите в чате «ок, статья ${slug}».`,
      '',
      '### Факты и откуда они',
      ...r.evidence.items.map((it) => `- ${it.claim} (${it.url}, ${it.published})`),
      '',
      '### Текст',
      ...g.sections.flatMap((s) => [`**${s.h}**`, ...s.p]),
    ].join('\n'),
  );
}

async function cmdList() {
  const s = await settings();
  const w = waiting(s.branch);
  console.log(w.length ? `Waiting for the owner's ok: ${w.join(', ')}` : 'No guide drafts are waiting.');
}

async function cmdTake() {
  const slug = process.argv[3];
  if (!slug || slug.startsWith('--')) throw new Error('Usage: node scripts/guide-tools.mjs take <slug> [--from dir]');
  const s = await settings();
  const from = flag('--from');
  let read;
  if (from) read = async (n) => readFile(join(resolve(ROOT, from), n), 'utf8');
  else {
    git(['fetch', '--quiet', 'origin', s.branch]);
    read = async (n) => git(['show', `FETCH_HEAD:guides/${slug}/${n}`]);
  }
  const guide = JSON.parse(await read('guide.json'));
  const evidence = JSON.parse(await read('evidence.json'));
  if (guide.slug !== slug) throw new Error(`The draft's slug is "${guide.slug}", not "${slug}".`);
  const target = join(ROOT, 'src/data/guides', `${slug}.json`);
  if (existsSync(target)) throw new Error(`src/data/guides/${slug}.json already exists.`);
  const r = checkGuide(guide, evidence, { views: siteViews(), existing: siteGuides(), fetches: null, today: today(), newsDays: 3650 });
  if (r.problems.length) throw new Error('The draft no longer passes:\n - ' + r.problems.join('\n - '));
  await mkdir(join(ROOT, 'src/data/guides'), { recursive: true });
  await writeFile(target, JSON.stringify(guide, null, 2) + '\n');
  console.log(`Published ${slug}: src/data/guides/${slug}.json`);
  console.log('Next: npm run build && npm run check:site, then commit and push to main.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commands = { gate: cmdGate, prompt: cmdPrompt, check: cmdCheck, finish: cmdFinish, list: cmdList, take: cmdTake };
  const cmd = commands[process.argv[2]];
  if (!cmd) {
    console.error('Usage: node scripts/guide-tools.mjs gate|prompt|check|finish|list|take');
    process.exit(2);
  }
  cmd().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
