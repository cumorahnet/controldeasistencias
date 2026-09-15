"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const {attendanceWindow, clockMinutes} = require("../functions/attendance-utils");

test("el HTML no instala controladores ficticios de acceso, cámara o guardado", () => {
  assert.doesNotMatch(html, /Mock Data|teacher123|Simulate API call|window\.currentUser\s*=/);
  assert.equal((html.match(/src="\.\/app\.js\?/g) || []).length, 1);
  assert.doesNotMatch(html, /id="btn-own-schedule"|onclick="window\.openScheduleSetup\(false\)"/);
});

test("el navegador y servidor coinciden en los límites y horarios heredados", () => {
  const context = vm.createContext({loggedTeacher: {classDuration: 90}, currentSchool: {}});
  vm.runInContext(app.slice(app.indexOf("function scheduleClockMinutes("), app.indexOf("function studentMatchesSelectedAttendanceGroup(")), context);
  for (const [schedule, clock, iso] of [
    [{entryTime: "08:30", classDuration: 50}, "08:29", "2026-09-05T14:29:00Z"],
    [{entryTime: "08:30", classDuration: 50}, "09:20", "2026-09-05T15:20:00Z"],
    [{entryTime: "08:30"}, "09:40", "2026-09-05T15:40:00Z"],
    [{entryTime: "23:30", classDuration: 60}, "00:10", "2026-09-06T06:10:00Z"],
  ]) {
    const browser = context.teacherAttendanceAvailability(schedule, new Date(iso));
    const server = attendanceWindow(clock, schedule.entryTime, schedule.classDuration ?? 90);
    assert.equal(browser.allowed, server.allowed);
    assert.equal(browser.endTime, server.endTime);
  }
});

function scheduleHarness(role = "admin_maestro") {
  const state = {assignedSubjects: ["Matemáticas", "Español"], groupSchedules: []};
  const context = vm.createContext({
    exports: {}, onCall: (handler) => handler,
    assertRole: async () => ({role, teacherId: "real-teacher"}),
    ATTENDANCE_ROLES: [], assertSameSchool: (_, key) => key,
    normalizeSchoolLevel: (value) => value, normalizeGroupName: (value) => value,
    normalizeText: (value, max) => String(value || "").trim().slice(0, max),
    clockMinutes, HttpsError: class extends Error {constructor(code, message) {super(message); this.code = code;}},
    schoolCollection: () => ({doc: () => ({})}),
    FieldValue: {serverTimestamp: () => "server-time"},
    db: {runTransaction: async (callback) => callback({
      get: async () => ({exists: true, get: (key) => state[key]}),
      set: (_, fields) => Object.assign(state, fields),
    })},
  });
  vm.runInContext(backend.slice(backend.indexOf("exports.updateOwnSchedule ="), backend.indexOf("exports.completeTeacherOnboarding =")), context);
  return {state, save: (data) => context.exports.updateOwnSchedule({data: {schoolKey: "SCHOOL", level: "SEC", group: "1A", entryTime: "08:30", tolerance: 10, classDuration: 50, subject: "Matemáticas", ...data}})};
}

test("guarda materia y horario de varios grupos sin reemplazar los demás", async () => {
  const {state, save} = scheduleHarness();
  await save({});
  await save({group: "2B", subject: "Español"});
  await save({entryTime: "09:30"});
  assert.equal(state.groupSchedules.length, 2);
  assert.equal(state.groupSchedules.find((item) => item.group === "1A").entryTime, "09:30");
  assert.equal(state.groupSchedules.find((item) => item.group === "2B").subject, "Español");
});

test("rechaza escritura docente y parámetros administrativos inválidos sin guardar", async () => {
  const {state, save} = scheduleHarness("docente");
  await assert.rejects(save({subject: "Otra"}), {code: "permission-denied"});
  await assert.rejects(scheduleHarness("admin_maestro").save({classDuration: "abc"}), {code: "invalid-argument"});
  assert.equal(state.groupSchedules.length, 0);
});

test("el docente no puede guardar parámetros administrativos aunque manipule la solicitud", async () => {
  const {state, save} = scheduleHarness("docente");
  await assert.rejects(save({tolerance: 120, classDuration: "abc", recessReturnTime: "invalid"}), {code: "permission-denied"});
  assert.equal(state.groupSchedules.length, 0);
});

test("el navegador ignora parámetros docentes antiguos y refleja cambios del plantel", () => {
  const school = {tolerance: 10, classDuration: 45, recessReturnTime: "11:00"};
  const teacher = {role: "docente", tolerance: 120, classDuration: 200, groupSchedules: [{level: "SEC", group: "1A", entryTime: "08:30", tolerance: 100, classDuration: 240, recessReturnTime: "15:00"}]};
  const context = vm.createContext({loggedTeacher: teacher, currentSchool: school, normalizeSchoolLevel: (v) => v, normalizeGroupName: (v) => v});
  vm.runInContext(app.slice(app.indexOf("function effectiveSchedule("), app.indexOf("function populateScheduleForm(")), context);
  vm.runInContext(app.slice(app.indexOf("function activeTeacherClass("), app.indexOf("function configuredGroupSchedule(")), context);
  vm.runInContext(app.slice(app.indexOf("function scheduleClockMinutes("), app.indexOf("function studentMatchesSelectedAttendanceGroup(")), context);
  let schedule = context.effectiveSchedule("SEC", "1A");
  assert.equal(schedule.tolerance, 10);
  assert.equal(schedule.classDuration, 45);
  assert.equal(schedule.recessReturnTime, "11:00");
  assert.equal(context.teacherAttendanceAvailability(teacher.groupSchedules[0], new Date("2026-09-05T15:20:00Z")).allowed, false);
  school.classDuration = 60;
  school.tolerance = 0;
  schedule = context.effectiveSchedule("SEC", "1A");
  assert.equal(schedule.tolerance, 0);
  assert.equal(schedule.classDuration, 60);
  assert.equal(context.teacherAttendanceAvailability(teacher.groupSchedules[0], new Date("2026-09-05T15:20:00Z")).allowed, false);
});

test("las cuentas docentes anteriores tampoco pueden guardar horarios propios", async () => {
  const {state, save} = scheduleHarness("docente");
  delete state.assignedSubjects;
  await assert.rejects(save({subject: ""}), {code: "permission-denied"});
  assert.equal(state.groupSchedules.length, 0);
});
