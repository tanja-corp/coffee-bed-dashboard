import { DRYING_DAYS, SITES } from './config.js';
import { CsvError, cloneRows, seedRows, parseBedCsv, serializeBedCsv, validateRows,
  latestRows, dataFromRows, changeBed, changedBeds, sameCsvText } from './bed-csv.js';
import { e } from './editor-i18n.js';
export { e } from './editor-i18n.js';

const LEGACY_PREFIX = 'coffee-bed-csv-v1:';
const workspaces = new Map();
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let hooks, busy = false, modalDirty = false, modalOpener, editingBed, toastTimer, remaining, timerStarted;
const direct = () => typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function' && window.isSecureContext;
const wsFor = (site = hooks.getSite()) => workspaces.get(site.id);
const active = () => { const ws = wsFor(); return ws?.active ? ws : null; };
const dirty = (ws) => changedBeds(ws.rows, ws.checkpoint).length > 0;
const message = (error, fallback) => error instanceof CsvError ? e(error.key, error.vars) : e(fallback);
const button = (action, label, primary = false, disabled = false) => `<button type="button" class="csv-button${primary ? ' csv-primary' : ''}" data-csv="${action}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const hint = (key) => `<p class="csv-help">${esc(e(key))}</p>`;

export function csvData(site, base) {
  const ws = workspaces.get(site.id);
  return ws?.active ? dataFromRows(ws.rows, site) : base;
}

export function bedEditButton(bed) {
  return `<button type="button" class="csv-button csv-primary csv-bed-edit" data-edit-bed="${bed}">${esc(e('edit'))}</button>`;
}

function stopToastClock() {
  if (!toastTimer) return;
  clearTimeout(toastTimer); toastTimer = null;
  remaining = Math.max(0, remaining - (Date.now() - timerStarted));
}
function startToastClock() {
  const toast = document.getElementById('csv-toast');
  if (toastTimer || remaining <= 0 || toast.hidden || document.hidden || toast.matches(':hover') || toast.contains(document.activeElement)) return;
  timerStarted = Date.now();
  toastTimer = setTimeout(() => { toast.hidden = true; toastTimer = null; }, remaining);
}
function toast(text, error = false) {
  stopToastClock();
  const node = document.getElementById('csv-toast');
  node.className = 'csv-toast' + (error ? ' is-error' : '');
  node.hidden = false;
  document.getElementById('csv-toast-status').textContent = '';
  document.getElementById('csv-toast-error').textContent = '';
  document.getElementById(error ? 'csv-toast-error' : 'csv-toast-status').textContent = text;
  node.querySelector('button').setAttribute('aria-label', e('dismiss'));
  remaining = error ? 0 : 4500;
  if (!error) startToastClock();
}

function closeModal(force = false) {
  const dialog = document.getElementById('csv-dialog');
  if (busy) return;
  if (!force && modalDirty && !window.confirm(e('discardForm'))) return;
  modalDirty = false;
  dialog.close();
  if (editingBed) {
    const bed = editingBed; editingBed = null; hooks.onPreview(bed);
    document.querySelector(`#bed-sheet [data-edit-bed="${bed}"]`)?.focus({ preventScroll: true });
  } else if (modalOpener?.isConnected) modalOpener.focus();
}
function modal(title, content, kind = '') {
  const dialog = document.getElementById('csv-dialog');
  dialog.dataset.kind = kind;
  if (!dialog.open) modalOpener = document.activeElement;
  modalDirty = false;
  dialog.innerHTML = `<div class="csv-dialog-heading"><div><p class="eyebrow">${esc(hooks.getSite().tab)}</p><h2 id="csv-dialog-title">${esc(title)}</h2></div><button type="button" class="csv-icon-button" data-csv="close" aria-label="${esc(e('close'))}">×</button></div>` +
    `<div class="csv-dialog-content"><p id="csv-dialog-error" class="csv-error" role="alert" tabindex="-1" hidden></p>${content}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}
function dialogError(text) {
  const target = document.getElementById('csv-dialog').open
    ? document.getElementById('csv-form-error') || document.getElementById('csv-dialog-error') : null;
  if (target) { target.textContent = text; target.hidden = false; target.focus(); }
  else toast(text, true);
}

function activateRows(site, rows, metadata = {}) {
  const ws = { active: true, rows, checkpoint: cloneRows(rows), hasExport: false, fileName: '', undo: [], handle: null,
    diskText: null, ...metadata };
  workspaces.set(site.id, ws);
  return ws;
}

function openFileOptions() {
  const ws = active();
  if (!ws) {
    modal(e('fileTitle'), `<p>${esc(e('scope'))}</p>${hint(direct() ? 'directHelp' : 'fallbackHelp')}<div class="csv-dialog-actions">${button('open', e('open'), true)}` +
      button('export-current', e('downloadCurrent'), false, hooks.getData(hooks.getSite()).status !== 'ready') + '</div>');
    return;
  }
  modal(e('fileTitle'), `<p>${esc(e('fileHelp'))}</p><div class="csv-callout">${esc(e('scope'))}</div>` +
    `<p class="csv-help">${esc(ws.handle ? e('destination', { name: ws.fileName }) : ws.fileName ? e('downloadedFile', { name: ws.fileName }) : e('noFile'))}</p>` +
    hint(direct() ? 'directHelp' : 'fallbackHelp') +
    `<section class="csv-choice">${button('open', e('reconnect'), true, dirty(ws))}${hint(dirty(ws) ? 'unsaved' : 'replaceHelp')}</section>` +
    `<section class="csv-choice">${button('save-copy', e('saveAs'))} ${button('download', e('download'))}</section>` +
    `<section class="csv-choice">${button('live', e('switchLive'), false, dirty(ws))}${hint('switchHelp')}</section>` + hint('sessionHelp'));
}

function summary(row) {
  return `${e(row.status)}${row.date_in ? ' · ' + e('dateIn') + ' ' + row.date_in : ''}${row.date_out ? ' · ' + e('dateOut') + ' ' + row.date_out : ''}`;
}
function review() {
  const ws = active();
  if (!ws) return;
  const ids = changedBeds(ws.rows, ws.checkpoint), before = latestRows(ws.checkpoint), after = latestRows(ws.rows);
  modal(e('reviewTitle'), `<p>${esc(e('reviewWhy'))}</p>${!ws.hasExport ? hint('newFile') : ''}` +
    (ids.length ? `<ol class="csv-changes">${ids.map((bed) => `<li><h3>${esc(e('bedTitle', { bed }))}</h3><dl>` +
      `<dt>${esc(e('before'))}</dt><dd>${esc(summary(before.get(bed)))}</dd><dt>${esc(e('after'))}</dt><dd>${esc(summary(after.get(bed)))}</dd></dl>` +
      `<p class="csv-change-detail">${esc(e('moisture'))}: ${esc(after.get(bed).moisture_percent || '—')}</p>` +
      (after.get(bed).note ? `<p class="csv-note">${esc(after.get(bed).note)}</p>` : '') + '</li>').join('')}</ol>` : hint('noChanges')) +
    `<div class="csv-dialog-actions">${button('save', e('save'), true)}${button('close', e('close'))}</div>`);
}

export function openBedEditor(bed) {
  if (busy) return;
  let ws = active();
  if (!ws) {
    const site = hooks.getSite(), base = hooks.getData(site);
    if (base.status !== 'ready') return toast(e('loading'));
    try {
      const rows = seedRows(site, base.beds, hooks.getToday());
      // Opening or cancelling the form must never create an unsaved workspace.
      ws = { active: true, rows, checkpoint: cloneRows(rows), hasExport: false, fileName: '', undo: [], handle: null, diskText: null };
    } catch (error) { toast(message(error, 'failedOpen'), true); return; }
  }
  const row = latestRows(ws.rows).get(bed);
  if (!row) return;
  document.getElementById('bed-sheet').hidden = true;
  document.getElementById('map-tooltip').hidden = true;
  const desktop = window.matchMedia('(min-width: 721px)').matches;
  const actions = row.status === 'in_use' ? (desktop ? ['correct', 'unload'] : ['unload', 'correct']) : row.status === 'unknown' ? ['load', 'empty'] : ['load', 'correct'];
  const labels = { load: 'load', unload: 'unload', correct: 'correct', empty: 'confirmEmpty' };
  const age = row.status === 'in_use' && row.date_in ? Math.round((Date.parse(hooks.getToday()) - Date.parse(row.date_in)) / 86400000) : null;
  const planned = row.status === 'in_use' && row.date_in ? new Date(Date.parse(row.date_in) + DRYING_DAYS * 86400000).toISOString().slice(0, 10) : '';
  const overview = `<aside class="csv-bed-overview" aria-label="${esc(e('currentStatus'))}"><h3>${esc(e('currentStatus'))}</h3>` +
    `<strong class="csv-bed-current-state csv-status-${row.status}"><span aria-hidden="true"></span>${esc(e(row.status))}</strong>` +
    (age === null ? '' : `<p class="csv-bed-age"><strong>${age}</strong> ${esc(e('elapsedDays'))}</p>`) +
    `<dl><div><dt>${esc(e('dateIn'))}</dt><dd>${esc(row.date_in || '—')}</dd></div>` +
    `<div><dt>${esc(e(row.status === 'in_use' ? 'plannedOut' : 'dateOut'))}</dt><dd>${esc(planned || row.date_out || '—')}</dd></div>` +
    `<div><dt>${esc(e('measuredMoisture'))}</dt><dd>${esc(row.moisture_percent === '' ? '—' : row.moisture_percent + '%')}</dd></div></dl>` +
    `<p class="csv-overview-help">${esc(e('viewOnlyHelp'))}</p></aside>`;
  modal(e('bedTitle', { bed }), `<p class="csv-bed-context">${esc(e('context', { site: hooks.getSite().tab, state: e(row.status) }))}</p>` +
    `<div class="csv-bed-workspace">${overview}<form id="csv-bed-form" data-bed="${bed}"><h3 class="csv-edit-heading">${esc(e('updateRecord'))}</h3><fieldset class="csv-actions"><legend>${esc(e('action'))}</legend>` +
    actions.map((action, i) => `<label><input type="radio" name="action" value="${action}"${i === 0 ? ' checked' : ''}><span>${esc(e(labels[action]))}</span></label>`).join('') + '</fieldset>' +
    '<div id="csv-action-help" class="csv-callout"></div>' +
    `<div class="csv-edit-fields"><div class="csv-field" id="csv-date-field"><label for="csv-date" id="csv-date-label">${esc(e('dateIn'))}</label><input type="date" id="csv-date" name="date" min="2000-01-01" max="${hooks.getToday()}" aria-describedby="csv-date-help"><small id="csv-date-help">${esc(e('dateHelp'))}</small></div>` +
    `<div class="csv-field" id="csv-moisture-field"><label for="csv-moisture">${esc(e('moisture'))}</label><input type="number" inputmode="decimal" id="csv-moisture" name="moisture" min="0" max="100" step="0.1" value="${esc(row.moisture_percent)}" aria-describedby="csv-moisture-help"><small id="csv-moisture-help">${esc(e('moistureHelp'))}</small></div></div>` +
    `<div class="csv-field"><label for="csv-note">${esc(e('note'))}</label><textarea id="csv-note" name="note" rows="4" maxlength="2000">${esc(row.note)}</textarea></div>` +
    '<p id="csv-preview" class="csv-preview" aria-live="polite"></p><p id="csv-form-error" class="csv-error" role="alert" tabindex="-1" hidden></p>' +
    `<div class="csv-dialog-actions"><button class="csv-button csv-primary" type="submit">${esc(e('apply'))}</button>${button('close', e('cancel'))}</div></form></div>`, 'bed');
  const form = document.getElementById('csv-bed-form');
  editingBed = bed;
  let previousAction = '';
  const update = () => {
    const action = form.elements.action.value;
    const showDate = action === 'load' || action === 'unload' || (action === 'correct' && row.status === 'in_use');
    if (action !== previousAction) {
      form.elements.date.value = action === 'correct' ? row.date_in : hooks.getToday();
      form.elements.date.min = action === 'unload' ? row.date_in || '2000-01-01' : action === 'load' ? row.date_out || '2000-01-01' : '2000-01-01';
      // A new cycle must not inherit the previous cycle's measurement or note.
      form.elements.moisture.value = action === 'load' ? '' : row.moisture_percent;
      form.elements.note.value = action === 'load' ? '' : row.note;
      previousAction = action;
    }
    document.getElementById('csv-date-field').hidden = !showDate;
    form.elements.date.required = showDate;
    form.elements.date.disabled = !showDate;
    document.getElementById('csv-date-label').textContent = e(action === 'unload' ? 'dateOut' : 'dateIn');
    document.getElementById('csv-moisture-field').hidden = action === 'empty';
    form.elements.moisture.disabled = action === 'empty';
    document.getElementById('csv-action-help').textContent = e(action === 'unload' ? 'unloadHelp' : action === 'correct' ? 'correctHelp' : action === 'empty' ? 'emptyHelp' : row.status === 'unknown' ? 'unknownHelp' : 'dateHelp');
    const previewKeys = { load: 'previewLoad', unload: 'previewUnload', correct: 'previewCorrect', empty: 'previewEmpty' };
    document.getElementById('csv-preview').textContent = e(previewKeys[action], { date: form.elements.date.value || '—' });
  };
  update();
  form.addEventListener('input', () => { modalDirty = true; update(); document.getElementById('csv-form-error').hidden = true; });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy) return;
    try {
      const next = changeBed(ws.rows, hooks.getSite(), bed, form.elements.action.value, {
        date: form.elements.date.value, moisture: form.elements.moisture.value, note: form.elements.note.value.trim()
      }, hooks.getToday());
      if (!changedBeds(next, ws.rows).length) { closeModal(true); toast(e('unchanged')); return; }
      ws.undo.push(cloneRows(ws.rows));
      if (ws.undo.length > 30) ws.undo.shift();
      ws.rows = next;
      workspaces.set(hooks.getSite().id, ws);
      hooks.onChange(); closeModal(true);
      toast(e('draftToast', { bed }));
    } catch (error) { dialogError(message(error, 'failedSave')); }
  });
}

async function importFile(file, handle, site) {
  if (file.size >= 10 * 1024 * 1024) throw new CsvError('bigFile');
  const text = await file.text();
  const rows = parseBedCsv(text, site, hooks.getToday());
  activateRows(site, rows, { hasExport: true, fileName: file.name, handle, diskText: text });
  closeModal(true); hooks.onChange();
  toast(e('importToast', { name: file.name }));
}
async function openFile() {
  if (busy) return;
  if (active() && dirty(active())) return dialogError(e('unsaved'));
  const site = hooks.getSite();
  if (!direct()) {
    const input = document.getElementById('csv-file-input');
    input.dataset.site = site.id; input.value = ''; input.click(); return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
    await importFile(await handle.getFile(), handle, site);
  } catch (error) { if (error.name !== 'AbortError') dialogError(message(error, 'failedOpen')); }
}

async function saveFile({ copy = false, download = false } = {}) {
  const site = hooks.getSite(), ws = active();
  if (!ws || busy) return;
  const rows = cloneRows(ws.rows);
  let newHandle = null;
  try {
    validateRows(rows, site, hooks.getToday());
    busy = true; renderCsvEditor();
    // Invoke the picker in the click gesture, before other asynchronous work.
    if (!download && direct() && (!ws.handle || copy)) {
      newHandle = await window.showSaveFilePicker({ suggestedName: `${site.id}-bed-status.csv`, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }] });
    }
    document.getElementById('csv-dialog').querySelectorAll('button, input, textarea').forEach((node) => { node.disabled = true; });
    const text = serializeBedCsv(rows);
    const handle = download ? null : newHandle || ws.handle;
    const name = handle?.name || `${site.id}-bed-status.csv`;
    if (handle) {
      // Check the original text rather than size/mtime, which can miss quick edits.
      const sameFile = handle === ws.handle || (ws.handle && typeof handle.isSameEntry === 'function' && await handle.isSameEntry(ws.handle));
      if (sameFile && ws.diskText !== null && !sameCsvText(await (await handle.getFile()).text(), ws.diskText)) throw new CsvError('conflict');
      const writable = await handle.createWritable();
      try { await writable.write(text); await writable.close(); }
      catch (error) { try { await writable.abort(); } catch { /* Stream may already be closed. */ } throw error; }
      ws.handle = handle; ws.diskText = text; ws.fileName = handle.name;
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      // Browsers cannot confirm a completed download. Keep the direct-file checkpoint
      // dirty when this download is only an alternative to a connected file.
      if (ws.handle) { toast(e('downloadToast', { name })); return; }
      ws.fileName = name;
    }
    ws.checkpoint = rows; ws.hasExport = true;
    busy = false;
    closeModal(true);
    toast(e(handle ? 'saveToast' : 'downloadToast', { name }));
  } catch (error) {
    if (error.name !== 'AbortError') dialogError(message(error, 'failedSave'));
  } finally {
    busy = false;
    document.getElementById('csv-dialog').querySelectorAll('button, input, textarea').forEach((node) => { node.disabled = false; });
    renderCsvEditor();
  }
}

export function renderCsvEditor() {
  if (!hooks) return;
  const controls = document.getElementById('csv-file-controls'), savebar = document.getElementById('csv-save-bar');
  const ws = active(), disabled = busy;
  controls.innerHTML = `<button type="button" class="csv-subtle-button" data-csv="manage" aria-label="${esc(e('fileTitle'))}" title="${esc(e('fileTitle'))}"${disabled ? ' disabled' : ''}>CSV <span aria-hidden="true">⌄</span></button>`;
  if (!ws) {
    savebar.hidden = true;
  } else {
    const pending = dirty(ws), count = changedBeds(ws.rows, ws.checkpoint).length;
    savebar.hidden = !pending;
    savebar.innerHTML = `<button type="button" class="csv-change-summary" data-csv="review" aria-label="${esc(e('review'))}"${disabled ? ' disabled' : ''}><strong>${esc(count ? e('changes', { count }) : e('draft'))}</strong><small>${esc(e('review'))} ›</small></button>` +
      `<div class="csv-inline-actions"><button type="button" class="csv-icon-button" data-csv="undo" aria-label="${esc(e('undo'))}" title="${esc(e('undo'))}"${disabled || !ws.undo.length ? ' disabled' : ''}>↶</button>${button('save', busy ? e('busy') : e('save'), true, disabled)}</div>`;
  }
  document.body.classList.toggle('csv-has-changes', !savebar.hidden);
}

export function setupCsvEditor(options) {
  hooks = options;
  document.querySelector('.map-actions').insertAdjacentHTML('beforeend', '<span id="csv-file-controls"></span>');
  document.body.insertAdjacentHTML('beforeend', '<div id="csv-save-bar" class="csv-save-bar" hidden></div><dialog id="csv-dialog" class="csv-dialog" aria-labelledby="csv-dialog-title"></dialog>' +
    '<input type="file" id="csv-file-input" accept=".csv,text/csv" hidden><div id="csv-toast" class="csv-toast" hidden><span class="csv-toast-icon" aria-hidden="true">✓</span><div><span id="csv-toast-status" role="status" aria-live="polite" aria-atomic="true"></span><span id="csv-toast-error" role="alert" aria-atomic="true"></span></div><button type="button" class="csv-icon-button" data-csv="dismiss-toast">×</button></div>');
  SITES.forEach((site) => {
    // Old versions persisted drafts. New drafts exist only for this open page.
    try { localStorage.removeItem(LEGACY_PREFIX + site.id); } catch { /* Storage is optional. Never restore it. */ }
  });
  document.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit-bed]');
    if (edit) { openBedEditor(Number(edit.dataset.editBed)); return; }
    const target = event.target.closest('[data-csv]');
    if (!target || target.disabled) return;
    const action = target.dataset.csv;
    if (action === 'dismiss-toast') { stopToastClock(); document.getElementById('csv-toast').hidden = true; return; }
    if (action === 'close') return closeModal();
    if (busy) return;
    if (action === 'manage') openFileOptions();
    else if (action === 'open') openFile();
    else if (action === 'save') saveFile();
    else if (action === 'save-copy') saveFile({ copy: true });
    else if (action === 'download') saveFile({ download: true });
    else if (action === 'review') review();
    else if (action === 'export-current') {
      const site = hooks.getSite(), base = hooks.getData(site);
      if (base?.status !== 'ready') return;
      try {
        activateRows(site, seedRows(site, base.beds, hooks.getToday()));
        saveFile({ download: true }); hooks.onChange();
      } catch (error) { dialogError(message(error, 'failedOpen')); }
    } else if (action === 'undo') {
      const ws = active();
      if (!ws?.undo.length) return;
      ws.rows = ws.undo.pop(); hooks.onChange(); toast(e('undoToast'));
    } else if (action === 'live') {
      const ws = active();
      if (!ws || dirty(ws)) return;
      ws.active = false; closeModal(true); hooks.onChange();
    }
  });
  document.getElementById('csv-file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0], site = SITES.find((s) => s.id === event.target.dataset.site);
    if (!file || !site) return;
    try { await importFile(file, null, site); } catch (error) { dialogError(message(error, 'failedOpen')); }
  });
  document.getElementById('csv-dialog').addEventListener('cancel', (event) => { event.preventDefault(); closeModal(); });
  document.getElementById('csv-dialog').addEventListener('click', (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
  });
  const node = document.getElementById('csv-toast');
  node.addEventListener('pointerenter', stopToastClock); node.addEventListener('pointerleave', startToastClock);
  node.addEventListener('focusin', stopToastClock); node.addEventListener('focusout', () => setTimeout(startToastClock, 0));
  document.addEventListener('visibilitychange', () => document.hidden ? stopToastClock() : startToastClock());
  new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--csv-save-height', `${Math.ceil(entry.target.getBoundingClientRect().height)}px`);
  }).observe(document.getElementById('csv-save-bar'));
  new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--bed-peek-height', `${Math.ceil(entry.target.getBoundingClientRect().height)}px`);
  }).observe(document.getElementById('bed-sheet'));
  window.addEventListener('pageshow', (event) => {
    // A history restoration can reuse the JS heap without reloading the module.
    if (!event.persisted) return;
    workspaces.clear(); busy = false; modalDirty = false; editingBed = null;
    stopToastClock();
    document.getElementById('csv-dialog').close();
    document.getElementById('csv-toast').hidden = true;
    document.getElementById('bed-sheet').hidden = true;
    hooks.onChange();
  });
}
