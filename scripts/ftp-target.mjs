// Safety check before every upload: finds the folder of hotelsviewer.com on the hosting
// and makes sure we never upload into another site's folder (for example saveandplay.com,
// which uses the same FTP login).
//
// A folder is accepted when it already holds our marker file (hotelsviewer-site.txt, part of every
// build) or when it is empty apart from the hosting's own files (cgi-bin, .well-known, ...).
// Folders tried, in order: FTP_SERVER_DIR (GitHub variable), then hotelsviewer.com/, then
// public_html/hotelsviewer.com/. The first accepted folder is written to the step output "dir".
// If none is accepted, the upload stops and the log lists what the FTP login can see.
//
// Run on GitHub only (needs FTP_SERVER, FTP_USERNAME, FTP_PASSWORD; FTP_SERVER_DIR is optional).
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MARKER = 'hotelsviewer-site.txt';

// Files a fresh hosting folder may already have. Anything else means the folder belongs to a site.
const HOSTING_FILES = new Set([
  '.', '..', 'cgi-bin', '.well-known', '.htaccess', '.ftpquota', 'error_log', '.ftp-deploy-sync-state.json',
]);

// "ours": our site is already there. "empty": safe for a first upload. "foreign": another site's folder.
export function verdict(names) {
  if (names.includes(MARKER)) return 'ours';
  const others = names.filter((n) => !HOSTING_FILES.has(n));
  return others.length === 0 ? 'empty' : 'foreign';
}

// "./", "", "/" all mean the folder the FTP login opens in. Everything else ends with one "/".
export function normalize(dir) {
  const d = String(dir ?? '').trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  return d === '' || d === '.' ? './' : `${d}/`;
}

export function candidates(wanted) {
  const list = [];
  if (wanted && wanted.trim()) list.push(normalize(wanted));
  for (const d of ['hotelsviewer.com/', 'public_html/hotelsviewer.com/']) {
    if (!list.includes(d)) list.push(d);
  }
  return list;
}

async function main() {
  const { Client } = await import('basic-ftp');
  const { FTP_SERVER, FTP_USERNAME, FTP_PASSWORD, FTP_SERVER_DIR, GITHUB_OUTPUT } = process.env;
  if (!FTP_SERVER || !FTP_USERNAME || !FTP_PASSWORD) {
    console.log('FTP secrets are missing (FTP_SERVER, FTP_USERNAME, FTP_PASSWORD). Nothing will be uploaded.');
    process.exit(1);
  }

  const client = new Client(30_000);
  // Same TLS settings as the upload step (FTP-Deploy-Action, protocol ftps, security "loose").
  await client.access({
    host: FTP_SERVER,
    user: FTP_USERNAME,
    password: FTP_PASSWORD,
    port: 21,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  });

  const seen = [];
  try {
    for (const dir of candidates(FTP_SERVER_DIR)) {
      let names;
      try {
        names = (await client.list(dir === './' ? '' : dir)).map((f) => f.name);
      } catch (e) {
        seen.push(`${dir}: can't open (${e.message.split('\n')[0]})`);
        continue;
      }
      const v = verdict(names);
      seen.push(`${dir}: ${v} (${names.length} items${names.length ? ': ' + names.slice(0, 12).join(', ') : ''})`);
      if (v === 'ours' || v === 'empty') {
        console.log(`Upload folder: ${dir} (${v === 'ours' ? 'HotelsViewer is already there' : 'empty, first upload'})`);
        if (FTP_SERVER_DIR && normalize(FTP_SERVER_DIR) !== dir) {
          console.log(`Note: the GitHub variable FTP_SERVER_DIR is "${FTP_SERVER_DIR}", but that folder is not ours. Set it to "${dir}".`);
        }
        if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `dir=${dir}\n`);
        return;
      }
    }

    console.log('STOP: no safe folder for hotelsviewer.com was found, nothing was uploaded.');
    console.log('Folders checked:');
    for (const s of seen) console.log(`  - ${s}`);
    try {
      const root = await client.list('');
      console.log('What the FTP login sees at its top level:');
      for (const f of root) console.log(`  ${f.isDirectory ? '[dir] ' : '      '}${f.name}`);
    } catch {}
    console.log('Fix: in cPanel -> Domains, find the Document Root of hotelsviewer.com and put that folder (relative to the FTP login, ending with /) into the GitHub variable FTP_SERVER_DIR. If the FTP login can\'t reach it, create an FTP account for that folder and use it in the three secrets.');
    process.exit(1);
  } finally {
    client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.log(`ftp-target: ${e.message}`);
    process.exit(1);
  });
}
