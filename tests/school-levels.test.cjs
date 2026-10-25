const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const app = fs.readFileSync("app.js", "utf8");
const backend = fs.readFileSync("functions/index.js", "utf8");

test("selectores muestran niveles configurados y restauran opciones al cambiar de plantel", () => {
  const fields = new Map();
  const byId = (id) => {
    if (!fields.has(id)) fields.set(id, {value: "SEC", options: [], replaceChildren() {this.options = [];}, add(option) {this.options.push(option);}});
    return fields.get(id);
  };
  const context = vm.createContext({currentSchool: {}, byId, STUDENT_LEVEL_LABELS: {PRE: "Preescolar", PRI: "Primaria", SEC: "Secundaria", BAC: "Bachillerato"}, Option: class {constructor(text, value) {this.text = text; this.value = value;}}});
  const start = app.indexOf("function schoolLevels(");
  const end = app.indexOf("\n}", app.indexOf("function refreshSchoolLevelSelectors", start)) + 2;
  vm.runInContext(app.slice(start, end), context);
  context.refreshSchoolLevelSelectors({levels: ["PRI"]});
  assert.equal(byId("timetable-level-field").hidden, true);
  for (const [id, field] of fields) {
    if (id === "timetable-level-field") continue;
    assert.deepEqual(field.options.map((o) => o.value), ["PRI"]);
    assert.equal(field.value, "PRI");
  }
  context.refreshSchoolLevelSelectors({levels: ["SEC", "BAC"]});
  assert.equal(byId("timetable-level-field").hidden, false);
  assert.deepEqual(byId("timetable-level").options.map((o) => o.value), ["SEC", "BAC"]);
  context.refreshSchoolLevelSelectors({});
  assert.equal(byId("batch-level").options.length, 4);
});

function harness() {
  const state = {school: {}, students: [], writes: []};
  const snapshot = () => ({exists: true, get: (key) => state.school[key]});
  const context = vm.createContext({exports: {}, onCall: (fn) => fn, MASTER_ROLES: new Set(),
    assertRole: async () => ({role: "director"}), assertSameSchool: (_, key) => key,
    normalizeText: (v) => String(v || "").trim(), normalizeCode: (v) => String(v || ""), normalizeSchoolLevel: (v) => v,
    ...require("../functions/attendance-utils"),
    validateLevelAttendancePolicies: require("../functions/attendance-utils").validateLevelAttendancePolicies,
    validateAttendancePeriods: require("../functions/attendance-utils").validateAttendancePeriods,
    tardyLimit: require("../functions/attendance-utils").tardyLimit, FieldValue: {serverTimestamp: () => 1},
    HttpsError: class extends Error {constructor(code, message) {super(message); this.code = code;}},
    schoolsRef: () => ({doc: () => ({get: async () => snapshot()})}), schoolCollection: () => "students",
    db: {runTransaction: async (fn) => fn({get: async (ref) => ref === "students" ? {docs: state.students.map((s) => ({data: () => s}))} : snapshot(), set: (_, data) => {state.writes.push(data); Object.assign(state.school, data);}})},
    writeAuditLog: async () => {},
  });
  vm.runInContext(backend.slice(backend.indexOf("exports.updateSchool ="), backend.indexOf("exports.updateTeacherSubjects =")), context);
  return {state, save: (profile) => context.exports.updateSchool({data: {schoolKey: "SCHOOL", profile: {name: "Escuela", tolerance: 0, tardiesPerAbsence: 0, ...profile}}})};
}

test("guarda niveles válidos y conserva la configuración cuando un cliente anterior no la envía", async () => {
  const {state, save} = harness();
  await save({levels: ["BAC", "SEC"]});
  assert.equal(JSON.stringify(state.school.levels), '["SEC","BAC"]');
  await save({director: "Directora"});
  assert.equal(JSON.stringify(state.school.levels), '["SEC","BAC"]');
  for (const levels of [[], ["XXX"], ["SEC", "SEC"], "SEC", null]) await assert.rejects(save({levels}), {code: "invalid-argument"});
  assert.equal(state.writes.length, 2);
});

test("guarda días laborables y modo de jornada institucional", async () => {
  const {state, save} = harness();
  await save({timetablePreferences: {workDays: [1, 3, 5], journeyMode: "levels"}});
  assert.equal(JSON.stringify(state.school.timetablePreferences), JSON.stringify({workDays: [1, 3, 5], journeyMode: "levels"}));
  await assert.rejects(save({timetablePreferences: {workDays: [], journeyMode: "institutional"}}), {code: "invalid-argument"});
  await assert.rejects(save({timetablePreferences: {workDays: [1], journeyMode: "invalid"}}), {code: "invalid-argument"});
});

test("no desactiva niveles ocupados ni modifica datos al rechazar los ajustes", async () => {
  const {state, save} = harness();
  state.school.subjectSchedules = [{level: "SEC"}];
  await assert.rejects(save({levels: ["PRI"]}), {code: "failed-precondition"});
  state.school.subjectSchedules = [];
  state.school.timetable = {groups: [{level: "SEC"}]};
  await assert.rejects(save({levels: ["PRI"]}), {code: "failed-precondition"});
  state.school.timetable = {groups: []};
  state.students = [{level: "SEC", active: true}];
  await assert.rejects(save({levels: ["PRI"]}), {code: "failed-precondition"});
  assert.equal(state.writes.length, 0);
});

