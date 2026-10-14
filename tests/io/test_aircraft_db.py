"""Tests for parsing the OpenSky aircraft database CSV (single-quoted fields)."""

from __future__ import annotations

from pathlib import Path

from stratum.io.aircraft_db import KEEP_COLUMNS, parse_csv

HEADER = "'icao24','timestamp','acars','adsb','built','categoryDescription','country','engines','firstFlightDate','firstSeen','icaoAircraftClass','lineNumber','manufacturerIcao','manufacturerName','model','modes','nextReg','notes','operator','operatorCallsign','operatorIata','operatorIcao','owner','prevReg','regUntil','registered','registration','selCal','serialNumber','status','typecode','vdl'"
ROWS = [
    "'801470','2025-01-01',0,0,,'',India,'',,,L2J,'',AIRBUS,'',A320neo,0,'','','IndiGo','IFLY','6E','igo','InterGlobe Aviation','',,,'VT-IIF','','','','a20n',0",
    "'801470','2025-01-01',0,0,,'',India,'',,,L2J,'',AIRBUS,'',dup,0,'','','','','','','','',,,'VT-XXX','','','','A20N',0",
    "'zzzzzz','2025-01-01',0,0,,'',,'',,,'','','','',bad,0,'','','','','','','','',,,'','','','','',0",
    "'76CD6E','2025-01-01',0,0,,'',Singapore,'',,,L4J,'',AIRBUS,'',A380,0,'','','','','','SIA','Singapore Airlines','',,,'9V-SKN','','','','A388',0",
]


def test_parse_csv(tmp_path: Path) -> None:
    p = tmp_path / "db.csv"
    p.write_text("\n".join([HEADER, *ROWS]) + "\n")
    df = parse_csv(p)
    assert list(df.columns) == list(KEEP_COLUMNS)
    assert sorted(df["icao24"]) == ["76cd6e", "801470"]  # lower-cased, invalid hex dropped, deduped
    r = df.set_index("icao24").loc["801470"]
    assert r["typecode"] == "A20N" and r["operatorIcao"] == "IGO" and r["registration"] == "VT-IIF"
    assert df.set_index("icao24").loc["76cd6e", "owner"] == "Singapore Airlines"
