import {
  AGE_GREEN_MAX,
  AGE_ORANGE_MAX,
  DEFAULT_SITE,
  DRYING_DAYS,
  MOISTURE_TARGET,
  OCCUPANCY_ALERT,
  SITES,
  TZ
} from './config.js';
import { emptyBeds, liveAdapter, snapshotAdapter } from './adapters.js';
import { applyTranslations, getLanguage, isSupportedLanguage, setLanguage, t } from './i18n.js';
import { SITE_MAPS, addText, svgElement } from './maps.js';

export { addText, svgElement };

const LANGUAGE_STORAGE_KEY = 'coffee-bed-dashboard-language';
const SITE_STORAGE_KEY = 'coffee-bed-dashboard-site';
const languages = ['en', 'sw', 'ja'];
const fields = [
  'source_row', 'harvest_date', 'grade', 'fermentation_date', 'tank_no',
  'dryer_date_in', 'table_numbers', 'no_of_debes', 'dryer_date_out',
  'moisture_percent', 'storage_lot', 'storage_date_in', 'storage_lot_no',
  'storage_lot_departure_date', 'occupancy_percent'
];
const RAIL_MAX_GROUPS = 10;
const RAIL_MIN_GROUPS = 1;

const appState = {
  site: SITES[0],
  // Per site: { status: 'loading' | 'ready', beds, history, records, live, warnings, liveFailed, snapshotAvailable, sourceInfo }
  sites: new Map(),
  beds: [],
  bedById: new Map(),
  history: new Map(),
  records: [],
  mobileView: 'map',
  zoom: 2,
  todayIso: nairobiTodayIso(),
  selectedBed: null,
  panHintSeen: false,
  railExpanded: false
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

export function bedIds(value, bedCount = appState.site.bedCount) {
  const source = (value || '').trim();
  if (!/^\d+(?:\s*[,;&]\s*\d+)*$/.test(source)) return [];
  return source.split(/[,;&]/).map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number >= 1 && number <= bedCount);
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

function siteName(site = appState.site) {
  return t(`site.${site.id}`);
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
  if (bed.inUse === false) return bedResult(bed, 'empty', null);
  const hasAnyCurrentData = bed.inUse !== null || bed.loadDate !== null || bed.loadDateRaw || bed.moisturePercent !== null;
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

function inUseText(inUse) {
  if (inUse === null) return t('value.unknown');
  return inUse ? t('value.inUse') : t('value.notInUse');
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

// Date Out: still on the bed (planned day-14 date) or, for an empty bed, when it was last cleared.
function dateOutText(bed) {
  if (bed.inUse) {
    const planned = bed.loadDate ? addCalendarDays(bed.loadDate, DRYING_DAYS) : null;
    return planned ? t('value.notOutPlanned', { date: planned }) : t('value.notOut');
  }
  if (bed.inUse === false && bed.lastDateOut) {
    const ago = elapsedDays(bed.lastDateOut);
    return t('value.lastOut', { date: bed.lastDateOut, count: ago === null ? '—' : ago });
  }
  if (bed.inUse === false) return t('value.noOutRecord');
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
    inUse: inUseText(bed.inUse),
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
  const gravel = svgElement('pattern', { id: 'gravel-dots', width: 7, height: 7, patternUnits: 'userSpaceOnUse' }, defs);
  svgElement('rect', { width: 7, height: 7, fill: '#8f9284' }, gravel);
  svgElement('circle', { cx: 2, cy: 2, r: 1.2, fill: '#c9cabd' }, gravel);
  svgElement('circle', { cx: 5.5, cy: 5, r: 1, fill: '#5f6457' }, gravel);
}

export function bedLayout(site = appState.site) {
  const layout = SITE_MAPS[site.id].layout();
  if (layout.length !== site.bedCount) throw new Error(`Map layout has ${layout.length} beds, expected ${site.bedCount}`);
  return layout;
}

export function buildMap(beds) {
  const site = appState.site;
  const definition = SITE_MAPS[site.id];
  const map = document.getElementById('yard-map');
  const [x, y, width, height] = definition.viewBox;
  map.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  map.setAttribute('aria-label', t('map.aria', { site: siteName(), count: site.bedCount }));
  map.style.aspectRatio = `${width} / ${height}`;
  const hero = document.getElementById('hero');
  hero.style.setProperty('--map-ratio', String(width / height));
  hero.dataset.shape = width >= height ? 'landscape' : 'portrait';
  map.dataset.site = site.id;
  map.replaceChildren();
  addMapDefinitions(map);
  definition.draw(map, t);
  const lookup = new Map(beds.map((bed) => [bed.bed, bed]));
  const bedLayer = svgElement('g', { class: 'bed-layer' }, map);
  bedLayout().forEach((position) => drawBed(bedLayer, position, lookup.get(position.bed)));
  renderBedGrid(beds);
  if (appState.selectedBed) markSelected(appState.selectedBed);
}

function drawBed(map, position, bed) {
  const result = classifyBed(bed);
  const centerX = position.x + position.width / 2;
  const centerY = position.y + position.height / 2;
  const transform = position.rotation ? `rotate(${position.rotation} ${centerX} ${centerY})` : '';
  const extraClass = (position.inferred ? ' bed-inferred' : '') + (position.unlocated ? ' bed-unlocated' : '');
  const group = svgElement('g', {
    class: `bed-marker state-${result.state}${result.confirm ? ' state-confirm' : ''}${extraClass}`,
    transform, tabindex: 0, role: 'button', 'aria-label': ariaLabelForBed(bed, result), 'data-bed-group': bed.bed
  }, map);
  svgElement('rect', {
    x: position.x, y: position.y, width: position.width, height: position.height, rx: 2,
    class: `bed-cell state-${result.state}${result.confirm ? ' state-confirm' : ''}`, 'data-bed': bed.bed
  }, group);
  // A bed under tree canopy in the photo keeps its colour under a translucent canopy tint.
  if (position.inferred) {
    svgElement('rect', { x: position.x, y: position.y, width: position.width, height: position.height, rx: 2, class: 'bed-canopy-tint' }, group);
  }
  const horizontal = position.width > position.height;
  // State letters only where the bed is big enough to hold them; colour carries the state elsewhere.
  const long = Math.max(position.width, position.height) >= 60 && Math.min(position.width, position.height) >= 12;
  const narrow = !horizontal && position.width < 16;
  const labelY = horizontal ? centerY : centerY + (long ? 5 : 0);
  const fontSize = Math.min(9, Math.max(7, Math.min(position.width, position.height) * 0.85));
  const pillWidth = String(bed.bed).length * fontSize * 0.6 + 3;
  svgElement('rect', {
    x: centerX - pillWidth / 2, y: labelY - fontSize / 2 - 0.5, width: pillWidth, height: fontSize + 1, rx: 1.5,
    class: `bed-label-bg state-${result.state}`
  }, group);
  addText(group, String(bed.bed), centerX, labelY + 0.5, 'bed-number', { style: `font-size:${fontSize}px` });
  if (long) {
    addText(group, result.confirm ? '!' : result.icon,
      horizontal ? position.x + position.width - 8 : centerX,
      horizontal ? centerY + 0.5 : position.y + 10, 'bed-state-icon');
  }
  if (result.moistureReached && long) {
    addText(group, '✓', horizontal ? position.x + 8 : centerX,
      horizontal ? centerY + 0.5 : position.y + position.height - 7, 'bed-moisture-icon');
  }
  group.addEventListener('pointerenter', (event) => showTooltip(bed, result, event));
  group.addEventListener('pointermove', positionTooltipAtPointer);
  group.addEventListener('pointerleave', () => { if (document.activeElement !== group) hideTooltip(); });
  group.addEventListener('focus', () => showTooltip(bed, result, null, group));
  group.addEventListener('blur', hideTooltip);
  group.addEventListener('click', (event) => {
    selectBed(bed.bed);
    if (isMobileLayout()) openBedSheet(bed, result);
    else if (event.pointerType === 'touch') showTooltip(bed, result, event);
  });
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectBed(bed.bed);
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
      selectBed(bed.bed);
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
  document.getElementById('pan-hint').hidden = !mobile || !map || appState.zoom <= 1 || appState.panHintSeen;
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
  ['pointerdown', 'wheel'].forEach((type) => document.getElementById('map-frame').addEventListener(type, () => {
    if (appState.panHintSeen) return;
    appState.panHintSeen = true;
    document.getElementById('pan-hint').hidden = true;
  }, { passive: true }));
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitRail, 150);
  });
  applyMobileView();
}

