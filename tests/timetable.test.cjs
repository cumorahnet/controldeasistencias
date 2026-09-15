const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const SchoolTimetable = require("../school-timetable");
const {generateModules, validateTimetable} = SchoolTimetable;
const group = (changes = {}) => ({level: "SEC", group: "1A", entryTime: "08:00", endTime: "14:00", modulesPerDay: 6, breakMinutes: 5, recessStart: "", recessEnd: "", ...changes});
const config = (changes = {}) => ({workDays: [1, 2, 3, 4, 5], groups: [group()], ...changes});

test("motor del navegador y del servidor idénticos", () => {
  assert.equal(fs.readFileSync("school-timetable.js", "utf8"), fs.readFileSync("functions/school-timetable.js", "utf8"));
});
test("genera módulos y descansos continuos hasta la salida sin perder minutos", () => {
  for (let count = 2; count <= 20; count++) {
    const slots = generateModules(group({modulesPerDay: count}));
    assert.equal(slots[0].entryTime, "08:00");
    assert.equal(slots.at(-1).endTime, "14:00");
    assert.equal(slots.filter((s) => s.type === "module").length, count);
    assert.equal(slots.filter((s) => s.type === "break").length, count - 1);
    slots.forEach((s, i) => {assert.ok(s.entryTime < s.endTime); if (i) assert.equal(slots[i - 1].endTime, s.entryTime);});
  }
  assert.equal(generateModules(group({breakMinutes: 0})).length, 6);
});
test("respeta receso fijo sin cortar clases ni sumar un descanso junto al receso", () => {
  const slots = generateModules(group({recessStart: "10:30", recessEnd: "11:00"}));
  const index = slots.findIndex((s) => s.type === "recess");
  assert.deepEqual(slots[index], {type: "recess", entryTime: "10:30", endTime: "11:00"});
  assert.equal(slots[index - 1].type, "module"); assert.equal(slots[index + 1].type, "module");
  assert.equal(slots[index - 1].endTime, "10:30"); assert.equal(slots[index + 1].entryTime, "11:00");
  assert.equal(slots.filter((s) => s.type === "module").length, 6);
  assert.equal(slots.at(-1).endTime, "14:00");
});
test("rechaza jornadas, recesos y cantidades inviables", () => {
  for (const changes of [{entryTime: "25:00"}, {endTime: "07:00"}, {modulesPerDay: 0}, {modulesPerDay: 1.5}, {modulesPerDay: 21}, {breakMinutes: -1}, {breakMinutes: NaN}, {breakMinutes: 120}, {recessStart: "10:00"}, {recessStart: "07:00", recessEnd: "09:00"}, {recessStart: "10:00", recessEnd: "10:00"}, {modulesPerDay: 1}]) assert.throws(() => generateModules(group(changes)));
  assert.equal(generateModules(group({modulesPerDay: 1, endTime: "09:00"})).length, 1);
});
test("valida días y clases por módulo manteniendo grupos con horarios anteriores", () => {
  const first = generateModules(group())[0];
  const row = {level: "SEC", group: "1A", day: 1, entryTime: first.entryTime, endTime: first.endTime};
  assert.doesNotThrow(() => validateTimetable(config(), [row]));
  assert.doesNotThrow(() => validateTimetable(config(), [{...row, group: "2A", endTime: "09:00"}]));
  assert.throws(() => validateTimetable(config(), [{...row, endTime: "09:00"}]));
  assert.throws(() => validateTimetable(config(), [{...row, day: 0}]));
  for (const workDays of [[], [1, 1], [7], ["1"]]) assert.throws(() => validateTimetable(config({workDays}), []));
  assert.throws(() => validateTimetable(config({groups: [group(), group({group: "1a"})]}), []));
  assert.throws(() => validateTimetable(config({groups: [group({group: ""})]}), []));
});

