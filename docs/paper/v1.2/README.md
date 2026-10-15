# STRATUM research protocol v1.2 — source

`paper.html` is the manuscript. Rebuild:

1. `uv run python docs/paper/v1.2/make_figures.py docs/paper/v1.2/fig` (needs the local Phase-1 sample data)
2. `uv run python docs/paper/v1.2/make_eq.py docs/paper/v1.2/eq`
3. Print `paper.html` to PDF with headless Chrome (`--print-to-pdf`).

The 19-page PDF is kept in the team folder (`STRATUM_Research_Protocol_v1.2.pdf`), not in git (> 2 MB).
