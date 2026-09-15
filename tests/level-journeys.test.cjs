const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {generateModules, validateTimetable, applyJourney, journeyForLevel} = require('../school-timetable');
const journey = {entryTime:'08:00',endTime:'14:00',modulesPerDay:6,breakMinutes:0,recessStart:'',recessEnd:''};
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
  const context = vm.createContext({schoolLevels: () => ["PRI", "SEC"], window: {SchoolTimetable: {generateModules, validateTimetable, applyJourney, journeyForLevel}, confirm: () => true}, document: {createElement: () => new Element()}, byId, Option: class {constructor(text, value) {this.text = text; this.value = value;}}, teacherCatalogCache: [{id: "DOC1", nombre: "Docente", role: "docente", status: "active"}]});
  const app = fs.readFileSync("app.js", "utf8");
  vm.runInContext(app.slice(app.indexOf("let schoolScheduleDraft ="), app.indexOf("let schoolScheduleRevision =")), context);
  vm.runInContext("function renderSchoolSchedules() {}", context);
  return {context, byId, run: (code) => vm.runInContext(code, context)};
}

test('aplicar por nivel conserva los otros niveles y persiste sin grupos', () => {
 const original = {workDays:[1], journey, groups:[{level:'PRI',group:'1A',...journey},{level:'SEC',group:'1A',...journey}]};
 const rows = original.groups.map(g=>({level:g.level,group:g.group,day:1,subject:'Mate',teacherId:'',entryTime:'08:00',endTime:'09:00'}));
 const result = applyJourney(original,rows,{...journey,entryTime:'07:00',endTime:'13:00'},['SEC']);
 assert.deepEqual(result.timetable.groups[0],original.groups[0]);
 assert.deepEqual(result.schedules[0],rows[0]);
 assert.equal(result.schedules[1].entryTime,'07:00');
 assert.equal(original.groups[1].entryTime,'08:00');
 const saved=validateTimetable(JSON.parse(JSON.stringify(result.timetable)),result.schedules);
 assert.equal(journeyForLevel(saved,'SEC').entryTime,'07:00');
 assert.equal(journeyForLevel(saved,'PRI').entryTime,'08:00');
 const empty=applyJourney({workDays:[1],groups:[]},[],journey,['PRI','SEC']);
 assert.equal(journeyForLevel(validateTimetable(empty.timetable,[]),'PRI').entryTime,'08:00');
 assert.throws(()=>applyJourney(original,rows,journey,[]));
 assert.throws(()=>validateTimetable({...original,levelJourneys:{BAD:journey}},rows));
 assert.throws(()=>applyJourney(original,[{...rows[1],entryTime:'13:00',endTime:'14:00'}],{...journey,modulesPerDay:3},['SEC']));
});
test('editor conserva jornada al cambiar grupo y permite otra por nivel', () => {
 const {context,byId,run}=editor();
 run('initializeTimetableEditor()');
 const apply=()=>context.window.applyInstitutionalJourney({preventDefault(){}});
 apply();
 assert.equal(run('schoolTimetableDraft.levelJourneys.PRI.entryTime'),'08:00');
 byId('timetable-journey-levels').children[0].children[0].checked=false;
 byId('timetable-entry').value='07:00';
 apply();
 assert.equal(run('schoolTimetableDraft.levelJourneys.PRI.entryTime'),'08:00');
 assert.equal(run('schoolTimetableDraft.levelJourneys.SEC.entryTime'),'07:00');
 run('schoolTimetableDraft.subjects = [{name:"Matem?ticas"}]');
 context.window.selectGroupTimetable('SEC/1A');
 context.window.generateGroupTimetable({preventDefault(){}});
 assert.equal(run('schoolTimetableDraft.groups[0].entryTime'),'07:00');
 context.window.selectGroupTimetable('PRI/1A');
 context.window.generateGroupTimetable({preventDefault(){}});
 assert.equal(run('schoolTimetableDraft.groups[1].entryTime'),'08:00');
 run('schoolTimetableDraft = JSON.parse(JSON.stringify(schoolTimetableDraft)); initializeTimetableEditor()');
 assert.equal(run('schoolTimetableDraft.levelJourneys.SEC.entryTime'),'07:00');
 byId('timetable-load-level').value='SEC'; context.window.loadLevelJourney();
 assert.equal(byId('timetable-entry').value,'07:00');
 assert.equal(byId('timetable-journey-levels').children[0].children[0].checked,false);
});
