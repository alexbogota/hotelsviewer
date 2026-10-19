#!/usr/bin/env node
// Tools for the view writer (workflow "View writer"). No AI in here: these are the fixed, checkable parts.
// The writer (Claude, started by the workflow with the owner's subscription token, no paid API) only writes the draft files.
// Everything that can be decided by rules is decided here. Settings: data/view-writer.json. Rules for the writer: docs/view-writer.md.
//
//   node scripts/view-tools.mjs gate               is it time for a view, and which place is next? (writes drafts/views-run.json, sets workflow outputs)
//   node scripts/view-tools.mjs prompt             builds drafts/views-prompt.txt for the writer (rules + the place + what is on the site)
//   node scripts/view-tools.mjs check <dir> [--transcript file]
//                                                  checks a draft folder: prints OK or the problems (exit 1). With a transcript it also proves
//                                                  that every quote was found on a page the writer really opened.
//   node scripts/view-tools.mjs result             after the writer: what the run itself reported (turns, errors) with a hint in the Summary
//   node scripts/view-tools.mjs finish             after the writer: full check, photo check, state, text for the run Summary
//   node scripts/view-tools.mjs mark               puts the result (drafted / rejected) into data/view-candidates.json
//   node scripts/view-tools.mjs list               drafts waiting on the "drafts" branch
//   node scripts/view-tools.mjs take <slug> [--from dir]
//                                                  puts a draft into the site folders (src/data/views, docs/research, candidates). Used after the owner's ok.
//
// A draft is the folder drafts/views/<slug>/ with: view.json, evidence.json, notes.md (or only rejected.md: "NO VIEW: reason" when the place cannot have a view, "NOT VERIFIED: reason" when too few hotels could be verified in this run).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, appendFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { checkView, checkEvidence, parseTranscript, parseSearches, hostOf, norm } from './lib/view-check.mjs';
import { licenceOk, looksLikeNight } from './fetch-photos.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CANDIDATES = 'data/view-candidates.json';
const UA = 'HotelsViewerBot/1.0 (https://hotelsviewer.com; contact@hotelsviewer.com)';

export const DEFAULTS = {
  enabled: true,
  maxPending: 2,
  expireDays: 14,
  model: 'sonnet',
  maxTurns: 90,
  branch: 'drafts',
  skipNear: true,
  maxAttempts: 2,
};

export const NOTES_HEADINGS = ['## Что за вид', '## Откуда данные', '## Что проверить владельцу', '## Когда перепроверить'];

// ---------- small helpers ----------

