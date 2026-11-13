# Judging freeze (Conrad Innovation Stage)

Judging runs from 7 Jan to 16 Feb 2027; the Innovation Summit is 21 to 24 Apr 2027. The site,
the Innovation Brief and the video must show the same thing for that whole time.

## Before submitting (by 5 Jan 2027)
1. Last content changes in: team photo, video URL (`site.videoUrl`), final numbers.
2. Check that the site, brief and video match: every number, name, satellite (Meteosat-9),
   date, price and claim. `npm run numbers` (in `web/`) lists every number on the site.
3. `make check` and `npm test && npm run e2e` in `web/` pass.
4. Tag the judging version and push the tag:
   `git tag -a judging-2027-01 -m "Version shown to Conrad judges" && git push origin judging-2027-01`
5. Note the tag and its commit in `docs/progress.md`.

## During judging (7 Jan to 16 Feb)
- No redesigns or big changes. Fix only real bugs, and log each fix.
- The daily jobs keep running; check once a week that the live pages show fresh data.

## Free-tier limits (checked 13 Nov 2026)
| Service | What we use | Limit | Headroom |
|---|---|---|---|
| Cloudflare Workers (free) | the website and `/data/*`, `/api/live` | 100,000 requests a day | far below at current traffic |
| GitHub Actions | `live.yml`, `outlook.yml`, `report.yml`, `schedule.yml` | free for public repositories; each job at most 6 h | the report job takes about 2 h a day |
| OpenSky API (team client) | live snapshots | 4,000 credits a day | about 2,300 a day used (`live.yml` header) |
| EUMETSAT Data Store | yesterday's images for `/report` | free for delayed data | fine |
| ECMWF open data | the daily forecast | free, CC BY 4.0 | fine |

GitHub may switch off scheduled workflows in a repository with no commits for 60 days. A
commit before 7 Jan and one in early February (a log entry is enough) keeps them on.
