import {
  AGE_GREEN_MAX,
  AGE_ORANGE_MAX,
  BED_COUNT,
  CURRENT_STATUS_URL,
  CURRENT_STATUS_SHEET_URL,
  DRYING_DAYS,
  MOISTURE_TARGET,
  OCCUPANCY_ALERT,
  TZ
} from './config.js';
import { liveAdapter, snapshotAdapter } from './adapters.js';
import { applyTranslations, getLanguage, isSupportedLanguage, setLanguage, t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const LANGUAGE_STORAGE_KEY = 'coffee-bed-dashboard-language';
const languages = ['en', 'sw', 'ja'];
const fields = [
  'source_row', 'harvest_date', 'grade', 'fermentation_date', 'tank_no',
  'dryer_date_in', 'table_numbers', 'no_of_debes', 'dryer_date_out',
  'moisture_percent', 'storage_lot', 'storage_date_in', 'storage_lot_no',
  'storage_lot_departure_date', 'occupancy_percent'
];

const appState = {
  beds: [],
  bedById: new Map(),
  history: new Map(),
  records: [],
  snapshotHistory: new Map(),
  snapshotRecords: [],
  live: false,
  liveWarnings: null,
  sourceInfo: {},
  snapshotBeds: [],
  mobileView: 'map',
  zoom: 2,
  todayIso: nairobiTodayIso(),
  selectedBed: null,
  snapshotAvailable: false,
  snapshotFailed: false,
  currentFailed: false,
  initialized: false
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
  return isoDate(value) || '—';
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

function stateMeta(state) {
  const metadata = {
    unknown: { label: t('state.unknown'), icon: '?', reason: t('reason.unknown') },
    empty: { label: t('state.empty'), icon: '○', reason: t('reason.empty') },
    invalid: { label: t('state.invalid'), icon: '!', reason: t('reason.invalid') },
    green: {
      label: t('state.green'), icon: 'G',
      reason: t('reason.green', { min: 0, max: AGE_GREEN_MAX })
    },
    orange: {
      label: t('state.orange'), icon: 'O',
      reason: t('reason.orange', { min: AGE_GREEN_MAX + 1, max: AGE_ORANGE_MAX })
    },
    red: {
      label: t('state.red'), icon: 'R',
      reason: t('reason.red', { min: AGE_ORANGE_MAX + 1 })
    }
  };
  return metadata[state];
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
  return { state, age, confirm, moistureReached, ...stateMeta(state) };
}

function displayPercent(value) {
  if (value === null || !Number.isFinite(value)) return t('value.unknown');
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function displayMoisture(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return t('value.moisture', {
    value: Number.isInteger(value) ? value : value.toFixed(1),
    target: MOISTURE_TARGET
  });
}

function loadDateText(bed) {
  if (bed.loadDate) return displayDate(bed.loadDate);
  if (bed.loadDateRaw) return t('value.invalid', { value: bed.loadDateRaw });
  return '—';
}

function statusText(result) {
  return result.confirm
    ? t('status.confirm', { icon: result.icon, label: result.label })
    : t('status.normal', { icon: result.icon, label: result.label });
}

function ariaLabelForBed(bed, result) {
  return t('bed.aria', {
    bed: bed.bed,
    state: result.label,
    date: loadDateText(bed),
    occupancy: displayPercent(bed.occupancyPercent),
    age: result.age === null ? '' : t('bed.ariaAge', { count: result.age }),
    confirm: result.confirm ? t('bed.ariaConfirm') : '',
    moisture: result.moistureReached ? t('bed.ariaMoisture') : ''
  });
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
  const facilities = svgElement('g', { class: 'facilities', 'aria-label': t('map.facilitiesAria') }, map);
  svgElement('polygon', { points: '720,57 783,69 774,128 708,113', class: 'landmark skin-roof' }, facilities);
  svgElement('polygon', { points: '720,57 751,63 743,120 708,113', class: 'skin-roof-blue' }, facilities);
  addText(facilities, t('facility.skinDryer'), 744, 48, 'landmark-label-outside');
  svgElement('polygon', { points: '595,174 689,183 680,242 586,232', class: 'landmark store-roof' }, facilities);
  addText(facilities, t('facility.store'), 637, 209, 'landmark-label');
  svgElement('circle', { cx: 583, cy: 342, r: 38, class: 'landmark landmark-dam' }, facilities);
  svgElement('circle', { cx: 583, cy: 342, r: 30, class: 'dam-waterline' }, facilities);
  addText(facilities, t('facility.dam'), 583, 342, 'landmark-label');
  svgElement('polygon', { points: '620,383 751,392 743,528 610,515', class: 'landmark factory-roof' }, facilities);
  svgElement('line', { x1: 630, y1: 420, x2: 743, y2: 428, class: 'roof-ridge' }, facilities);
  addText(facilities, t('facility.factory'), 681, 456, 'landmark-label');
  svgElement('polygon', { points: '772,235 823,238 817,542 765,535', class: 'long-roof' }, facilities);
  addText(facilities, t('map.longRoof'), 796, 391, 'long-roof-label', { transform: 'rotate(90 796 391)' });
  svgElement('polygon', { points: '526,397 576,399 574,444 523,441', class: 'landmark small-roof' }, facilities);
  svgElement('polygon', { points: '548,462 603,466 599,507 544,503', class: 'landmark small-roof' }, facilities);
  svgElement('polygon', { points: '511,470 542,472 540,510 508,507', class: 'landmark small-roof' }, facilities);
  addText(facilities, t('map.smallBuildings'), 548, 528, 'minor-label');
}

export function buildMap(beds) {
  const map = document.getElementById('yard-map');
  map.replaceChildren();
  addMapDefinitions(map);
  svgElement('rect', { x: 0, y: 0, width: 1000, height: 660, class: 'site-ground' }, map);
  svgElement('path', { d: 'M116 48 L704 39 L891 118 L933 548 L775 616 L205 594 L94 500 Z', class: 'site-boundary' }, map);
  svgElement('path', { d: 'M20 586 C148 540 236 533 335 548 C447 565 535 612 657 624 C774 635 874 604 976 551', class: 'site-road' }, map);
  svgElement('path', { d: 'M23 586 C151 543 239 537 334 551 C446 568 534 615 656 627 C773 638 875 607 976 554', class: 'site-road-edge' }, map);
  svgElement('path', { d: 'M111 49 L704 40 L890 118 L932 547 L775 615 L205 593 L95 499 Z', class: 'site-boundary-line' }, map);
  addText(map, t('map.north'), 74, 78, 'north-label');
  svgElement('path', { d: 'M74 92 L74 53 M74 53 L67 65 M74 53 L81 65', class: 'north-arrow' }, map);
  addText(map, t('map.zoneNorth'), 148, 67, 'zone-label');
  addText(map, t('map.zoneNortheast'), 548, 69, 'zone-label');
  addText(map, t('map.zoneWestUpper'), 145, 240, 'zone-label');
  addText(map, t('map.zoneWestLower'), 145, 350, 'zone-label');
  addText(map, t('map.zoneEast'), 847, 244, 'zone-label');
  addText(map, t('map.roadSouth'), 160, 630, 'road-label');
  drawFacility(map);
  const lookup = new Map(beds.map((bed) => [bed.bed, bed]));
  bedLayout().forEach((position) => drawBed(map, position, lookup.get(position.bed)));
  renderBedGrid(beds);
}

function drawBed(map, position, bed) {
  const result = classifyBed(bed);
  const centerX = position.x + position.width / 2;
  const centerY = position.y + position.height / 2;
  const transform = position.rotation ? `rotate(${position.rotation} ${centerX} ${centerY})` : '';
  const group = svgElement('g', {
    class: `bed-marker state-${result.state}${result.confirm ? ' state-confirm' : ''}`,
    transform, tabindex: 0, role: 'button', 'aria-label': ariaLabelForBed(bed, result), 'data-bed-group': bed.bed
  }, map);
  svgElement('rect', {
    x: position.x, y: position.y, width: position.width, height: position.height, rx: 2,
    class: `bed-cell state-${result.state}${result.confirm ? ' state-confirm' : ''}`, 'data-bed': bed.bed
  }, group);
  const horizontal = position.width > position.height;
  addText(group, String(bed.bed), centerX, horizontal ? centerY + 0.5 : centerY + 5, 'bed-number');
  addText(group, result.confirm ? '!' : result.icon,
    horizontal ? position.x + position.width - 8 : centerX,
    horizontal ? centerY + 0.5 : position.y + 10, 'bed-state-icon');
  if (result.moistureReached) {
    addText(group, '✓', horizontal ? position.x + 8 : centerX,
      horizontal ? centerY + 0.5 : position.y + position.height - 7, 'bed-moisture-icon');
  }
  group.addEventListener('pointerenter', (event) => showTooltip(bed, result, event));
  group.addEventListener('pointermove', positionTooltipAtPointer);
  group.addEventListener('pointerleave', () => { if (document.activeElement !== group) hideTooltip(); });
  group.addEventListener('focus', () => showTooltip(bed, result, null, group));
  group.addEventListener('blur', hideTooltip);
  group.addEventListener('click', (event) => {
    selectBed(bed.bed, appState.history);
    if (isMobileLayout()) openBedSheet(bed, result);
    else if (event.pointerType === 'touch') showTooltip(bed, result, event);
  });
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectBed(bed.bed, appState.history);
      if (isMobileLayout()) openBedSheet(bed, result);
    }
  });
}

