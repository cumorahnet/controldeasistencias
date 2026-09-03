"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {applyTardyPolicy, attendanceStatus, resolveAttendanceSchedule, tardyLimit} = require("../attendance-utils");

test("clasifica como asistencia dentro de la tolerancia", () => {
  assert.equal(attendanceStatus("07:14:59", "07:00", 15), "A TIEMPO");
  assert.equal(attendanceStatus("07:15:00", "07:00", 15), "A TIEMPO");
});

test("clasifica como retardo después de la tolerancia", () => {
  assert.equal(attendanceStatus("07:16:00", "07:00", 15), "RETARDO");
});

test("convierte en falta el retardo que alcanza el límite y reinicia el contador", () => {
  assert.deepEqual(applyTardyPolicy({arrivalStatus: "RETARDO", tardiesPerAbsence: 3, pendingTardies: 1}), {
    status: "RETARDO",
    convertedToAbsence: false,
    pendingTardies: 2,
    tardyLimit: 3,
  });
  assert.deepEqual(applyTardyPolicy({arrivalStatus: "RETARDO", tardiesPerAbsence: 3, pendingTardies: 2}), {
    status: "FALTA POR RETARDOS",
    convertedToAbsence: true,
    pendingTardies: 0,
    tardyLimit: 3,
  });
});

test("la equivalencia de retardos se puede desactivar y limita valores inválidos", () => {
  assert.equal(tardyLimit(""), 0);
  assert.equal(tardyLimit(99), 30);
  assert.equal(applyTardyPolicy({arrivalStatus: "RETARDO", tardiesPerAbsence: 0, pendingTardies: 4}).status, "RETARDO");
});

test("un docente requiere horario específico para el grupo", () => {
  const result = resolveAttendanceSchedule({
    role: "docente",
    level: "PRI",
    group: "2 A",
    teacher: {groupSchedules: []},
    school: {entryTime: "07:00", tolerance: 10},
  });

  assert.equal(result.requiresTeacherSetup, true);
  assert.equal(result.configuredForGroup, false);
});

test("usa la hora y tolerancia configuradas por el docente para el grupo", () => {
  const result = resolveAttendanceSchedule({
    role: "docente",
    level: "PRI",
    group: "2 A",
    teacher: {
      groupSchedules: [
        {level: "PRI", group: "1 A", entryTime: "07:00", tolerance: 5},
        {level: "PRI", group: "2 A", entryTime: "08:30", tolerance: 12},
      ],
    },
    school: {entryTime: "06:45", tolerance: 20},
  });

  assert.equal(result.requiresTeacherSetup, false);
  assert.equal(result.entryTime, "08:30");
  assert.equal(result.tolerance, 12);
});

test("otros roles pueden usar el horario institucional", () => {
  const result = resolveAttendanceSchedule({
    role: "porteria",
    level: "SEC",
    group: "B",
    teacher: {},
    school: {entryTime: "07:20", tolerance: 8},
  });

  assert.equal(result.requiresTeacherSetup, false);
  assert.equal(result.entryTime, "07:20");
  assert.equal(result.tolerance, 8);
});
