// A very small RSS 2.0 reader: enough for <item> with title, link, pubDate, description. No packages.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s) {
  return String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};
export function parseRss(xml) {
  const items = [];
  for (const m of String(xml).matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const x = m[1];
    const link = tag(x, 'link') || (x.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i)?.[1] ?? '');
    const date = new Date(tag(x, 'pubDate') || tag(x, 'dc:date'));
    items.push({ title: tag(x, 'title'), link: link.trim(), date: isNaN(date) ? null : date.toISOString(), description: tag(x, 'description').slice(0, 600) });
  }
  return items.filter((i) => i.title && /^https?:\/\//.test(i.link));
}
