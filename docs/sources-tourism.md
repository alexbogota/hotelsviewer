# Sources for posts and guides (checked 21 Oct 2026)

Goal: fresh, interesting hooks for social posts and guides, readable by a program (RSS or API), about any place, not only our 21 views.
A post about a place without a view page links to our hotel search `/hotels/?q=<city>` (works for any city, Stay22 photos and prices).
Facts in a post or guide still need a page that was opened and a quote (same rule as the writers).

## Checked from the chat on 21 Oct 2026
| Source | What it gives | How to read | Status | Use for |
|---|---|---|---|---|
| Euronews Travel | Daily travel news: new rules and fees, hotel openings, tourism numbers, Schengen, Airbnb changes | RSS `https://www.euronews.com/rss?format=mrss&level=vertical&name=travel` | works, 8 items on 20–21 Oct | news hook (guides, format b), question posts |
| Atlas Obscura | Several curious places a day, all over the world | RSS `https://www.atlasobscura.com/feeds/latest` | works, items of 20–21 Oct | "hidden gem" and history angles (angles 5, 6 of the research); always link to them, never copy text |
| UNESCO World Heritage Centre | Official news on World Heritage sites | RSS `https://whc.unesco.org/en/news/rss` | works, but mostly workshops (14 Oct, 8 Oct...) | rare: inscriptions in July, sites in danger |
| GDELT DOC 2.0 API | Search of world news by keyword (e.g. "Eiffel Tower"), last 3 months, JSON or RSS, title, date, image | `https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=artlist&format=json` | documented on the GDELT blog; the test call from the chat failed (client_error), test it from GitHub | news per landmark of our views, for the guide writer |
| Wikipedia "On this day" | Events of a date, history facts about places | Wikimedia feed API (`/feed/onthisday/...`) | not reachable from the chat (Wikimedia is closed here), works only from GitHub; endpoint to confirm there | "on this day" posts about our landmarks (angle 5) |
| Wikimedia Commons Picture of the Day | One free-licence photo a day, with author and licence | Commons POTD feed | not reachable from the chat; to test from GitHub | photo posts with credit, only CC0/PD/CC BY/CC BY-SA |

## Closed to the chat tools (do not plan on them)
The Guardian Travel RSS (site blocked), Condé Nast Traveler and Travel + Leisure (site blocked), One Mile at a Time (robots.txt forbids bots).

## Sources
- GDELT DOC 2.0 API: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
- UNESCO WHC news RSS: https://whc.unesco.org/en/news/rss
- Atlas Obscura feed: https://www.atlasobscura.com/feeds/latest
- Euronews Travel RSS: https://www.euronews.com/rss?format=mrss&level=vertical&name=travel
- Commons Picture of the Day RSS: https://commons.wikimedia.org/wiki/Commons:Press_releases/Picture_of_the_Day_RSS
