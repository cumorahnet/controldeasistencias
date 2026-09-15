"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const {recalculateTardies} = require("../functions/attendance-corrections");
const {tardyLimit} = require("../functions/attendance-utils");
const backend = fs.readFileSync(require.resolve("../functions/index.js"), "utf8");

function harness({role = "admin_jr", records = [], student = {}, school = {}} = {}) {
  const writes = [];
  const error = class extends Error {constructor(code, message) {super(message); this.code = code;}};
  const ref = (id) => ({id});
  const snapshot = (data) => ({exists: true, data: () => data, get: (key) => data[key]});
  const context = {
    exports: {}, onCall: (handler) => handler, HttpsError: error,
    ADMIN_ROLES: new Set(["admin_jr", "admin_maestro", "director"]),
    assertRole: async (_, roles) => {if (!roles.has(role) && role !== "super") throw new error("permission-denied"); return {role, schoolKey: "SCHOOL", sub: "actor"};},
    assertSameSchool: (_, key) => {if (key !== "SCHOOL") throw new error("permission-denied"); return key;},
    requireIdentifier: (id) => id,
    requireDate: (date) => {if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new error("invalid-argument"); return date;},
    requireText: (text) => {if (!text || text.trim().length < 3) throw new error("invalid-argument"); return text.trim();},
    normalizeText: (text) => text || "", normalizeSchoolLevel: (level) => level, normalizeGroupName: (group) => group,
    tardyLimit, recalculateTardies, FieldValue: {serverTimestamp: () => "server-time"},
    schoolsRef: () => ({doc: () => ref("school")}), auditLogsRef: () => ({doc: () => ref("audit")}), auditLogData: (_, data) => data,
    schoolCollection: (_, type) => ({doc: (id) => ref(type === "alumnos" ? "student" : id), where: (_, op, id) => ({limit: () => ({queryId: id})})}),
    db: {runTransaction: async (callback) => callback({
      get: async (reference) => {
        if (reference.id === "student") return snapshot({level: "SEC", grupo: "1A", ...student});
        if (reference.id === "school") return snapshot({tardiesPerAbsence: 3, ...school});
        return {docs: records.filter((r) => r.data.alumnoId === reference.queryId).map((r) => ({id: r.id, ref: ref(r.id), data: () => r.data, updateTime: {toDate: () => new Date("2026-09-01T12:00:00Z")}}))};
      },
      set: (ref, data) => writes.push({id: ref.id, data}), create: (ref, data) => writes.push({id: ref.id, data}),
    })},
  };
  vm.runInNewContext(backend.slice(backend.indexOf("exports.correctAttendance ="), backend.indexOf("exports.justifyAttendance =")), context);
  return {writes, save: (data = {}) => context.exports.correctAttendance({data: {schoolKey: "SCHOOL", studentId: "STUDENT", date: "2026-09-01", status: "A TIEMPO", reason: "Omisión de captura", ...data}})};
}

test("corrección administrativa crea asistencia omitida y auditoría en la misma transacción", async () => {
  const h = harness();
  await h.save();
  assert.equal(h.writes.find((w) => w.id === "2026-09-01_STUDENT").data.status, "A TIEMPO");
  assert.equal(h.writes.find((w) => w.id === "audit").data.before, null);
});

test("rechaza docentes, portería, otro plantel, motivo vacío y fecha futura sin escribir", async () => {
  for (const role of ["docente", "porteria"]) await assert.rejects(harness({role}).save(), {code: "permission-denied"});
  for (const data of [{schoolKey: "OTHER"}, {reason: " "}, {date: "2099-01-01"}, {status: "INVALID"}, {time: "25:00"}]) {
    const h = harness();
    await assert.rejects(h.save(data));
    assert.equal(h.writes.length, 0);
  }
});

test("corrige el ID anterior sin duplicar y rechaza una versión obsoleta", async () => {
  const h = harness({student: {previousStudentIds: ["OLD"]}, records: [{id: "2026-09-01_OLD", data: {alumnoId: "OLD", fecha: "2026-09-01", status: "RETARDO", arrivalStatus: "RETARDO", tardyLimitApplied: 3}}]});
  await assert.rejects(h.save(), {code: "aborted"});
  assert.equal(h.writes.length, 0);
  await h.save({expectedVersion: "2026-09-01T12:00:00.000Z"});
  assert.equal(h.writes[0].id, "2026-09-01_OLD");
  assert.equal(h.writes[0].data.justified, false);
});

test("rechaza clases de otro grupo o día y acepta una clase histórica", async () => {
  const scheduleId = "a".repeat(32);
  await assert.rejects(harness({school: {subjectSchedules: [{id: scheduleId, level: "SEC", group: "2B", day: 2}]}}).save({scheduleId}), {code: "failed-precondition"});
  const h = harness({records: [{id: "historic", data: {alumnoId: "STUDENT", fecha: "2026-09-01", scheduleId, scheduleLevel: "SEC", scheduleGroup: "1A", scheduleDay: 2, status: "FALTA JUSTIFICADA"}}]});
  await h.save({scheduleId, expectedVersion: "2026-09-01T12:00:00.000Z"});
  assert.equal(h.writes[0].id, "historic");
});

test("eliminar un retardo revierte la falta acumulada y actualiza el contador", () => {
  const records = ["A TIEMPO", "RETARDO", "FALTA POR RETARDOS"].map((status, index) => ({id: String(index), data: {fecha: `2026-09-0${index + 1}`, status, arrivalStatus: index ? "RETARDO" : "A TIEMPO", tardyLimitApplied: 3}}));
  const result = recalculateTardies(records);
  assert.equal(result.pendingTardies, 2);
  assert.equal(result.tardyAbsences, 0);
  assert.equal(result.updates.find((r) => r.id === "2").fields.status, "RETARDO");
});

test("recalcula entre clases con límites históricos y no cuenta faltas normales", () => {
  const records = [0, 2, 2].map((limit, index) => ({id: String(index), data: {fecha: `2026-09-0${index + 1}`, status: "RETARDO", tardyLimitApplied: limit}}));
  records.push({id: "absence", data: {fecha: "2026-09-04", status: "FALTA NORMAL"}});
  const result = recalculateTardies(records);
  assert.equal(result.pendingTardies, 0);
  assert.equal(result.tardyAbsences, 1);
  assert.equal(result.updates.find((r) => r.id === "2").fields.status, "FALTA POR RETARDOS");
});
