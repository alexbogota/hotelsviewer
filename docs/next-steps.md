# Next steps and how to continue (written 18 October 2026)

Read START.md first. This file is the detail behind its "План дальше" block.

## State at the end of the first session
- Site live at hotelsviewer.com: 3 views (Eiffel Tower, Bellagio fountains, Niagara Falls), 17 hotels, 48 room categories, 18 pages. Deploy on push to `main` works (FTPS, safety step `scripts/ftp-target.mjs`).
- Destinations layer done: `src/lib/places.ts`, pages `/destinations/...`, `components/HotelMap.astro` (hidden until `site.stay22Aid` is set).
- Stay22 LinkSwap script installed (`site.stay22Id`), status Active, DeepStruct `/go/`. Not yet verified that it swaps our /go/ links (see clicks in hub.stay22.com).
- Not done: contact@ mailbox, affiliate applications (texts were drafted in chat: Stay22 and Travelpayouts first, Agoda / Expedia / GetYourGuide later; honest wording: new site, socials planned), Stay22 `aid` for the map.

## Plan: growing the catalogue by automation
Principle: the catalogue grows from verified views, never from a list of cities. A country or city page exists only when it holds a view.

1. Candidate list (weekly workflow, GitHub): landmarks from Wikidata (coordinates, country, city) ranked by Wikipedia page views; later add the number of hotels nearby from the Agoda feed once approved. Output `data/view-candidates.json` (100-200 places, sorted, with status new / drafted / published / rejected). Heavy downloads belong in the public repo `saveandplay-feeds` (free Actions minutes) if they get large; Wikidata queries are small and can stay here.
2. View writer (daily workflow, GitHub; at most 2 per day to start): takes the next candidate, Claude (owner's subscription, token in secret `CLAUDE_CODE_OAUTH_TOKEN`, same setup as the SaveAndPlay article writer, see that repo's `docs/article-writer.md`) researches hotels and exact room category names with sources and writes a draft `src/data/views/<slug>.json` plus research notes for `docs/research-*.md` to a branch `drafts`. A checker script validates it (all required fields, sources and month on every hotel, level pictured/listed/reported, no prices, no invented fields, photo candidates from Wikimedia with allowed licences). Draft goes to the run Summary. Owner says "ok" and Claude publishes (merge to main). No auto-publish to the site (same decision as SaveAndPlay articles).
3. Where the research can't be verified (many hotel sites block tools) the hotel gets level `reported` or is left out. Quality over speed.

## Content rules to keep (full list in CLAUDE.md)
Room names exactly as sold, no invented data, no prices, booking sites named but not linked, free-licence photos only with credit, no night Eiffel photos, no AI pictures of views.

## Other ideas, not started
- Pinterest pins per view (images 1000x1500, arched window style); Bluesky/Mastodon/Tumblr/Quora posts, same account scheme as SaveAndPlay (`data/accounts.json`).
- "Coming next" block on the home page, to show the site is growing (useful for affiliate applications).
- Replace the Booking search links in `src/data/links.json` with affiliate links when a programme approves.
- Telegram channel and email subscription (`site.ts` fields exist).

## Opening prompt for a new chat or Claude Code
"Продолжаем проект hotelsviewer.com (репозиторий alexbogota/hotelsviewer). Прочитай START.md и docs/next-steps.md и скажи, что делаем следующим шагом: начинаем с списка кандидатов в новые виды и ежедневного автора видов."
