const CSV_URL = './data/shah-drying-records.csv';
const NS = 'http://www.w3.org/2000/svg';

const fields = [
  'source_row', 'harvest_date', 'grade', 'fermentation_date', 'tank_no',
  'dryer_date_in', 'table_numbers', 'no_of_debes', 'dryer_date_out',
  'moisture_percent', 'storage_lot', 'storage_date_in', 'storage_lot_no',
  'storage_lot_departure_date', 'occupancy_percent'
];

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((line) => line.some((value) => value.trim()))
    .map((line) => Object.fromEntries(fields.map((field, index) => [field, (line[index] || '').trim()])));
}

function bedIds(value) {
  const source = (value || '').trim();
  if (!/^\d+(?:\s*[,;&]\s*\d+)*$/.test(source)) return [];
  return source.split(/[,;&]/).map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= 80);
}

function isoDate(value) {
  const match = (value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0') : '';
}

function displayDate(value) {
  const date = isoDate(value);
  return date ? date.replaceAll('-', '/') : '—';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function svgElement(name, attrs, parent) {
  const element = document.createElementNS(NS, name);
  Object.entries(attrs || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (parent) parent.appendChild(element);
  return element;
}

function addText(parent, text, x, y, className, attrs) {
  const element = svgElement('text', Object.assign({ x, y, class: className }, attrs || {}), parent);
  element.textContent = text;
  return element;
}

function buildMap(records) {
  const map = document.getElementById('yard-map');
  map.replaceChildren();

  svgElement('rect', { x: 0, y: 0, width: 1000, height: 660, class: 'site-ground' }, map);
  svgElement('path', {
    d: 'M52 67 L379 48 L504 74 L720 62 L930 132 L958 360 L884 575 L628 622 L339 610 L75 565 L42 306 Z',
    class: 'site-boundary'
  }, map);
  svgElement('path', {
    d: 'M70 544 C190 525 270 500 340 484 C420 464 478 465 500 493 C519 517 511 554 534 574 C560 598 665 588 748 567 C835 545 891 503 874 431 C858 374 842 325 850 246 C855 193 850 176 831 160',
    class: 'site-path'
  }, map);
  svgElement('path', {
    d: 'M70 544 C190 525 270 500 340 484 C420 464 478 465 500 493 C519 517 511 554 534 574 C560 598 665 588 748 567 C835 545 891 503 874 431 C858 374 842 325 850 246 C855 193 850 176 831 160',
    class: 'site-path-mark'
  }, map);

  addText(map, 'NORTH DRYING AREA', 130, 76, 'zone-label');
  addText(map, 'WEST DRYING AREA', 73, 189, 'zone-label');
  addText(map, 'SOUTH DRYING AREA', 124, 378, 'zone-label');
  addText(map, 'EAST DRYING AREA', 734, 249, 'zone-label');

  const groups = [
    { start: 1, count: 20, x: 112, y: 95, cols: 10, dx: 40, dy: 25 },
    { start: 21, count: 24, x: 83, y: 213, cols: 6, dx: 43, dy: 24 },
    { start: 45, count: 20, x: 112, y: 406, cols: 10, dx: 40, dy: 25 },
    { start: 65, count: 16, x: 742, y: 278, cols: 4, dx: 49, dy: 25 }
  ];
  const recordsByBed = new Map();
  records.forEach((record) => {
    bedIds(record.table_numbers).forEach((id) => {
      if (!recordsByBed.has(id)) recordsByBed.set(id, []);
      recordsByBed.get(id).push(record);
    });
  });

  groups.forEach((group) => {
    for (let offset = 0; offset < group.count; offset += 1) {
      const id = group.start + offset;
      const x = group.x + (offset % group.cols) * group.dx;
      const y = group.y + Math.floor(offset / group.cols) * group.dy;
      const hasHistory = recordsByBed.has(id);
      const g = svgElement('g', {
        class: 'bed-marker',
        tabindex: 0,
        role: 'button',
        'aria-label': 'Bed ' + id + (hasHistory ? ', historical record available' : ', no mapped historical record')
      }, map);
      const rect = svgElement('rect', {
        x, y, width: 38, height: 16,
        class: 'bed-cell' + (hasHistory ? ' has-history' : ''),
        'data-bed': id
      }, g);
      g.addEventListener('click', () => selectBed(id, recordsByBed));
      g.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectBed(id, recordsByBed);
        }
      });
      const title = svgElement('title', {}, g);
      title.textContent = 'Bed ' + id + (hasHistory ? ' · history in source' : ' · no mapped history');
      addText(g, String(id), x + 19, y + 8.5, 'bed-number');
    }
  });

  // Facility positions are schematic interpretations of the supplied aerial photos.
  svgElement('rect', { x: 532, y: 113, width: 137, height: 68, rx: 5, class: 'landmark landmark-secondary' }, map);
  addText(map, 'STORE', 600.5, 147, 'landmark-label landmark-label-dark');
  svgElement('rect', { x: 686, y: 84, width: 121, height: 54, rx: 5, class: 'landmark' }, map);
  addText(map, 'SKIN DRYER', 746.5, 111, 'landmark-label');
  svgElement('circle', { cx: 601, cy: 313, r: 39, class: 'landmark landmark-dam' }, map);
  addText(map, 'DAM', 601, 313, 'landmark-label');
  svgElement('rect', { x: 536, y: 411, width: 176, height: 118, rx: 8, class: 'landmark' }, map);
  addText(map, 'FACTORY', 624, 470, 'landmark-label');
  addText(map, 'Diagram only · not a surveyed plan', 692, 627, 'site-note', { 'text-anchor': 'end' });

  map._recordsByBed = recordsByBed;
}

