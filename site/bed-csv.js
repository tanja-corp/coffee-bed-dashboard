// A bed-status file is deliberately separate from the traceability workbook.
// Rows are drying cycles; the last row for a bed describes its current state.
export const CSV_FIELDS = ['site', 'bed', 'status', 'date_in', 'date_out', 'moisture_percent', 'note', 'updated_at'];
export class CsvError extends Error {
  constructor(key, vars = {}) { super(key); this.key = key; this.vars = vars; }
}
const fail = (key, vars) => { throw new CsvError(key, vars); };
export const cloneRows = (rows) => rows.map((row) => ({ ...row }));
export const sameCsvText = (left, right) => left.replace(/^\uFEFF/, '') === right.replace(/^\uFEFF/, '');

export function readRows(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; closed = false;
    } else {
      if (closed || c === '"') fail('badCsv');
      cell += c;
    }
  }
  if (quoted) fail('badCsv');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

export function validDate(value, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= today;
}

export function validateRows(rows, site, today) {
  if (!rows.length || rows.length > 50000) fail('rowCount');
  const latest = new Map();
  rows.forEach((row, index) => {
    const vars = { row: index + 2 };
    if (row.site !== site.id) fail('wrongSite', { ...vars, site: site.tab });
    const bed = Number(row.bed);
    if (!/^\d+$/.test(String(row.bed)) || bed < 1 || bed > site.bedCount) fail('badBed', vars);
    if (!['unknown', 'empty', 'in_use'].includes(row.status)) fail('badStatus', vars);
    for (const key of ['date_in', 'date_out']) if (row[key] && !validDate(row[key], today)) fail('badDate', vars);
    if (row.date_out && row.date_in && row.date_out < row.date_in) fail('dateOrder', vars);
    if ((row.status === 'in_use' && row.date_out) || (row.status === 'unknown' && (row.date_in || row.date_out))) fail('badStatus', vars);
    if (row.status === 'empty' && row.date_in && !row.date_out) fail('dateOutRequired', vars);
    if (row.moisture_percent !== '' && (!/^\d+(?:\.\d+)?$/.test(String(row.moisture_percent)) || Number(row.moisture_percent) > 100)) fail('badMoisture', vars);
    if (row.note.length > 2000) fail('longNote', vars);
    if (row.updated_at && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.updated_at) || !Number.isFinite(Date.parse(row.updated_at)))) fail('badDate', vars);
    const previous = latest.get(bed);
    if (previous && previous.status !== 'empty') fail('openCycle', vars);
    if (previous?.date_out && (row.date_in || row.date_out) && (row.date_in || row.date_out) < previous.date_out) fail('dateOrder', vars);
    latest.set(bed, row);
  });
  if (latest.size !== site.bedCount) fail('missingBeds', { count: site.bedCount });
  return rows;
}

export function parseBedCsv(text, site, today) {
  const lines = readRows(text);
  const header = (lines.shift() || []).map((value) => value.trim());
  if (header.length !== CSV_FIELDS.length || new Set(header).size !== header.length || CSV_FIELDS.some((key) => !header.includes(key))) fail('badHeader');
  const rows = lines.map((line, index) => {
    if (line.length !== header.length) fail('badCsv', { row: index + 2 });
    const row = Object.fromEntries(header.map((key, i) => [key, key === 'note' ? line[i].replace(/^\t(?=[=+\-@])/, '') : line[i].trim()]));
    return row;
  });
  validateRows(rows, site, today);
  return rows.map((row) => ({ ...row, bed: Number(row.bed) }));
}

