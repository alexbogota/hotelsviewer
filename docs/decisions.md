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

