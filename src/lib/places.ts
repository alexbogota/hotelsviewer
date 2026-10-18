// Countries and cities, built from the view data files. A country or a city exists on the site
// only when at least one view is in it, so there are never empty destination pages.
// New view with a new city or country = its pages appear by themselves.
import { views, type View } from './views';

export interface City {
  name: string;
  slug: string;
  region?: string;
  country: Country;
  views: View[];
  // Map centre: the first view's landmark.
  coords: { lat: number; lng: number };
}

export interface Country {
  name: string;
  slug: string;
  cities: City[];
  views: View[];
}

// "Île-de-France" -> "ile-de-france", "United States" -> "united-states"
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function build(): Country[] {
  const byCountry = new Map<string, Country>();
  for (const v of views) {
    const cSlug = slugify(v.country);
    let country = byCountry.get(cSlug);
    if (!country) {
      country = { name: v.country, slug: cSlug, cities: [], views: [] };
      byCountry.set(cSlug, country);
    }
    country.views.push(v);
    const citySlug = slugify(v.city);
    let city = country.cities.find((c) => c.slug === citySlug);
    if (!city) {
      city = { name: v.city, slug: citySlug, region: v.region, country, views: [], coords: v.coords };
      country.cities.push(city);
    }
    city.views.push(v);
  }
  const countries = [...byCountry.values()];
  for (const c of countries) c.cities.sort((a, b) => a.name.localeCompare(b.name));
  return countries.sort((a, b) => a.name.localeCompare(b.name));
}

export const countries: Country[] = build();
export const cities: City[] = countries.flatMap((c) => c.cities);

export const countryHref = (c: Country) => `/destinations/${c.slug}/`;
export const cityHref = (c: City) => `/destinations/${c.country.slug}/${c.slug}/`;

export function cityOf(view: View): City {
  return cities.find((c) => c.views.includes(view)) as City;
}

// "Paris, France"
export function placeLabel(view: View): string {
  return `${view.city}, ${view.country}`;
}
