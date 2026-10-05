import { CURRENT_STATUS_DATE_ORDER } from './config.js';
import { parseTraceability } from './traceability.js';
import { bedIds, parseCsv } from './app.js';

export function emptyBeds(bedCount, source) {
  return Array.from({ length: bedCount }, (_, index) => ({
    bed: index + 1,
    loadDate: null,
    loadDateRaw: '',
    inUse: null,
    moisturePercent: null,
    lastDateOut: null,
    lastDateIn: null,
    source
  }));
}

function indexHistory(records, bedCount) {
  const history = new Map();
  records.forEach((record) => {
    bedIds(record.table_numbers, bedCount).forEach((bed) => {
      if (!history.has(bed)) history.set(bed, []);
      history.get(bed).push(record);
    });
  });
  return history;
}

// Published read-only CSV (Shah only). It has no current use status, so every bed stays unknown.
export async function snapshotAdapter(site) {
  if (!site.snapshotCsvUrl) throw new Error(`${site.id} has no snapshot CSV`);
  const [response, infoResponse] = await Promise.all([
    fetch(site.snapshotCsvUrl, { cache: 'no-store' }),
    site.sourceInfoUrl ? fetch(site.sourceInfoUrl, { cache: 'no-store' }) : null
  ]);
  if (!response.ok) throw new Error('CSV HTTP ' + response.status);
  if (infoResponse && !infoResponse.ok) throw new Error('Source info HTTP ' + infoResponse.status);
  const records = parseCsv(await response.text());
  return {
    beds: emptyBeds(site.bedCount, 'snapshot'),
    history: indexHistory(records, site.bedCount),
    records,
    sourceInfo: infoResponse ? await infoResponse.json() : {}
  };
}

// Live source: the site's tab of the traceability workbook, read as CSV.
export async function liveAdapter(site, todayIso) {
  if (!site.statusUrl) throw new Error(`${site.id} has no live sheet URL`);
  // One retry: three tabs load at once and Google occasionally drops one of the requests.
  let response;
  try {
    response = await fetch(site.statusUrl, { cache: 'no-store' });
  } catch (error) {
    response = await fetch(site.statusUrl, { cache: 'no-store' });
  }
  if (!response.ok) throw new Error('Current status CSV HTTP ' + response.status);
  return parseTraceability(await response.text(), {
    bedCount: site.bedCount, dateOrder: CURRENT_STATUS_DATE_ORDER, todayIso
  });
}