function isMobileLayout() {
  return window.matchMedia('(max-width: 720px)').matches;
}

function renderBedGrid(beds) {
  const grid = document.getElementById('bed-grid');
  grid.replaceChildren();
  beds.forEach((bed) => {
    const result = classifyBed(bed);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `grid-bed state-${result.state}${result.confirm ? ' state-confirm' : ''}`;
    button.setAttribute('aria-label', ariaLabelForBed(bed, result));
    button.dataset.gridBed = String(bed.bed);
    const age = result.age === null ? '' : t('state.days', { count: result.age });
    button.innerHTML = `<strong>${bed.bed}</strong><span class="grid-bed-icon" aria-hidden="true">${escapeHtml(result.confirm ? '!' : result.icon)}</span>` +
      `<small>${escapeHtml(age || result.label)}</small>`;
    button.addEventListener('click', () => {
      selectBed(bed.bed, appState.history);
      openBedSheet(bed, result);
    });
    grid.appendChild(button);
  });
}

function openBedSheet(bed, result) {
  hideTooltip();
  const sheet = document.getElementById('bed-sheet');
  sheet.innerHTML = `<button type="button" class="bed-sheet-close" aria-label="${escapeHtml(t('sheet.close'))}">×</button>` +
    `<div class="bed-sheet-body">${tooltipHtml(bed, result)}</div>`;
  sheet.querySelector('.bed-sheet-close').addEventListener('click', closeBedSheet);
  sheet.dataset.state = result.state;
  sheet.hidden = false;
}