function tooltipHtml(bed, result) {
  const badges = [];
  if (result.confirm) badges.push(`<span class="inline-status confirm">${escapeHtml(t('status.confirmNeeded'))}</span>`);
  if (result.moistureReached) badges.push(`<span class="inline-status reached">${escapeHtml(t('status.moistureReached'))}</span>`);
  return [
    `<strong class="tooltip-title">${escapeHtml(t('bed.name'))} ${bed.bed} · ${escapeHtml(result.label)}</strong>`,
    `<span class="tooltip-reason">${escapeHtml(result.reason)}</span>`,
    '<dl>',
    `<div><dt>${escapeHtml(t('detail.dateIn'))}</dt><dd>${escapeHtml(loadDateText(bed))}</dd></div>`,
    `<div><dt>${escapeHtml(t('detail.dateOut'))}</dt><dd>${escapeHtml(dateOutText(bed))}</dd></div>`,
    `<div><dt>${escapeHtml(t('detail.elapsed'))}</dt><dd>${result.age === null ? '—' : escapeHtml(t('state.days', { count: result.age }))}<small>${escapeHtml(t('detail.notDryness'))}</small></dd></div>`,
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

function markSelected(id) {
  const map = document.getElementById('yard-map');
  map.querySelectorAll('.bed-cell.selected').forEach((cell) => cell.classList.remove('selected'));
  const cell = map.querySelector(`[data-bed="${id}"]`);
  if (cell) cell.classList.add('selected');
}

export function selectBed(id, recordsByBed = appState.history) {
  markSelected(id);
  appState.selectedBed = id;
  const bed = appState.bedById.get(id);
  if (!bed) return;
  const result = classifyBed(bed);
  const matches = (recordsByBed.get(id) || []).slice()
    .sort((left, right) => (isoDate(right.dryer_date_in) || '').localeCompare(isoDate(left.dryer_date_in) || ''));
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
        `<div class="detail-item"><dt>${escapeHtml(t('detail.dateOut'))}</dt><dd>${escapeHtml(dateOutText(bed))}</dd></div>` +
        `<div class="detail-item"><dt>${escapeHtml(t('detail.elapsed'))}</dt><dd>${result.age === null ? '—' : escapeHtml(t('state.days', { count: result.age }))}<small>${escapeHtml(t('detail.notDrynessShort'))}</small></dd></div>` +
        `<div class="detail-item"><dt>${escapeHtml(t('detail.inUse'))}</dt><dd>${escapeHtml(inUseText(bed.inUse))}</dd></div>` +
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
  const data = currentData();
  document.getElementById('record-count').textContent = t('history.count', { count: records.length });
  if (data.status === 'loading') {
    container.innerHTML = `<p class="empty-detail">${escapeHtml(t('history.loading'))}</p>`;
    return;
  }
  if (!data.live && !data.snapshotAvailable) {
    container.innerHTML = `<p class="empty-detail">${escapeHtml(t('data.historyFailed'))}</p>`;
    return;
  }
  // A Date In after today is a typo (often day and month swapped), so it is counted but not listed.
  const withDate = records.filter((record) => isoDate(record.dryer_date_in));
  const dated = withDate.filter((record) => isoDate(record.dryer_date_in) <= appState.todayIso)
    .sort((left, right) => isoDate(right.dryer_date_in).localeCompare(isoDate(left.dryer_date_in)));
  const future = withDate.length - dated.length;
  if (!dated.length) {
    container.innerHTML = `<p class="empty-detail">${escapeHtml(t('history.noDated'))}</p>`;
    return;
  }
  container.innerHTML =
    `<div class="record-row header"><span>${escapeHtml(t('history.headerIn'))}</span><span>${escapeHtml(t('history.headerOut'))}</span><span>${escapeHtml(t('history.headerBed'))}</span><span>${escapeHtml(t('history.headerLot'))}</span><span>${escapeHtml(t('history.headerMoisture'))}</span></div>` +
    dated.slice(0, 8).map((record) =>
      '<div class="record-row">' +
        `<strong>${escapeHtml(displayDate(record.dryer_date_in))}</strong>` +
        `<span>${escapeHtml(displayDate(record.dryer_date_out))}</span>` +
        `<span>${escapeHtml(record.table_numbers || '—')}</span>` +
        `<span>${escapeHtml(record.storage_lot_no || record.storage_lot || '—')}</span>` +
        `<span>${escapeHtml(record.moisture_percent ? `${record.moisture_percent}%` : '—')}</span>` +
      '</div>'
    ).join('') +
    `<p class="records-note">${escapeHtml(t('history.note'))}${future ? ` ${escapeHtml(t('history.futureHidden', { count: future }))}` : ''}</p>`;
}

function stateCounts(beds) {
  const results = beds.map((bed) => classifyBed(bed));
  return {
    green: results.filter((result) => result.state === 'green').length,
    orange: results.filter((result) => result.state === 'orange').length,
    red: results.filter((result) => result.state === 'red').length,
    confirm: results.filter((result) => result.confirm).length,
    empty: results.filter((result) => result.state === 'empty').length,
    unknown: results.filter((result) => result.state === 'unknown').length,
    invalid: results.filter((result) => result.state === 'invalid').length
  };
}

function inUseCount(beds) {
  return beds.length && beds.every((bed) => bed.inUse !== null) ? beds.filter((bed) => bed.inUse).length : null;
}

function bedChips(numbers, limit = 8) {
  const shown = numbers.slice(0, limit).map((number) =>
    `<button type="button" class="bed-chip" data-select-bed="${number}">${number}</button>`).join('');
  const more = numbers.length > limit ? `<span class="bed-chip-more">${escapeHtml(t('rail.more', { count: numbers.length - limit }))}</span>` : '';
  return shown + more;
}

// In-use beds grouped by Date In, oldest first, with the planned Date Out (Date In + drying days).
function dueGroups(beds) {
  const groups = new Map();
  beds.filter((bed) => bed.inUse && bed.loadDate).forEach((bed) => {
    if (!groups.has(bed.loadDate)) groups.set(bed.loadDate, []);
    groups.get(bed.loadDate).push(bed.bed);
  });
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([dateIn, numbers]) => ({ dateIn, numbers, plannedOut: addCalendarDays(dateIn, DRYING_DAYS), age: elapsedDays(dateIn) }));
}

// Tables cleared per Date Out, newest first. Future dates are typos and are left out.
function outGroups(records) {
  const groups = new Map();
  records.forEach((record) => {
    const dateOut = isoDate(record.dryer_date_out);
    if (!dateOut || dateOut > appState.todayIso) return;
    if (!groups.has(dateOut)) groups.set(dateOut, new Set());
    const numbers = bedIds(record.table_numbers);
    if (numbers.length) numbers.forEach((number) => groups.get(dateOut).add(number));
  });
  return [...groups.entries()].filter(([, numbers]) => numbers.size)
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dateOut, numbers]) => ({ dateOut, numbers: [...numbers].sort((a, b) => a - b), ago: elapsedDays(dateOut) }));
}

