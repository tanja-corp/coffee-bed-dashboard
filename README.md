# Coffee Bed Dashboard

GitHub Pages project for monitoring Shah's coffee drying beds.

- Public site: https://tanja-corp.github.io/coffee-bed-dashboard/
- Read-only Shah CSV: https://tanja-corp.github.io/coffee-bed-dashboard/data/shah-drying-records.csv
- Source data snapshot: `site/data/shah-drying-records.csv` (only rows associated with `SH-` storage-lot IDs)
- Public visitors can read/download the CSV. The static site has no write endpoint.
- This CSV is a snapshot from a Drive-hosted `.xlsx` retrieved on 2026-10-03; it does not auto-sync with the source workbook.
- The source export contains dryer dates, table numbers, Debes counts, date out, moisture, and storage-lot IDs. It does not contain a bed-level occupancy percentage. `no_of_debes` is not an occupancy percentage.
- Do not infer present bed occupancy from historical rows. The latest extracted dryer Date In is 2026-09-12 00:00:00 and the latest Date Out is 2026-09-23 00:00:00.

GitHub Pages deploys the `site/` directory on pushes to `main` via `.github/workflows/pages.yml`.
