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

*No deviations. Pre-registration locked 2026-10-13 (combined SHA-256 ebd71ed91f63…0a95, written 2026-10-13 16:11 UTC at commit 1e1c17e).*