function closeBedSheet() {
  document.getElementById('bed-sheet').hidden = true;
}

function applyMobileView() {
  const map = appState.mobileView === 'map';
  const mobile = isMobileLayout();
  document.getElementById('map-frame').hidden = mobile && !map;
  document.getElementById('bed-grid').hidden = !mobile || map;
  document.getElementById('zoom-controls').hidden = !map;
  document.querySelectorAll('#view-switch button').forEach((button) => {
    button.setAttribute('aria-checked', String(button.dataset.view === appState.mobileView));
    button.tabIndex = button.dataset.view === appState.mobileView ? 0 : -1;
  });
  document.getElementById('map-frame').style.setProperty('--zoom', String(appState.zoom));
}

function setZoom(next) {
  const frame = document.getElementById('map-frame');
  const previous = appState.zoom;
  appState.zoom = Math.min(4, Math.max(1, next));
  const centerX = (frame.scrollLeft + frame.clientWidth / 2) / previous;
  const centerY = (frame.scrollTop + frame.clientHeight / 2) / previous;
  frame.style.setProperty('--zoom', String(appState.zoom));
  frame.scrollLeft = centerX * appState.zoom - frame.clientWidth / 2;
  frame.scrollTop = centerY * appState.zoom - frame.clientHeight / 2;
}

