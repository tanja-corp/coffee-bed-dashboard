# Public read-only Shah data snapshot

- Scope: rows associated with `SH-` storage lot identifiers only. Other farm records are excluded.
- Snapshot retrieved: 2026-10-03 (Africa/Nairobi date).
- Source file: Drive-hosted XLSX export; this is a snapshot, not an automatic live connection.
- Extracted source rows: 125
- Latest dryer Date In in this snapshot: 2026-09-12 00:00:00
- Latest dryer Date Out in this snapshot: 2026-09-23 00:00:00
- `occupancy_percent` is blank because the source workbook does not provide a bed occupancy percentage. `no_of_debes` is preserved as recorded and must not be interpreted as a percentage.
- Dates and numbers are preserved as exported. Suspect or ambiguous source values should be reviewed before operational use.
- This file is served from GitHub Pages over HTTP GET only. Public visitors can read/download it; the static site provides no write endpoint.
