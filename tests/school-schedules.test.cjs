const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const utils = require("../functions/attendance-utils");
const {validateTimetable} = require("../functions/school-timetable");
const backend = fs.readFileSync("functions/index.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const row = (changes = {}) => ({id: "math", teacherId: "DOC1", subject: "Matemáticas", level: "SEC", group: "1A", day: 1, entryTime: "08:00", endTime: "09:00", ...changes});
class HttpsError extends Error {constructor(code, message) {super(message); this.code = code;}}

test("el servidor rechaza horarios de niveles no habilitados", async () => {
  const {state, save} = adminHarness();
  state.school.levels = ["PRI"];
  await assert.rejects(save(), {code: "failed-precondition"});
  await assert.rejects(save({schedules: [], timetable: {workDays: [1], groups: [{level: "SEC", group: "1A", entryTime: "08:00", endTime: "10:00", modulesPerDay: 2, breakMinutes: 0}]}}), {code: "failed-precondition"});
  assert.equal(state.school.schedulesRevision, 0);
  await save({schedules: [row({level: "PRI"})]});
  assert.equal(state.school.subjectSchedules[0].level, "PRI");
});

test("guarda materias sin docentes y asigna después validando cruces", async () => {
  const {state, save} = adminHarness();
  state.teacher = null;
  const pending = [row({teacherId: ""}), row({teacherId: "", group: "2A"})];
  await save({schedules: pending});
  assert.equal(state.school.subjectSchedules.length, 2);
  assert.equal(utils.activeSchoolSchedule(state.school, "DOC1", new Date("2026-09-07T14:30:00Z")), undefined);
  assert.equal(utils.activeSchoolSchedule(state.school, "", new Date("2026-09-07T14:30:00Z")), undefined);
  await assert.rejects(save({revision: 1, schedules: [pending[0], {...pending[1], group: "1A"}]}), {code: "invalid-argument"});
  state.teacher = {role: "docente", status: "active"};
  await assert.rejects(save({revision: 1, schedules: pending.map((r) => ({...r, teacherId: "DOC1"}))}), {code: "invalid-argument"});
  await save({revision: 1, schedules: [row(), pending[1]]});
  assert.equal(utils.activeSchoolSchedule(state.school, "DOC1", new Date("2026-09-07T14:30:00Z")).group, "1A");
});

test("valida días, campos, horas y cruces de docente o grupo", () => {
  for (const changes of [{day: 7}, {day: "1"}, {subject: " "}, {subject: {}}, {entryTime: "25:00"}, {endTime: "08:00"}, {endTime: "07:00"}]) {
    assert.throws(() => utils.validateSubjectSchedules([row(changes)]));
  }
  assert.throws(() => utils.validateSubjectSchedules([row(), row({teacherId: "DOC2"})]), /superpuestas/);
  assert.throws(() => utils.validateSubjectSchedules([row(), row({group: "2A"})]), /superpuestas/);
  assert.doesNotThrow(() => utils.validateSubjectSchedules([row(), row({entryTime: "09:00", endTime: "10:00"}), row({day: 2}), row({teacherId: "DOC2", group: "2A"})]));
});

test("navegador y servidor coinciden en inicio, fin, cambio de materia y día", () => {
  const school = {subjectSchedules: [row(), row({id: "spanish", subject: "Español", entryTime: "09:00", endTime: "10:00"})]};
  const context = vm.createContext({currentSchool: school, loggedTeacher: {id: "DOC1", role: "docente"}});
  vm.runInContext(app.slice(app.indexOf("function activeTeacherClass("), app.indexOf("function configuredGroupSchedule(")), context);
  vm.runInContext(app.slice(app.indexOf("function scheduleClockMinutes("), app.indexOf("function studentMatchesSelectedAttendanceGroup(")), context);
  for (const [iso, expected] of [["2026-09-07T13:59:00Z", undefined], ["2026-09-07T14:00:00Z", "math"], ["2026-09-07T14:59:59Z", "math"], ["2026-09-07T15:00:00Z", "spanish"], ["2026-09-07T16:00:00Z", undefined], ["2026-09-08T14:00:00Z", undefined]]) {
    const date = new Date(iso);
    assert.equal(utils.activeSchoolSchedule(school, "DOC1", date)?.id, expected);
    assert.equal(context.activeTeacherClass(date)?.id, expected);
    assert.equal(utils.activeSchoolSchedule(school, "DOC2", date), undefined);
  }
  const wrongGroup = utils.resolveAttendanceSchedule({role: "docente", teacherId: "DOC1", school, level: "SEC", group: "2A", now: new Date("2026-09-07T14:00:00Z")});
  assert.equal(wrongGroup.requiresTeacherSetup, true);
  school.subjectSchedules = [];
  assert.equal(context.activeTeacherClass(new Date("2026-09-07T14:00:00Z")), undefined);
});

function adminHarness(role = "admin_jr") {
  const state = {school: {schedulesRevision: 0, subjectSchedules: []}, teacher: {role: "docente", status: "active"}, audits: []};
  const snapshot = (data) => ({exists: Boolean(data), get: (key) => data?.[key]});
  const context = vm.createContext({
    exports: {}, onCall: (fn) => fn, HttpsError, ...utils, validateTimetable,
    ADMIN_ROLES: new Set(["admin_jr", "admin_maestro", "director", "super"]),
    assertRole: async (_, roles) => {if (!roles.has(role)) throw new HttpsError("permission-denied"); return {role, teacherId: "ADMIN"};},
    assertSameSchool: (_, key) => {if (key !== "SCHOOL") throw new HttpsError("permission-denied"); return key;},
    requireIdentifier: (value) => value, normalizeText: (value) => String(value).trim(), normalizeSchoolLevel: (value) => value.toUpperCase(), normalizeGroupName: (value) => value.toUpperCase(),
    schoolsRef: () => ({doc: () => "school"}), schoolCollection: () => ({doc: (id) => id}),
    randomBytes: () => ({toString: () => "generated-id"}), FieldValue: {serverTimestamp: () => 1},
    writeAuditLog: async (_, event) => state.audits.push(event),
    db: {runTransaction: async (callback) => callback({get: async (ref) => snapshot(ref === "school" ? state.school : state.teacher), update: (_, data) => Object.assign(state.school, data)})},
  });
  vm.runInContext(backend.slice(backend.indexOf("exports.updateSchoolSchedules ="), backend.indexOf("exports.completeTeacherOnboarding =")), context);
  return {state, save: (data = {}) => context.exports.updateSchoolSchedules({data: {schoolKey: "SCHOOL", revision: 0, schedules: [row()], ...data}})};
}

test("administradores guardan la tabla del plantel y conservan IDs sin cambios", async () => {
  for (const role of ["admin_jr", "admin_maestro", "director", "super"]) {
    const {state, save} = adminHarness(role);
    await save();
    assert.equal(state.school.schedulesRevision, 1);
    assert.equal(state.school.subjectSchedules[0].id, "generated-id");
    await save({revision: 1});
    assert.equal(state.school.subjectSchedules[0].id, "generated-id");
    assert.equal(state.audits.length, 2);
    await assert.rejects(save(), {code: "aborted"});
    assert.equal(state.school.schedulesRevision, 2);
    await save({revision: 2, schedules: []});
    assert.equal(state.school.subjectSchedules.length, 0);
  }
});

test("guarda jornada sin materias y valida módulos también frente a clientes anteriores", async () => {
  const {state, save} = adminHarness();
  const timetable = {workDays: [1, 2, 3, 4, 5], groups: [{level: "SEC", group: "1A", entryTime: "08:00", endTime: "10:00", modulesPerDay: 2, breakMinutes: 0}]};
  await save({schedules: [], timetable});
  assert.equal(state.school.timetable.groups.length, 1);
  await save({revision: 1, timetable});
  assert.equal(state.school.subjectSchedules[0].entryTime, "08:00");
  await assert.rejects(save({revision: 2, schedules: [row({endTime: "09:30"})]}), {code: "invalid-argument"});
  await assert.rejects(save({revision: 2, timetable: {...timetable, workDays: [2]}}), {code: "invalid-argument"});
  await assert.rejects(save({revision: 0, timetable}), {code: "aborted"});
  assert.equal(state.school.schedulesRevision, 2);
});

test("rechaza docentes, portería, otro plantel, cuentas inactivas y cruces normalizados", async () => {
  for (const role of ["docente", "porteria"]) await assert.rejects(adminHarness(role).save(), {code: "permission-denied"});
  const {state, save} = adminHarness();
  await assert.rejects(save({schoolKey: "OTHER"}), {code: "permission-denied"});
  await assert.rejects(save({schedules: [row(), row({group: "1a", teacherId: "DOC2"})]}), {code: "invalid-argument"});
  await assert.rejects(save({schedules: [row({endTime: "14:00"})]}), {code: "invalid-argument"});
  state.teacher.status = "disabled";
  await assert.rejects(save(), {code: "invalid-argument"});
  state.teacher = null;
  await assert.rejects(save(), {code: "invalid-argument"});
  assert.equal(state.school.schedulesRevision, 0);
});

test("cada clase admite una asistencia propia y bloquea repeticiones o solicitudes fuera de horario", async () => {
  let time = "2026-09-07T14:00:00Z";
  const records = new Map();
  const school = {tolerance: 10, subjectSchedules: [row(), row({id: "spanish", subject: "Español", entryTime: "09:00", endTime: "10:00"})]};
  const student = {level: "SEC", grupo: "1A", nombres: "Alumno"};
  const snap = (data) => ({exists: Boolean(data), data: () => data, get: (key) => data?.[key]});
  const read = (path) => snap(path === "school" ? school : path.startsWith("alumnos/") ? student : path.startsWith("maestros/") ? {} : records.get(path));
  const ref = (path) => ({path, get: async () => read(path)});
  const context = vm.createContext({
    exports: {}, onCall: (fn) => fn, HttpsError, ...utils,
    Date: class extends Date {constructor(...args) {super(...(args.length ? args : [time]));}},
    ATTENDANCE_ROLES: [], assertRole: async () => ({role: "docente", teacherId: "DOC1"}), assertSameSchool: (_, key) => key,
    requireIdentifier: (v) => v, normalizeText: (v) => String(v || ""), normalizeCode: (v) => String(v || "").toUpperCase(), normalizeSchoolLevel: (v) => v, normalizeGroupName: (v) => v,
    schoolCollection: (_, name) => ({doc: (id) => ref(`${name}/${id}`)}), schoolsRef: () => ({doc: () => ref("school")}),
    FieldValue: {serverTimestamp: () => 1}, db: {runTransaction: async (callback) => callback({get: async (r) => read(r.path), create: (r, data) => records.set(r.path, data), set: () => {}})},
  });
  vm.runInContext(backend.slice(backend.indexOf("exports.recordAttendance ="), backend.indexOf("exports.justifyAttendance =")), context);
  const record = (changes = {}) => context.exports.recordAttendance({data: {schoolKey: "SCHOOL", studentId: "STUD1", scheduleLevel: "SEC", scheduleGroup: "1A", ...changes}});
  assert.equal((await record()).created, true);
  assert.equal((await record()).created, false);
  time = "2026-09-07T15:00:00Z";
  assert.equal((await record()).created, true);
  assert.equal(records.size, 2);
  assert.deepEqual([...records.values()].map((r) => r.subject), ["Matemáticas", "Español"]);
  await assert.rejects(record({scheduleGroup: "2A"}), {code: "failed-precondition"});
  time = "2026-09-07T16:00:00Z";
  await assert.rejects(record(), {code: "failed-precondition"});
  time = "2026-09-08T14:00:00Z";
  await assert.rejects(record(), {code: "failed-precondition"});
});


test("guarda catálogo sin clases, lo conserva para clientes anteriores y valida duplicados", async () => {
  const {state, save} = adminHarness();
  const timetable = {workDays: [1, 2, 3, 4, 5], groups: [], subjects: [{name: "Matemáticas", code: "MAT"}]};
  await save({schedules: [], timetable});
  assert.equal(state.school.timetable.subjects[0].name, "MATEMÁTICAS");
  await save({revision: 1, schedules: [], timetable: {workDays: [1], groups: []}});
  assert.equal(state.school.timetable.subjects[0].name, "MATEMÁTICAS");
  await assert.rejects(save({revision: 2, schedules: [], timetable: {...timetable, subjects: [...timetable.subjects, {name: "matematicas"}]}}), {code: "invalid-argument"});
  assert.equal(state.school.schedulesRevision, 2);
  await save({revision: 2, schedules: [], timetable: {...timetable, subjects: []}});
  assert.equal(state.school.timetable.subjects.length, 0);
});

test('jornadas por nivel persisten sin grupos y clientes anteriores las conservan', async () => {
 const {state,save}=adminHarness();
 const journey={entryTime:'08:00',endTime:'14:00',modulesPerDay:6,breakMinutes:0};
 state.school.levels=['PRI','SEC'];
 await save({schedules:[],timetable:{workDays:[1],groups:[],levelJourneys:{PRI:journey,SEC:{...journey,entryTime:'07:00'}}}});
 assert.equal(state.school.timetable.levelJourneys.SEC.entryTime,'07:00');
 await save({revision:1,schedules:[],timetable:{workDays:[1],groups:[]}});
 assert.equal(state.school.timetable.levelJourneys.SEC.entryTime,'07:00');
 await assert.rejects(save({revision:2,schedules:[],timetable:{workDays:[1],groups:[],levelJourneys:{BAC:journey}}}),{code:'failed-precondition'});
 assert.equal(state.school.schedulesRevision,2);
});
