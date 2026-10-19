# Social profiles: Bluesky, Mastodon, Quora (prepared 18 October 2026)

Accounts are NOT created yet. The owner creates them (an account can't be made by Claude: sign-up, passwords and email codes are manual). Everything below is ready to paste.
Pictures: `brand/social/`, made by `python3 scripts/make-social.py` (site fonts and colours, no photos, no landmarks, nothing to credit). Alt text is given for every picture.

## Name and handles
One name everywhere: **HotelsViewer**. Tagline from the site: "See the view before you book."
- Bluesky: handle `hotelsviewer.bsky.social` (later a domain handle, see "After the accounts exist").
- Mastodon: `@hotelsviewer@mastodon.social`. Why mastodon.social: sign-up is open and needs no approval, and its 6 server rules say nothing against business accounts (instance API read 18 Oct 2026). Any server works for posting through the API.
- Quora: name HotelsViewer. Quora allows organisation accounts (Platform Policies, "Special Cases"; some may be asked to verify).
- Whether the names are free can only be seen at sign-up. If taken: `hotelsviewer_com`, then `hotels-viewer`, same on all three.

## Limits (checked 18 Oct 2026)
| | Name | Bio | Photo | Banner |
|---|---|---|---|---|
| Bluesky | 64 | 256 | PNG/JPEG, 1 MB | PNG/JPEG, 1 MB, ratio 3:1 |
| Mastodon (mastodon.social) | 40 | 500 (a link counts 23), 4 fields | 2 MB, shown 400x400 | 2 MB, shown 1500x500; alt text for both up to 150 |
| Quora | n/a | credential 80, bio 1000 (both from third-party guides, Quora gives no official numbers) | 400x400, 5 MB | profiles have none; only a Space has a cover, about 1600x400, and a 500x500 icon (not official) |
Sources: opentweet.io/answers/bluesky-limits, docs.joinmastodon.org/user/profile, mastodon.social/api/v2/instance, allplatforms.io/quora, help.quora.com Platform Policies.

## Texts (English only)
**Bluesky bio** (231/256):
Which hotel room actually has the view? We read the room categories and show which one to book and which look-alike to skip. Eiffel Tower, Colosseum, Taj Mahal and more. We may earn commissions on bookings. hotelsviewer.com/go/bsky

**Mastodon bio** (363/500, the link counts 23):
Hotels sell the same view under many names, and some names don't mean what they seem. We read the room categories and show which one to book for a landmark view, and which look-alike to skip. Every hotel lists its sources and the month we checked.

Guides: https://hotelsviewer.com/go/mastodon

Some links are affiliate links: we may earn a commission at no extra cost to you.

**Mastodon fields** (label → value): Website → https://hotelsviewer.com/go/mastodon · All views → https://hotelsviewer.com/views/ · Affiliate disclosure → https://hotelsviewer.com/disclosure/ . The Website row is the tracked short link. Verified check mark: every page of our site has the footer link back to the profile, so the "All views" row gets the mark; the Website row goes through a redirect and may not (not verified). Do not add the email field until the contact@ mailbox exists.
**Mastodon featured hashtags:** #travel #hotels #hotelrooms

**Quora credential** (41/80): Guide to hotel rooms that face a landmark
**Quora bio** (543/1000):
HotelsViewer is a guide to hotel rooms with a view of a landmark. Hotels sell the same view under many names, and some of those names don't mean what they seem. For each landmark we list the hotels that sell rooms with that view, the exact room category to book, and the look-alike categories to skip. Every entry names its sources and the month we checked it. We don't show prices and we never invent a room name. Guides: hotelsviewer.com/go/quora. Some links on our site are affiliate links: we may earn a commission at no extra cost to you.

**Quora Space (optional, only place on Quora with a cover):** name "Hotel Rooms With a View"; description "Which hotel room actually has the view? The exact room category to book for a landmark view, the look-alikes to skip, and where we checked. From HotelsViewer (hotelsviewer.com/go/quora)."

**Alt text, avatar** (126/150): HotelsViewer logo: an arched window with a pale sky, a thin horizon and a small brass-colored sun, on a dark slate background.
**Alt text, banner** (123/150): HotelsViewer banner: the name and the line “See the view before you book.” next to three arched windows showing a pale sky.

Files: Bluesky and Mastodon take `avatar.png` and `banner.png`; Quora takes `avatar.png`; the Space takes `quora-space-icon.png` and `quora-space-cover.png`.

## Links with marks (19 October 2026)
Every profile carries a SHORT link of its own, never the bare address, so the visits from each network can be told apart in Google Analytics:
| Network | Link for the profile | Mark (subid) |
|---|---|---|
| Bluesky | hotelsviewer.com/go/bsky | bluesky |
| Mastodon | https://hotelsviewer.com/go/mastodon | mastodon |
| Quora | hotelsviewer.com/go/quora | quora |
| Pinterest, Tumblr, Telegram (profiles not made yet) | hotelsviewer.com/go/pinterest, /go/tumblr, /go/telegram | pinterest, tumblr, telegram |
Each short link answers 302 and leads to the home page with `?utm_source=<mark>&utm_medium=social&utm_campaign=profile`. The mark of a network lives in ONE place: `data/accounts.json` (field `subid`). It is the same in the short link, in post links (`postLink` in `scripts/lib/accounts.mjs`) and for a partner network sub ID. A new network = one block in `data/accounts.json`; `scripts/build-go.mjs` adds the redirect by itself and `npm run check:site` fails the deploy if a line is missing.
Reading the result: Google Analytics, Reports, Acquisition, Traffic acquisition, Session source / medium (for example `bluesky / social`), campaign `profile`. Google counts only visitors who clicked "Allow analytics", so the numbers are lower than real visits. Quick test: open the short link in a browser, click Allow, look in Reports, Realtime.

## After the accounts exist (each step is small; keep them in this order)
1. `src/data/site.ts`, `social.bluesky` and `social.mastodon`: put the profile addresses. The footer already writes them with `rel="me"`, so Mastodon shows the website field as verified by itself. Quora has no slot in `site.ts` yet.
2. Bluesky domain handle `@hotelsviewer.com`: a file `public/.well-known/atproto-did` with the account's DID (Claude can read the DID from the public profile once the account exists). It proves the profile belongs to the site and helps in affiliate applications. Not tried yet: check after deploy that the URL answers with the DID as plain text.
3. Posting by program (later): Bluesky needs an app password, Mastodon an access token (Preferences → Development, rights to write posts and media). Both go to GitHub secrets, never into chat or files. Quora: no official way to post by program that we know of (not verified), so it stays manual.

## Quora rules (Platform Policies, read 18 Oct 2026)
Spam covers "excessively promoting the same product or service", links to outside sites for money, and questions posted to promote a business. So on Quora: answer real questions first, link only our own page where it answers the question, never an affiliate link, never post a question to promote the site.
