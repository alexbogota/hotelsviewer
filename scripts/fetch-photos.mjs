// Downloads one licensed photo per view from Wikimedia Commons, together with its credit.
// Runs on GitHub (step in .github/workflows/deploy.yml), because the chat workspace can't reach Wikimedia.
//
// Rules (CLAUDE.md, "Photos"):
// - only licences that allow commercial use: CC0, public domain, CC BY, CC BY-SA. NC and ND are refused;
// - night shots are skipped: the Eiffel Tower's lights are copyrighted, and we keep one rule for every view;
// - a photo already in public/photos/ with an entry in src/data/photo-credits.json is never downloaded again.
// The candidates for each view are in src/data/views/<slug>.json -> photo.commons (first that passes wins).
// Never fails the deploy: problems are printed, and the page simply keeps its plain sky picture.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewsDir = join(root, 'src/data/views');
const creditsPath = join(root, 'src/data/photo-credits.json');
const photosDir = join(root, 'public/photos');
const WIDTH = 1600;
const UA = 'HotelsViewerBot/1.0 (https://hotelsviewer.com; contact@hotelsviewer.com)';

const ALLOWED = [/^cc0\b/i, /^public domain\b/i, /^pd\b/i, /^cc by(-sa)? \d(\.\d)?\b/i];
const NIGHT = /\b(night|nighttime|nuit|nacht|noche|illuminated|illumination|at dusk)\b/i;

function stripHtml(s = '') {
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function licenceOk(name) {
  if (!name) return false;
  if (/\b(nc|nd)\b/i.test(name.replace(/-/g, ' '))) return false;
  return ALLOWED.some((re) => re.test(name.trim()));
}

export function looksLikeNight(...texts) {
  return NIGHT.test(texts.join(' '));
}

async function commonsInfo(file) {
  const api =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=${WIDTH}&titles=${encodeURIComponent(file)}`;
  const res = await fetch(api, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Commons API answered ${res.status}`);
  const json = await res.json();
  const page = json?.query?.pages?.[0];
  if (!page || page.missing || !page.imageinfo?.[0]) return null;
  return page.imageinfo[0];
}

async function main() {
  const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, 'utf8')) : {};
  const before = JSON.stringify(credits);
  mkdirSync(photosDir, { recursive: true });

  for (const fileName of readdirSync(viewsDir).filter((f) => f.endsWith('.json')).sort()) {
    const view = JSON.parse(readFileSync(join(viewsDir, fileName), 'utf8'));
    const slug = view.slug;
    const target = join(photosDir, `${slug}.jpg`);
    if (credits[slug] && existsSync(target)) {
      console.log(`${slug}: already have ${credits[slug].file}`);
      continue;
    }
    let done = false;
    for (const candidate of view.photo?.commons ?? []) {
      try {
        const info = await commonsInfo(candidate.file);
        if (!info) {
          console.log(`${slug}: ${candidate.file} not found on Commons`);
          continue;
        }
        const meta = info.extmetadata ?? {};
        const licence = stripHtml(meta.LicenseShortName?.value);
        if (!licenceOk(licence)) {
          console.log(`${slug}: ${candidate.file} skipped, licence "${licence}" is not allowed`);
          continue;
        }
        if (looksLikeNight(candidate.file, stripHtml(meta.ImageDescription?.value), stripHtml(meta.ObjectName?.value))) {
          console.log(`${slug}: ${candidate.file} skipped, looks like a night photo`);
          continue;
        }
        if (info.mime !== 'image/jpeg') {
          console.log(`${slug}: ${candidate.file} skipped, not a JPEG (${info.mime})`);
          continue;
        }
        const url = info.thumburl || info.url;
        const img = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!img.ok) throw new Error(`download answered ${img.status}`);
        const buf = Buffer.from(await img.arrayBuffer());
        if (buf.length < 20_000) throw new Error(`download is suspiciously small (${buf.length} bytes)`);
        writeFileSync(target, buf);
        const author = (stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || 'Unknown author').slice(0, 90);
        credits[slug] = {
          file: candidate.file,
          src: `/photos/${slug}.jpg`,
          width: info.thumbwidth || info.width,
          height: info.thumbheight || info.height,
          alt: candidate.alt,
          author,
          license: licence,
          licenseUrl: stripHtml(meta.LicenseUrl?.value) || undefined,
          source: info.descriptionurl,
        };
        console.log(`${slug}: saved ${candidate.file} (${licence}, ${author})`);
        done = true;
        break;
      } catch (e) {
        console.log(`${slug}: ${candidate.file} failed: ${e.message}`);
      }
    }
    if (!done) console.log(`${slug}: no photo this time, the page keeps its plain sky picture`);
  }

  if (JSON.stringify(credits) !== before) {
    writeFileSync(creditsPath, JSON.stringify(credits, null, 2) + '\n');
    console.log('photo-credits.json updated');
  } else {
    console.log('No new photos.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`fetch-photos: ${e.message}`);
  });
}