function dueLabel(group) {
  if (group.age === null || group.age < 0) return { text: '—', tone: 'invalid' };
  const left = DRYING_DAYS - group.age;
  // Red only once the planned Date Out is reached; orange for the last two days before it.
  if (left > 2) return { text: t('rail.daysLeft', { count: left }), tone: 'neutral' };
  if (left > 0) return { text: t('rail.daysLeft', { count: left }), tone: 'orange' };
  if (left === 0) return { text: t('rail.dueToday'), tone: 'red' };
  return { text: t('rail.daysOver', { count: -left }), tone: 'red' };
}

function shortDate(iso) {
  return iso ? iso.slice(5) : '—';
}

// In-use beds that have reached their planned Date Out (Date In + drying days) or gone past it.
function pastPlannedOut(beds) {
  return beds.filter((bed) => bed.inUse && bed.loadDate && (elapsedDays(bed.loadDate) ?? -1) >= DRYING_DAYS).length;
}

function renderRail(beds, records, limit = RAIL_MAX_GROUPS) {
  const site = appState.site;
  const data = currentData();
  const counts = stateCounts(beds);
  const used = inUseCount(beds);
  const percent = used === null ? null : Math.round((used / site.bedCount) * 100);
  const segments = [['green', counts.green], ['orange', counts.orange], ['red', counts.red], ['invalid', counts.invalid], ['empty', counts.empty], ['unknown', counts.unknown]]
    .filter(([, value]) => value > 0)
    .map(([state, value]) => `<span class="state-bar-seg state-${state}" style="flex-grow:${value}" title="${escapeHtml(stateMeta(state).label)} ${value}"></span>`).join('');
  const stateRows = [
    ['green', 'G', t('state.greenShort'), counts.green, t('state.days', { count: `0–${AGE_GREEN_MAX}` })],
    ['orange', 'O', t('state.orangeShort'), counts.orange, t('state.days', { count: `${AGE_GREEN_MAX + 1}–${AGE_ORANGE_MAX}` })],
    ['red', 'R', t('state.redShort'), counts.red, t('state.daysPlus', { count: AGE_ORANGE_MAX + 1 })],
    ['confirm', '!', t('state.confirmShort'), counts.confirm, t('state.confirmRule', { days: DRYING_DAYS, target: MOISTURE_TARGET })],
    ['empty', '○', t('state.emptyShort'), counts.empty, t('state.emptyRule')],
    ['unknown', '?', t('state.unknownShort'), counts.unknown + counts.invalid,
      counts.invalid ? t('state.includesInvalid', { count: counts.invalid }) : t('state.noCurrent')]
  ];

  let dueHtml;
  if (data.status === 'loading') dueHtml = `<p class="rail-empty">${escapeHtml(t('rail.loading'))}</p>`;
  else if (used === null) dueHtml = `<p class="rail-empty">${escapeHtml(t('rail.dueUnknown'))}</p>`;
  else {
    const groups = dueGroups(beds);
    const shown = appState.railExpanded ? groups.length : limit;
    const over = pastPlannedOut(beds);
    dueHtml = groups.length
      ? `<p class="rail-total${over ? ' is-over' : ''}">${escapeHtml(t('rail.dueTotal', { over, count: used, days: DRYING_DAYS }))}</p>` +
        `<ol class="event-list">${groups.slice(0, shown).map((group) => {
        const label = dueLabel(group);
        return `<li class="event-item"><div class="event-dates" title="${escapeHtml(`${group.dateIn} → ${group.plannedOut || '—'}`)}">` +
          `<span>${escapeHtml(t('rail.in', { date: shortDate(group.dateIn) }))}</span><span class="event-arrow" aria-hidden="true">→</span>` +
          `<strong>${escapeHtml(t('rail.out', { date: shortDate(group.plannedOut) }))}</strong></div>` +
          `<span class="event-tag tone-${label.tone}">${escapeHtml(label.text)}</span>` +
          `<div class="event-beds">${bedChips(group.numbers)}</div></li>`;
      }).join('')}</ol>` +
        (groups.length > shown || appState.railExpanded
          ? `<button type="button" class="rail-more" data-rail-toggle>${escapeHtml(appState.railExpanded ? t('rail.showFewer') : t('rail.showAll', { count: groups.length }))}</button>` : '')
      : `<p class="rail-empty">${escapeHtml(t('rail.dueEmpty'))}</p>`;
  }

  let outHtml;
  if (data.status === 'loading') outHtml = `<p class="rail-empty">${escapeHtml(t('rail.loading'))}</p>`;
  else {
    const groups = outGroups(records);
    outHtml = groups.length
      ? `<ol class="event-list">${groups.slice(0, appState.railExpanded ? RAIL_MAX_GROUPS : limit).map((group) =>
        `<li class="event-item"><div class="event-dates" title="${escapeHtml(group.dateOut)}"><strong>${escapeHtml(t('rail.out', { date: shortDate(group.dateOut) }))}</strong></div>` +
          `<span class="event-tag tone-out">${escapeHtml(group.ago === 0 ? t('rail.today') : t('rail.daysAgo', { count: group.ago }))}</span>` +
          `<div class="event-beds">${bedChips(group.numbers)}</div></li>`).join('')}</ol>`
      : `<p class="rail-empty">${escapeHtml(t('rail.outEmpty'))}</p>`;
  }

  document.getElementById('hero-rail').innerHTML =
    '<section class="rail-block rail-occupancy">' +
      `<span class="rail-label">${escapeHtml(t('summary.inUse'))}</span>` +
      `<div class="rail-big"><strong>${used === null ? escapeHtml(t('value.unknown')) : used}</strong>` +
        (used === null ? '' : `<span>/ ${site.bedCount}</span><em>${percent}%</em>`) + '</div>' +
      `<div class="state-bar" aria-hidden="true">${segments}</div>` +
      `<p class="rail-note">${escapeHtml(used === null ? t('summary.inUseUnknown') : t('summary.inUseKnown', { free: counts.empty, threshold: OCCUPANCY_ALERT }))}</p>` +
      `<ul class="state-list" aria-label="${escapeHtml(t('stateSummary.aria'))}">${stateRows.map(([state, icon, label, value, note]) =>
        `<li class="state-row state-${state}${value ? '' : ' is-zero'}"><span class="state-row-icon" aria-hidden="true">${icon}</span>` +
          `<span class="state-row-label">${escapeHtml(label)}<small>${escapeHtml(note)}</small></span><strong>${value}</strong></li>`).join('')}</ul>` +
    '</section>' +
    '<section class="rail-block">' +
      `<h3 class="rail-heading"><span>${escapeHtml(t('rail.dueTitle'))}</span><small>${escapeHtml(t('rail.dueRule', { days: DRYING_DAYS }))}</small></h3>${dueHtml}` +
    '</section>' +
    '<section class="rail-block">' +
      `<h3 class="rail-heading"><span>${escapeHtml(t('rail.outTitle'))}</span><small>${escapeHtml(t('rail.outRule'))}</small></h3>${outHtml}` +
    '</section>';

  document.getElementById('occupancy-alert').hidden = percent === null || percent < OCCUPANCY_ALERT;
}

