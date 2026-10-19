# Decision log

Newest at the bottom. START.md keeps only the result.

## 18 October 2026: the site and its first version
- Concept: hotel rooms with a view of a landmark. Each page answers "which room category do I book to get the view?" with the exact room names, the look-alikes to skip, and a level of confidence. Chosen because the domain name says "viewer", the search intent is close to booking, view rooms cost more, and the information is specific enough to stand out in AI search results.
- First three views: Eiffel Tower, Bellagio fountains, Niagara Falls (owner's choice, 18 Oct).
- Stack: same as SaveAndPlay (Astro, GitHub, GitHub Actions FTPS deploy to the same hosting). Owner chose "GitHub as before" over WordPress (18 Oct).
- One JSON file per view; pages generated from data.
- Levels: pictured (photo captioned as the view from that category), listed (category sold with the view), reported (guides or guests report it, no category sold with it).
- No prices on the site. Booking sites are named as sources, not linked.
- Price buttons go through our own `/go/<hotel-id>/` redirect, built from `src/data/links.json`. For now the target is a plain Booking.com search (no affiliate yet); the switch to an affiliate link is one file.
- Photos: Wikimedia Commons only, downloaded on GitHub during deploy with a licence check (CC0, public domain, CC BY, CC BY-SA) and saved with credits. No night Eiffel Tower photos (SETE copyright on the lights). Hotel photos later from affiliate content (Agoda feed, Expedia Creator Toolbox) or hotels' permission.
- No analytics and no cookies on the site for now. Fonts self-hosted.
- Design: mist / slate / brass palette, Newsreader + Public Sans, arched-window frames, "≠" pairs of look-alike room names.

## 18 October 2026: first deploy
- Pushed to alexbogota/hotelsviewer; Actions run green; site live at hotelsviewer.com. The shared FTP login is protected by `scripts/ftp-target.mjs` (empty or marker-file folders only). Photos fetched from Wikimedia and committed by the bot.

## 18 October 2026: destinations
- Catalogue grows from views, not from a list of cities: country and city pages are generated from view data and exist only when they hold a checked view (no thin pages).
- URL scheme `/destinations/<country>/<city>/` (nested, so cities with the same name in different countries don't clash).
- City pages carry a Stay22 map of nearby hotels, clearly marked as not checked by us. Needs the Stay22 `aid`.
- Next: a candidate list of landmarks (Wikidata + Wikipedia pageviews) and a daily view-writer on GitHub, like the SaveAndPlay article writer (owner asked for daily, 18 Oct).

## 18 October 2026: handoff
- Context of the first session was getting long; state and plan written to START.md and docs/next-steps.md so a new chat or Claude Code can continue from the repository alone.

## 18 October 2026: list of view candidates
- `data/view-candidates.json` is built weekly on GitHub (`.github/workflows/candidates.yml`, `scripts/build-candidates.mjs`): landmarks from Wikidata (31 kinds: towers, skyscrapers, bridges, waterfalls, castles, palaces, cathedrals, temples, mountains, volcanoes, lakes, beaches, squares, statues, archaeological sites and so on) with coordinates and an English Wikipedia article, ranked by English Wikipedia page views over the last 12 full months. Only the best-known places by number of language editions get page views (cost).
- A candidate is only a name on a list. Whether hotels sell rooms with that view is for the view writer to research; if it finds nothing to verify, the place becomes `rejected` with a reason in `note`.
- Countries, political territories, administrative areas and settlements are left out (the first run put 62 island countries in the top 200). Done in a second, light query on the places already found: a filter inside the per-kind queries made the run take over 20 minutes and was cancelled.
- Every Wikidata id used is checked against its English name at the start of each run; a kind that does not match is skipped with a warning (annotation on the run page).
- The status of each place survives the weekly rebuild. The commit says `[skip ci]` and the bot's push does not start a deploy; the site does not change.
- 11 obviously unsuitable places were set to `rejected` by hand (a shipwreck, a destroyed statue, whole seas and whole islands, a statue inside a museum).
- The run log of GitHub is not reachable from the chat workspace (403); problems are therefore also printed as annotations (`::warning::`, `::error::`), which the API returns.

## 18 October 2026: a wide first batch instead of one view a day
- The owner's reasoning: with few countries on the site, a visitor is unlikely to find the place they are looking for. So eight views in eight new countries were built at once (Colosseum, Acropolis, Taj Mahal, Mount Fuji, Burj Khalifa, Sagrada Família, Hagia Sophia, Pyramids of Giza), kept on branch `drafts` until the owner says ok.
- Same rules as before: a room name is only copied from a listing or an official page, never inferred. Where a booking site's view tag and the room name disagree (Hotels.com "City view" for a Hagia Sophia room, Expedia "Garden view" for a pyramid room), the name is the promise and the page says so.
- A hotel with no category sold with the view, but a guide that says its rooms have it, is `reported`, never `listed` (Palace Downtown, Four Seasons Sultanahmet, Le Méridien Pyramids, Hostemplo Sagrada Familia, Konansou).
- Star counts are shown only when a page states a number of stars. "Property class" on Expedia and Hotels.com is not treated as stars.
- Where there are few honest hotels (Sagrada Família: three), the page has three hotels. Hotels that see the landmark only from a rooftop go to the "No view room? Try a rooftop" block, not to the list.
- Apartments and rentals are not listed; they are not hotel room categories.
- The page slug follows the wording hotels sell: `pyramids-of-giza` for the candidate "Great Pyramid of Giza", `acropolis` for "Parthenon".
- The home page no longer says how many views there are.


## 18 October 2026: "After the window", a pilot of tickets and transport
- Why: tickets, transfers and eSIM raise income per visitor but do not bring visitors. They go where the reader already is, on the view page, and only where we checked a real product on the seller's own page. Nothing generic, no filler rows.
- Pilot: Burj Khalifa (Tiqets tickets) and Mount Fuji (Klook: panoramic ropeway, Tokyo to Lake Kawaguchi highway bus). Hagia Sophia has no row: foreign visitors pay at the gate, and no real product was found.
- Wording: the product name is the seller's; the note says only what the seller's page says ("Klook says...", "Tiqets says..."); no prices; the month checked is shown; a partner-link line sits above the rows and the disclosure page is updated.
- Links: made by the Travelpayouts Links API on GitHub (`scripts/make-partner-links.mjs`), one per row, with the row id as sub ID, so statistics show which row earns. The marker (174296) and project ID (587479) are public and live in `src/data/travelpayouts.json`; the API token is the GitHub secret `TRAVELPAYOUTS_TOKEN` and is never printed or saved.
- Safety: a row without a partner link is not shown, so a failed run changes nothing for visitors. The deploy never fails because of this step. Failures are saved in `data/partner-links-status.json` and printed as `::warning::` annotations.
- Not done on purpose: articles about eSIM or "Colosseum tickets" (big sites win, and they dilute the topic). Hotel buttons stay on the Booking.com search until a hotel programme approves.

## 18 October 2026: social profiles prepared (Bluesky, Mastodon, Quora)
- One name everywhere (HotelsViewer) and one look: the site's arched window, drawn by `scripts/make-social.py`. No photos and no landmarks in the pictures, so there is no licence or credit to carry.
- Every bio says in plain words that links may earn a commission, like the Disclosure page. No numbers of views in bios (the home page doesn't state them either).
- Mastodon on mastodon.social (open sign-up, no rules against business accounts). Bluesky gets a domain handle later. Quora is manual only and has the strictest promotion rules: no affiliate links there.
- Texts, limits with sources and next steps: `docs/social-profiles.md`. The accounts themselves are created by the owner.


## 18 October 2026: Google Analytics (replaces "no analytics")
- Owner asked for Google Analytics 4. Measurement ID `G-KNJLEMRVNP` (not a secret) is `gaId` in `src/data/site.ts`; empty value = no analytics and no banner.
- Consent first: `components/AnalyticsConsent.astro` shows a small bottom bar on every page. Nothing is requested from Google and no cookies are set until the visitor clicks "Allow analytics". The choice is kept in the browser (`localStorage` key `hv-analytics`). "Analytics settings" in the footer reopens the bar; "No thanks" after a "yes" sets the `ga-disable` flag and deletes the `_ga` cookies.
- Why this way: GA sets cookies and the site has EU/UK visitors, so a "yes" is needed before loading. Loading nothing until then (not even cookieless pings) keeps the Privacy page honest. Cost: visitors who ignore the bar are not counted, so the numbers show a part of the traffic only.
- Privacy page updated the same day. The GA snippet pasted by the owner was not used as is (it loads Google on every visit); same ID, loaded after consent.
- Tested in a simulated browser (first visit, Allow, No thanks, return visits, withdrawal); the real look of the bar is to be seen on a phone.