function setupMobileControls() {
  document.querySelectorAll('#view-switch button').forEach((button) => {
    button.addEventListener('click', () => {
      appState.mobileView = button.dataset.view;
      closeBedSheet();
      applyMobileView();
    });
  });
  document.getElementById('zoom-in').addEventListener('click', () => setZoom(appState.zoom + 0.75));
  document.getElementById('zoom-out').addEventListener('click', () => setZoom(appState.zoom - 0.75));
  window.matchMedia('(max-width: 720px)').addEventListener('change', () => { closeBedSheet(); applyMobileView(); });
  applyMobileView();
}

function tooltipHtml(bed, result) {
  const day14 = bed.loadDate ? addCalendarDays(bed.loadDate, DRYING_DAYS) : null;
  const badges = [];
  if (result.confirm) badges.push(`<span class="inline-status confirm">${escapeHtml(t('status.confirmNeeded'))}</span>`);
  if (result.moistureReached) badges.push(`<span class="inline-status reached">${escapeHtml(t('status.moistureReached'))}</span>`);
  return [
    `<strong class="tooltip-title">${escapeHtml(t('bed.name'))} ${bed.bed} · ${escapeHtml(result.label)}</strong>`,
    `<span class="tooltip-reason">${escapeHtml(result.reason)}</span>`,
    '<dl>',
    `<div><dt>${escapeHtml(t('detail.dateIn'))}</dt><dd>${escapeHtml(loadDateText(bed))}</dd></div>`,
    `<div><dt>${escapeHtml(t('detail.occupancy'))}</dt><dd>${escapeHtml(displayPercent(bed.occupancyPercent))}</dd></div>`,
    `<div><dt>${escapeHtml(t('detail.elapsed'))}</dt><dd>${result.age === null ? '—' : escapeHtml(t('state.days', { count: result.age }))}<small>${escapeHtml(t('detail.notDryness'))}</small></dd></div>`,
    `<div><dt>${escapeHtml(t('detail.day14'))}</dt><dd>${day14 ? escapeHtml(displayDate(day14)) : '—'}</dd></div>`,
    `<div><dt>${escapeHtml(t('detail.moisture'))}</dt><dd>${escapeHtml(displayMoisture(bed.moisturePercent))}</dd></div>`,
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
  if (!bed) return;
  const result = classifyBed(bed);
  const matches = (recordsByBed.get(id) || []).slice()
    .sort((left, right) => (isoDate(right.dryer_date_in) || '').localeCompare(isoDate(left.dryer_date_in) || ''));
  const day14 = bed.loadDate ? addCalendarDays(bed.loadDate, DRYING_DAYS) : null;
  const badge = document.getElementById('selected-badge');
  document.getElementById('selected-title').textContent = `${t('bed.name')} ${id}`;
  badge.textContent = statusText(result);
  badge.className = `state-badge state-${result.state}${result.confirm ? ' state-confirm' : ''}`;
  const currentFlags = [];
  if (result.confirm) currentFlags.push(`<span class="inline-status confirm">${escapeHtml(t('status.confirmDetail'))}</span>`);
  if (result.moistureReached) currentFlags.push(`<span class="inline-status reached">${escapeHtml(t('status.moistureReached'))}</span>`);
  const historyHtml = matches.length
    ? `<div class="history-list">${matches.slice(0, 5).map((record) =>
      '<div class="history-row">' +
        `<strong>${escapeHtml(displayDate(record.dryer_date_in))}</strong>` +
        `<span>${escapeHtml(t('history.out', { date: displayDate(record.dryer_date_out) }))}</span>` +
        `<span>${escapeHtml(t('history.moisture', { value: record.moisture_percent ? `${record.moisture_percent}%` : '—' }))}</span>` +
        `<span>${escapeHtml(t('history.lot', { value: record.storage_lot_no || record.storage_lot || '—' }))}</span>` +
      '</div>'
    ).join('')}</div><p class="records-note">${escapeHtml(t('detail.historyCount', { count: matches.length }))}</p>`
    : `<p class="empty-detail">${escapeHtml(t('detail.noHistory'))}</p>`;
  document.getElementById('selected-detail').innerHTML =
    '<section class="current-detail">' +
      `<h3>${escapeHtml(t('detail.current'))}</h3>` +
      `<p class="status-reason"><span aria-hidden="true">${escapeHtml(result.icon)}</span> ${escapeHtml(result.reason)}</p>` +
      '<dl class="detail-grid">' +
        `<div class="detail-item"><dt>${escapeHtml(t('detail.dateIn'))}</dt><dd>${escapeHtml(loadDateText(bed))}</dd></div>` +
        `<div class="detail-item"><dt>${escapeHtml(t('detail.occupancy'))}</dt><dd>${escapeHtml(displayPercent(bed.occupancyPercent))}</dd></div>` +
        `<div class="detail-item"><dt>${escapeHtml(t('detail.elapsed'))}</dt><dd>${result.age === null ? '—' : escapeHtml(t('state.days', { count: result.age }))}<small>${escapeHtml(t('detail.notDrynessShort'))}</small></dd></div>` +
        `<div class="detail-item"><dt>${escapeHtml(t('detail.day14'))}</dt><dd>${day14 ? escapeHtml(displayDate(day14)) : '—'}</dd></div>` +
        `<div class="detail-item detail-wide"><dt>${escapeHtml(t('detail.moisture'))}</dt><dd>${escapeHtml(displayMoisture(bed.moisturePercent))}</dd></div>` +
      '</dl>' +
      (currentFlags.length ? `<div class="detail-flags">${currentFlags.join('')}</div>` : '') +
    '</section>' +
    '<section class="history-section">' +
      `<h3>${escapeHtml(t('detail.history'))}</h3>${historyHtml}` +
    '</section>';
}

export function renderRecords(records) {
  const container = document.getElementById('recent-records');
  document.getElementById('record-count').textContent = t('history.count', { count: records.length });
  if (appState.snapshotFailed) {
    container.innerHTML = `<p class="empty-detail">${escapeHtml(t('data.historyFailed'))}</p>`;
    return;
  }
  const dated = records.filter((record) => isoDate(record.dryer_date_in))
    .sort((left, right) => isoDate(right.dryer_date_in).localeCompare(isoDate(left.dryer_date_in)));
  if (!dated.length) {
    container.innerHTML = `<p class="empty-detail">${escapeHtml(t('history.noDated'))}</p>`;
    return;
  }
  container.innerHTML =
    `<div class="record-row header"><span>${escapeHtml(t('history.headerIn'))}</span><span>${escapeHtml(t('history.headerBed'))}</span><span>${escapeHtml(t('history.headerLot'))}</span><span>${escapeHtml(t('history.headerMoisture'))}</span></div>` +
    dated.slice(0, 8).map((record) =>
      '<div class="record-row">' +
        `<strong>${escapeHtml(displayDate(record.dryer_date_in))}</strong>` +
        `<span>${escapeHtml(record.table_numbers || '—')}</span>` +
        `<span>${escapeHtml(record.storage_lot_no || record.storage_lot || '—')}</span>` +
        `<span>${escapeHtml(record.moisture_percent ? `${record.moisture_percent}%` : '—')}</span>` +
      '</div>'
    ).join('') +
    `<p class="records-note">${escapeHtml(t('history.note'))}</p>`;
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
    ['green', 'G', t('state.greenShort'), counts.green, t('state.days', { count: `0–${AGE_GREEN_MAX}` })],
    ['orange', 'O', t('state.orangeShort'), counts.orange, t('state.days', { count: `${AGE_GREEN_MAX + 1}–${AGE_ORANGE_MAX}` })],
    ['red', 'R', t('state.redShort'), counts.red, t('state.daysPlus', { count: AGE_ORANGE_MAX + 1 })],
    ['confirm', '!', t('state.confirmShort'), counts.confirm, t('state.confirmRule', { days: DRYING_DAYS, target: MOISTURE_TARGET })],
    ['empty', '○', t('state.emptyShort'), counts.empty, t('state.emptyRule')],
    ['unknown', '?', t('state.unknownShort'), counts.unknown,
      counts.invalid ? t('state.includesInvalid', { count: counts.invalid }) : t('state.noCurrent')]
  ];
  document.getElementById('state-summary').innerHTML = items.map(([state, icon, label, value, note]) =>
    `<article class="state-count-card state-${state}"><span class="state-count-icon" aria-hidden="true">${icon}</span>` +
      `<div><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></div></article>`
  ).join('');
  const occupancyKnown = beds.every((bed) => bed.occupancyPercent !== null && Number.isFinite(bed.occupancyPercent));
  const occupancy = occupancyKnown ? beds.reduce((sum, bed) => sum + bed.occupancyPercent, 0) / beds.length : null;
  document.getElementById('occupancy-label').textContent = t('summary.occupancy', { count: BED_COUNT });
  document.getElementById('occupancy-value').textContent = occupancy === null ? t('value.unknown') : occupancy.toFixed(1);
  document.getElementById('occupancy-unit').textContent = occupancy === null ? '' : '%';
  document.getElementById('occupancy-note').textContent = occupancy === null
    ? t('summary.occupancyUnknown', { count: BED_COUNT })
    : t('summary.occupancyKnown', { count: BED_COUNT, threshold: OCCUPANCY_ALERT });
  document.getElementById('occupancy-alert').hidden = occupancy === null || occupancy < OCCUPANCY_ALERT;
}

