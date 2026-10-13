# Decision log

One line per decision: date · decision · reason · who OK'd it.
Judges ask "why did you choose X?". The answer should be here.
Pre-registration changes go in `deviations.md` instead (with a team OK).

**Authority note.** On 13 Oct 2026 Shrugal told Claude in chat to "take independent decisions"
for Phase 0. Decisions marked *delegated* were made by Claude under that instruction using the
build prompt's recommendations, and can be revisited by the team **before the lock is written**.

| Date | Decision | Reason | OK'd by |
|---|---|---|---|
| 2026-10-13 | Repo lives at `~/code/stratum`, not inside the `Future Goal For MIT:CMU/…` folder | Python refuses to create virtual environments in paths containing `:` (tested) | delegated (Shrugal) |
| 2026-10-13 | GitHub repo `ShrugalVinod/stratum`, private; Shrugal is the only collaborator for now | Only Shrugal runs code (Shrugal, chat) | Shrugal |
| 2026-10-13 | **Python 3.12** instead of the build prompt's 3.11 | pycontrails ≥ 0.64 requires Python ≥ 3.12; Colab runs 3.12 | delegated (Shrugal) |
| 2026-10-13 | Code licence Apache-2.0 | Build prompt suggestion; permissive, has a patent grant | delegated (Shrugal) |
| 2026-10-13 | Colab launchers install the pinned env into their own venv (`uv sync --frozen` → `/content/venv`) and call `stratum` commands, instead of `pip install` over Colab's packages | Colab's preinstalled `google-colab` pins its own pandas; installing ours on top would break one or the other. Same `uv.lock` everywhere = identical versions | delegated (Shrugal) |
| 2026-10-13 | `requirements-colab.txt` is still exported from `uv.lock` (`make lock-env`) | Build prompt §0.3; fallback if uv is unavailable | delegated (Shrugal) |
| 2026-10-13 | Laptop has no Google Drive for Desktop; laptop "drive root" = `data/drive_local/` (gitignored) | Shrugal: Drive is used from Colab only | Shrugal |
| 2026-10-13 | Jan 2026 dev-month leakage: option **(b)**, report winter with and without Jan 2026 | Keeps paper's dev month and evaluation year; shows any leakage openly (open question 7) | delegated (Shrugal) |
| 2026-10-13 | Aircraft mass = 0.80 × MTOW; sensitivity 0.70 / 0.90 | Paper §4.2 gives no value; build prompt suggestion (open question 6) | delegated (Shrugal) |
| 2026-10-13 | η: OpenAP per type; 0.30 fallback; sensitivity 0.25 / 0.40 (paper App. A) added to `preregistered.yaml` | The paper pre-registers these but the build prompt's YAML omitted them (open question 8) | delegated (Shrugal) |
| 2026-10-13 | Paper Appendix B scoring rules (10 px minimum, clear/partly obscured/obscured, uncertain scored separately, blind labelling) frozen in `preregistered.yaml` | Paper wins where the build prompt's labeller design differed (open question 9) | delegated (Shrugal) |
| 2026-10-13 | Labeller disagreements settled by discussion between the two labellers (paper §4.4), recorded in the app's adjudication mode | Paper wins over the build prompt's single adjudicator (open question 10) | delegated (Shrugal) |
| 2026-10-13 | κ on 16×16-px grid cells + symmetric object F1 | Object-only κ has no true negatives (open question 3) | delegated (Shrugal) |
| 2026-10-13 | H1 primary = raw detectable ratio; efficiency-adjusted secondary | Model predicts *detectable* contrails (paper §4.5) (open question 1) | delegated (Shrugal) |
| 2026-10-13 | Segment label rule: y=1 if matched at any observable slot; y=0 if observable at ≥ 2 slots and never matched; else missing | Build prompt §5.5.6 recommendation (open question 2) | delegated (Shrugal) |
| 2026-10-13 | Latitude bands 6–15 / 15–25 / 25–37°N; confidence-note N = 50; LightGBM primary | Build prompt recommendations (open questions 13–15) | delegated (Shrugal) |
| 2026-10-13 | Proposed labellers: Ishaan Kupnur + Abeer Shah (Shrugal, as modelling lead, does not label) | Phase plan: "IK + one other"; keeps labels independent of the person building the model. **Provisional:** confirm before Phase 5 | delegated (Shrugal) |
| 2026-10-13 | Corridor polygon: great circle VIDP (28.55563 N, 77.09519 E) – VABB (19.088699 N, 72.867897 E), ±75 km, generated in code | Build prompt §3.1; coordinates from OurAirports (public domain) | delegated (Shrugal) |
| 2026-10-13 | `preregistered.yaml` replaced by Shrugal's revised version (parallax correction, explicit segment-label rule, ⚑ `null` placeholders for open items, monotone keys = feature names `rhi_at_level`, `temp_minus_TLM`) | Shrugal's review; fixes a real bug: monotone keys that aren't feature names would silently apply no constraint (now a validation error) | Shrugal |
| 2026-10-13 | Lock rule: filling a ⚑ `null` after the lock = settling an open question (allowed, reported); changing any already-set value = deviation | Lets open questions be settled later without hiding changes such as re-drawing a seed | delegated (Shrugal) |
| 2026-10-13 | Q3 (κ method) re-opened to match the YAML's `agreement_metric: null`; Q16 (labelled-split seed) added | Keep the two pre-registration files consistent | delegated (Shrugal) |
| 2026-10-13 | Pre-registration approved and locked (combined SHA-256 ebd71ed91f63…0a95, written 2026-10-13 16:11 UTC at commit 1e1c17e) | Phase 0 §0.4; approval given in chat | Shrugal |
| 2026-10-13 | Web hosting deferred to Phase 4 (GitHub Pages recommended) | Not needed until Phase 4; ask before first public deploy | – |
