"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {applyTardyPolicy, attendanceStatus, attendanceWindow, resolveAttendanceSchedule, tardyLimit} = require("../attendance-utils");

test("clasifica como asistencia dentro de la tolerancia", () => {
  assert.equal(attendanceStatus("07:14:59", "07:00", 15), "A TIEMPO");
  assert.equal(attendanceStatus("07:15:00", "07:00", 15), "A TIEMPO");
});

test("clasifica como retardo después de la tolerancia", () => {
  assert.equal(attendanceStatus("07:16:00", "07:00", 15), "RETARDO");
});

test("solo permite el pase de lista durante el módulo configurado", () => {
  assert.equal(attendanceWindow("08:29:59", "08:30", 50).allowed, false);
  assert.deepEqual(attendanceWindow("08:30:00", "08:30", 50), {
    allowed: true,
    startTime: "08:30",
    endTime: "09:20",
    duration: 50,
  });
  assert.equal(attendanceWindow("09:19:59", "08:30", 50).allowed, true);
  assert.equal(attendanceWindow("09:20:00", "08:30", 50).allowed, false);
});

test("la ventana de pase admite módulos que terminan después de medianoche", () => {
  assert.equal(attendanceWindow("00:10", "23:30", 60).allowed, true);
  assert.equal(attendanceWindow("00:30", "23:30", 60).allowed, false);
});

test("un módulo nocturno aplica la tolerancia después de medianoche", () => {
  assert.equal(attendanceStatus("00:10", "23:30", 10, 60), "RETARDO");
  assert.equal(attendanceStatus("00:05", "23:55", 10, 50), "A TIEMPO");
  assert.equal(attendanceStatus("00:06", "23:55", 10, 50), "RETARDO");
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

test("usa la clase administrativa vigente e ignora horarios docentes antiguos", () => {
  const result = resolveAttendanceSchedule({
    role: "docente",
    level: "PRI",
    group: "2 A",
    teacherId: "DOC1",
    now: new Date("2026-09-07T14:30:00Z"),
    teacher: {
      groupSchedules: [
        {level: "PRI", group: "1 A", entryTime: "07:00", tolerance: 5},
        {level: "PRI", group: "2 A", entryTime: "08:30", tolerance: 12, classDuration: 200},
      ],
    },
    school: {entryTime: "06:45", tolerance: 20, classDuration: 200,
      subjectSchedules: [{id: "clase1", teacherId: "DOC1", subject: "Matemáticas", level: "PRI", group: "2 A", day: 1, entryTime: "08:30", endTime: "09:15"}]},
  });

  assert.equal(result.requiresTeacherSetup, false);
  assert.equal(result.entryTime, "08:30");
  assert.equal(result.tolerance, 20);
  assert.equal(result.classDuration, 45);
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