function selectBed(id, recordsByBed) {
  const map = document.getElementById('yard-map');
  map.querySelectorAll('.bed-cell.selected').forEach((cell) => cell.classList.remove('selected'));
  const cell = map.querySelector('[data-bed="' + id + '"]');
  if (cell) cell.classList.add('selected');

  const matches = (recordsByBed.get(id) || []).slice()
    .sort((a, b) => (isoDate(b.dryer_date_in) || '').localeCompare(isoDate(a.dryer_date_in) || ''));
  document.getElementById('selected-title').textContent = 'Bed ' + id;
  const badge = document.getElementById('selected-badge');
  const detail = document.getElementById('selected-detail');

  if (!matches.length) {
    badge.textContent = '対応記録なし';
    badge.className = 'state-badge state-unknown';
    detail.innerHTML = '<p class="empty-detail">この番号に対応するテーブル番号の記録はCSV内にありません。現在の空き状況を示す表示ではありません。</p>';
    return;
  }

  const latest = matches[0];
  badge.textContent = '履歴 ' + matches.length + '件';
  badge.className = 'state-badge state-history';
  detail.innerHTML =
    '<dl class="detail-grid">' +
      '<div class="detail-item"><dt>記録日</dt><dd>' + escapeHtml(displayDate(latest.dryer_date_in)) + '</dd></div>' +
      '<div class="detail-item"><dt>テーブル番号</dt><dd>' + escapeHtml(latest.table_numbers) + '</dd></div>' +
      '<div class="detail-item"><dt>終了日</dt><dd>' + escapeHtml(displayDate(latest.dryer_date_out)) + '</dd></div>' +
      '<div class="detail-item"><dt>水分値</dt><dd>' + escapeHtml(latest.moisture_percent ? latest.moisture_percent + '%' : '—') + '</dd></div>' +
      '<div class="detail-item"><dt>Debes数</dt><dd>' + escapeHtml(latest.no_of_debes || '—') + '</dd></div>' +
      '<div class="detail-item"><dt>Storage Lot</dt><dd>' + escapeHtml(latest.storage_lot_no || latest.storage_lot || '—') + '</dd></div>' +
    '</dl>' +
    '<p class="detail-warning">この情報は過去記録です。現在そのBedが使用中か、何日目か、占有率は、CSVからは判定できません。</p>';
}

function renderRecords(records) {
  const dated = records.filter((record) => isoDate(record.dryer_date_in))
    .sort((a, b) => isoDate(b.dryer_date_in).localeCompare(isoDate(a.dryer_date_in)));
  const container = document.getElementById('recent-records');
  document.getElementById('record-count').textContent = records.length + '件';
  if (!dated.length) {
    container.innerHTML = '<p class="empty-detail">Date Inが入った行は見つかりませんでした。</p>';
    return;
  }

  const visible = dated.slice(0, 8);
  container.innerHTML =
    '<div class="record-row header"><span>IN</span><span>BED/TABLE</span><span>LOT</span><span>MOISTURE</span></div>' +
    visible.map((record) =>
      '<div class="record-row">' +
        '<strong>' + escapeHtml(displayDate(record.dryer_date_in)) + '</strong>' +
        '<span>' + escapeHtml(record.table_numbers || '—') + '</span>' +
        '<span>' + escapeHtml(record.storage_lot_no || record.storage_lot || '—') + '</span>' +
        '<span>' + escapeHtml(record.moisture_percent ? record.moisture_percent + '%' : '—') + '</span>' +
      '</div>'
    ).join('') +
    '<p class="records-note">日付順の過去記録です。ベッド稼働中の一覧ではありません。</p>';
}

async function initialize() {
  const status = document.getElementById('data-alert-text');
  try {
    const [csvResponse, infoResponse] = await Promise.all([
      fetch(CSV_URL, { cache: 'no-store' }),
      fetch('./data/source-info.json', { cache: 'no-store' })
    ]);
    if (!csvResponse.ok) throw new Error('CSV HTTP ' + csvResponse.status);
    const [csvText, sourceInfo] = await Promise.all([csvResponse.text(), infoResponse.json()]);
    const records = parseCsv(csvText);
    const date = sourceInfo.snapshot_date || 'unknown';
    document.getElementById('snapshot-date').textContent = 'SNAPSHOT · ' + date;
    document.getElementById('data-alert').classList.add('data-alert-warning');
    status.textContent = 'Shahの読み取り専用CSV ' + records.length + '行を表示中。これは ' + date +
      ' 時点のスナップショットです。最新の記録日付は ' + displayDate(sourceInfo.latest_dryer_date_in) +
      '。占有率と現在稼働中のベッドは元データにありません。';
    buildMap(records);
    renderRecords(records);
  } catch (error) {
    document.getElementById('snapshot-date').textContent = 'CSVを取得できません';
    document.getElementById('data-alert').classList.add('data-alert-error');
    status.textContent = 'CSVの読み込みに失敗しました。ネットワークまたは公開CSVの状態を確認してください。';
    document.getElementById('recent-records').innerHTML = '<p class="empty-detail">記録を読み込めません。</p>';
  }
}

initialize();