test("el acceso a horarios está únicamente dentro de ajustes institucionales", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.equal((html.match(/onclick="window.openSchoolSchedules\(\)"/g) || []).length, 1);
  assert.ok(html.indexOf('id="open-school-schedules"') > html.indexOf('id="div-mantenimiento-institucion"'));
});

test("valida periodos y los conserva para clientes anteriores", async () => {
  const {state, save} = harness();
  for (const attendancePeriods of [[], "invalid", [{start: "2026-02-30", end: "2026-03-01"}]]) {
    await assert.rejects(save({tardiesPerAbsence: 3, attendancePeriods}), {code: "invalid-argument"});
  }
  const periods = [{start: "2026-09-01", end: "2026-09-30"}];
  await save({tardiesPerAbsence: 3, attendancePeriods: periods});
  assert.equal(JSON.stringify(state.school.attendancePeriods), JSON.stringify(periods));
  await save({tardiesPerAbsence: 3});
  assert.equal(JSON.stringify(state.school.attendancePeriods), JSON.stringify(periods));
});

const levelPeriod = [{start:'2026-09-01', end:'2026-10-01'}];
test('guarda reglas distintas por nivel y conserva los valores al volver a jornada institucional', async () => {
 const {state, save} = harness();
 const levelAttendancePolicies = {PRI:{tolerance:15,tardiesPerAbsence:3,attendancePeriods:levelPeriod},SEC:{tolerance:5,tardiesPerAbsence:2,attendancePeriods:[]}};
 await assert.rejects(save({levels:['PRI','SEC'], timetablePreferences:{workDays:[1],journeyMode:'levels'},levelAttendancePolicies}), {code:'invalid-argument'});
 assert.equal(state.writes.length,0);
 levelAttendancePolicies.SEC.attendancePeriods = [{start:'2026-09-01',end:'2026-09-15'}];
 await save({levels:['PRI','SEC'],timetablePreferences:{workDays:[1],journeyMode:'levels'},levelAttendancePolicies});
 assert.equal(state.school.levelAttendancePolicies.PRI.tolerance,15);
 assert.equal(state.school.levelAttendancePolicies.SEC.tardiesPerAbsence,2);
 await save({tolerance:10,tardiesPerAbsence:0,attendancePeriods:[],timetablePreferences:{workDays:[1],journeyMode:'institutional'}});
 assert.equal(state.school.levelAttendancePolicies.SEC.tolerance,5);
 await assert.rejects(save({timetablePreferences:{workDays:[1],journeyMode:'levels'},levelAttendancePolicies:{PRI:levelAttendancePolicies.PRI}}),{code:'invalid-argument'});
});

test('guarda dias por nivel, preserva clientes anteriores y bloquea quitar dias con clases solo en ese nivel',async()=>{
 const {state,save}=harness();const prefs={workDays:[1,2,3,4,5],journeyMode:'levels',levelWorkDays:{PRI:[1,3,5],SEC:[2,4,6]}};
 await save({levels:['PRI','SEC'],timetablePreferences:prefs});assert.equal(JSON.stringify(state.school.timetablePreferences.levelWorkDays.SEC),'[2,4,6]');
 for(const levelWorkDays of [{PRI:[]},{PRI:[1,1],SEC:[6]},{BAD:[1]},{PRI:[7],SEC:[6]},{PRI:[1]}])await assert.rejects(save({timetablePreferences:{...prefs,levelWorkDays}}),{code:'invalid-argument'});
 await save({timetablePreferences:{workDays:[1,2,3,4,5],journeyMode:'levels'}});assert.equal(JSON.stringify(state.school.timetablePreferences.levelWorkDays.SEC),'[2,4,6]');
 state.school.subjectSchedules=[{level:'SEC',day:6}];
 await save({timetablePreferences:{...prefs,levelWorkDays:{PRI:[1],SEC:[6]}}});
 const writes=state.writes.length;
 await assert.rejects(save({timetablePreferences:{...prefs,levelWorkDays:{PRI:[1],SEC:[2]}}}),{code:'failed-precondition'});assert.equal(state.writes.length,writes);
 await assert.rejects(save({timetablePreferences:{...prefs,journeyMode:'institutional'}}),{code:'failed-precondition'});
});

test('guarda entradas independientes sin cambiar clases y conserva valores para clientes anteriores',async()=>{
 const {state,save}=harness();state.school.subjectSchedules=[{level:'SEC',day:1,entryTime:'09:00',endTime:'09:45'}];
 const preferences={workDays:[1],journeyMode:'levels'};
 await save({levels:['PRI','SEC'],entryTime:'07:30',levelEntryTimes:{PRI:'07:00',SEC:'08:00'},timetablePreferences:preferences});
 assert.equal(state.school.levelEntryTimes.PRI,'07:00');assert.equal(state.school.subjectSchedules[0].entryTime,'09:00');
 for(const levelEntryTimes of [{PRI:'07:00'},{PRI:'07:00',SEC:'24:00'},{BAD:'08:00'},null])await assert.rejects(save({levelEntryTimes,timetablePreferences:preferences}),{code:'invalid-argument'});
 await save({entryTime:'07:45',timetablePreferences:{...preferences,journeyMode:'institutional'}});assert.equal(state.school.levelEntryTimes.SEC,'08:00');
 await assert.rejects(save({entryTime:'',levelEntryTimes:{},timetablePreferences:{...preferences,journeyMode:'institutional'}}),{code:'invalid-argument'});
});
