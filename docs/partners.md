# Affiliate programs: plan and status

Checked 17–18 October 2026. Re-check terms before relying on any number here.

## Order of applications
1. **Right away, no review needed**
   - **Stay22**: free sign-up, a script on the site turns hotel links into affiliate links across several booking sites (Booking.com, Expedia and others; Agoda inventory added in 2025). Commission share starts at 30% of what Stay22 earns; a commission is ready 7 days after the guest checks out. Their auto-link script works on links in the page; our buttons go through /go/, so use Stay22's own link format (Allez links) as the target in `src/data/links.json` once signed up.
   - **Travelpayouts**: joining is without moderation, and since 27 April 2026 the project is connected to all programs automatically; some brands inside review it first (see below). Use it for tours and tickets (GetYourGuide, Tiqets and others), eSIM, transfers. Hotellook was closed on 20 October 2025, don't plan on it. Don't run two auto-link scripts at once (Stay22's and Travelpayouts') on the same links.
2. **After the first pages are live**
   - **Agoda Partners**: needs a website; applications are reviewed (up to about 48 hours). Gives affiliates a hotel data feed with descriptions, photos and GPS coordinates: a legal source of hotel photos for our cards.
   - **Expedia Group Travel Creator Program** (Expedia, Hotels.com, Vrbo): apply in minutes, up to 4% on eligible bookings. Join **directly**, not through a network: only direct members get the Creator Toolbox, which lets you download property images.
   - **GetYourGuide**: applications reviewed in a few days; also available inside Travelpayouts.
   - **Viator**: own partner program; for viewpoints and tours near each landmark.