const readJson = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = async (p, data) => {
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 2) + '\n');
};
const output = (k, v) => (process.env.GITHUB_OUTPUT ? appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`) : console.log(`${k}=${v}`));
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  else console.log('\n--- Summary ---\n' + text);
};
export const todayUTC = () => process.env.TODAY || new Date().toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

async function loadSettings() {
  return { ...DEFAULTS, ...(await readJson(join(ROOT, 'data/view-writer.json'), {})) };
}

export function readSiteViews(root = ROOT) {
  const dir = join(root, 'src/data/views');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

function goIds(root = ROOT) {
  try {
    const acc = JSON.parse(readFileSync(join(root, 'data/accounts.json'), 'utf8'));
    return Object.values(acc.accounts ?? {}).map((a) => a.go).filter(Boolean);
  } catch {
    return [];
  }
}

// ---------- which place is next ----------

// candidates: data/view-candidates.json -> candidates. The list is ordered by Wikipedia page views; this orders again to be safe.
export function pickCandidate(candidates, { skipNear = true, attempts = {}, maxAttempts = 2, only = '' } = {}) {
  if (only) {
    const c = candidates.find((x) => x.slug === only);
    return c && ['new', 'drafted'].includes(c.status) ? c : null;
  }
  return (
    [...candidates]
      .filter((c) => c.status === 'new')
      .filter((c) => !(skipNear && Array.isArray(c.near) && c.near.length))
      .filter((c) => (attempts[c.qid] ?? 0) < maxAttempts)
      .sort((a, b) => (b.views12m ?? -1) - (a.views12m ?? -1))[0] ?? null
  );
}

// Drafts that wait for the owner's ok: not on the site, not too old, and the candidate is still "drafted".
export function waitingDrafts(state, candidates, siteSlugs, today, expireDays) {
  const status = new Map(candidates.map((c) => [c.qid, c.status]));
  return (state.drafts ?? []).filter((d) => !siteSlugs.includes(d.slug) && daysBetween(d.date, today) <= expireDays && status.get(d.qid) === 'drafted');
}

export function gateDecision({ settings, state, candidates, siteSlugs, today, only = '' }) {
  if (!settings.enabled) return { run: false, reason: 'The writer is switched off (enabled: false in data/view-writer.json).', candidate: null };
  const waiting = waitingDrafts(state, candidates, siteSlugs, today, settings.expireDays);
  if (!only && waiting.length >= settings.maxPending) {
    return { run: false, reason: `${waiting.length} draft(s) wait for your «ок»: ${waiting.map((d) => d.title || d.slug).join('; ')}. No new draft until one is published (or ${settings.expireDays} days pass).`, candidate: null };
  }
  const candidate = pickCandidate(candidates, { skipNear: settings.skipNear, attempts: state.attempts ?? {}, maxAttempts: settings.maxAttempts, only });
  if (!candidate) {
    return { run: false, reason: only ? `"${only}" is not a place with status new or drafted.` : 'No place with status new is left to try (see data/view-candidates.json).', candidate: null };
  }
  return { run: true, reason: only ? `Started by hand for ${candidate.name}.` : `Next place: ${candidate.name}.`, candidate };
}

// ---------- the instructions for the writer ----------

export function buildPrompt({ rules, today, candidate, views, month }) {
  const maxOrder = Math.max(0, ...views.map((v) => v.order ?? 0));
  const lines = [];
  lines.push('# Run info (made by scripts/view-tools.mjs)');
  lines.push(`- Today: ${longDate(today)} (${today}). The month of the check, for "checked" in view.json: ${month}.`);
  lines.push(`- The place to write: ${candidate.name} (English Wikipedia: ${candidate.enwiki}). Slug: ${candidate.slug}. Wikidata: ${candidate.qid}.`);
  lines.push(`- Wikidata says: country "${candidate.country || 'unknown'}", area "${candidate.area || 'unknown'}", coordinates ${candidate.coords.lat}, ${candidate.coords.lng}. These are hints: the real city, region and country go into view.json as people write them.`);
  lines.push(`- Output folder: drafts/views/${candidate.slug}/ (view.json, evidence.json, notes.md; or only rejected.md). Write nothing outside it.`);
  lines.push(`- Use "order": ${maxOrder + 1} in view.json.`);
  lines.push(`- Check command: node scripts/view-tools.mjs check drafts/views/${candidate.slug}`);
  lines.push('');
  lines.push('## Views already on the site (do not repeat their hotels; countries and cities are spelled the way they are here)');
  for (const v of [...views].sort((a, b) => a.order - b.order)) lines.push(`- ${v.slug}: ${v.landmark}, ${v.city}${v.region ? ', ' + v.region : ''}, ${v.country}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(rules);
  return lines.join('\n');
}

// ---------- checking a draft folder ----------

