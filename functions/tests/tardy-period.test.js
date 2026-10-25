"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {applyPeriodTardyPolicy, attendancePeriodForDate, validateAttendancePeriods} = require("../attendance-utils");
const {recalculateTardies} = require("../attendance-corrections");
const first = {start: "2026-09-01", end: "2026-09-30"};
const second = {start: "2026-10-01", end: "2026-10-31"};
const base = {arrivalStatus: "RETARDO", tardiesPerAbsence: 3, attendancePeriod: first,
  pendingTardies: 2, pendingAttendancePeriod: "2026-09-01/2026-09-30"};
test("period dates are inclusive and gaps have no active rule", () => {
  assert.equal(attendancePeriodForDate([first], first.start), first);
  assert.equal(attendancePeriodForDate([first], first.end), first);
  assert.equal(attendancePeriodForDate([first], "2026-10-01"), null);
});
test("third tardy resets the count but keeps the institutional period", () => {
  const result = applyPeriodTardyPolicy({...base, date: first.end});
  assert.equal(result.status, "FALTA POR RETARDOS");
  assert.equal(result.pendingTardies, 0);
  assert.equal(result.pendingAttendancePeriod, base.pendingAttendancePeriod);
  assert.equal(applyPeriodTardyPolicy({...base, ...result, date: first.end}).pendingTardies, 1);
});
test("new period resets pending tardies even without captures between periods", () => {
  const result = applyPeriodTardyPolicy({...base, date: second.start, attendancePeriod: second});
  assert.equal(result.status, "RETARDO");
  assert.equal(result.pendingTardies, 1);
});
test("outside periods tardies are recorded without automatic absences", () => {
  for (const attendancePeriod of [null, first]) {
    const result = applyPeriodTardyPolicy({...base, date: "2026-11-01", attendancePeriod});
    assert.equal(result.pendingTardies, 0);
    assert.equal(result.convertedToAbsence, false);
  }
});
test("validate periods: real dates, ordered limits, overlap, adjacent periods", () => {
  for (const rows of [null, [{start: "2026-02-30", end: first.end}], [{start: first.end, end: first.start}], [first, first], [first, {start: first.end, end: second.end}]]) {
    assert.throws(() => validateAttendancePeriods(rows));
  }
  assert.deepEqual(validateAttendancePeriods([second, first]), [first, second]);
  assert.deepEqual(validateAttendancePeriods([{start: first.start, end: first.start}]), [{start: first.start, end: first.start}]);
});
test("corrections do not carry counts or tardy absences across periods", () => {
  const records = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-10-01", "2026-10-02"].map((fecha, i) =>
    ({id: String(i), data: {fecha, status: "RETARDO", tardyLimitApplied: 3, attendancePeriodApplied: i < 3 ? first : second}}));
  const result = recalculateTardies(records);
  assert.equal(result.tardyAbsences, 0);
  assert.equal(result.pendingTardies, 2);
  assert.equal(result.updates.find(r => r.id === "2").fields.status, "FALTA POR RETARDOS");
  const corrected = recalculateTardies(records.filter(r => r.id !== "1"));
  assert.equal(corrected.pendingTardies, 2);
  assert.equal(corrected.updates.find(r => r.id === "2").fields.status, "RETARDO");
});