3. **Later, when the site has 15–20 good pages and some traffic**
   - **Booking.com via CJ**: since June 2025 Booking.com has no direct program; all applicants go through CJ, 4% on completed stays. CJ checks the site twice (network, then brand), refuses sites with "coming soon" pages, and often refuses new blogs. Until then Booking.com inventory is covered by Stay22. Update 18 October 2026: Booking.com is also listed inside Travelpayouts (3–5%), so apply there first and keep CJ as the second route.
   - **Booking.com Demand API** and **Expedia Rapid API** (room-level data, including Expedia's room "views" field): only for managed partners with a contract. Long-term goal for full automation.

## Traffic sources to declare
Website, Pinterest, Bluesky, Mastodon, Tumblr, Quora, Telegram channel (planned). Each program has its own list of allowed traffic types and countries: read it before promoting, Telegram is not allowed everywhere.

## Status
| Program | Status | Date |
|---|---|---|
| Stay22 | approved, script on the site, status Active | 18 Oct 2026 |
| Travelpayouts | project added; everything not under review is available now (26 of the 46 programs on the owner's screenshots); 20 are under review (clock icon) | 18 Oct 2026 |
| Booking.com, Trip.com, Agoda, Expedia, Hotels.com, Vio.com, Rakuten Travel INTL (inside Travelpayouts) | under review, nothing to do but wait | 18 Oct 2026 |
| GetYourGuide, Viator, Tripadvisor Experiences (inside Travelpayouts) | under review | 18 Oct 2026 |
| Agoda Partners (direct) | not applied | |
| Expedia Travel Creator Program (direct) | not applied | |
| Booking.com (CJ) | fallback, later | |

## Travelpayouts: how approval works and what fits us (18 October 2026)
**How approval works** (Travelpayouts help pages, checked 18 Oct 2026). Since 27 April 2026 there is no applying to programs one by one: when a Project (our site) is created, Travelpayouts connects it to all relevant programs by itself. "Instant access" programs are available at once. The others show a clock icon ("under review"): the Travelpayouts team checks the program's rules, platform policies and our site, usually within a couple of days (the link generator says up to 24 hours). If a program says "Unavailable" or "Declined", the usual causes are a language or domain mismatch, content type, topic fit, traffic quality or design: fix it, then request a review again.

Rates below are the ranges shown on the cards in the owner's screenshots. The real rate depends on each program's terms.

**Under review on 18 Oct 2026 (20):** Booking.com, Trip.com, Agoda, Expedia, Hotels.com, Vio.com, Rakuten Travel (JP and INTL), Traveloka, Vrbo, Hostelworld, Viator, GetYourGuide, Tripadvisor Experiences, DiscoverCars, Omio, 12Go, VisitorsCoverage, Insubuy, Ticketmaster. Every other program on the list is available.

**Available now and useful for us**
- Tickets and tours at the landmark: Tiqets (3.5-8%, 30 days, app and web), Go City (3.4-6%, 90 days, web only), Klook (2-5%, 7-30 days), KKday (1-5%, 30 days), WeGoTrip (audio tours, 6.64-41.5%, 30 days).
- Airport transfers: Welcome Pickups (8-9%, 45 days), Kiwitaxi (9-11%, 30 days), GetTransfer (4-25%), intui.travel (10%, 35 days).
- eSIM: Saily (15%), Yesim (18%, 90 days), Airalo (12%), GigSky (20% / fixed reward, card cut off). Drimsim pays a fixed 8 EUR.
- Luggage storage on check-out day: Radical Storage (8%, 30 days).
- Not useful for now: car rental (Localrent, GetRentacar, QEEQ, Economybookings, AutoEurope, BikesBooking), flights (Kiwi.com, Aviasales), compensation (AirHelp, Compensair), insurance (EKTA).

**Under review and useful for us**
- Hotels, the main income. Booking.com: 3-5%, cookie lasts one session, app and web. Trip.com: 1-5.5%, 7-30 days. Rakuten Travel INTL: 0.8-5%, 30 days, Japan-based, for the Mount Fuji view (check that our five hotels are on it). Vio.com: "revenue share" 40-64%, a share of Vio's own earnings, not of the room price. Expedia and Hotels.com: 1.35-3.6%, 7 days. Agoda: 1-6%, one day.
- Tours: GetYourGuide (8%, 31 days) and Viator (8%, 30 days), both mobile web only. Tripadvisor Experiences is the same shop window as Viator (Viator belongs to Tripadvisor): one of the two is enough.

**Skip:** Vrbo (apartments are excluded by our rules), Hostelworld, Traveloka, Rakuten Travel JP (fixed yen reward), DiscoverCars, Omio, 12Go, insurance, Ticketmaster.

**Direct programs stay in the plan:** Expedia Travel Creator (up to 4% and the photo toolbox) and Agoda Partners (hotel data feed with photos). The Travelpayouts versions of Expedia, Hotels.com and Agoda are a second route, not a replacement.

**Making links (can be automated).** Travelpayouts has a Links API: `POST https://api.travelpayouts.com/links/v1/create`, header `X-Access-Token` (API token from the profile), body `trs` (project ID), `marker` (partner ID), `shorten`, and `links` (up to 10 full brand URLs per request, each with an optional `sub_id`). It returns a `partner_url` per link. It works only for programs the project is connected to and approved for, and it does not support Kiwi.com, Expedia UK, HolidayTaxis, Ticketmaster, Priority Pass and Indrive. Plan: a script that runs on GitHub (like the photo script) turns each hotel's target URL into a partner link with the hotel id as `sub_id`, saves them in a data file, and `scripts/build-go.mjs` reads that file. Needs three values from the owner: API token (a GitHub secret), `trs`, `marker`.

**Cautions**
- Short cookies: Booking (one session) and Agoda (one day) pay only if the guest books soon after the click. Our readers plan ahead, so longer cookies matter.
- "Revenue share" (Vio.com, Hostelworld) is a share of the company's own commission, not of the price. Don't compare it with 3-5%.
- "Mobile web only" (GetYourGuide, Viator, Go City, Welcome Pickups, Kiwitaxi, intui.travel): bookings made in the app don't count.
- Don't add the Travelpayouts auto-link script next to Stay22's (see above). Use tracked links only.
- Room names on the site come from Expedia, Hotels.com and hotel sites; Booking may name the same rooms differently. `links.json` needs a choice of provider per hotel.

## Sources
- Booking.com via CJ since June 2025, 4% on stays: https://www.makeinfluence.com/en/academy/booking-coms-affiliate-program-how-travel-creators-earn-commission
- Hotellook closure: https://support.travelpayouts.com/hc/en-us/articles/29534131568530-FAQ-on-the-closure-of-Hotellook
- Stay22 FAQ (30% share, 7 days after checkout): https://stay22.com/faq
- Stay22 and Agoda via Vio (2025): https://www.traveldailynews.com/technology/stay22-reports-187-growth-in-the-first-half-of-the-year-2025/
- Stay22 vs Travelpayouts auto-link tools: https://blog.stay22.com/are-you-using-the-right-travel-affiliate-program
- Expedia Travel Creator Program: https://partner.expediagroup.com/en-gb/solutions/build-your-travel-experience/travel-creator-program
- Expedia Creator Toolbox only for direct members: https://help.creator.expediagroup.com/hc/en-us/articles/18049160291479
- Agoda data feed with photos and GPS: https://ushub.awin.com/?p=120522
- CJ approval tips: https://www.affililist.com/blog/cj-affiliate-program
- Booking.com Demand API prerequisites: https://developers.booking.com/demand/docs/getting-started/prerequisites
- Expedia Rapid room views field: https://developers.expediagroup.com/rapid/lodging/content/content-reference-lists
- Travelpayouts, how connection and review work: https://support.travelpayouts.com/hc/en-us/articles/360021216060
- Travelpayouts, about programs: https://support.travelpayouts.com/hc/en-us/articles/203955763
- Travelpayouts Links API: https://support.travelpayouts.com/hc/en-us/articles/25289759198226-API-for-Travelpayouts-partner-links
- Travelpayouts affiliate links (statuses, deep links): https://support.travelpayouts.com/hc/en-us/articles/360027634052