function editor() {
  class Element {
    constructor() {this.children = []; this.value = ""; this.listeners = {}; this.options = [];}
    append(...children) {this.children.push(...children);}
    replaceChildren(...children) {this.children = children; this.options = children;}
    add(option) {this.options.push(option);}
    setAttribute() {}
    addEventListener(name, fn) {this.listeners[name] = fn;}
    insertRow() {const row = new Element(); this.append(row); return row;}
    insertCell() {return this.insertRow();}
    createCaption() {return this.insertRow();}
    createTHead() {return this.insertRow();}
    createTBody() {return this.insertRow();}
  }
  const elements = new Map();
  const byId = (id) => {if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id);};
  const context = vm.createContext({schoolLevels: () => ["SEC"], window: {SchoolTimetable, confirm: () => true}, document: {createElement: () => new Element()}, byId, Option: class {constructor(text, value) {this.text = text; this.value = value;}}, teacherCatalogCache: [{id: "DOC1", nombre: "Docente", role: "docente", status: "active"}]});
  const app = fs.readFileSync("app.js", "utf8");
  vm.runInContext(app.slice(app.indexOf("let schoolScheduleDraft ="), app.indexOf("let schoolScheduleRevision =")), context);
  vm.runInContext("function renderSchoolSchedules() {}", context);
  return {context, byId, run: (code) => vm.runInContext(code, context)};
}

function preparedEditor() {
  const h = editor();
  h.run('initializeTimetableEditor()');
  h.context.window.applyInstitutionalJourney({preventDefault() {}});
  h.byId('timetable-subject-name').value = 'Matemáticas';
  h.context.window.addTimetableSubject({preventDefault() {}});
  h.byId('timetable-group').value = '1a';
  h.context.window.generateGroupTimetable({preventDefault() {}});
  return h;
}
const firstCell = (h) => h.byId('timetable-grid').children[0].children[2].children[0].children[1];

test('editor conserva materias y docentes entre grupos y permite vaciar celdas', () => {
  const h = preparedEditor(), {context, byId, run} = h;
  assert.equal(run('schoolTimetableDraft.groups[0].group'), '1A');
  const table = byId('timetable-grid').children[0];
  assert.deepEqual(table.children[1].children[0].children.map(c => c.textContent), ['Horario','Lunes','Martes','Miércoles','Jueves','Viernes']);
  const field = firstCell(h).children[0]; field.value = 'mat'; field.listeners.input(); field.listeners.change();
  assert.equal(field.value, 'MATEMÁTICAS');
  const assignment = byId('timetable-assignments').children[0].children[1];
  assignment.value = 'DOC1'; assignment.listeners.change();
  context.window.selectGroupTimetable('SEC/2A');
  context.window.generateGroupTimetable({preventDefault() {}});
  assert.equal(run('schoolTimetableDraft.groups.length'), 2);
  context.window.selectGroupTimetable('SEC/1A');
  assert.equal(firstCell(h).children[0].value, 'MATEMÁTICAS');
  assert.equal(run('schoolScheduleDraft[0].teacherId'), 'DOC1');
  firstCell(h).children[1].listeners.click();
  assert.equal(run('schoolScheduleDraft.length'), 0);
});

test('jornada continua y con traslado se aplica antes de generar y persiste al reabrir', () => {
  const {context, byId, run} = preparedEditor();
  for (const [mode, gap] of [['continuous',0], ['break',13]]) {
    byId('timetable-break-mode').value = mode;
    context.window.updateTimetableBreakMode(); byId('timetable-break').value = String(gap);
    assert.equal(byId('timetable-break').disabled, mode === 'continuous');
    assert.equal(byId('timetable-generate').disabled, true);
    context.window.applyInstitutionalJourney({preventDefault() {}});
    assert.equal(run('schoolTimetableDraft.groups[0].breakMinutes'), gap);
    run('schoolTimetableDraft = JSON.parse(JSON.stringify(schoolTimetableDraft)); initializeTimetableEditor()');
    assert.equal(byId('timetable-break-mode').value, mode);
    assert.equal(byId('timetable-break').value, gap);
  }
});

