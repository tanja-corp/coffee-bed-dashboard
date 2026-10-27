import test from 'node:test';
import assert from 'node:assert/strict';
import { seedRows, serializeBedCsv, parseBedCsv, changeBed, dataFromRows, changedBeds, validDate, validateRows, sameCsvText } from '../site/bed-csv.js';

const site = { id: 'test', tab: 'Test', bedCount: 3 }, today = '2026-10-27';
const seed = () => seedRows(site, [
  { bed: 1, inUse: true, loadDate: '2026-10-10', lastDateIn: '2026-09-01', lastDateOut: '2026-09-15' },
  { bed: 2, inUse: false, loadDate: null },
  { bed: 3, inUse: null, loadDate: null }
], today);
const values = (date, moisture = '', note = '') => ({ date, moisture, note });
const rejects = (fn, key) => assert.throws(fn, (error) => error.key === key);

test('applying unchanged details keeps timestamps and pending-bed count unchanged', () => {
  const rows = seed();
  const next = changeBed(rows, site, 1, 'correct', values('2026-10-10'), today);
  assert.deepEqual(next, rows);
  assert.deepEqual(changedBeds(next, rows), []);
});

test('file conflict detection ignores the BOM stripped by File.text, and detects actual edits', async () => {
  const text = serializeBedCsv(seed());
  const read = await new File([text], 'bed-status.csv').text();
  assert.equal(read.charCodeAt(0) === 0xFEFF, false);
  assert.equal(sameCsvText(read, text), true);
  assert.equal(sameCsvText(read + '\r\n', text), false);
});

test('round trip preserves Unicode, multiline notes, quotes, commas, and zero moisture', () => {
  const rows = changeBed(seed(), site, 1, 'correct', values('2026-10-10', '0', '現場メモ, "確認"\nline 2'), today);
  assert.deepEqual(parseBedCsv(serializeBedCsv(rows), site, today), rows);
  assert.equal(dataFromRows(rows, site).beds[0].moisturePercent, 0);
});
test('operator-led notes are escaped for spreadsheet use and restored on import', () => {
  for (const note of ['=1+1', '+123', '-text', '@SUM(A1)']) {
    const rows = changeBed(seed(), site, 1, 'correct', values('2026-10-10', '', note), today);
    assert.ok(serializeBedCsv(rows).includes('\t' + note));
    assert.deepEqual(parseBedCsv(serializeBedCsv(rows), site, today), rows);
  }
});
test('clearing one bed preserves the cycle and does not alter other beds', () => {
  const rows = seed(), next = changeBed(rows, site, 1, 'unload', values(today, '11.1', 'Done'), today);
  const data = dataFromRows(next, site);
  assert.equal(data.beds[0].inUse, false);
  assert.equal(data.beds[0].lastDateOut, today);
  assert.equal(data.history.get(1).length, 2);
  assert.deepEqual(changedBeds(next, rows), [1]);
  assert.equal(data.beds[2].inUse, null);
  assert.equal(dataFromRows(rows, site).beds[0].inUse, true);
});
test('a new cycle retains the closed history and does not inherit its measurement', () => {
  const cleared = changeBed(seed(), site, 1, 'unload', values(today, '11'), today);
  const loaded = changeBed(cleared, site, 1, 'load', values(today), today);
  const data = dataFromRows(loaded, site);
  assert.equal(data.beds[0].inUse, true);
  assert.equal(data.beds[0].moisturePercent, null);
  assert.equal(data.history.get(1).length, 3);
  assert.deepEqual(parseBedCsv(serializeBedCsv(loaded), site, today), loaded);
});
test('unknown can be confirmed empty without manufacturing a date', () => {
  const next = changeBed(seed(), site, 3, 'empty', values(''), today);
  assert.equal(dataFromRows(next, site).beds[2].inUse, false);
  assert.equal(dataFromRows(next, site).beds[2].lastDateOut, null);
});
test('invalid source dates keep occupied beds occupied, with an explicit repair path', () => {
  const rows = seedRows({ ...site, bedCount: 1 }, [{ bed: 1, inUse: true, loadDate: null, loadDateRaw: '12/2/2926' }], today);
  assert.equal(dataFromRows(rows, { ...site, bedCount: 1 }).beds[0].inUse, true);
  rejects(() => changeBed(rows, { ...site, bedCount: 1 }, 1, 'unload', values(today), today), 'fixDateFirst');
});
test('double loading, clearing empty beds, and reversed dates are rejected', () => {
  rejects(() => changeBed(seed(), site, 1, 'load', values(today), today), 'alreadyInUse');
  rejects(() => changeBed(seed(), site, 2, 'unload', values(today), today), 'notInUse');
  rejects(() => changeBed(seed(), site, 1, 'unload', values('2026-10-09'), today), 'dateOrder');
});
test('impossible dates, future dates, and moisture outside the range are rejected', () => {
  assert.equal(validDate('2026-02-30', today), false);
  assert.equal(validDate('2026-10-28', today), false);
  assert.equal(validDate('2024-02-29', today), true);
  rejects(() => changeBed(seed(), site, 2, 'load', values('2026-02-30'), today), 'dateRequired');
  rejects(() => changeBed(seed(), site, 2, 'load', values(today, '101'), today), 'badMoisture');
  rejects(() => changeBed(seed(), site, 2, 'load', values(today, '-1'), today), 'badMoisture');
});
test('import rejects a different site, missing beds, and overlapping open cycles', () => {
  rejects(() => parseBedCsv(serializeBedCsv(seed()), { ...site, id: 'other' }, today), 'wrongSite');
  rejects(() => validateRows(seed().filter((row) => row.bed !== 3), site, today), 'missingBeds');
  rejects(() => validateRows([...seed(), { ...seed().find((row) => row.status === 'in_use') }], site, today), 'openCycle');
});
test('strict CSV parsing rejects broken quotes, unknown columns, and exponential bed IDs', () => {
  rejects(() => parseBedCsv('site,bed,status\n"broken', site, today), 'badCsv');
  rejects(() => parseBedCsv('site,bed,status\ntest,1,empty', site, today), 'badHeader');
  rejects(() => parseBedCsv(serializeBedCsv(seed()).replace('test,2,empty', 'test,2e0,empty'), site, today), 'badBed');
});
test('external edits cannot inject formulas through timestamps', () => {
  const rows = seed(); rows[0].updated_at = '=WEBSERVICE("https://example.com")';
  rejects(() => validateRows(rows, site, today), 'badDate');
});
test('current statuses retain the most recent clearing across several cycles', () => {
  let rows = changeBed(seed(), site, 1, 'unload', values('2026-10-20'), today);
  rows = changeBed(rows, site, 1, 'load', values('2026-10-21'), today);
  assert.equal(dataFromRows(rows, site).beds[0].lastDateOut, '2026-10-20');
  rejects(() => changeBed(rows, site, 1, 'correct', values('2026-10-19'), today), 'dateOrder');
});
