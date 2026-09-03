"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const functions = fs.readFileSync(path.join(projectRoot, "functions", "index.js"), "utf8");

test("el alta y el inicio docente no fuerzan la configuración inmediata de horarios", () => {
  assert.doesNotMatch(app, /teacherNeedsInitialScheduleSetup/);
  assert.doesNotMatch(app, /scheduleSetupRequired/);
  assert.match(app, /if \(tab === "scanner" && loggedTeacher\?\.role === "docente"\) \{\s*populateAttendanceGroupOptions\(\)/);
  assert.match(app, /Puede hacerlo en cualquier momento/);
  assert.match(html, /id="btn-close-schedule"/);
});

test("el docente selecciona un grupo antes de pasar lista", () => {
  assert.match(html, /id="teacher-attendance-group-panel"/);
  assert.match(html, /id="attendance-group"[^>]+selectAttendanceGroup\(\)/);
  assert.match(html, /Grupo para pasar lista/);
  assert.match(app, /function attendanceGroupReady\(openConfiguration = false\)/);
  assert.match(app, /window\.toggleCamera = async \(\) => \{\s*if \(!isScannerRunning && loggedTeacher\?\.role === "docente" && !attendanceGroupReady\(true\)\) return/);
  assert.match(app, /window\.manualAttendance = async \(\) => \{\s*if \(loggedTeacher\?\.role === "docente" && !attendanceGroupReady\(true\)\) return/);
});

test("un grupo sin horario abre la configuración en ese momento", () => {
  assert.match(app, /!configuredGroupSchedule\(selection\.level, selection\.group\)/);
  assert.match(app, /window\.openScheduleSetup\(true, \{level: selection\.level, grupo: selection\.group\}\)/);
  assert.match(app, /Configure el horario de este grupo para poder pasar lista/);
  assert.match(html, /id="btn-configure-attendance-group"/);
});

test("la búsqueda y el QR se limitan al grupo elegido", () => {
  assert.match(app, /filter\(\(student\) => studentMatchesSelectedAttendanceGroup\(student\)\)/);
  assert.match(app, /!studentMatchesSelectedAttendanceGroup\(student\)/);
  assert.match(app, /scheduleLevel: attendanceGroup\?\.level/);
  assert.match(app, /scheduleGroup: attendanceGroup\?\.group/);
  assert.match(functions, /selectedLevel !== studentLevel \|\| selectedGroup !== studentGroup/);
  assert.match(functions, /El alumno no pertenece al grupo seleccionado para el pase de lista/);
});

test("cada docente conserva horarios independientes para varios grupos", () => {
  assert.match(functions, /const currentSchedules = Array\.isArray\(snapshot\.get\("groupSchedules"\)\)/);
  assert.match(functions, /groupSchedules\.push\(schedule\)/);
  assert.match(functions, /groupSchedules: groupSchedules\.slice\(-200\)/);
  assert.match(app, /groupSchedules: \[\.\.\.groupSchedules, saved\]/);
});
