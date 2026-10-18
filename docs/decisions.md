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
