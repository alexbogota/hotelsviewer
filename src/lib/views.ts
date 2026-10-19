// Everything the pages need about the views: types, loading the data files, small helpers.
import links from '../data/links.json';
import credits from '../data/photo-credits.json';
import partnerLinks from '../data/partner-links.json';

export type Level = 'pictured' | 'listed' | 'reported';

export interface Room {
  room: string;
  note?: string;
}

export interface Source {
  label: string;
  url?: string; // only official sources get a link; booking sites are named, not linked
}

export interface Hotel {
  id: string;
  name: string;
  where: string;
  distance?: string;
  stars?: number;
  level: Level;
  book: Room[];
  skip?: Room[];
  notes?: string[];
  sources: Source[];
  query: string; // what the "Check prices" link searches for
}

// A ticket or transport link near a view ("After the window"). Only real products we checked on the seller's page.
export interface Extra {
  id: string; // becomes /go/<id>/ and the sub ID in the Travelpayouts statistics
  kind: string; // "Tickets", "Getting there", "See it from above"
  title: string; // the product name as the seller names it
  partner: string; // the seller, e.g. "Tiqets"
  url: string; // the seller's own page; scripts/make-partner-links.mjs turns it into a partner link
  note?: string; // only what the seller's page says
  checked: string; // YYYY-MM
}

export interface View {
  slug: string;
  order: number;
  landmark: string;
  landmarkInText?: string; // the landmark inside a sentence, e.g. "the Eiffel Tower" (default: landmark)
  city: string; // city or town name only, e.g. "Niagara Falls"
  region?: string; // state, province or region, e.g. "Ontario"
  country: string;
  coords: { lat: number; lng: number }; // the landmark itself; centres the hotel map on the city page
  checked: string; // YYYY-MM
  title: string;
  metaDescription: string;
  h1: string;
  dek: string;
  teaser: string;
  // position = which part of a wide photo stays visible in the tall window (CSS object-position), e.g. "35% 50%".
  photo: { commons: { file: string; alt: string; position?: string }[] };
  shortAnswer: { label: string; hotel: string; room: string }[];
  decoder: { left: string; right: string; text: string }[];
  hotels: Hotel[];
  extras?: Extra[];
  alternatives?: { title: string; text: string }[];
  askAtDesk?: { title: string; items: { name: string; text: string }[] };
  faq: { q: string; a: string }[];
}

export interface Photo {
  file: string;
  src: string;
  width: number;
  height: number;
  alt: string;
  author: string;
  license: string;
  licenseUrl?: string;
  source: string;
  position?: string;
}

const modules = import.meta.glob<{ default: View }>('../data/views/*.json', { eager: true });

export const views: View[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order);

export function getView(slug: string): View | undefined {
  return views.find((v) => v.slug === slug);
}

export const levels: Record<Level, { label: string; text: string }> = {
  pictured: {
    label: 'Pictured',
    text: 'A published photo, captioned as the view from that room category, shows the view.',
  },
  listed: {
    label: 'Listed',
    text: 'The hotel sells a room category with the view in its name or description.',
  },
  reported: {
    label: 'Reported',
    text: 'Travel guides or guests report the view, but no room category is sold with it.',
  },
};

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "2026-10" -> "October 2026"
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${months[m - 1]} ${y}`;
}

// Number of room categories sold with the view on one page.
export function roomCount(view: View): number {
  return view.hotels.reduce((n, h) => n + h.book.length, 0);
}

export function starsLabel(stars?: number): string | undefined {
  if (!stars) return undefined;
  return `${String(stars)}-star`;
}

export const pricesButton = links.buttonLabel;
export const pricesProvider = links.provider;

export function goHref(hotelId: string): string {
  return `/go/${hotelId}/`;
}

// The extras of a view that already have a partner link (src/data/partner-links.json, made on GitHub by
// scripts/make-partner-links.mjs). A row without one is not shown, so no button ever leads nowhere.
export function liveExtras(view: View): Extra[] {
  const store = partnerLinks as Record<string, { url: string; partner_url: string }>;
  return (view.extras ?? []).filter((e) => store[e.id]?.url === e.url);
}

// The photo of a view, once scripts/fetch-photos.mjs has downloaded it. Null until then.
export function photoFor(slug: string): Photo | null {
  const entry = (credits as Record<string, Photo>)[slug];
  if (!entry) return null;
  // The crop can be changed in the view's data file at any time, without downloading the photo again.
  const candidate = getView(slug)?.photo.commons.find((c) => c.file === entry.file);
  return { ...entry, position: candidate?.position ?? entry.position };
}

export function hotelName(view: View, id: string): string {
  return view.hotels.find((h) => h.id === id)?.name ?? id;
}

// "the Eiffel Tower" for use inside a sentence.
export function landmarkInText(view: View): string {
  return view.landmarkInText ?? view.landmark;
}