// Beside the map the rail fills the map's height: it shows as many list groups as fit, at least one.
// Stacked under the map (phones, narrow screens) it shows five.
function fitRail() {
  const rail = document.getElementById('hero-rail');
  const frame = document.getElementById('map-frame');
  const besideMap = rail.getBoundingClientRect().top - frame.getBoundingClientRect().top < 4;
  let limit = besideMap && !frame.hidden ? RAIL_MAX_GROUPS : 5;
  renderRail(appState.beds, appState.records, limit);
  if (!besideMap || frame.hidden || appState.railExpanded) return;
  while (limit > RAIL_MIN_GROUPS && rail.scrollHeight > frame.offsetHeight + 2) {
    limit -= 1;
    renderRail(appState.beds, appState.records, limit);
  }
}

function renderSummary(beds) {
  const site = appState.site;
  const inUse = beds.filter((bed) => bed.inUse && bed.loadDate);
  const ages = inUse.map((bed) => elapsedDays(bed.loadDate)).filter((age) => age !== null && age >= 0);
  const known = inUseCount(beds) !== null;
  const average = ages.length ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length) : null;
  const oldest = inUse.slice().sort((left, right) => left.loadDate.localeCompare(right.loadDate))[0];
  const oldestAge = oldest ? elapsedDays(oldest.loadDate) : null;
  const due = pastPlannedOut(beds);
  const cards = [
    ['capacity', t('summary.capacity'), site.bedCount, t('summary.beds'),
      site.nylex ? t('summary.nylex', site.nylex) : t('summary.nylexNone')],
    ['average', t('summary.avgDays'), known && average !== null ? average : '—', known && average !== null ? t('summary.days') : '',
      known ? t('summary.avgNote', { count: ages.length }) : t('summary.needsLive')],
    ['oldest', t('summary.oldest'), known && oldestAge !== null ? oldestAge : '—', known && oldestAge !== null ? t('summary.days') : '',
      known && oldest ? t('summary.oldestNote', { bed: oldest.bed, date: oldest.loadDate }) : t('summary.needsLive')],
    ['due', t('summary.due', { days: DRYING_DAYS }), known ? due : '—', known ? t('summary.beds') : '',
      known ? t('summary.dueNote', { days: DRYING_DAYS }) : t('summary.needsLive')]
  ];
  const grid = document.getElementById('summary-grid');
  grid.setAttribute('aria-label', t('summary.aria', { site: siteName() }));
  grid.innerHTML = cards.map(([kind, label, value, unit, note]) =>
    `<article class="summary-card summary-${kind}"><span class="summary-label">${escapeHtml(label)}</span>` +
      `<strong>${escapeHtml(value)}</strong><span class="summary-unit">${escapeHtml(unit)}</span>` +
      `<small>${escapeHtml(note)}</small></article>`).join('');
}

