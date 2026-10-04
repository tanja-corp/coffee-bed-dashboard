import {
  AGE_GREEN_MAX,
  AGE_ORANGE_MAX,
  BED_COUNT,
  CURRENT_STATUS_URL,
  DRYING_DAYS,
  MOISTURE_TARGET,
  OCCUPANCY_ALERT,
  TZ
} from './config.js';
import { demoAdapter, liveAdapter, snapshotAdapter } from './adapters.js';

const NS = 'http://www.w3.org/2000/svg';
const fields = [
  'source_row', 'harvest_date', 'grade', 'fermentation_date', 'tank_no',
  'dryer_date_in', 'table_numbers', 'no_of_debes', 'dryer_date_out',
  'moisture_percent', 'storage_lot', 'storage_date_in', 'storage_lot_no',
  'storage_lot_departure_date', 'occupancy_percent'
];

const stateMeta = {
  unknown: { label: '不明', icon: '?', reason: '現在データがないため不明' },
  empty: { label: '空き', icon: '○', reason: '占有率0%のため空き' },
  invalid: { label: '日付不正', icon: '!', reason: '投入日が未入力または解釈できない' },
  green: { label: 'きみどり', icon: 'G', reason: `0–${AGE_GREEN_MAX}日経過のためきみどり` },
  orange: { label: 'オレンジ', icon: 'O', reason: `${AGE_GREEN_MAX + 1}–${AGE_ORANGE_MAX}日経過のためオレンジ` },
  red: { label: '赤', icon: 'R', reason: `${AGE_ORANGE_MAX + 1}日以上経過のため赤` }
};

const appState = {
  beds: [],
  bedById: new Map(),
  history: new Map(),
  records: [],
  sourceInfo: {},
  demo: false,
  todayIso: nairobiTodayIso(),
  selectedBed: null,
  snapshotAvailable: false
};

export function parseCsv(text) {
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
  const nonEmpty = rows.filter((line) => line.some((value) => value.trim()));
  if (nonEmpty[0] && nonEmpty[0][0].trim() === fields[0]) nonEmpty.shift();
  return nonEmpty.map((line) => Object.fromEntries(fields.map((field, index) => [field, (line[index] || '').trim()])));
}

export function bedIds(value) {
  const source = (value || '').trim();
  if (!/^\d+(?:\s*[,;&]\s*\d+)*$/.test(source)) return [];
  return source.split(/[,;&]/).map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= BED_COUNT);
}

export function isoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '';
  const normalized = match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
  return calendarDayNumber(normalized) === null ? '' : normalized;
}