export function notesProblems(text) {
  const problems = [];
  let at = -1;
  for (const h of NOTES_HEADINGS) {
    const i = text.indexOf(h, at + 1);
    if (i < 0) problems.push(`notes.md: the heading "${h}" is missing or out of order`);
    else at = i;
  }
  const body = NOTES_HEADINGS.reduce((t, h) => t.replaceAll(h, ''), text);
  const cyrillic = (body.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  const latin = (body.match(/[A-Za-z]/g) ?? []).length;
  if (cyrillic < 100 || cyrillic < latin * 0.4) problems.push('notes.md must be written in Russian (names and addresses may stay as they are)');
  if (text.length < 300) problems.push('notes.md is too short to be useful');
  return problems;
}

// dir: drafts/views/<slug>. Returns { problems, outcome, view }. fetches: pages opened in the run, or null to check the shape only.
export async function checkDraft(dir, { fetches = null, root = ROOT, month = todayUTC().slice(0, 7), candidates = null } = {}) {
  const slug = dir.replace(/\/+$/, '').split('/').pop();
  const cands = candidates ?? (await readJson(join(root, CANDIDATES), { candidates: [] })).candidates;
  const candidate = cands.find((c) => c.slug === slug) ?? null;
  if (!candidate) return { problems: [`"${slug}" is not a slug in ${CANDIDATES}`], outcome: 'failed', view: null };

  const rejected = join(dir, 'rejected.md');
  if (existsSync(rejected)) {
    const text = (await readFile(rejected, 'utf8')).trim();
    const m = /^(NO VIEW|NOT VERIFIED):\s*([\s\S]+)$/.exec(text);
    if (!m || m[2].trim().length < 20 || text.length > 600 || /\n\s*\n/.test(text)) {
      return { problems: ['rejected.md must be one short paragraph (20 to 600 characters) that starts with "NO VIEW:" (the place cannot have one) or "NOT VERIFIED:" (too few hotels could be verified in this run), then the reason'], outcome: 'failed', view: null };
    }
    return { problems: [], outcome: m[1] === 'NO VIEW' ? 'rejected' : 'unverified', view: null, reason: m[2].replace(/\s+/g, ' ').trim() };
  }

  const problems = [];
  const view = await readJson(join(dir, 'view.json'), null);
  const evidence = await readJson(join(dir, 'evidence.json'), null);
  if (!view) problems.push('view.json is missing or is not valid JSON');
  if (!evidence) problems.push('evidence.json is missing or is not valid JSON');
  if (view) {
    if (view.slug !== slug) problems.push(`view.json says slug "${view.slug}", the folder is "${slug}"`);
    problems.push(...checkView(view, { others: readSiteViews(root), candidate, month, goIds: goIds(root) }));
  }
  if (view && evidence) problems.push(...checkEvidence(view, evidence, fetches));
  const notesFile = join(dir, 'notes.md');
  if (!existsSync(notesFile)) problems.push('notes.md is missing');
  else problems.push(...notesProblems(await readFile(notesFile, 'utf8')));
  return { problems, outcome: problems.length ? 'failed' : 'drafted', view, evidence, candidate };
}

// ---------- the photo candidates ----------

async function commonsInfo(file) {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    `&prop=imageinfo|categories&cllimit=50&iiprop=url|size|mime|extmetadata&titles=${encodeURIComponent(file)}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons answered ${res.status}`);
  const page = (await res.json())?.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo?.[0]) return null;
  return { info: page.imageinfo[0], categories: (page.categories ?? []).map((c) => c.title) };
}

const stripHtml = (s = '') => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// Does a candidate exist, is its licence allowed, is it a daytime JPEG, and does its name, description or categories mention the landmark?
export async function verifyPhotos(view, fetchInfo = commonsInfo) {
  const words = norm(`${view.landmark} ${view.landmarkInText ?? ''} ${view.slug.replace(/-/g, ' ')}`).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && w !== 'the');
  const good = [];
  const notes = [];
  let unreachable = 0;
  for (const c of view.photo.commons) {
    try {
      const got = await fetchInfo(c.file);
      if (!got) {
        notes.push(`${c.file}: not found on Commons`);
        continue;
      }
      const meta = got.info.extmetadata ?? {};
      const licence = stripHtml(meta.LicenseShortName?.value);
      const text = `${c.file} ${stripHtml(meta.ImageDescription?.value)} ${stripHtml(meta.ObjectName?.value)} ${got.categories.join(' ')}`;
      if (!licenceOk(licence)) notes.push(`${c.file}: licence "${licence}" is not allowed`);
      else if (looksLikeNight(c.file, stripHtml(meta.ImageDescription?.value), stripHtml(meta.ObjectName?.value))) notes.push(`${c.file}: looks like a night photo`);
      else if (got.info.mime !== 'image/jpeg') notes.push(`${c.file}: not a JPEG`);
      else if (!words.some((w) => norm(text).includes(w))) notes.push(`${c.file}: its name, description and categories do not mention ${view.landmark}`);
      else good.push(c.file);
    } catch (e) {
      unreachable++;
      notes.push(`${c.file}: could not be checked (${e.message})`);
    }
  }
  return { good, notes, unreachable };
}