test('editor rechaza desactivar días ocupados y reducir módulos con materias', () => {
  const {context, byId, run} = preparedEditor();
  run("schoolScheduleDraft = window.SchoolTimetable.generateModules(schoolTimetableDraft.groups[0]).filter(s => s.type === 'module').map(s => ({level:'SEC',group:'1A',day:1,entryTime:s.entryTime,endTime:s.endTime,subject:'MATEMÁTICAS',teacherId:'DOC1'}))");
  const monday = byId('timetable-days').children[0].children[0];
  monday.checked = false; monday.listeners.change(); assert.equal(monday.checked, true);
  byId('timetable-count').value = '2';
  context.window.applyInstitutionalJourney({preventDefault() {}});
  assert.equal(run('schoolScheduleDraft.length'), 6);
  assert.equal(run('schoolTimetableDraft.groups[0].modulesPerDay'), 6);
  assert.match(byId('school-schedules-status').textContent, /módulos que desaparecerían/);
});

test('catálogo normaliza nombres y rechaza duplicados sin depender de iniciales', () => {
  const subjects = [{name:' Matemáticas ',code:'MAT'}, {name:'Español'}];
  const saved = validateTimetable(config({subjects}), []);
  assert.equal(saved.subjects[0].name, 'MATEMÁTICAS');
  for (const name of ['matematicas', '', 'x'.repeat(81)]) assert.throws(() => validateTimetable(config({subjects:[...subjects,{name}]}), []));
  assert.deepEqual(validateTimetable(config({subjects:[]}), []).subjects, []);
});

test('sugerencias distinguen materias y bloquean quitar una materia con clases', () => {
  const h = preparedEditor(), {context,byId,run} = h;
  byId('timetable-subject-name').value = 'Materiales'; context.window.addTimetableSubject({preventDefault(){}});
  const field = firstCell(h).children[0]; field.value = 'mat'; field.listeners.input(); field.listeners.change();
  assert.equal(run('schoolScheduleDraft.length'), 0);
  assert.equal(run('timetablePendingSubjects.size'), 1);
  field.value = 'matem'; field.listeners.input(); field.listeners.change();
  assert.equal(field.value, 'MATEMÁTICAS'); assert.equal(run('timetablePendingSubjects.size'), 0);
  byId('timetable-subjects').children[0].children[1].listeners.click();
  assert.equal(run('schoolTimetableDraft.subjects.length'), 2);
  assert.match(byId('school-schedules-status').textContent, /Quite primero las clases/);
  firstCell(h).children[1].listeners.click();
  byId('timetable-subjects').children[0].children[1].listeners.click();
  assert.equal(run('schoolTimetableDraft.subjects.length'), 1);
});

test('cambiar grupo conserva jornada aplicada y parámetros pendientes sin sobrescribirlos', () => {
  const {context,byId,run} = preparedEditor();
  byId('timetable-entry').value = '07:00'; byId('timetable-form').oninput();
  context.window.selectGroupTimetable('SEC/2A');
  assert.equal(byId('timetable-entry').value, '07:00');
  context.window.generateGroupTimetable({preventDefault(){}});
  assert.equal(run('schoolTimetableDraft.groups.length'), 1);
  context.window.applyInstitutionalJourney({preventDefault(){}});
  context.window.generateGroupTimetable({preventDefault(){}});
  assert.equal(run('schoolTimetableDraft.groups.length'), 2);
  assert.equal(run('schoolTimetableDraft.groups.every(g => g.entryTime === "07:00")'), true);
});

test('una materia pendiente sigue visible al cambiar grupo y bloquea desactivar su día', () => {
  const h = preparedEditor(), {context,byId,run} = h;
  const field = firstCell(h).children[0]; field.value = 'Sin completar'; field.listeners.input();
  context.window.selectGroupTimetable('SEC/2A'); context.window.selectGroupTimetable('SEC/1A');
  assert.equal(firstCell(h).children[0].value, 'Sin completar');
  const monday = byId('timetable-days').children[0].children[0];
  monday.checked = false; monday.listeners.change();
  assert.equal(monday.checked, true);
  assert.equal(run('schoolTimetableDraft.workDays.includes(1)'), true);
  firstCell(h).children[1].listeners.click();
  monday.checked = false; monday.listeners.change();
  assert.equal(run('schoolTimetableDraft.workDays.includes(1)'), false);
  assert.equal(run('timetablePendingSubjects.size'), 0);
});