export function displayDate(value) {
  const date = isoDate(value);
  return date ? date.replaceAll('-', '/') : '—';
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function svgElement(name, attrs, parent) {
  const element = document.createElementNS(NS, name);
  Object.entries(attrs || {}).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (parent) parent.appendChild(element);
  return element;
}

export function addText(parent, text, x, y, className, attrs) {
  const element = svgElement('text', Object.assign({ x, y, class: className }, attrs || {}), parent);
  element.textContent = text;
  return element;
}

function nairobiTodayIso() {
  const formatted = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const direct = isoDate(formatted);
  if (direct) return direct;
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function calendarDayNumber(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const milliseconds = Date.UTC(year, month - 1, day);
  const date = new Date(milliseconds);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(milliseconds / 86400000);
}

export function elapsedDays(loadDate, todayIso = appState.todayIso) {
  const start = calendarDayNumber(loadDate);
  const today = calendarDayNumber(todayIso);
  return start === null || today === null ? null : today - start;
}

export function addCalendarDays(value, days) {
  const dayNumber = calendarDayNumber(value);
  if (dayNumber === null) return null;
  const date = new Date((dayNumber + days) * 86400000);
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
}

export function classifyBed(bed) {
  if (bed.occupancyPercent === 0) return bedResult(bed, 'empty', null);
  const hasAnyCurrentData = bed.occupancyPercent !== null || bed.loadDate !== null || bed.loadDateRaw || bed.moisturePercent !== null;
  if (!hasAnyCurrentData) return bedResult(bed, 'unknown', null);
  if (!bed.loadDate) return bedResult(bed, 'invalid', null);
  const age = elapsedDays(bed.loadDate);
  if (age === null || age < 0) return bedResult(bed, 'invalid', age);
  if (age <= AGE_GREEN_MAX) return bedResult(bed, 'green', age);
  if (age <= AGE_ORANGE_MAX) return bedResult(bed, 'orange', age);
  return bedResult(bed, 'red', age);
}

function bedResult(bed, state, age) {
  const confirm = age !== null && age >= DRYING_DAYS && bed.moisturePercent !== null && bed.moisturePercent > MOISTURE_TARGET;
  const moistureReached = bed.moisturePercent !== null && bed.moisturePercent <= MOISTURE_TARGET;
  return { state, age, confirm, moistureReached, ...stateMeta[state] };
}

function displayPercent(value) {
  if (value === null || !Number.isFinite(value)) return '不明';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function displayMoisture(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%（目安${MOISTURE_TARGET}%）`;
}

function loadDateText(bed) {
  if (bed.loadDate) return displayDate(bed.loadDate);
  if (bed.loadDateRaw) return `不正：${bed.loadDateRaw}`;
  return '—';
}

function statusText(result) {
  return result.confirm ? `${result.icon} ${result.label}・確認` : `${result.icon} ${result.label}`;
}

function ariaLabelForBed(bed, result) {
  const parts = [
    `Bed ${bed.bed}`,
    `状態 ${result.label}`,
    `乗せた日 ${loadDateText(bed)}`,
    `占有率 ${displayPercent(bed.occupancyPercent)}`
  ];
  if (result.age !== null) parts.push(`経過 ${result.age}日`);
  if (result.confirm) parts.push('確認が必要');
  if (result.moistureReached) parts.push('水分目標到達');
  return parts.join('、');
}

function addMapDefinitions(map) {
  const defs = svgElement('defs', {}, map);
  const pattern = svgElement('pattern', {
    id: 'invalid-hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)'
  }, defs);
  svgElement('rect', { width: 10, height: 10, fill: '#d8dde1' }, pattern);
  svgElement('line', { x1: 0, y1: 0, x2: 0, y2: 10, stroke: '#697580', 'stroke-width': 4 }, pattern);
}

export function bedLayout() {
  const layout = [];
  let bed = 1;
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      layout.push({ bed: bed++, x: 150 + column * 125, y: 78 + row * 24, width: 105, height: 14, rotation: 0 });
    }
  }
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      layout.push({ bed: bed++, x: 590 + column * 98, y: 83 + row * 25, width: 82, height: 13, rotation: -35 });
    }
  }
  for (let column = 0; column < 21; column += 1) {
    layout.push({ bed: bed++, x: 145 + column * 18.5, y: 250, width: 14, height: 84, rotation: 0 });
  }
  for (let column = 0; column < 21; column += 1) {
    layout.push({ bed: bed++, x: 145 + column * 18.5, y: 360, width: 14, height: 104, rotation: 0 });
  }
  for (let row = 0; row < 10; row += 1) {
    layout.push({ bed: bed++, x: 845, y: 255 + row * 28, width: 72, height: 15, rotation: 0 });
  }
  if (layout.length !== BED_COUNT) throw new Error(`Map layout has ${layout.length} beds, expected ${BED_COUNT}`);
  return layout;
}

function drawFacility(map) {
  const facilities = svgElement('g', { class: 'facilities', 'aria-label': '施設' }, map);

  svgElement('polygon', { points: '720,57 783,69 774,128 708,113', class: 'landmark skin-roof' }, facilities);
  svgElement('polygon', { points: '720,57 751,63 743,120 708,113', class: 'skin-roof-blue' }, facilities);
  addText(facilities, 'SKIN DRYER', 744, 48, 'landmark-label-outside');

  svgElement('polygon', { points: '595,174 689,183 680,242 586,232', class: 'landmark store-roof' }, facilities);
  addText(facilities, 'STORE', 637, 209, 'landmark-label');

  svgElement('circle', { cx: 583, cy: 342, r: 38, class: 'landmark landmark-dam' }, facilities);
  svgElement('circle', { cx: 583, cy: 342, r: 30, class: 'dam-waterline' }, facilities);
  addText(facilities, 'DAM', 583, 342, 'landmark-label');

  svgElement('polygon', { points: '620,383 751,392 743,528 610,515', class: 'landmark factory-roof' }, facilities);
  svgElement('line', { x1: 630, y1: 420, x2: 743, y2: 428, class: 'roof-ridge' }, facilities);
  addText(facilities, 'FACTORY', 681, 456, 'landmark-label');

  svgElement('polygon', { points: '772,235 823,238 817,542 765,535', class: 'long-roof' }, facilities);
  addText(facilities, '長屋根 (用途未確認)', 796, 391, 'long-roof-label', { transform: 'rotate(90 796 391)' });

  svgElement('polygon', { points: '526,397 576,399 574,444 523,441', class: 'landmark small-roof' }, facilities);
  svgElement('polygon', { points: '548,462 603,466 599,507 544,503', class: 'landmark small-roof' }, facilities);
  svgElement('polygon', { points: '511,470 542,472 540,510 508,507', class: 'landmark small-roof' }, facilities);
  addText(facilities, '小型建物', 548, 528, 'minor-label');
}

export function buildMap(beds) {
  const map = document.getElementById('yard-map');
  map.replaceChildren();
  addMapDefinitions(map);

  svgElement('rect', { x: 0, y: 0, width: 1000, height: 660, class: 'site-ground' }, map);
  svgElement('path', {
    d: 'M116 48 L704 39 L891 118 L933 548 L775 616 L205 594 L94 500 Z',
    class: 'site-boundary'
  }, map);
  svgElement('path', {
    d: 'M20 586 C148 540 236 533 335 548 C447 565 535 612 657 624 C774 635 874 604 976 551',
    class: 'site-road'
  }, map);
  svgElement('path', {
    d: 'M23 586 C151 543 239 537 334 551 C446 568 534 615 656 627 C773 638 875 607 976 554',
    class: 'site-road-edge'
  }, map);
  svgElement('path', {
    d: 'M111 49 L704 40 L890 118 L932 547 L775 615 L205 593 L95 499 Z',
    class: 'site-boundary-line'
  }, map);

  addText(map, 'N', 74, 78, 'north-label');
  svgElement('path', { d: 'M74 92 L74 53 M74 53 L67 65 M74 53 L81 65', class: 'north-arrow' }, map);
  addText(map, '北側ベッド', 148, 67, 'zone-label');
  addText(map, '北東・斜め列', 600, 69, 'zone-label');
  addText(map, '中央西・上段', 145, 240, 'zone-label');
  addText(map, '中央西・下段', 145, 350, 'zone-label');
  addText(map, '東側列', 847, 244, 'zone-label');
  addText(map, '南・南西の未舗装路', 160, 630, 'road-label');

  drawFacility(map);
  const lookup = new Map(beds.map((bed) => [bed.bed, bed]));
  bedLayout().forEach((position) => drawBed(map, position, lookup.get(position.bed)));
}

function drawBed(map, position, bed) {
  const result = classifyBed(bed);
  const centerX = position.x + position.width / 2;
  const centerY = position.y + position.height / 2;
  const transform = position.rotation ? `rotate(${position.rotation} ${centerX} ${centerY})` : '';
  const group = svgElement('g', {
    class: `bed-marker state-${result.state}${result.confirm ? ' state-confirm' : ''}`,
    transform,
    tabindex: 0,
    role: 'button',
    'aria-label': ariaLabelForBed(bed, result),
    'data-bed-group': bed.bed
  }, map);
  svgElement('rect', {
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    rx: 2,
    class: `bed-cell state-${result.state}${result.confirm ? ' state-confirm' : ''}`,
    'data-bed': bed.bed
  }, group);

  const horizontal = position.width > position.height;
  addText(group, String(bed.bed), centerX, horizontal ? centerY + 0.5 : centerY + 5, 'bed-number');
  addText(
    group,
    result.confirm ? '!' : result.icon,
    horizontal ? position.x + position.width - 8 : centerX,
    horizontal ? centerY + 0.5 : position.y + 10,
    'bed-state-icon'
  );
  if (result.moistureReached) {
    addText(group, '✓', horizontal ? position.x + 8 : centerX, horizontal ? centerY + 0.5 : position.y + position.height - 7, 'bed-moisture-icon');
  }

  group.addEventListener('pointerenter', (event) => showTooltip(bed, result, event));
  group.addEventListener('pointermove', (event) => positionTooltipAtPointer(event));
  group.addEventListener('pointerleave', () => {
    if (document.activeElement !== group) hideTooltip();
  });
  group.addEventListener('focus', () => showTooltip(bed, result, null, group));
  group.addEventListener('blur', hideTooltip);
  group.addEventListener('click', (event) => {
    selectBed(bed.bed, appState.history);
    if (event.pointerType === 'touch') showTooltip(bed, result, event);
  });
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectBed(bed.bed, appState.history);
    }
  });
}

function tooltipHtml(bed, result) {
  const day14 = bed.loadDate ? addCalendarDays(bed.loadDate, DRYING_DAYS) : null;
  const badges = [];
  if (result.confirm) badges.push('<span class="inline-status confirm">確認</span>');
  if (result.moistureReached) badges.push('<span class="inline-status reached">水分目標到達</span>');
  return [
    `<strong class="tooltip-title">Bed ${bed.bed} · ${escapeHtml(result.label)}</strong>`,
    `<span class="tooltip-reason">${escapeHtml(result.reason)}</span>`,
    '<dl>',
    `<div><dt>乗せた日</dt><dd>${escapeHtml(loadDateText(bed))}</dd></div>`,
    `<div><dt>占有率</dt><dd>${escapeHtml(displayPercent(bed.occupancyPercent))}</dd></div>`,
    `<div><dt>経過日数</dt><dd>${result.age === null ? '—' : `${result.age}日`}<small>経過日数であり乾燥度ではありません</small></dd></div>`,
    `<div><dt>14日目の予定日</dt><dd>${day14 ? escapeHtml(displayDate(day14)) : '—'}</dd></div>`,
    `<div><dt>実測水分</dt><dd>${escapeHtml(displayMoisture(bed.moisturePercent))}</dd></div>`,
    '</dl>',
    badges.length ? `<div class="tooltip-badges">${badges.join('')}</div>` : ''
  ].join('');
}

function showTooltip(bed, result, event, target) {
  const tooltip = document.getElementById('map-tooltip');
  tooltip.innerHTML = tooltipHtml(bed, result);
  tooltip.hidden = false;
  if (event && Number.isFinite(event.clientX)) positionTooltipAtPointer(event);
  else if (target) positionTooltipAtElement(target);
}

function positionTooltipAtPointer(event) {
  const frame = document.getElementById('map-frame');
  const tooltip = document.getElementById('map-tooltip');
  if (tooltip.hidden) return;
  const bounds = frame.getBoundingClientRect();
  placeTooltip(event.clientX - bounds.left + 14, event.clientY - bounds.top + 14, bounds);
}

function positionTooltipAtElement(element) {
  const frame = document.getElementById('map-frame');
  const tooltip = document.getElementById('map-tooltip');
  if (tooltip.hidden) return;
  const bounds = frame.getBoundingClientRect();
  const targetBounds = element.getBoundingClientRect();
  placeTooltip(targetBounds.right - bounds.left + 10, targetBounds.top - bounds.top, bounds);
}

function placeTooltip(left, top, frameBounds) {
  const tooltip = document.getElementById('map-tooltip');
  const maxLeft = Math.max(8, frameBounds.width - tooltip.offsetWidth - 8);
  const maxTop = Math.max(8, frameBounds.height - tooltip.offsetHeight - 8);
  tooltip.style.left = `${Math.max(8, Math.min(left, maxLeft))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(top, maxTop))}px`;
}

function hideTooltip() {
  document.getElementById('map-tooltip').hidden = true;
}

export function selectBed(id, recordsByBed = appState.history) {
  const map = document.getElementById('yard-map');
  map.querySelectorAll('.bed-cell.selected').forEach((cell) => cell.classList.remove('selected'));
  const cell = map.querySelector(`[data-bed="${id}"]`);
  if (cell) cell.classList.add('selected');
  appState.selectedBed = id;

  const bed = appState.bedById.get(id);
  const result = classifyBed(bed);
  const matches = (recordsByBed.get(id) || []).slice()
    .sort((left, right) => (isoDate(right.dryer_date_in) || '').localeCompare(isoDate(left.dryer_date_in) || ''));
  const day14 = bed.loadDate ? addCalendarDays(bed.loadDate, DRYING_DAYS) : null;
  const badge = document.getElementById('selected-badge');
  document.getElementById('selected-title').textContent = `Bed ${id}`;
  badge.textContent = statusText(result);
  badge.className = `state-badge state-${result.state}${result.confirm ? ' state-confirm' : ''}`;

  const currentFlags = [];
  if (result.confirm) currentFlags.push('<span class="inline-status confirm">確認：14日以上かつ実測水分が目安超過</span>');
  if (result.moistureReached) currentFlags.push('<span class="inline-status reached">水分目標到達</span>');

  const historyHtml = matches.length
    ? `<div class="history-list">${matches.slice(0, 5).map((record) =>
      '<div class="history-row">' +
        `<strong>${escapeHtml(displayDate(record.dryer_date_in))}</strong>` +
        `<span>OUT ${escapeHtml(displayDate(record.dryer_date_out))}</span>` +
        `<span>水分 ${escapeHtml(record.moisture_percent ? `${record.moisture_percent}%` : '—')}</span>` +
        `<span>Lot ${escapeHtml(record.storage_lot_no || record.storage_lot || '—')}</span>` +
      '</div>'
    ).join('')}</div><p class="records-note">CSV内の該当履歴 ${matches.length}件中、日付の新しい順に最大5件を表示。</p>`
    : '<p class="empty-detail">このBed番号に対応する過去記録はCSV内にありません。</p>';

  document.getElementById('selected-detail').innerHTML =
    '<section class="current-detail">' +
      '<h3>現在状態</h3>' +
      `<p class="status-reason"><span aria-hidden="true">${escapeHtml(result.icon)}</span> ${escapeHtml(result.reason)}</p>` +
      '<dl class="detail-grid">' +
        `<div class="detail-item"><dt>乗せた日</dt><dd>${escapeHtml(loadDateText(bed))}</dd></div>` +
        `<div class="detail-item"><dt>占有率</dt><dd>${escapeHtml(displayPercent(bed.occupancyPercent))}</dd></div>` +
        `<div class="detail-item"><dt>経過日数</dt><dd>${result.age === null ? '—' : `${result.age}日`}<small>乾燥度ではありません</small></dd></div>` +
        `<div class="detail-item"><dt>14日目の予定日</dt><dd>${day14 ? escapeHtml(displayDate(day14)) : '—'}</dd></div>` +
        `<div class="detail-item detail-wide"><dt>実測水分</dt><dd>${escapeHtml(displayMoisture(bed.moisturePercent))}</dd></div>` +
      '</dl>' +
      (currentFlags.length ? `<div class="detail-flags">${currentFlags.join('')}</div>` : '') +
    '</section>' +
    '<section class="history-section">' +
      '<h3>過去記録</h3>' + historyHtml +
    '</section>';
}

export function renderRecords(records) {
  const dated = records.filter((record) => isoDate(record.dryer_date_in))
    .sort((left, right) => isoDate(right.dryer_date_in).localeCompare(isoDate(left.dryer_date_in)));
  const container = document.getElementById('recent-records');
  document.getElementById('record-count').textContent = `${records.length}件`;
  if (!dated.length) {
    container.innerHTML = '<p class="empty-detail">Date Inが入った実CSV行は見つかりませんでした。</p>';
    return;
  }
  container.innerHTML =
    '<div class="record-row header"><span>IN</span><span>BED/TABLE</span><span>LOT</span><span>MOISTURE</span></div>' +
    dated.slice(0, 8).map((record) =>
      '<div class="record-row">' +
        `<strong>${escapeHtml(displayDate(record.dryer_date_in))}</strong>` +
        `<span>${escapeHtml(record.table_numbers || '—')}</span>` +
        `<span>${escapeHtml(record.storage_lot_no || record.storage_lot || '—')}</span>` +
        `<span>${escapeHtml(record.moisture_percent ? `${record.moisture_percent}%` : '—')}</span>` +
      '</div>'
    ).join('') +
    '<p class="records-note">実CSVの日付順の過去記録です。現在稼働中の一覧ではありません。</p>';
}

function renderSummary(beds) {
  const results = beds.map((bed) => classifyBed(bed));
  const counts = {
    green: results.filter((result) => result.state === 'green').length,
    orange: results.filter((result) => result.state === 'orange').length,
    red: results.filter((result) => result.state === 'red').length,
    confirm: results.filter((result) => result.confirm).length,
    empty: results.filter((result) => result.state === 'empty').length,
    unknown: results.filter((result) => result.state === 'unknown' || result.state === 'invalid').length,
    invalid: results.filter((result) => result.state === 'invalid').length
  };
  const items = [
    ['green', 'G', '緑', counts.green, `0–${AGE_GREEN_MAX}日`],
    ['orange', 'O', '橙', counts.orange, `${AGE_GREEN_MAX + 1}–${AGE_ORANGE_MAX}日`],
    ['red', 'R', '赤', counts.red, `${AGE_ORANGE_MAX + 1}日以上`],
    ['confirm', '!', '確認', counts.confirm, `${DRYING_DAYS}日以上・水分>${MOISTURE_TARGET}%`],
    ['empty', '○', '空き', counts.empty, '占有率0%'],
    ['unknown', '?', '不明', counts.unknown, counts.invalid ? `日付不正${counts.invalid}床を含む` : '現在データなし']
  ];
  document.getElementById('state-summary').innerHTML = items.map(([state, icon, label, value, note]) =>
    `<article class="state-count-card state-${state}"><span class="state-count-icon" aria-hidden="true">${icon}</span>` +
      `<div><span>${label}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></div></article>`
  ).join('');

  const occupancyKnown = beds.every((bed) => bed.occupancyPercent !== null && Number.isFinite(bed.occupancyPercent));
  const occupancy = occupancyKnown
    ? beds.reduce((sum, bed) => sum + bed.occupancyPercent, 0) / beds.length
    : null;
  document.getElementById('occupancy-value').textContent = occupancy === null ? '不明' : occupancy.toFixed(1);
  document.getElementById('occupancy-unit').textContent = occupancy === null ? '' : '%';
  document.getElementById('occupancy-note').textContent = occupancy === null
    ? '80床のいずれかに占有率不明あり'
    : `80床の単純平均 · 基準${OCCUPANCY_ALERT}%`;
  document.getElementById('occupancy-alert').hidden = occupancy === null || occupancy < OCCUPANCY_ALERT;
}

function updateModeUi() {
  const toggle = document.getElementById('mode-toggle');
  toggle.setAttribute('aria-pressed', String(appState.demo));
  document.getElementById('mode-toggle-state').textContent = appState.demo ? '現在：デモ表示' : '現在：実データ';
  document.getElementById('demo-band').hidden = !appState.demo;
}

function applyConfigCopy() {
  document.getElementById('intro-bed-count').textContent = BED_COUNT;
  document.getElementById('intro-drying-days').textContent = `${DRYING_DAYS}日`;
  document.getElementById('drying-period-copy').textContent = `${DRYING_DAYS}日固定`;
  document.getElementById('green-range-copy').textContent = `きみどり 0–${AGE_GREEN_MAX}日`;
  document.getElementById('orange-range-copy').textContent = `オレンジ ${AGE_GREEN_MAX + 1}–${AGE_ORANGE_MAX}日`;
  document.getElementById('red-range-copy').textContent = `赤 ${AGE_ORANGE_MAX + 1}日以上`;
  document.getElementById('capacity-value').textContent = BED_COUNT;
  document.getElementById('occupancy-label').textContent = `OCCUPANCY · ${BED_COUNT}床平均`;
  document.getElementById('legend-green-copy').textContent = `きみどり 0–${AGE_GREEN_MAX}日`;
  document.getElementById('legend-orange-copy').textContent = `オレンジ ${AGE_GREEN_MAX + 1}–${AGE_ORANGE_MAX}日`;
  document.getElementById('legend-red-copy').textContent = `赤 ${AGE_ORANGE_MAX + 1}日以上`;
  document.getElementById('legend-confirm-copy').textContent = `確認 ${DRYING_DAYS}日以上かつ水分>${MOISTURE_TARGET}%`;
  document.getElementById('footer-threshold-copy').textContent = `乾燥期間${DRYING_DAYS}日固定 · 色は経過日数の区分`;
  document.getElementById('occupancy-alert').querySelector('strong').textContent =
    `占有率${OCCUPANCY_ALERT}%以上：空きベッドが少なくなっています。Skin dryerの事前利用を検討`;
  document.getElementById('yard-map').setAttribute('aria-label', `Shah drying site schematic with ${BED_COUNT} beds`);
}

async function renderMode() {
  let current;
  if (appState.demo) current = demoAdapter(appState.todayIso);
  else if (CURRENT_STATUS_URL) current = await liveAdapter();
  else current = { beds: appState.snapshotBeds };

  appState.beds = current.beds;
  appState.bedById = new Map(current.beds.map((bed) => [bed.bed, bed]));
  updateModeUi();
  renderSummary(current.beds);
  buildMap(current.beds);
  if (appState.selectedBed) selectBed(appState.selectedBed, appState.history);

  const alert = document.getElementById('data-alert');
  const status = document.getElementById('data-alert-text');
  alert.className = 'data-alert';
  if (appState.demo) {
    alert.classList.add('data-alert-demo');
    status.textContent = `マップは${appState.todayIso.replaceAll('-', '/')}を基準にした架空データです。最近の乾燥記録と「過去記録」は実CSVを表示しています。`;
  } else if (CURRENT_STATUS_URL) {
    status.textContent = '公開されたShah現在状況CSVを表示中です。過去記録は読み取り専用スナップショットです。';
  } else if (appState.snapshotAvailable) {
    alert.classList.add('data-alert-warning');
    const date = appState.sourceInfo.snapshot_date || '不明';
    status.textContent = `Shahの読み取り専用CSV ${appState.records.length}行（スナップショット ${date}）を表示中。現在の投入日と占有率は元データにないため、80床の現在状態はすべて「不明」です。`;
  } else {
    alert.classList.add('data-alert-error');
    status.textContent = 'CSVの読み込みに失敗しました。マップの現在状態はすべて「不明」で表示しています。';
  }
}

function fallbackSnapshotBeds() {
  return Array.from({ length: BED_COUNT }, (_, index) => ({
    bed: index + 1,
    loadDate: null,
    loadDateRaw: '',
    occupancyPercent: null,
    moisturePercent: null,
    source: 'snapshot'
  }));
}

async function initialize() {
  applyConfigCopy();
  const params = new URLSearchParams(window.location.search);
  appState.demo = params.get('demo') === '1';
  document.getElementById('mode-toggle').addEventListener('click', async () => {
    appState.demo = !appState.demo;
    const nextParams = new URLSearchParams(window.location.search);
    if (appState.demo) nextParams.set('demo', '1');
    else nextParams.delete('demo');
    const query = nextParams.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    await renderMode();
  });

  try {
    const [snapshot, infoResponse] = await Promise.all([
      snapshotAdapter(),
      fetch('./data/source-info.json', { cache: 'no-store' })
    ]);
    if (!infoResponse.ok) throw new Error('Source info HTTP ' + infoResponse.status);
    appState.sourceInfo = await infoResponse.json();
    appState.snapshotBeds = snapshot.beds;
    appState.history = snapshot.history;
    appState.records = snapshot.records;
    appState.snapshotAvailable = true;
    document.getElementById('snapshot-date').textContent = `SNAPSHOT · ${appState.sourceInfo.snapshot_date || 'unknown'}`;
    renderRecords(snapshot.records);
  } catch (error) {
    console.error(error);
    appState.snapshotBeds = fallbackSnapshotBeds();
    appState.history = new Map();
    appState.records = [];
    document.getElementById('snapshot-date').textContent = 'CSVを取得できません';
    document.getElementById('recent-records').innerHTML = '<p class="empty-detail">実CSVの記録を読み込めません。</p>';
    document.getElementById('record-count').textContent = '0件';
    document.getElementById('data-alert').classList.add('data-alert-error');
    document.getElementById('data-alert-text').textContent = 'CSVの読み込みに失敗しました。ネットワークまたは公開CSVを確認してください。';
  }

  try {
    await renderMode();
  } catch (error) {
    console.error(error);
    appState.beds = appState.snapshotBeds;
    appState.bedById = new Map(appState.beds.map((bed) => [bed.bed, bed]));
    renderSummary(appState.beds);
    buildMap(appState.beds);
    document.getElementById('data-alert').className = 'data-alert data-alert-error';
    document.getElementById('data-alert-text').textContent = '現在状況データを読み込めません。実CSVの履歴だけを表示しています。';
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') initialize();