// ---------- candidate list: change one place without touching the rest of the file ----------

// The file has one place per line, exactly as scripts/build-candidates.mjs writes it. Only the line of this place changes.
export function patchCandidateText(text, qid, patch) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.includes(`"qid":${JSON.stringify(qid)}`));
  if (i < 0) throw new Error(`${qid} is not in ${CANDIDATES}`);
  const comma = lines[i].trimEnd().endsWith(',') ? ',' : '';
  const obj = JSON.parse(lines[i].trim().replace(/,$/, ''));
  const next = { ...obj, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  lines[i] = '    ' + JSON.stringify(next) + comma;
  return lines.join('\n');
}

export function patchPublishedViews(text, slugs) {
  return text.replace(/^(\s*"publishedViews": ).*$/m, `$1${JSON.stringify([...slugs].sort())},`);
}

// The last line of `claude -p --output-format stream-json` is a "result" object: how the run ended.
export function lastResult(text) {
  let last = null;
  for (const line of String(text).split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const o = JSON.parse(t);
      if (o?.type === 'result') last = o;
    } catch {}
  }
  return last;
}

// Plain-Russian hint for the owner when the writer itself stopped with an error.
export function resultHint(r) {
  if (!r) return 'Автор не вернул итог запуска: он не стартовал или процесс оборвался. Откройте шаг «Write the draft with Claude» и прочитайте последние строки.';
  const text = `${r.subtype ?? ''} ${typeof r.result === 'string' ? r.result : ''}`;
  if (r.subtype === 'error_max_turns') return 'Автору не хватило шагов (maxTurns в data/view-writer.json). Место остаётся в очереди, запуск можно повторить.';
  if (!r.is_error && r.subtype === 'success') return '';
  if (/authenticat|log ?in|oauth|401|invalid.*token|expired/i.test(text)) return 'Похоже, токен подписки устарел или неверный. Выполните `claude setup-token` на своём компьютере и замените секрет CLAUDE_CODE_OAUTH_TOKEN.';
  if (/limit|usage|quota|429|rate/i.test(text)) return 'Похоже, лимит подписки на сегодня исчерпан. Запуск можно повторить позже.';
  return `Автор закончил с ошибкой (${r.subtype ?? 'неизвестно'}). Подробности в шаге «Write the draft with Claude».`;
}

// ---------- commands ----------

async function cmdGate() {
  const settings = await loadSettings();
  const state = await readJson(join(ROOT, 'drafts/views-state.json'), { drafts: [], attempts: {} });
  const candidates = (await readJson(join(ROOT, CANDIDATES), { candidates: [] })).candidates;
  const today = todayUTC();
  const d = gateDecision({ settings, state, candidates, siteSlugs: readSiteViews().map((v) => v.slug), today, only: (process.env.ONLY_SLUG ?? '').trim() });
  console.log(d.run ? `Write a view: ${d.reason}` : `Skip: ${d.reason}`);
  output('run', d.run);
  output('model', settings.model);
  output('maxTurns', settings.maxTurns);
  output('slug', d.candidate?.slug ?? '');
  await writeJson(join(ROOT, 'drafts/views-run.json'), { date: today, run: d.run, reason: d.reason, slug: d.candidate?.slug ?? '', qid: d.candidate?.qid ?? '', name: d.candidate?.name ?? '' });
  if (!d.run) summary(`## View writer\n\nNo new view today. ${d.reason}`);
}

async function cmdPrompt() {
  const run = await readJson(join(ROOT, 'drafts/views-run.json'), null);
  if (!run?.slug) throw new Error('drafts/views-run.json has no slug: the "gate" step did not run.');
  const candidate = (await readJson(join(ROOT, CANDIDATES), { candidates: [] })).candidates.find((c) => c.slug === run.slug);
  if (!candidate) throw new Error(`${run.slug} is not in ${CANDIDATES}`);
  let rules = await readFile(join(ROOT, 'docs/view-writer.md'), 'utf8');
  if (rules.startsWith('# Правила автора')) rules = rules.replace(/^[\s\S]*?\n---\n/, '').trim(); // the first block is a note for the owner, not for the writer
  const today = todayUTC();
  const text = buildPrompt({ rules, today, candidate, views: readSiteViews(), month: today.slice(0, 7) });
  await mkdir(join(ROOT, 'drafts'), { recursive: true });
  await writeFile(join(ROOT, 'drafts/views-prompt.txt'), text);
  console.log(`Wrote drafts/views-prompt.txt (${text.length} characters).`);
}