function applyConfigCopy() {
  document.getElementById('legend-green-copy').textContent = t('legend.green', { greenMax: AGE_GREEN_MAX });
  document.getElementById('legend-orange-copy').textContent = t('legend.orange', { orangeMin: AGE_GREEN_MAX + 1, orangeMax: AGE_ORANGE_MAX });
  document.getElementById('legend-red-copy').textContent = t('legend.red', { redMin: AGE_ORANGE_MAX + 1 });
  document.getElementById('legend-confirm-copy').textContent = t('legend.confirm', { dryingDays: DRYING_DAYS, target: MOISTURE_TARGET });
  document.getElementById('footer-threshold-copy').textContent = t('footer.threshold', { days: DRYING_DAYS });
  document.getElementById('occupancy-alert-text').textContent = t('occupancy.alert', { threshold: OCCUPANCY_ALERT });
}

function applySiteCopy() {
  const site = appState.site;
  const name = siteName();
  document.title = t('page.title', { site: name });
  document.getElementById('site-title').textContent = name;
  document.getElementById('footer-site').textContent = t('footer.snapshot', { site: name });
  const noteKey = `map.note.${site.id}`;
  document.getElementById('map-site-note').textContent = t(noteKey, { count: site.bedCount });
  document.getElementById('legend-inferred').hidden = site.id !== 'bergfrieden';
  document.getElementById('legend-unlocated').hidden = site.id !== 'tingatinga';
}

