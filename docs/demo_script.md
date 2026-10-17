# STRATUM: 4-minute demo script (Phase 4 open item d)

Draft by Claude, 17 Oct 2026. The team edits the words; the **clicks** are tested by the Playwright
end-to-end test (`web/e2e/site.spec.ts`), so they keep working when the site changes.

**Set-up for the recording**
- Chrome, a **new clean profile** (no extensions, no bookmarks bar), window 1440 × 900, zoom 100 %.
- Open https://stratum.aerospaceonyx.workers.dev once before recording so the fonts and map tiles
  are cached, then reload.
- Screen recorder at 1080p, system sounds off. Narrator reads from this page on a second screen.
- Every number spoken below is on the site or in `docs/web_numbers.md`. Say nothing that is not.

| time | on screen / click | narration (draft) |
|---|---|---|
| 0:00–0:20 | Home page, let the hero animation play (FL380 vs FL360 through the humid layer). | "Contrails cause a large share of aviation's warming, but only the few that form in cold, humid air last for hours. Move the plane a little, and you can lose the cloud." |
| 0:20–0:40 | Scroll slowly past the departures board to the **Phase** board. | "STRATUM is a research prototype over India. Our analysis plan was locked on 13 October 2026, before we had any result. Phases 0 to 4 are done; labels and matching are under way." |
| 0:40–1:00 | Click **Map** in the header. Wait for the replay (planes move, ≈ 7 s). | "This is 1 January 2026: 1,458 commercial flights, replayed from real tracking data, over the hourly physics forecast of where lasting contrails can form." |
| 1:00–1:30 | Click the **top segment** in the list on the right. The detail bar opens under the map. | "Physics alone flags 66 one-minute segments from 6 flights. This one, the strongest: the bar shows how long CoCiP says the contrail lasted, and its warming estimate." |
| 1:30–1:45 | Click the **›** (next segment) arrow twice, then **Close**. | "We can step through each flagged segment of that flight." |
| 1:45–2:05 | Click a **grey flight track** with no flagged segment. Point at the sky column. | "Most flights make no lasting contrail. Click any flight and the column shows the humidity and temperature it flew through." |
| 2:05–2:25 | Click the **flight-level** tape (FL400), then press **→** on the hour slider twice. | "The map changes with flight level and hour: the humid layers are thin, which is why a small altitude change can matter." |
| 2:25–2:50 | Scroll to the **gallery**; open the first satellite image; press **Esc**. | "Physics is not enough. Meteosat-9 sees India every 15 minutes, and our detector finds real contrails in it. On 1 January, no predicted contrail lined up with a detected one." |
| 2:50–3:15 | Click **How it works**; open one **For scientists** panel. | "STRATUM checks every prediction against the satellite, after correcting for wind drift and parallax, and learns where the physics is wrong." |
| 3:15–3:35 | Click **Methods**; point at the hypotheses H1–H4 and the pre-registration badge. | "Four hypotheses, fixed in advance, each with a pass or fail rule. The results come in Phase 7; nothing on this site is a result yet." |
| 3:35–3:50 | Click the **Chart / Night** button (theme switch). | "The site works in day and night themes and on a phone." |
| 3:50–4:00 | Click **Team**. Hold. | "We are four students from Indus International School, Bengaluru, with Dr. Varsha Pant. STRATUM: move the plane, lose the cloud." |

**Checks before the final take**
- Detail bar shows "Contrail lasted" with a number, not "0 h", for the top segment.
- No "— Phase 7" field is described as a result.
- Credits visible in the footer when scrolling (EUMETSAT, Copernicus, ADS-B Exchange, OpenSky,
  Natural Earth).
- If the Phase 5 numbers are mentioned, use only those on the Progress page.
