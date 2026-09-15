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

test("el docente recibe automáticamente el grupo de su clase", () => {
  assert.match(html, /id="teacher-attendance-group-panel"/);
  assert.match(html, /id="attendance-group"[^>]+selectAttendanceGroup\(\)/);
  assert.match(html, /Clase asignada por el administrador/);
  assert.match(app, /const active = activeTeacherClass\(\)/);
  assert.match(app, /function attendanceGroupReady\(openConfiguration = false\)/);
  assert.match(app, /window\.toggleCamera = async \(\) => \{\s*if \(!isScannerRunning && loggedTeacher\?\.role === "docente" && !attendanceGroupReady\(true\)\) return/);
  assert.match(app, /window\.manualAttendance = async \(\) => \{\s*if \(loggedTeacher\?\.role === "docente" && !attendanceGroupReady\(true\)\) return/);
});

test("el docente no dispone del editor de horarios y recibe aviso sin clase activa", () => {
  assert.doesNotMatch(html, /id="btn-own-schedule"/);
  assert.match(app, /if \(loggedTeacher\?\.role === "docente"\) return window.openSelectedAttendanceSchedule\(\)/);
  assert.match(app, /No tiene una clase activa/);
  assert.doesNotMatch(html, /id="btn-configure-attendance-group"/);
});

test("el docente solo puede pasar lista durante la clase que configuró el administrador", () => {
  assert.match(html, /El pase de lista solo estará disponible durante ese módulo/);
  assert.match(app, /function teacherAttendanceAvailability\(schedule, date = new Date\(\)\)/);
  assert.match(app, /if \(!active\) \{[\s\S]*?return false/);
  assert.match(app, /window\.showModalMsg\("Fuera de horario"/);
  assert.match(functions, /const availability = attendanceWindow\(hora, schedule\.entryTime, schedule\.classDuration\)/);
  assert.match(functions, /if \(!availability\.allowed\) \{[\s\S]*?solo está disponible de/);
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
