const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('patched SheetJS reads and writes real XLS/XLSX files without turning text into formulas', () => {
  const XLSX = require('../vendor/xlsx.full.min.js');
  assert.equal(XLSX.version, '0.20.3');
  for (const bookType of ['xls', 'xlsx']) {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Student', 'Total'], ['=1+1', 3]]), 'Report');
    const bytes = XLSX.write(book, {bookType, type: 'buffer'});
    const result = XLSX.read(bytes, {type: 'buffer'}).Sheets.Report;
    assert.equal(result.A2.v, '=1+1');
    assert.equal(result.A2.f, undefined);
    assert.equal(result.B2.v, 3);
  }
});

function worker({offline = false, storageFailure = false, cacheControl = ''} = {}) {
  const listeners = {}, writes = [], deleted = [];
  const cached = new Response('offline shell');
  const response = new Response('online', {headers: {'Cache-Control': cacheControl}});
  const ctx = {URL, Response, Set,
    self: {location: new URL('https://school.example/'), clients: {claim() {}}, skipWaiting() {},
      addEventListener: (name, fn) => {listeners[name] = fn;}},
    fetch: async () => {if (offline) throw new Error('offline'); return response;},
    caches: {keys: async () => ['another-app', 'control-asistencia-old'], delete: async (name) => deleted.push(name),
      open: async () => ({put: async (request) => {if (storageFailure) throw new Error('quota'); writes.push(request.url);}, match: async () => cached})},
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), ctx);
  return {writes, deleted, response, cached,
    activate: () => new Promise((resolve) => listeners.activate({waitUntil: resolve})),
    fetch: (url, headers = {}) => {
      let result;
      listeners.fetch({request: new Request(url, {headers}), respondWith: (promise) => {result = promise;}});
      return result;
    }};
}

test('service worker ignores private endpoints, external hosts and authenticated requests', () => {
  const w = worker();
  for (const url of ['https://school.example/api/students', 'https://school.example/__/auth/handler', 'https://other.example/app.js']) assert.equal(w.fetch(url), undefined);
  assert.equal(w.fetch('https://school.example/app.js', {Authorization: 'Bearer test'}), undefined);
  assert.equal(w.writes.length, 0);
});

test('service worker preserves network responses on cache failure and respects no-store', async () => {
  for (const options of [{storageFailure: true}, {cacheControl: 'no-store'}, {cacheControl: 'private'}]) {
    const w = worker(options);
    assert.equal(await w.fetch('https://school.example/app.js'), w.response);
    assert.equal(w.writes.length, 0);
  }
  const w = worker();
  await w.fetch('https://school.example/app.js');
  assert.equal(w.writes.length, 1);
});

test('offline requests use current cache and activation preserves other applications', async () => {
  const w = worker({offline: true});
  assert.equal(await w.fetch('https://school.example/index.html'), w.cached);
  await w.activate();
  assert.deepEqual(w.deleted, ['control-asistencia-old']);
});

test('report totals exclude holidays, hidden dates, absences and duplicate days', async () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const ctx = {normalizeCode: (v) => v, normalizeText: (v) => v,
    isTardyAbsence: (v) => v === 'FALTA POR RETARDOS', isJustifiedAbsence: (v) => v.justified === true};
  vm.runInNewContext(source.slice(source.indexOf('function attendanceCountsByStudent('), source.indexOf('function isJustifiedAbsence(')), ctx);
  const report = {students: [{id: 'STUDENT', name: 'Student'}],
    dates: ['2026-09-01', '2026-09-02', '2026-09-03'], calendarExceptions: [{date: '2026-09-02', type: 'festivo'}],
    rows: ['2026-09-01', '2026-09-01', '2026-09-02', '2026-09-06'].map((date) => ({studentId: 'STUDENT', date, status: 'A TIEMPO'}))};
  report.rows.push({studentId: 'STUDENT', date: '2026-09-03', status: 'FALTA NORMAL'});
  assert.equal(ctx.attendanceCountsByStudent(report).get('STUDENT'), 1);
  const mod = await import('../attendance-report-export.js');
  const data = mod.createAttendanceExportData({report, calendarExceptions: report.calendarExceptions, attendanceLabel: (r) => r.status});
  assert.equal(data.rows[7].at(-1), 1);
  assert.equal(data.rows[7][2], 'FESTIVO');
});

test('calendar validation rejects impossible dates before any database writes', () => {
  const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
  const fragment = source.slice(source.indexOf('  let calendarExceptions;'), source.indexOf('  const profile = {', source.indexOf('  let calendarExceptions;')));
  for (const date of ['2026-99-99', '2026-02-30', '', 'not-a-date']) {
    assert.throws(() => vm.runInNewContext(fragment, {input: {calendarExceptions: [{date, type: 'festivo'}]},
      HttpsError: class extends Error {constructor(code) {super(code); this.code = code;}}, normalizeText: (s) => s || ''}), {code: 'invalid-argument'});
  }
  assert.doesNotThrow(() => vm.runInNewContext(fragment, {input: {calendarExceptions: [{date: '2028-02-29', type: 'festivo'}]}, normalizeText: (s) => s || ''}));
});

test('unknown teacher status cannot use an authenticated callable', async () => {
  const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
  const fragment = source.slice(source.indexOf('async function assertActiveTeacher('), source.indexOf('async function assertRole('));
  const snapshot = (data) => ({exists: true, data: () => data, get: (key) => data[key]});
  const ctx = {requireIdentifier: (s) => s, ALLOWED_ROLES: new Set(['docente']),
    HttpsError: class extends Error {constructor(code) {super(code); this.code = code;}},
    schoolCollection: () => ({doc: () => ({get: async () => snapshot({status: 'archived', role: 'docente', passwordChangeRequired: false})})}),
    schoolsRef: () => ({doc: () => ({get: async () => snapshot({status: 'active'})})})};
  vm.runInNewContext(fragment, ctx);
  await assert.rejects(ctx.assertActiveTeacher({schoolKey: 'TEST', teacherId: 'TEACHER', role: 'docente', passwordChangeRequired: false}), {code: 'permission-denied'});
});
