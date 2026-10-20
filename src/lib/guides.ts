// Guides: short articles built on our checked views and on a news hook. One JSON file per guide in src/data/guides/.
export interface Guide {
  slug: string;
  view: string; // slug of the view page the guide leads to
  date: string; // YYYY-MM-DD
  title: string;
  description: string;
  dek: string;
  sections: { h: string; p: string[] }[];
  hotels?: string[]; // ids of hotels in the guide's view: shown with their "Check prices" buttons
  cta: { label: string; href: string };
  sources: { label: string; url?: string }[];
  checked: string; // YYYY-MM
}

const files = import.meta.glob('../data/guides/*.json', { eager: true }) as Record<string, { default: Guide }>;

export const guides: Guide[] = Object.values(files)
  .map((m) => m.default)
  .sort((a, b) => b.date.localeCompare(a.date));

export const getGuide = (slug: string) => guides.find((g) => g.slug === slug);

export function dateLabel(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
