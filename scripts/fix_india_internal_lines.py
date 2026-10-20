"""Remove Line-of-Control / Line-of-Actual-Control traces from the website's internal state lines.

The basemap's India outline already follows India's official depiction (Gilgit-Baltistan, PoK,
Aksai Chin, Shaksgam and Arunachal Pradesh inside India). The internal lines of Jammu and Kashmir
and Ladakh, however, came from a de-facto source: they trace the LoC and LAC, which then look like
borders inside Indian territory. Official maps of India do not draw them.

This keeps only the parts of those two lines that are shared with another state or with India's
outer boundary, and drops the rest (the LoC/LAC traces and, with them, the J&K–Ladakh division,
which cannot be separated from them in this data). Idempotent; run from the repository root:

    uv run python scripts/fix_india_internal_lines.py
"""

from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import linemerge, unary_union

GEO = Path("web/public/geo")
TARGET = {"Jammu and Kashmir", "Ladakh"}
TOL_DEG = 0.02  # ≈ 2 km: "shared with" another line
MIN_LEN_DEG = 0.05  # drop fragments shorter than ≈ 5 km


def main() -> None:
    countries = json.loads((GEO / "countries.geojson").read_text())
    states_path = GEO / "india_states.geojson"
    states = json.loads(states_path.read_text())
    feats = states["features"]
    india = next(
        shape(f["geometry"]) for f in countries["features"] if f["properties"]["name"] == "India"
    )
    others = unary_union(
        [shape(f["geometry"]) for f in feats if f["properties"]["name"] not in TARGET]
    )
    keep_zone = unary_union([india.boundary, others]).buffer(TOL_DEG)
    for f in feats:
        if f["properties"]["name"] not in TARGET:
            continue
        kept = shape(f["geometry"]).intersection(keep_zone)
        line_types = ("LineString", "MultiLineString")
        parts = [g for g in getattr(kept, "geoms", [kept]) if g.geom_type in line_types]
        joined = unary_union(parts) if parts else None
        multi = joined is not None and joined.geom_type == "MultiLineString"
        merged = linemerge(joined) if multi else joined
        pieces = getattr(merged, "geoms", [merged])
        lines = [g for g in pieces if g is not None and g.length >= MIN_LEN_DEG]
        empty = {"type": "MultiLineString", "coordinates": []}
        f["geometry"] = mapping(unary_union(lines)) if lines else empty
        f["properties"]["note"] = "LoC/LAC traces removed (official depiction of India)"
    states_path.write_text(json.dumps(states, separators=(",", ":")))
    print("updated", states_path)


if __name__ == "__main__":
    main()