function applyConfigCopy() {
  document.getElementById('capacity-value').textContent = BED_COUNT;
  document.getElementById('legend-green-copy').textContent = t('legend.green', { greenMax: AGE_GREEN_MAX });
  document.getElementById('legend-orange-copy').textContent = t('legend.orange', { orangeMin: AGE_GREEN_MAX + 1, orangeMax: AGE_ORANGE_MAX });
  document.getElementById('legend-red-copy').textContent = t('legend.red', { redMin: AGE_ORANGE_MAX + 1 });
  document.getElementById('legend-confirm-copy').textContent = t('legend.confirm', { dryingDays: DRYING_DAYS, target: MOISTURE_TARGET });
  document.getElementById('footer-threshold-copy').textContent = t('footer.threshold', { days: DRYING_DAYS });
  document.getElementById('occupancy-alert-text').textContent = t('occupancy.alert', { threshold: OCCUPANCY_ALERT });
  document.getElementById('yard-map').setAttribute('aria-label', t('map.aria', { count: BED_COUNT }));
}

function updateSnapshotUi() {
  const snapshot = document.getElementById('snapshot-date');
  if (appState.live) snapshot.textContent = t('snapshot.live');
  else if (appState.snapshotFailed) snapshot.textContent = t('snapshot.failed');
  else if (appState.snapshotAvailable) {
    snapshot.textContent = t('snapshot.label', { date: appState.sourceInfo.snapshot_date || t('snapshot.unknown') });
  } else snapshot.textContent = t('loading.csv');
}

