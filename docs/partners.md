# Affiliate programs: plan and status

Checked 17–18 October 2026. Re-check terms before relying on any number here.

## Order of applications
1. **Right away, no review needed**
   - **Stay22**: free sign-up, a script on the site turns hotel links into affiliate links across several booking sites (Booking.com, Expedia and others; Agoda inventory added in 2025). Commission share starts at 30% of what Stay22 earns; a commission is ready 7 days after the guest checks out. Their auto-link script works on links in the page; our buttons go through /go/, so use Stay22's own link format (Allez links) as the target in `src/data/links.json` once signed up.
   - **Travelpayouts**: joining is without moderation; some brands inside need approval. Use it for tours and tickets (GetYourGuide, Tiqets and others), eSIM, transfers. Hotellook was closed on 20 October 2025, don't plan on it. Don't run two auto-link scripts at once (Stay22's and Travelpayouts') on the same links.
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
| Travelpayouts | registered; 9 instant programs approved (see below); every other program needs its own application | 18 Oct 2026 |
| Booking.com, Trip.com, Rakuten Travel INTL, Vio.com (inside Travelpayouts) | to apply | |
| Tiqets, GetYourGuide, Viator (inside Travelpayouts) | to apply | |
| Welcome Pickups, Radical Storage (inside Travelpayouts) | to apply | |
| Agoda Partners (direct) | not applied | |
| Expedia Travel Creator Program (direct) | not applied | |
| Booking.com (CJ) | fallback, later | |

## Travelpayouts catalogue: what fits us (18 October 2026)
From the owner's screenshots of the programs list. Rates are the ranges shown on the cards; the real rate depends on each program's terms, so read them before applying.

**Approved already (instant, no review):** Yesim, Localrent.com, GigSky, GetTransfer.com, GetRentacar.com, AirHelp, QEEQ, Ticketmaster, Saily. Useful for us: GetTransfer (airport transfers) and Saily, Yesim, GigSky (eSIM). The rest (car rental, flight compensation, concerts) are off-topic. None of them is a hotel program.

**Apply, in this order** (each needs its own application inside Travelpayouts):
1. Hotels, the main income.
   - Booking.com: 3–5%, cookie lasts one session, app and web tracked. It is listed here, so we don't have to wait for CJ.
   - Trip.com: 1–5.5%, cookie 7–30 days, app and web.
   - Rakuten Travel INTL: 0.8–5%, 30 days. Japan-based; for the Mount Fuji view. Check that our five hotels are on it.
   - Vio.com: "revenue share" 40–64%, 30 days. That is a share of Vio's own earnings, not of the room price. Read the terms before comparing it with the others.
2. Tickets and tours at the landmark itself.
   - Tiqets: 3.5–8%, 30 days, app and web.
   - GetYourGuide: 8%, 31 days, mobile web only.
   - Viator: 8%, 30 days, mobile web only.
   - Klook (2–5%) later, for the Asian views.
3. Getting there.
   - Welcome Pickups: 8–9%, 45 days, airport transfers.
   - Radical Storage: 8%, 30 days, luggage storage on check-out day.

**Not through Travelpayouts:** Expedia and Hotels.com (1.35–3.6% there) and Agoda (1–6%, cookie one day) stay as direct applications, as planned above (Expedia: up to 4% and the photo toolbox). Use the Travelpayouts cards only if a direct application is refused.

**Skip for now:** Vrbo (apartments are excluded by our rules), Hostelworld, car rental, flights, trains, insurance, Ticketmaster, flight-compensation services. Tripadvisor Experiences is the same shop window as Viator (Viator belongs to Tripadvisor), so one of the two is enough.

**Cautions**
- Short cookies: Booking (one session) and Agoda (one day) pay only if the guest books soon after the click. Our readers plan ahead, so longer cookies matter.
- "Revenue share" (Vio.com, Hostelworld) is a share of the company's own commission, not a share of the price. Don't compare it with 3–5%.
- "Mobile web only" (GetYourGuide, Viator): bookings made in the app don't count.
- Don't add the Travelpayouts auto-link script next to Stay22's (see above). Use hand-made tracked links in `links.json` only.
- Room names on the site come from Expedia, Hotels.com and hotel sites; Booking may name the same rooms differently. Later `links.json` needs a choice of provider per hotel, and a second URL encoding for network deep links (a tracked link carries the target address inside a parameter). Do this once a real link from the Travelpayouts account is in hand, so the template matches the real format.

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
