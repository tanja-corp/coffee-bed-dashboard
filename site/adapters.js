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

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shiftIsoDate(todayIso, days) {
  const [year, month, day] = todayIso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

export function demoAdapter(todayIso) {
  const random = seededRandom(20261004);
  const emptyBeds = new Set([8, 24, 39, 61, 78]);
  const missingDates = new Set([12, 53]);
  const invalidDateBed = 67;

  const beds = Array.from({ length: BED_COUNT }, (_, index) => {
    const bed = index + 1;
    if (emptyBeds.has(bed)) {
      return { ...emptyBed(bed, 'demo'), occupancyPercent: 0 };
    }

    const occupancyPercent = Math.round(80 + random() * 16);
    if (missingDates.has(bed)) {
      return { ...emptyBed(bed, 'demo'), occupancyPercent };
    }
    if (bed === invalidDateBed) {
      return {
        bed,
        loadDate: null,
        loadDateRaw: '2026/13/40',
        occupancyPercent,
        moisturePercent: 12.1,
        source: 'demo'
      };
    }

    const age = (bed * 7 + Math.floor(random() * 5)) % 19;
    let moisturePercent = null;
    if (bed % 3 === 0) moisturePercent = Number((9.8 + random() * 2.8).toFixed(1));
    if (age >= 14 && bed % 4 === 1) moisturePercent = Number((11.4 + random() * 1.4).toFixed(1));
    if (age >= 14 && bed % 4 === 2) moisturePercent = Number((9.7 + random() * 1.2).toFixed(1));

    const loadDate = shiftIsoDate(todayIso, -age);
    return {
      bed,
      loadDate,
      loadDateRaw: loadDate,
      occupancyPercent,
      moisturePercent,
      source: 'demo'
    };
  });

  return { beds, history: new Map(), records: [] };
}

// Live source: the Shah tab of the traceability workbook, published as CSV.
export async function liveAdapter(url = CURRENT_STATUS_URL) {
  if (!url) throw new Error('CURRENT_STATUS_URL is not configured');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Current status CSV HTTP ' + response.status);
  return parseTraceability(await response.text(), { bedCount: BED_COUNT, dateOrder: CURRENT_STATUS_DATE_ORDER });
}