function currentData() {
  return appState.sites.get(appState.site.id) || { status: 'loading' };
}

function updateSnapshotUi() {
  const snapshot = document.getElementById('snapshot-date');
  const data = currentData();
  snapshot.className = 'snapshot-date';
  if (data.status === 'loading') snapshot.textContent = t('loading.csv');
  else if (data.live) { snapshot.textContent = t('snapshot.live', { tab: appState.site.tab }); snapshot.classList.add('is-live'); }
  else if (data.snapshotAvailable) snapshot.textContent = t('snapshot.label', { date: data.sourceInfo.snapshot_date || t('snapshot.unknown') });
  else { snapshot.textContent = t('snapshot.failed'); snapshot.classList.add('is-failed'); }
}

function renderDataAlert() {
  const alert = document.getElementById('data-alert');
  const status = document.getElementById('data-alert-text');
  const data = currentData();
  const site = appState.site;
  alert.className = 'data-alert';
  if (data.status === 'loading') {
    status.textContent = t('data.checking', { site: siteName() });
  } else if (data.live) {
    const warnings = data.warnings || { unparsedOpenRows: 0, outOfRangeTables: [] };
    const notes = [t('data.live', { site: siteName(), tab: site.tab })];
    if (warnings.unparsedOpenRows) notes.push(t('data.liveUnparsed', { count: warnings.unparsedOpenRows }));
    if (warnings.outOfRangeTables.length) notes.push(t('data.liveOutOfRange', { tables: compactRanges(warnings.outOfRangeTables), beds: site.bedCount }));
    if (warnings.unparsedOpenRows || warnings.outOfRangeTables.length) alert.classList.add('data-alert-warning');
    status.textContent = notes.join(' ');
  } else if (data.liveFailed && data.snapshotAvailable) {
    alert.classList.add('data-alert-error');
    status.textContent = t('data.currentFailed');
  } else if (data.snapshotAvailable) {
    alert.classList.add('data-alert-warning');
    status.textContent = t('data.snapshot', {
      site: siteName(), count: data.records.length,
      date: data.sourceInfo.snapshot_date || t('value.unknown'), beds: site.bedCount
    });
  } else {
    alert.classList.add('data-alert-error');
    status.textContent = t('data.loadFailed', { site: siteName() });
  }
}