function renderDataAlert() {
  const alert = document.getElementById('data-alert');
  const status = document.getElementById('data-alert-text');
  alert.className = 'data-alert';
  if (appState.currentFailed) {
    alert.classList.add('data-alert-error');
    status.textContent = t('data.currentFailed');
  } else if (appState.live) {
    const warnings = appState.liveWarnings || { unparsedOpenRows: 0, outOfRangeTables: [] };
    const notes = [t('data.live')];
    if (warnings.unparsedOpenRows) notes.push(t('data.liveUnparsed', { count: warnings.unparsedOpenRows }));
    if (warnings.outOfRangeTables.length) notes.push(t('data.liveOutOfRange', { tables: warnings.outOfRangeTables.join(', '), beds: BED_COUNT }));
    if (warnings.unparsedOpenRows || warnings.outOfRangeTables.length) alert.classList.add('data-alert-warning');
    status.textContent = notes.join(' ');
  } else if (appState.snapshotAvailable) {
    alert.classList.add('data-alert-warning');
    status.textContent = t('data.snapshot', {
      count: appState.records.length,
      date: appState.sourceInfo.snapshot_date || t('value.unknown'),
      beds: BED_COUNT
    });
  } else {
    alert.classList.add('data-alert-error');
    status.textContent = t('data.snapshotFailed');
  }
}

function updateSourceLinks() {
  const href = appState.live ? CURRENT_STATUS_SHEET_URL : './data/shah-drying-records.csv';
  document.querySelectorAll('.source-link, .text-link').forEach((link) => {
    link.href = href;
    if (appState.live) { link.target = '_blank'; link.rel = 'noopener'; }
    else { link.removeAttribute('target'); link.removeAttribute('rel'); }
    const label = link.querySelector('[data-i18n]');
    if (label) {
      label.dataset.i18n = link.classList.contains('source-link')
        ? (appState.live ? 'source.openSheet' : 'source.open')
        : (appState.live ? 'history.openSheet' : 'history.openAll');
      label.textContent = t(label.dataset.i18n);
    }
  });
}

