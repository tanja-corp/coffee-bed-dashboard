import { BED_COUNT, CURRENT_STATUS_URL, SNAPSHOT_CSV_URL, TZ } from './config.js';
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

// Expected published CSV columns for the future live sheet:
// Bed No, Date In, Occupancy % (Moisture % is optional)
export async function liveAdapter(url = CURRENT_STATUS_URL) {
  if (!url) throw new Error('CURRENT_STATUS_URL is not configured');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Current status CSV HTTP ' + response.status);
  const rows = parseHeaderCsv(await response.text());
  const byBed = new Map();

  rows.forEach((row) => {
    const bed = Number(row['Bed No']);
    if (!Number.isInteger(bed) || bed < 1 || bed > BED_COUNT) return;
    const rawDate = (row['Date In'] || '').trim();
    const loadDate = parseSheetDate(rawDate);
    byBed.set(bed, {
      bed,
      loadDate,
      loadDateRaw: rawDate,
      occupancyPercent: nullableNumber(row['Occupancy %']),
      moisturePercent: nullableNumber(row['Moisture %']),
      source: 'live'
    });
  });

  return {
    beds: Array.from({ length: BED_COUNT }, (_, index) => byBed.get(index + 1) || emptyBed(index + 1, 'live')),
    history: new Map(),
    records: []
  };
}

// A published Google Sheet shows dates in the owner's locale (2026-10-04, 4/10/2026 or 10/4/2026).
// A day/month order that cannot be told apart is rejected rather than guessed.
function parseSheetDate(raw) {
  const text = (raw || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return isoFrom(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]);
  if (first > 12) return isoFrom(year, second, first);
  if (second > 12) return isoFrom(year, first, second);
  if (first === second) return isoFrom(year, first, second);
  const today = Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()));
  const plausible = (iso) => {
    const age = iso ? (today - Date.parse(iso)) / 86400000 : NaN;
    return age >= 0 && age <= 45;
  };
  const dayFirst = isoFrom(year, second, first);
  const monthFirst = isoFrom(year, first, second);
  if (plausible(dayFirst) && !plausible(monthFirst)) return dayFirst;
  if (plausible(monthFirst) && !plausible(dayFirst)) return monthFirst;
  return null;
}

function isoFrom(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function nullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(String(value).replace('%', '').trim());
  return Number.isFinite(number) ? number : null;
}

function parseHeaderCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const nonEmpty = rows.filter((line) => line.some((value) => value.trim()));
  const headers = nonEmpty.shift() || [];
  return nonEmpty.map((line) => Object.fromEntries(headers.map((header, index) => [header.trim(), (line[index] || '').trim()])));
}
