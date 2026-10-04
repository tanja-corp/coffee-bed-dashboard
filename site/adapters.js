import { BED_COUNT, CURRENT_STATUS_DATE_ORDER, CURRENT_STATUS_URL, SNAPSHOT_CSV_URL } from './config.js';
import { parseTraceability } from './traceability.js';
import { bedIds, parseCsv } from './app.js';

function emptyBed(bed, source) {
  return {
    bed,
    loadDate: null,
    loadDateRaw: '',
    occupancyPercent: null,
    moisturePercent: null,
    source
  };
}

function indexHistory(records) {
  const history = new Map();
  records.forEach((record) => {
    bedIds(record.table_numbers).forEach((bed) => {
      if (!history.has(bed)) history.set(bed, []);
      history.get(bed).push(record);
    });
  });
  return history;
}

export async function snapshotAdapter() {
  const response = await fetch(SNAPSHOT_CSV_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error('CSV HTTP ' + response.status);
  const records = parseCsv(await response.text());
  return {
    beds: Array.from({ length: BED_COUNT }, (_, index) => emptyBed(index + 1, 'snapshot')),
    history: indexHistory(records),
    records
  };
}

// Live source: the Shah tab of the traceability workbook, published as CSV.
export async function liveAdapter(url = CURRENT_STATUS_URL) {
  if (!url) throw new Error('CURRENT_STATUS_URL is not configured');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Current status CSV HTTP ' + response.status);
  return parseTraceability(await response.text(), { bedCount: BED_COUNT, dateOrder: CURRENT_STATUS_DATE_ORDER });
}
