// Reads the Shah tab of the traceability workbook (published as CSV) and turns it into bed states.
// One row is one lot/grade. A row with Table Nos and no Date Out is treated as still on those tables.
// Date In is only written on the first row of a lot, so it carries down to the rows below it.
// A closed row (Date Out filled) is kept per table so an empty table can show when it was last cleared.

function parseRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (character !== '\r') cell += character;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.map((line) => line.map((value) => value.trim()));
}

function isoFrom(year, month, day) {
  if (year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

export function parseSheetDate(raw, dateOrder = 'dmy') {
  const text = (raw || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return isoFrom(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]);
  return dateOrder === 'mdy' ? isoFrom(year, first, second) : isoFrom(year, second, first);
}

function tableNumbers(value) {
  if (!/^\d+(?:\s*[,;&]\s*\d+)*$/.test(value)) return null;
  return value.split(/[,;&]/).map((part) => Number(part.trim()));
}

function locateColumns(rows) {
  for (let groupRow = 0; groupRow < Math.min(rows.length, 8); groupRow += 1) {
    const start = rows[groupRow].findIndex((cell) => cell === 'Tables');
    if (start < 0) continue;
    let end = rows[groupRow].findIndex((cell, index) => index > start && cell !== '');
    if (end < 0) end = rows[groupRow].length;
    const labels = rows[groupRow + 1] || [];
    const within = (label) => {
      for (let index = start; index < end; index += 1) if (labels[index] === label) return index;
      return -1;
    };
    const columns = {
      dateIn: within('Date In'), tableNos: within('Table Nos'), debes: within('No of Debes'),
      dateOut: within('Date Out'), moisture: within('Moisture %'),
      storageLot: labels.findIndex((cell, index) => index >= end && cell === 'Storage Lot')
    };
    if (columns.dateIn < 0 || columns.tableNos < 0) return null;
    return { columns, firstDataRow: groupRow + 2 };
  }
  return null;
}

export function parseTraceability(text, { bedCount = 80, dateOrder = 'dmy', todayIso = null } = {}) {
  const rows = parseRows(text);
  const located = locateColumns(rows);
  if (!located) throw new Error('Tables block (Date In / Table Nos) not found in the sheet');
  const { columns, firstDataRow } = located;
  const cell = (row, index) => (index >= 0 ? (row[index] || '') : '');

  const records = [];
  const open = new Map();
  const cleared = new Map();
  const outOfRange = new Set();
  let unparsedOpenRows = 0;
  let carriedDate = '';

  for (let index = firstDataRow; index < rows.length; index += 1) {
    const row = rows[index];
    const ownDate = cell(row, columns.dateIn);
    if (ownDate) carriedDate = ownDate;
    const tablesText = cell(row, columns.tableNos);
    if (!tablesText) continue;
    const dateOutRaw = cell(row, columns.dateOut);
    const isoIn = parseSheetDate(carriedDate, dateOrder);
    const isoOut = parseSheetDate(dateOutRaw, dateOrder);
    records.push({
      dryer_date_in: isoIn || '', table_numbers: tablesText, no_of_debes: cell(row, columns.debes),
      dryer_date_out: isoOut || '', moisture_percent: cell(row, columns.moisture),
      storage_lot_no: cell(row, columns.storageLot), storage_lot: ''
    });
    const tables = tableNumbers(tablesText);
    if (dateOutRaw) {
      // Future Date Outs are typos; they still close the row but do not count as the last clearing.
      if (tables && isoOut && (!todayIso || isoOut <= todayIso)) {
        tables.forEach((table) => {
          const previous = cleared.get(table);
          if (!previous || isoOut > previous.dateOut) cleared.set(table, { dateOut: isoOut, dateIn: isoIn });
        });
      }
      continue;
    }

    if (!tables) { unparsedOpenRows += 1; continue; }
    const entry = { dateRaw: carriedDate, iso: isoIn };
    tables.forEach((table) => {
      if (table < 1 || table > bedCount) { outOfRange.add(table); return; }
      if (!open.has(table)) open.set(table, []);
      open.get(table).push(entry);
    });
  }

  const history = new Map();
  records.forEach((record) => {
    const tables = tableNumbers(record.table_numbers) || [];
    tables.forEach((table) => {
      if (!history.has(table)) history.set(table, []);
      history.get(table).push(record);
    });
  });

  const beds = Array.from({ length: bedCount }, (_, offset) => {
    const bed = offset + 1;
    const entries = open.get(bed);
    const last = cleared.get(bed) || null;
    const lastOut = { lastDateOut: last ? last.dateOut : null, lastDateIn: last ? last.dateIn : null };
    if (!entries) return { bed, loadDate: null, loadDateRaw: '', inUse: false, moisturePercent: null, source: 'live', ...lastOut };
    const badDate = entries.find((entry) => !entry.iso);
    const dates = entries.map((entry) => entry.iso).filter(Boolean).sort();
    return {
      bed,
      loadDate: badDate ? null : dates[0],
      loadDateRaw: badDate ? (badDate.dateRaw || '—') : dates[0],
      inUse: true,
      moisturePercent: null,
      source: 'live',
      ...lastOut
    };
  });

  return {
    beds, history, records,
    warnings: { unparsedOpenRows, outOfRangeTables: [...outOfRange].sort((a, b) => a - b) }
  };
}