function flag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}

async function cmdResult() {
  const tfile = join(ROOT, 'drafts/views-transcript.jsonl');
  const text = existsSync(tfile) ? await readFile(tfile, 'utf8') : '';
  const r = lastResult(text);
  if (r) console.log(`The writer ended with: ${r.subtype}, turns ${r.num_turns ?? '?'}, error ${Boolean(r.is_error)}${typeof r.result === 'string' ? ', last words: ' + r.result.replace(/\s+/g, ' ').slice(0, 300) : ''}`);
  else console.log('The transcript has no result line.');
  const hint = resultHint(r);
  if (hint) summary(`## Автор видов: что сказал сам запуск\n\n${hint}`);
}

async function cmdCheck() {
  const dir = process.argv[3];
  if (!dir || dir.startsWith('--')) throw new Error('Usage: node scripts/view-tools.mjs check <drafts/views/slug> [--transcript file]');
  const tfile = flag('--transcript');
  const fetches = tfile ? parseTranscript(await readFile(tfile, 'utf8')) : null;
  const r = await checkDraft(resolve(ROOT, dir), { fetches });
  if (r.problems.length) {
    console.log(`${r.problems.length} problem(s):`);
    for (const p of r.problems) console.log(' - ' + p);
    process.exit(1);
  }
  console.log(r.outcome === 'rejected' || r.outcome === 'unverified' ? `OK (${r.outcome}: ${r.reason})` : fetches ? `OK (every quote found on a page opened in the run: ${fetches.length} pages read)` : 'OK');
}