// 28, 31, 32, 33, 40 -> "28, 31–33, 40"
function compactRanges(numbers) {
  const parts = [];
  numbers.forEach((number, index) => {
    if (index && number === numbers[index - 1] + 1) parts[parts.length - 1][1] = number;
    else parts.push([number, number]);
  });
  return parts.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
}

function updateSourceLinks() {
  const data = currentData();
  const site = appState.site;
  const live = Boolean(data.live || (!data.snapshotAvailable && site.sheetUrl));
  const href = live ? site.sheetUrl : site.snapshotCsvUrl;
  document.querySelectorAll('.source-link, .text-link').forEach((link) => {
    link.hidden = !href;
    if (!href) return;
    link.href = href;
    if (live) { link.target = '_blank'; link.rel = 'noopener'; }
    else { link.removeAttribute('target'); link.removeAttribute('rel'); }
    const label = link.querySelector('[data-i18n]');
    if (label) {
      label.dataset.i18n = link.classList.contains('source-link')
        ? (live ? 'source.openSheet' : 'source.open')
        : (live ? 'history.openSheet' : 'history.openAll');
      label.textContent = t(label.dataset.i18n, { tab: site.tab });
    }
  });
}

function renderSiteTabs() {
  document.querySelectorAll('#site-tabs [data-site]').forEach((tab) => {
    const site = SITES.find((entry) => entry.id === tab.dataset.site);
    const data = appState.sites.get(site.id);
    const selected = site.id === appState.site.id;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    tab.querySelector('.site-tab-name').textContent = siteName(site);
    const count = tab.querySelector('.site-tab-count');
    const used = data && data.status === 'ready' ? inUseCount(data.beds) : null;
    count.textContent = `${used === null ? '–' : used}/${site.bedCount}`;
    count.classList.toggle('is-live', used !== null);
    count.title = used === null ? t('tabs.capacity', { count: site.bedCount }) : t('tabs.inUse', { used, count: site.bedCount });
  });
}

function renderCurrentSite() {
  const site = appState.site;
  const data = currentData();
  const beds = data.status === 'ready' ? data.beds : emptyBeds(site.bedCount, 'loading');
  appState.beds = beds;
  appState.bedById = new Map(beds.map((bed) => [bed.bed, bed]));
  appState.history = data.history || new Map();
  appState.records = data.records || [];
  applySiteCopy();
  updateSnapshotUi();
  updateSourceLinks();
  renderSiteTabs();
  renderRecords(appState.records);
  renderSummary(beds);
  buildMap(beds);
  fitRail();
  if (appState.selectedBed && appState.bedById.has(appState.selectedBed)) selectBed(appState.selectedBed);
  else resetSelection();
  renderDataAlert();
}

