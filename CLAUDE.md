# HotelsViewer — project brief

Owner is a beginner with websites; explain steps simply, in Russian. Site copy is English only.
Same owner and the same way of working as SaveAndPlay (repo alexbogota/saveandplay): Astro, GitHub, deploy to the same shared hosting over FTPS.

## What this is
hotelsviewer.com: a guide to hotel rooms with a view of a landmark. For each view it lists the hotels that sell rooms with that view, the exact room category to book, and the look-alike categories to skip. It earns affiliate commissions on bookings.
Tagline: "See the view before you book." Main question on the home page: "Which hotel room actually has the view?"
First goal (October 2026): get approved by affiliate programs. Order and status: `docs/partners.md`.

## Stack
- Astro, static output. No database, no admin panel.
- One JSON file per view: `src/data/views/<slug>.json`. Pages, the sitemap and the /go/ redirects are generated from these files. A new view = a new JSON file, no code changes.
- Destinations (18 Oct 2026): `src/lib/places.ts` groups views by `country` and `city` (fields in each view JSON, plus optional `region`, `coords` of the landmark and `landmarkInText`). Pages `/destinations/`, `/destinations/<country>/`, `/destinations/<country>/<city>/` exist only when they hold at least one view: never create empty country or city pages. City pages show the Stay22 hotel map (`components/HotelMap.astro`) when `site.stay22Aid` is set, with a note that those hotels are not checked.
- `src/data/links.json`: where the "Check prices" buttons go. Every button links to our own `/go/<hotel-id>/`; `scripts/build-go.mjs` writes `dist/go/.htaccess` from the template after `astro build`. Switching to an affiliate network = changing this one file.
- `src/data/site.ts`: email, social links, subscribe form address. Empty values are hidden on the site.
- Photos: `scripts/fetch-photos.mjs` runs on GitHub during the deploy, downloads one photo per view from Wikimedia Commons (licence checked) into `public/photos/`, writes the credit into `src/data/photo-credits.json`, and commits both. The chat workspace can't reach Wikimedia, so look at new photos after `git pull`.
- Fonts are self-hosted (`@fontsource-variable/newsreader`, `@fontsource-variable/public-sans`): no requests to Google.
- Deploy: `.github/workflows/deploy.yml`. Push to `main` → fetch missing photos → build → `npm run check:site` → find the upload folder → FTPS upload. Secrets `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` are the same FTP login as saveandplay.com; variable `FTP_SERVER_DIR` (optional).
- Upload safety (`scripts/ftp-target.mjs`): the FTP login is shared with saveandplay.com, whose files sit in `./`. Before uploading, the run tries `FTP_SERVER_DIR`, then `hotelsviewer.com/`, then `public_html/hotelsviewer.com/`, and accepts a folder only if it holds our marker `hotelsviewer-site.txt` or is empty. Otherwise it stops and prints what the FTP login sees. Never remove this step or the marker file, and never point the upload at a folder with another site in it.
- Candidate list (18 Oct 2026): `data/view-candidates.json` (places for future views, ranked by Wikipedia page views) is rebuilt every Monday by `.github/workflows/candidates.yml` (`scripts/build-candidates.mjs`; Wikimedia is only reachable from GitHub). Statuses new / drafted / published / rejected are kept between runs; edit them in the file, never delete a place with a status. Commands: `npm run test:candidates`, `npm run check:candidates`.
- Checks before every deploy: `npm run build && npm run check:site` (title, description, one h1, alt text, links and anchors, /go/ links, no unfinished text).

## Content rules
- Room names are copied exactly as the hotels sell them. Never invent a room name, a view, a distance, a star rating or a price. If a source doesn't say it, the site doesn't say it.
- Each hotel has a level: `pictured`, `listed` or `reported` (definitions in `src/lib/views.ts`, shown on `/about/#how-we-check`). Each entry names its sources and the month of the check.
- Booking sites (Hotels.com, Expedia, Travelocity, Booking.com) are named as sources but not linked. Official sources (hotel sites, tourism boards) and travel guides are linked.
- No prices on the site.
- Photos: only licences that allow commercial use (CC0, public domain, CC BY, CC BY-SA), always credited next to the photo. Never copy photos from booking sites or hotel sites without permission. No night photos of the Eiffel Tower (its lights are copyrighted, SETE permission needed). Never AI-generated pictures of a "view".
- The affiliate disclosure stays visible in the footer and on every view page above the hotels.
- Keep the research trail: every new hotel gets its sources in `docs/research-*.md`.

## Design
Tokens in `src/styles/global.css`. Palette: mist paper #F3F6F8, slate ink #1C2633, zinc #566477, sky #E2EAF0, brass #A8752A (decoration only, 3.7:1) and brass ink #7A5212 (text links). Type: Newsreader (headings and room names), Public Sans (everything else).
Signature elements: arched-window photo frames (`components/ArchPhoto.astro`, also the logo and the share picture) and the "≠" pairs of look-alike room names (`components/Decoder.astro`). Room names always use the `.room` style.
Avoid: identical card grids, decorative gradients (only the placeholder sky has one), ALL CAPS labels, arrows on buttons. Must work at phone width with no sideways scroll; touch targets at least 44px.

## Rules (same as SaveAndPlay)
- Maximum automation. Don't hand routine work to the owner. If something can't be automated, say so and name the smallest manual step.
- Alt text is the default everywhere.
- Commit often, small commits. Tell the owner in plain Russian what changed.
- After every task update `START.md` yourself (60 lines or fewer, plain Russian). Long records go to `docs/`: decisions to `docs/decisions.md`, partners to `docs/partners.md`.
