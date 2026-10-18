// sitemap.xml for search engines. New views appear here by themselves.
import type { APIRoute } from 'astro';
import { views } from '../lib/views';

export const GET: APIRoute = ({ site }) => {
  const base = site ?? new URL('https://hotelsviewer.com');
  const pages: { path: string; lastmod?: string }[] = [
    { path: '/' },
    { path: '/views/' },
    ...views.map((v) => ({ path: `/views/${v.slug}/`, lastmod: `${v.checked}-01` })),
    { path: '/about/' },
    { path: '/contact/' },
    { path: '/disclosure/' },
    { path: '/privacy/' },
    { path: '/terms/' },
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages
      .map(
        (p) =>
          `  <url><loc>${new URL(p.path, base).href}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
