# Coffee Bed Dashboard

GitHub Pages project for monitoring Shah's coffee drying beds.

- Public site: https://tanja-corp.github.io/coffee-bed-dashboard/
- Read-only Shah CSV: https://tanja-corp.github.io/coffee-bed-dashboard/data/shah-drying-records.csv
- Source data snapshot: `site/data/shah-drying-records.csv` (only rows associated with `SH-` storage-lot IDs)
- Public visitors can read/download the CSV. The static site has no write endpoint.
- This CSV is a snapshot from a Drive-hosted `.xlsx` retrieved on 2026-10-03; it does not auto-sync with the source workbook.
- The source export contains dryer dates, table numbers, Debes counts, date out, moisture, and storage-lot IDs. It does not contain a bed-level occupancy percentage. `no_of_debes` is not an occupancy percentage.
- Do not infer present bed occupancy from historical rows. The latest extracted dryer Date In is 2026-09-12 00:00:00 and the latest Date Out is 2026-09-23 00:00:00.

## Dashboard behavior

- `site/index.html` renders the Shah dashboard and an approximate facility diagram based on the five user-provided aerial/reference photos. It marks the drying areas and Factory, Store, Dam, and Skin dryer. The diagram is illustrative, not a surveyed floor plan; actual bed-number-to-position mapping has not been confirmed. The reference photos themselves are not published.
- Selecting a bed shows matching historical rows when its number occurs in the CSV `table_numbers` field. This is a possible history lookup, not confirmation that the bed is currently occupied.
- The CSV's occupancy percentage is blank, and no current per-bed load dates are provided. The dashboard therefore reports current occupancy and bed state as unknown. It does not treat `no_of_debes` as a percentage.
- Age color guide: 0–7 days green, 8–13 days orange, 14+ days red. It is a guide for future/current load dates and is not assigned to the historical records in this snapshot.
- Shah's 80 total beds and Nylex condition counts (15 good, 65 worn) are shown as provided. The individual beds corresponding to those condition counts are not identified.

## Updating the snapshot

This is a static read-only website; it does not connect live to Drive and it has no write endpoint. To refresh data, export/filter Shah rows from the approved source, review that no other farm's data is included, update `site/data/shah-drying-records.csv` and `site/data/source-info.json`, then commit and push to `main`. GitHub Actions will redeploy the `site/` directory. Never add API keys or service account credentials to this public repository.

For local preview, run a static HTTP server from the repository root and open `http://localhost:8000/site/` (for example: `python -m http.server 8000`). Opening `index.html` as a `file://` URL may block CSV fetches in the browser.

GitHub Pages deploys the `site/` directory on pushes to `main` via `.github/workflows/pages.yml`.