// Anything the writer changed outside drafts/ is a mistake or an attack: nothing is saved.
function strayChanges() {
  const out = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter((l) => l.trim() && !/^\?\? drafts\//.test(l));
}

// A short record of what the run opened and searched, kept on the drafts branch (traces/) because the run log of GitHub is not
// reachable from the chat. A page counts as "blocked" when the tool reported an error, came back almost empty, or says so.
export function buildTrace(text) {
  const fetched = parseTranscript(text).slice(0, 80).map((f) => ({
    url: f.url,
    chars: f.text.length,
    blocked: f.error || f.text.trim().length < 150 || /\b(403|forbidden|access denied|captcha|blocked|timed? ?out|unable to fetch|request failed|ECONN\w*)\b/i.test(f.text.slice(0, 400)),
    head: f.text.replace(/\s+/g, ' ').slice(0, 180),
  }));
  const r = lastResult(text);
  return { fetched, searches: parseSearches(text).slice(0, 40), ended: r ? { subtype: r.subtype, turns: r.num_turns, error: Boolean(r.is_error) } : null };
}

// One plain line for the Summary about what the writer could and could not open.
export function traceLine(trace) {
  const ok = trace.fetched.filter((f) => !f.blocked);
  const blocked = [...new Set(trace.fetched.filter((f) => f.blocked).map((f) => hostOf(f.url)))];
  return `Автор открыл страниц: ${trace.fetched.length} (прочитано ${ok.length}, не открылось ${trace.fetched.length - ok.length}), поисков: ${trace.searches.length}${blocked.length ? `. Не открылись сайты: ${blocked.slice(0, 12).join(', ')}` : ''}.`;
}

function summaryFor(view, evidence, photos, slug) {
  const rows = view.hotels.map((h) => `| ${h.name} | ${h.level} | ${h.book.length} |`).join('\n');
  const rooms = view.hotels.reduce((n, h) => n + h.book.length, 0);
  const lines = [
    `## Автор видов: черновик «${view.h1}» готов`,
    '',
    `Место: ${view.landmark}, ${view.city}, ${view.country}. Файл: \`${slug}\`. Отелей: ${view.hotels.length}, категорий номеров «брать»: ${rooms}.`,
    '',
    '| Отель | Уровень | Номеров «брать» |',
    '| --- | --- | --- |',
    rows,
    '',
    `Программа проверила: все поля вида; ${evidence.length} цитат со страниц (каждая найдена на странице, которую автор открыл в этом запуске); название, адрес, звёзды и расстояние каждого отеля и каждое название номера подтверждены цитатой; цены и выдуманные поля не найдены.`,
    photos.good.length ? `Фото: годных кандидатов ${photos.good.length} (свободная лицензия, дневное фото, в описании назван объект).` : 'Фото: не проверялись (Wikimedia не ответила), деплой проверит сам.',
    ...(photos.notes.length ? ['', 'Заметки по фото:', ...photos.notes.map((n) => `- ${n}`)] : []),
    '',
    'Что дальше: прочитайте черновик на ветке `drafts` (папка `views/' + slug + '/`). Если всё устраивает, скажите Claude «ок, вид ' + slug + '», он опубликует. Если нет, скажите, что поправить.',
  ];
  return lines.join('\n');
}

async function cmdFinish() {
  const run = await readJson(join(ROOT, 'drafts/views-run.json'), null);
  if (!run?.slug) throw new Error('drafts/views-run.json has no slug: the "gate" step did not run.');
  const settings = await loadSettings();
  const state = await readJson(join(ROOT, 'drafts/views-state.json'), { drafts: [], attempts: {} });
  state.drafts ??= [];
  state.attempts ??= {};
  const dir = join(ROOT, 'drafts/views', run.slug);
  const tfile = join(ROOT, 'drafts/views-transcript.jsonl');
  const result = { ...run, outcome: 'failed', problems: [] };
  const transcript = existsSync(tfile) ? await readFile(tfile, 'utf8') : null;
  const trace = transcript === null ? null : { date: run.date, slug: run.slug, ...buildTrace(transcript) };

  const stray = strayChanges();
  if (stray.length) {
    result.problems.push(`The writer changed files outside drafts/ (${stray.slice(0, 5).join('; ')}). Nothing is saved.`);
  } else if (!existsSync(dir)) {
    result.problems.push(`The writer did not create drafts/views/${run.slug}/.`);
  } else {
    const fetches = transcript === null ? null : parseTranscript(transcript);
    const r = await checkDraft(dir, { fetches });
    result.problems.push(...r.problems);
    const final = r.outcome === 'rejected' || r.outcome === 'unverified';
    if (!final && !fetches) result.problems.push('drafts/views-transcript.jsonl is missing, so the quotes cannot be proved: nothing is saved.');
    else if (!final && fetches.length === 0) result.problems = [`The transcript holds no pages opened with WebFetch (the writer never opened a page, or the transcript format is not the one parseTranscript expects).`];
    if (!result.problems.length) {
      if (final) {
        result.outcome = r.outcome;
        result.reason = r.reason;
      } else {
        const photos = process.env.SKIP_PHOTO_CHECK ? { good: [], notes: ['photo check skipped'], unreachable: 0 } : await verifyPhotos(r.view);
        if (!photos.good.length && photos.unreachable === 0 && !process.env.SKIP_PHOTO_CHECK) {
          result.problems.push(`None of the photo candidates is usable: ${photos.notes.join('; ')}`);
        } else {
          result.outcome = 'drafted';
          result.title = r.view.h1;
          result.hotels = r.view.hotels.length;
          result.rooms = r.view.hotels.reduce((n, h) => n + h.book.length, 0);
          result.summary = summaryFor(r.view, r.evidence, photos, run.slug);
        }
      }
    }
  }

  const pages = trace ? '\n\n' + traceLine(trace) : '';
  if (result.outcome === 'drafted') {
    state.drafts = [...state.drafts.filter((d) => d.slug !== run.slug), { date: run.date, slug: run.slug, qid: run.qid, title: result.title, hotels: result.hotels, rooms: result.rooms }];
    delete state.attempts[run.qid];
    summary(result.summary + pages);
  } else if (result.outcome === 'rejected') {
    delete state.attempts[run.qid];
    summary(`## Автор видов: «${run.name}» отклонён\n\nВида здесь быть не может: ${result.reason}\n\nМесто помечено rejected в \`data/view-candidates.json\`. Если не согласны, поставьте status new.${pages}`);
  } else if (result.outcome === 'unverified') {
    state.attempts[run.qid] = (state.attempts[run.qid] ?? 0) + 1;
    if (state.attempts[run.qid] >= settings.maxAttempts) {
      result.outcome = 'gave-up';
      result.honest = true; // the writer worked properly, it just found too little: not a red run
      result.reason = `Not verified in ${state.attempts[run.qid]} tries. Last reason: ${result.reason}`.slice(0, 400);
    }
    summary(
      `## Автор видов: «${run.name}» пока не подтвердить\n\nАвтор не нашёл трёх отелей, которые можно подтвердить цитатой со страницы: ${result.reason}\n\n` +
        (result.outcome === 'gave-up' ? `Это ${state.attempts[run.qid]}-я попытка, место помечено rejected, чтобы не тратить лимит подписки. Вернуть: status new в \`data/view-candidates.json\`.` : 'Место остаётся в очереди, следующий запуск попробует его ещё раз.') +
        pages,
    );
  } else {
    state.attempts[run.qid] = (state.attempts[run.qid] ?? 0) + 1;
    if (state.attempts[run.qid] >= settings.maxAttempts) {
      result.outcome = 'gave-up';
      result.reason = `The writer could not produce a draft that passes the checks in ${state.attempts[run.qid]} tries. First problem: ${result.problems[0]}`.slice(0, 400);
    }
    summary(
      [
        `## Автор видов: черновик «${run.name}» не получился`,
        '',
        'Сайт не тронут, ничего не опубликовано. Что не прошло проверку:',
        '',
        ...result.problems.slice(0, 30).map((p) => `- ${p}`),
        '',
        result.outcome === 'gave-up' ? `Это ${state.attempts[run.qid]}-я попытка, место помечено rejected, чтобы не тратить лимит подписки. Можно вернуть status new в \`data/view-candidates.json\`.` : 'Следующий запуск попробует это место ещё раз.',
      ].join('\n') + pages,
    );
    if (process.env.GITHUB_ACTIONS) for (const p of result.problems.slice(0, 9)) console.log(`::error::${p}`);
  }
  if (trace) await writeJson(join(ROOT, 'drafts/views-trace.json'), { ...trace, outcome: result.outcome, reason: result.reason });
  await writeJson(join(ROOT, 'drafts/views-state.json'), state);
  await writeJson(join(ROOT, 'drafts/views-run.json'), result);
  output('outcome', result.outcome);
  console.log(`Outcome: ${result.outcome}`);
  for (const p of result.problems) console.log(' - ' + p);
  if (result.outcome === 'failed' || (result.outcome === 'gave-up' && !result.honest)) process.exit(1);
}

async function cmdMark() {
  const run = await readJson(join(ROOT, 'drafts/views-run.json'), null);
  if (!run?.qid) throw new Error('drafts/views-run.json has no place: nothing to mark.');
  const file = join(ROOT, CANDIDATES);
  const text = await readFile(file, 'utf8');
  let patch = null;
  if (run.outcome === 'drafted') patch = { status: 'drafted' };
  if (run.outcome === 'rejected' || run.outcome === 'gave-up') patch = { status: 'rejected', note: String(run.reason).slice(0, 400) };
  if (!patch) {
    console.log(`Outcome "${run.outcome}": the candidate list stays as it is.`);
    return;
  }
  await writeFile(file, patchCandidateText(text, run.qid, patch));
  console.log(`${run.name} is now ${patch.status} in ${CANDIDATES}.`);
}

const git = (args, opts = {}) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });

async function cmdList() {
  const settings = await loadSettings();
  try {
    git(['fetch', '--quiet', 'origin', settings.branch]);
  } catch {
    console.log(`No branch "${settings.branch}" on GitHub yet: no drafts.`);
    return;
  }
  const show = (p) => git(['show', `FETCH_HEAD:${p}`]).toString();
  let state;
  try {
    state = JSON.parse(show('views-state.json'));
  } catch {
    console.log('The branch has no views-state.json: no drafts yet.');
    return;
  }
  const site = new Set(readSiteViews().map((v) => v.slug));
  for (const d of state.drafts ?? []) console.log(`${d.date}  ${d.slug}  ${d.title}  (${d.hotels} hotels, ${d.rooms} rooms)  ${site.has(d.slug) ? 'published' : 'waiting for ok'}`);
  if (!(state.drafts ?? []).length) console.log('No drafts.');
}

// What the research trail (docs/research-*.md) gets from a published draft: every page every hotel's facts came from.
export function researchSection(view, evidence, month) {
  const lines = [`## ${view.landmark} (${view.city}, ${view.country}), written by the view writer, checked ${month}`, ''];
  for (const h of view.hotels) {
    const mine = evidence.filter((e) => e.hotel === h.id);
    const urls = [...new Set(mine.map((e) => e.url))];
    lines.push(`- ${h.name}, ${h.where} (${h.level}${h.stars ? ', ' + h.stars + ' stars' : ''}). Pages: ${urls.join(' ')}`);
    lines.push(`  Book: ${h.book.map((r) => r.room).join('; ')}.${(h.skip ?? []).length ? ' Skip: ' + h.skip.map((r) => r.room).join('; ') + '.' : ''}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function cmdTake() {
  const slug = process.argv[3];
  if (!slug || slug.startsWith('--')) throw new Error('Usage: node scripts/view-tools.mjs take <slug> [--from dir]');
  const from = flag('--from');
  let readDraft;
  if (from) {
    readDraft = async (name) => readFile(join(resolve(ROOT, from), name), 'utf8');
  } else {
    const settings = await loadSettings();
    git(['fetch', '--quiet', 'origin', settings.branch]);
    readDraft = async (name) => git(['show', `FETCH_HEAD:views/${slug}/${name}`]).toString();
  }
  const view = JSON.parse(await readDraft('view.json'));
  const evidence = JSON.parse(await readDraft('evidence.json'));
  if (view.slug !== slug) throw new Error(`The draft's slug is "${view.slug}", not "${slug}".`);
  const target = join(ROOT, 'src/data/views', `${slug}.json`);
  if (existsSync(target)) throw new Error(`src/data/views/${slug}.json already exists: this view is on the site.`);

  // The same checks again, against the site as it is now (another view may have been published since).
  const others = readSiteViews();
  const cands = (await readJson(join(ROOT, CANDIDATES), { candidates: [] })).candidates;
  const problems = [...checkView(view, { others, candidate: cands.find((c) => c.slug === slug), goIds: goIds() }), ...checkEvidence(view, evidence, null)];
  if (problems.length) throw new Error('The draft no longer passes:\n - ' + problems.join('\n - '));

  view.order = Math.max(0, ...others.map((v) => v.order ?? 0)) + 1;
  await writeFile(target, JSON.stringify(view, null, 2) + '\n');

  const month = view.checked;
  const doc = join(ROOT, `docs/research-${month}-writer.md`);
  const head = existsSync(doc) ? await readFile(doc, 'utf8') : `# Research trail, ${month}, views made by the view writer\n\nEvery hotel fact on these pages came from the pages listed (opened by the writer in the run; the quotes are kept on the branch drafts).\n\n`;
  await writeFile(doc, head.trimEnd() + '\n\n' + researchSection(view, evidence, month));

  let text = await readFile(join(ROOT, CANDIDATES), 'utf8');
  const c = cands.find((x) => x.slug === slug);
  if (c) text = patchCandidateText(text, c.qid, { status: 'published' });
  text = patchPublishedViews(text, [...others.map((v) => v.slug), slug]);
  await writeFile(join(ROOT, CANDIDATES), text);

  console.log(`Published ${slug}: src/data/views/${slug}.json (order ${view.order}), the research trail in docs/research-${month}-writer.md, the candidate list.`);
  console.log('Next: npm run build && npm run check:site && npm run check:candidates, then commit and push to main (the deploy fetches the photo).');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const commands = { gate: cmdGate, prompt: cmdPrompt, check: cmdCheck, result: cmdResult, finish: cmdFinish, mark: cmdMark, list: cmdList, take: cmdTake };
  const cmd = commands[process.argv[2]];
  if (!cmd) {
    console.error('Usage: node scripts/view-tools.mjs gate|prompt|check|result|finish|mark|list|take');
    process.exit(2);
  }
  cmd().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