export function serializeBedCsv(rows) {
  const cell = (value, key) => {
    let text = String(value ?? '');
    // Avoid interpreting operator-led notes as spreadsheet formulas.
    if (key === 'note' && /^[=+\-@]/.test(text)) text = '\t' + text;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return '\uFEFF' + [CSV_FIELDS.join(','), ...rows.map((row) => CSV_FIELDS.map((key) => cell(row[key], key)).join(','))].join('\r\n') + '\r\n';
}

export function seedRows(site, beds, today) {
  const rows = [];
  for (const bed of beds) {
    const blank = { site: site.id, bed: bed.bed, status: 'unknown', date_in: '', date_out: '', moisture_percent: '', note: '', updated_at: '' };
    const dateIn = validDate(bed.loadDate || '', today) ? bed.loadDate : '';
    const lastOut = validDate(bed.lastDateOut || '', today) ? bed.lastDateOut : '';
    const lastIn = validDate(bed.lastDateIn || '', today) && bed.lastDateIn <= lastOut ? bed.lastDateIn : '';
    if (bed.inUse && lastOut && (!dateIn || lastOut <= dateIn)) rows.push({ ...blank, status: 'empty', date_in: lastIn, date_out: lastOut });
    rows.push({ ...blank, status: bed.inUse === null ? 'unknown' : bed.inUse ? 'in_use' : 'empty',
      date_in: bed.inUse ? dateIn : lastIn, date_out: bed.inUse ? '' : lastOut,
      moisture_percent: bed.moisturePercent ?? '',
      note: bed.inUse && !dateIn && bed.loadDateRaw ? `Source Date In: ${bed.loadDateRaw}` : '' });
  }
  return validateRows(rows, site, today);
}

export function latestRows(rows) {
  return new Map(rows.map((row) => [row.bed, row]));
}

export function dataFromRows(rows, site) {
  const history = new Map(), records = [], latest = latestRows(rows), cleared = new Map();
  rows.forEach((row) => {
    if (row.date_out) cleared.set(row.bed, row);
    if (!row.date_in && !row.date_out) return;
    const record = { dryer_date_in: row.date_in, dryer_date_out: row.date_out, table_numbers: String(row.bed),
      moisture_percent: row.moisture_percent, storage_lot_no: '', storage_lot: '', no_of_debes: '', note: row.note };
    records.push(record);
    if (!history.has(row.bed)) history.set(row.bed, []);
    history.get(row.bed).push(record);
  });
  const beds = Array.from({ length: site.bedCount }, (_, i) => {
    const row = latest.get(i + 1), last = cleared.get(i + 1);
    return { bed: i + 1, inUse: row.status === 'unknown' ? null : row.status === 'in_use',
      loadDate: row.status === 'in_use' ? row.date_in || null : null, loadDateRaw: row.date_in,
      moisturePercent: row.moisture_percent === '' ? null : Number(row.moisture_percent),
      lastDateOut: last?.date_out || null, lastDateIn: last?.date_in || null, note: row.note, source: 'csv' };
  });
  return { status: 'ready', csv: true, live: false, snapshotAvailable: true, sourceInfo: {}, beds, records, history };
}

export function changeBed(rows, site, bed, action, values, today) {
  const next = cloneRows(rows), current = latestRows(next).get(bed);
  if (!current) fail('badBed');
  const date = values.date || '';
  const now = new Date().toISOString();
  if (action === 'load') {
    if (current.status === 'in_use') fail('alreadyInUse');
    if (!validDate(date, today)) fail('dateRequired');
    if (current.date_out && date < current.date_out) fail('dateOrder');
    // Unknown/never-used rows have no cycle to retain.
    if (!current.date_in && !current.date_out) next.splice(next.indexOf(current), 1);
    next.push({ site: site.id, bed, status: 'in_use', date_in: date, date_out: '', moisture_percent: values.moisture,
      note: values.note, updated_at: now });
  } else if (action === 'unload') {
    if (current.status !== 'in_use') fail('notInUse');
    if (!validDate(date, today)) fail('dateRequired');
    if (!current.date_in) fail('fixDateFirst');
    if (date < current.date_in) fail('dateOrder');
    Object.assign(current, { status: 'empty', date_out: date, moisture_percent: values.moisture, note: values.note, updated_at: now });
  } else if (action === 'empty') {
    if (current.status !== 'unknown') fail('badStatus');
    Object.assign(current, { status: 'empty', moisture_percent: '', note: values.note, updated_at: now });
  } else if (action === 'correct') {
    if (current.status === 'in_use' && !validDate(date, today)) fail('dateRequired');
    const updated = { date_in: current.status === 'in_use' ? date : current.date_in,
      moisture_percent: values.moisture, note: values.note };
    if (Object.entries(updated).some(([key, value]) => current[key] !== value)) Object.assign(current, updated, { updated_at: now });
  } else fail('badStatus');
  return validateRows(next, site, today);
}

export function changedBeds(rows, checkpoint) {
  const before = new Map();
  checkpoint.forEach((row) => { if (!before.has(row.bed)) before.set(row.bed, []); before.get(row.bed).push(row); });
  const after = new Map();
  rows.forEach((row) => { if (!after.has(row.bed)) after.set(row.bed, []); after.get(row.bed).push(row); });
  return [...after.keys()].filter((bed) => JSON.stringify(after.get(bed)) !== JSON.stringify(before.get(bed))).sort((a, b) => a - b);
}
