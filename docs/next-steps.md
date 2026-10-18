# Next steps and how to continue (written 18 October 2026)

Read START.md first. This file is the detail behind its "План дальше" block.

## State at the end of the first session
- Site live at hotelsviewer.com: 3 views (Eiffel Tower, Bellagio fountains, Niagara Falls), 17 hotels, 48 room categories, 18 pages. Deploy on push to `main` works (FTPS, safety step `scripts/ftp-target.mjs`).
- Destinations layer done: `src/lib/places.ts`, pages `/destinations/...`, `components/HotelMap.astro` (hidden until `site.stay22Aid` is set).
- Stay22 LinkSwap script installed (`site.stay22Id`), status Active, DeepStruct `/go/`. Not yet verified that it swaps our /go/ links (see clicks in hub.stay22.com).
- Not done: contact@ mailbox, affiliate applications (texts were drafted in chat: Stay22 and Travelpayouts first, Agoda / Expedia / GetYourGuide later; honest wording: new site, socials planned). Stay22 `aid` for the map is set (`hotelsviewer`, 18 Oct) and the map shows on the city pages.

## Done 18 October (evening): candidate list
- Weekly workflow `candidates.yml` + `scripts/build-candidates.mjs` (+ check and tests). Result in `data/view-candidates.json`, 202 places, 189 new, 11 rejected by hand with reasons, 2 published (Eiffel Tower, Niagara Falls; Bellagio fountains is not in the list because it has too few language editions, it is only in `publishedViews`).
- Fields per place: `qid`, `name`, `enwiki`, `country`, `area` (first-level administrative area from Wikidata, often not the city), `coords`, `classes`, `sitelinks`, `views12m`, `status`, `slug` (suggested file name, unique), optional `near` (published views within 3 km) and `note`.
- The writer must decide the real city/country/region itself (fields in the view JSON); `area` is only a hint.
- Coverage is about 330 places after the filters. To widen: lower `min` values in `CLASSES` (heavy kinds like mountain, island, lake time out when set low; the script retries once with double), or add kinds.
- Lessons: Wikimedia is not reachable from the chat workspace, so only GitHub can run the script; GitHub run logs cannot be downloaded from here, so the scripts print `::warning::` and `::error::` annotations that the API returns (`gh api repos/<repo>/check-runs/<job id>/annotations`).

## Plan: growing the catalogue by automation
Principle: the catalogue grows from verified views, never from a list of cities. A country or city page exists only when it holds a view.

1. (done) Candidate list, see above.
2. View writer (daily workflow, GitHub; at most 2 per day to start): takes the next candidate with status `new` (highest page views first, skipping places with `near` unless the view is clearly different), Claude (owner's subscription, token in secret `CLAUDE_CODE_OAUTH_TOKEN`, same setup as the SaveAndPlay article writer, see that repo's `docs/article-writer.md`) researches hotels and exact room category names with sources and writes a draft `src/data/views/<slug>.json` plus research notes for `docs/research-*.md` to a branch `drafts`. The candidate becomes `drafted`. A checker script validates the draft (all required fields, sources and month on every hotel, level pictured/listed/reported, no prices, no invented fields, photo candidates from Wikimedia with allowed licences). Draft goes to the run Summary. Owner says "ok" and Claude publishes (merge to main, candidate becomes `published`). No auto-publish to the site (same decision as SaveAndPlay articles). If the research finds nothing verifiable the candidate becomes `rejected` with a `note`.
3. Where the research can't be verified (many hotel sites block tools) the hotel gets level `reported` or is left out. Quality over speed.
4. Still to build for step 2: the checker for a view draft (`scripts/check-view.mjs`), the workflow `view-writer.yml`, the writer's instructions (`docs/view-writer.md`), and the status updates of `data/view-candidates.json` (drafted / published / rejected).

## Content rules to keep (full list in CLAUDE.md)
Room names exactly as sold, no invented data, no prices, booking sites named but not linked, free-licence photos only with credit, no night Eiffel photos, no AI pictures of views.

## Other ideas, not started
- Pinterest pins per view (images 1000x1500, arched window style); Bluesky/Mastodon/Tumblr/Quora posts, same account scheme as SaveAndPlay (`data/accounts.json`).
- "Coming next" block on the home page, to show the site is growing (useful for affiliate applications).
- Replace the Booking search links in `src/data/links.json` with affiliate links when a programme approves.
- Telegram channel and email subscription (`site.ts` fields exist).

## Opening prompt for a new chat or Claude Code
"Продолжаем проект hotelsviewer.com (репозиторий alexbogota/hotelsviewer). Прочитай START.md и docs/next-steps.md и скажи, что делаем следующим шагом: следующий шаг: ежедневный автор видов (список кандидатов уже готов)."