async function renderMode() {
  let current;
  appState.currentFailed = false;
  appState.live = false;
  appState.liveWarnings = null;
  appState.history = appState.snapshotHistory;
  appState.records = appState.snapshotRecords;
  if (CURRENT_STATUS_URL) {
    current = await liveAdapter();
    appState.live = true;
    appState.liveWarnings = current.warnings;
    appState.history = current.history;
    appState.records = current.records;
  } else current = { beds: appState.snapshotBeds };
  appState.beds = current.beds;
  appState.bedById = new Map(current.beds.map((bed) => [bed.bed, bed]));
  updateSnapshotUi();
  updateSourceLinks();
  renderRecords(appState.records);
  renderSummary(current.beds);
  buildMap(current.beds);
  if (appState.selectedBed) selectBed(appState.selectedBed, appState.history);
  renderDataAlert();
}

function rerenderLanguage() {
  applyTranslations();
  applyConfigCopy();
  updateSnapshotUi();
  renderRecords(appState.records);
  if (appState.beds.length) {
    renderSummary(appState.beds);
    buildMap(appState.beds);
    if (appState.selectedBed) selectBed(appState.selectedBed, appState.history);
  }
  renderDataAlert();
}

function fallbackSnapshotBeds() {
  return Array.from({ length: BED_COUNT }, (_, index) => ({
    bed: index + 1, loadDate: null, loadDateRaw: '', occupancyPercent: null,
    moisturePercent: null, source: 'snapshot'
  }));
}

function resolveInitialLanguage() {
  const queryLanguage = new URLSearchParams(window.location.search).get('lang');
  if (isSupportedLanguage(queryLanguage)) return queryLanguage;
  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(storedLanguage)) return storedLanguage;
  } catch (error) {
    console.warn('Language preference is unavailable.', error);
  }
  return 'en';
}

function updateLanguageSwitcher(language, focus = false) {
  const switcher = document.getElementById('language-switcher');
  switcher.dataset.current = language;
  switcher.querySelectorAll('[role="radio"]').forEach((button) => {
    const selected = button.dataset.lang === language;
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
}

function chooseLanguage(language, { updateUrl = true, focus = false } = {}) {
  if (!isSupportedLanguage(language)) return;
  setLanguage(language);
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch (error) {
    console.warn('Language preference could not be saved.', error);
  }
  if (updateUrl) {
    const params = new URLSearchParams(window.location.search);
    params.set('lang', language);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
  updateLanguageSwitcher(language, focus);
  rerenderLanguage();
}

function setupLanguageSwitcher() {
  const switcher = document.getElementById('language-switcher');
  switcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lang]');
    if (button) chooseLanguage(button.dataset.lang);
  });
  switcher.addEventListener('keydown', (event) => {
    const currentIndex = languages.indexOf(getLanguage());
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % languages.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + languages.length) % languages.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = languages.length - 1;
    else return;
    event.preventDefault();
    chooseLanguage(languages[nextIndex], { focus: true });
  });
}

async function initialize() {
  setLanguage(resolveInitialLanguage());
  updateLanguageSwitcher(getLanguage());
  applyTranslations();
  applyConfigCopy();
  setupLanguageSwitcher();
  setupMobileControls();

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
    appState.snapshotHistory = snapshot.history;
    appState.snapshotRecords = snapshot.records;
    appState.snapshotAvailable = true;
  } catch (error) {
    console.error(error);
    appState.snapshotFailed = true;
    appState.snapshotBeds = fallbackSnapshotBeds();
    appState.history = new Map();
    appState.records = [];
  }
  updateSnapshotUi();
  renderRecords(appState.records);
  try {
    await renderMode();
  } catch (error) {
    console.error(error);
    appState.currentFailed = true;
    appState.beds = appState.snapshotBeds;
    appState.bedById = new Map(appState.beds.map((bed) => [bed.bed, bed]));
    renderSummary(appState.beds);
    buildMap(appState.beds);
    renderDataAlert();
  }
  appState.initialized = true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') initialize();