function resetSelection() {
  appState.selectedBed = null;
  document.getElementById('selected-title').textContent = t('detail.select');
  const badge = document.getElementById('selected-badge');
  badge.className = 'state-badge state-unknown';
  badge.textContent = t('status.unselected');
  document.getElementById('selected-detail').innerHTML = `<p class="empty-detail">${escapeHtml(t('detail.empty'))}</p>`;
}

async function loadSite(site) {
  const data = {
    status: 'ready', beds: emptyBeds(site.bedCount, 'unknown'), history: new Map(), records: [],
    live: false, warnings: null, liveFailed: false, snapshotAvailable: false, sourceInfo: {}
  };
  if (site.statusUrl) {
    try {
      const live = await liveAdapter(site, appState.todayIso);
      return Object.assign(data, { beds: live.beds, history: live.history, records: live.records, live: true, warnings: live.warnings });
    } catch (error) {
      console.error(error);
      data.liveFailed = true;
    }
  }
  if (site.snapshotCsvUrl) {
    try {
      const snapshot = await snapshotAdapter(site);
      Object.assign(data, { beds: snapshot.beds, history: snapshot.history, records: snapshot.records, snapshotAvailable: true, sourceInfo: snapshot.sourceInfo });
    } catch (error) {
      console.error(error);
    }
  }
  return data;
}

function chooseSite(id, { updateUrl = true, focus = false } = {}) {
  const site = SITES.find((entry) => entry.id === id);
  if (!site) return;
  const changed = site.id !== appState.site.id;
  appState.site = site;
  try { window.localStorage.setItem(SITE_STORAGE_KEY, site.id); } catch (error) {
    console.warn('Site preference could not be saved.', error);
  }
  if (updateUrl) {
    const params = new URLSearchParams(window.location.search);
    params.set('site', site.id);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  }
  if (changed) {
    appState.selectedBed = null;
    appState.railExpanded = false;
    appState.panHintSeen = false;
    appState.zoom = site.mobileZoom;
    closeBedSheet();
    hideTooltip();
    const frame = document.getElementById('map-frame');
    frame.scrollLeft = 0;
    frame.scrollTop = 0;
    applyMobileView();
  }
  renderCurrentSite();
  if (focus) document.querySelector(`#site-tabs [data-site="${site.id}"]`).focus();
}

function setupSiteTabs() {
  const tabs = document.getElementById('site-tabs');
  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-site]');
    if (tab) chooseSite(tab.dataset.site);
  });
  tabs.addEventListener('keydown', (event) => {
    const ids = SITES.map((site) => site.id);
    const index = ids.indexOf(appState.site.id);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % ids.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + ids.length) % ids.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = ids.length - 1;
    else return;
    event.preventDefault();
    chooseSite(ids[next], { focus: true });
  });
  document.getElementById('hero-rail').addEventListener('click', (event) => {
    if (event.target.closest('[data-rail-toggle]')) {
      appState.railExpanded = !appState.railExpanded;
      fitRail();
      return;
    }
    const chip = event.target.closest('[data-select-bed]');
    if (!chip) return;
    const id = Number(chip.dataset.selectBed);
    selectBed(id);
    const bed = appState.bedById.get(id);
    if (isMobileLayout() && bed) openBedSheet(bed, classifyBed(bed));
  });
}

function resolveInitialSite() {
  const querySite = new URLSearchParams(window.location.search).get('site');
  if (SITES.some((site) => site.id === querySite)) return querySite;
  try {
    const stored = window.localStorage.getItem(SITE_STORAGE_KEY);
    if (SITES.some((site) => site.id === stored)) return stored;
  } catch (error) {
    console.warn('Site preference is unavailable.', error);
  }
  return DEFAULT_SITE;
}

function rerenderLanguage() {
  applyTranslations();
  applyConfigCopy();
  renderCurrentSite();
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

function initialize() {
  setLanguage(resolveInitialLanguage());
  updateLanguageSwitcher(getLanguage());
  appState.site = SITES.find((site) => site.id === resolveInitialSite());
  appState.zoom = appState.site.mobileZoom;
  applyTranslations();
  applyConfigCopy();
  setupLanguageSwitcher();
  setupSiteTabs();
  setupMobileControls();
  renderCurrentSite();
  // All three tabs load in parallel so the header can show each site's beds in use.
  SITES.forEach((site) => {
    loadSite(site).then((data) => {
      appState.sites.set(site.id, data);
      if (site.id === appState.site.id) renderCurrentSite();
      else renderSiteTabs();
    });
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') initialize();
