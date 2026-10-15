# Deviations from the pre-registration

Every change to a locked value in `configs/preregistered.yaml`, or to a **settled** answer in
`configs/preregistered_open_questions.md`, must be listed here **with the team's OK** before
results that depend on it are produced. `stratum verify-lock` reads this file. Use exactly
this format (one `##` heading per deviation; `Keys:` lists the dotted key paths, or
`open_questions.Q<n>`):

```
## D-001 — 2026-11-02 — short title
- Keys: matching.max_distance_px
- Reason: why the change is needed
- Results seen before the change: no | yes (which)
- Team OK: Name, date (where: chat / meeting)
```

Final runs are never deleted. If a bug is found after a final run, fix it, rerun, and report
both runs (build prompt §6.8).

---

*Pre-registration locked 2026-10-13 (combined SHA-256 ebd71ed91f63…0a95, written 2026-10-13 16:11 UTC at commit 1e1c17e).*

## D-001 — 2026-10-15 — CoCiP Monte Carlo members N = 20 → 100
- Keys: open_questions.Q12
- Reason: Q12 (settled 15 Oct) set N = 20 and required a convergence check, with a larger N adopted
  only through this log before any evaluation run. The check on 2026-01-01 (B1, N = 20 vs 40)
  changed the summed EF percentiles by p50 1.5 %, p95 7.1 % and **p05 27.8 %**. p05 is the lower
  bound on which the decision layer ranks alternatives, so N = 20 is not stable enough. N = 100
  (with a 100 vs 200 check) is adopted for all CoCiP runs. Cost is Colab time only.
- Results seen before the change: no hypothesis outcomes. Only the Phase 2 development-month
  physics run (EF percentiles, convergence numbers) had been seen; no labels, detections, matches
  or model scores exist.
- Team OK: Shrugal Vinod, 2026-10-15 (chat: "approved n = 100")
