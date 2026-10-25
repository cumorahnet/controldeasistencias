'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const utils = require('../functions/attendance-utils');
const {recalculateTardies} = require('../functions/attendance-corrections');
const app = fs.readFileSync('app.js','utf8');
const periods = [{start:'2026-09-01',end:'2026-09-30'}];
const school = {entryTime:"08:00",tolerance:10,tardiesPerAbsence:4,attendancePeriods:periods,
 timetablePreferences:{journeyMode:'levels'},levelAttendancePolicies:{
 PRI:{tolerance:15,tardiesPerAbsence:3,attendancePeriods:periods},
 SEC:{tolerance:5,tardiesPerAbsence:2,attendancePeriods:[{start:'2026-09-01',end:'2026-09-15'}]}}};

test('reglas institucionales y por nivel resuelven tolerancia, limites y periodos sin mezclar niveles',()=>{
 assert.equal(utils.resolveAttendancePolicy(school,'PRI').tolerance,15);
 assert.equal(utils.resolveAttendancePolicy(school,'SEC').tardiesPerAbsence,2);
 assert.equal(utils.attendancePeriodForDate(utils.resolveAttendancePolicy(school,'SEC').attendancePeriods,'2026-09-16'),null);
 assert.equal(utils.resolveAttendancePolicy({...school,timetablePreferences:{journeyMode:'institutional'}},'SEC').tolerance,10);
 assert.equal(utils.resolveAttendancePolicy({...school,levelAttendancePolicies:undefined},'SEC').tardiesPerAbsence,4);
 const policy = utils.applyPeriodTardyPolicy({arrivalStatus:'RETARDO',tardiesPerAbsence:2,date:'2026-09-02',attendancePeriod:periods[0],attendancePolicyScope:'SEC',pendingAttendancePeriod:'PRI:2026-09-01/2026-09-30',pendingTardies:1});
 assert.equal(policy.pendingTardies,1);
 assert.equal(policy.convertedToAbsence,false);
});

test('validacion rechaza niveles, tolerancias, limites y periodos invalidos',()=>{
 assert.deepEqual(utils.validateLevelAttendancePolicies(school.levelAttendancePolicies),school.levelAttendancePolicies);
 for(const input of [null,[],{BAD:school.levelAttendancePolicies.PRI},{PRI:{...school.levelAttendancePolicies.PRI,tolerance:NaN}},{PRI:{...school.levelAttendancePolicies.PRI,tolerance:121}},{PRI:{...school.levelAttendancePolicies.PRI,tardiesPerAbsence:2.5}},{PRI:{...school.levelAttendancePolicies.PRI,attendancePeriods:[]}}]) assert.throws(()=>utils.validateLevelAttendancePolicies(input));
});

test('docente y porteria aplican la tolerancia del nivel y porteria hereda la entrada de la jornada',()=>{
 const configured={...school,timetable:{levelJourneys:{SEC:{entryTime:'07:00'}}},subjectSchedules:[{id:'class',teacherId:'DOC1',level:'SEC',group:'1A',day:1,entryTime:'08:00',endTime:'09:00',subject:'MAT'}]};
 const gate=utils.resolveAttendanceSchedule({role:'porteria',school:configured,level:'SEC',teacher:{entryTime:'09:00',tolerance:99}});
 assert.equal(gate.entryTime,'07:00'); assert.equal(gate.tolerance,5);
 const teacher=utils.resolveAttendanceSchedule({role:'docente',school:configured,teacherId:'DOC1',level:'SEC',group:'1A',now:new Date('2026-09-07T14:10:00Z')});
 assert.equal(teacher.tolerance,5);
 assert.equal(utils.attendanceStatus('08:10',teacher.entryTime,teacher.tolerance),'RETARDO');
 assert.equal(utils.attendanceStatus('08:10',teacher.entryTime,utils.resolveAttendancePolicy(configured,'PRI').tolerance),'A TIEMPO');
});

test('recalculo conserva el alcance historico y reinicia al cambiar de nivel',()=>{
 const record=(id,scope)=>({id,data:{fecha:'2026-09-02',hora:'08:01',arrivalStatus:'RETARDO',status:'RETARDO',tardyLimitApplied:2,attendancePeriodApplied:periods[0],attendancePolicyScopeApplied:scope,tardySequence:1,absenceType:'',justified:false}});
 const result=recalculateTardies([record('a','PRI'),record('b','SEC')]);
 assert.equal(result.pendingTardies,1);assert.equal(result.tardyAbsences,0);
});

function editor(){
 class Element{constructor(){this.value='';this.children=[];this.checked=false;this.hidden=false;}
 replaceChildren(...children){this.children=children;} add(child){this.children.push(child);} append(...children){this.children.push(...children);} setAttribute(){} }
 const fields=new Map(); const byId=id=>{if(!fields.has(id))fields.set(id,new Element());return fields.get(id);};
 const context=vm.createContext({window:{showModalMsg:()=>{}},document:{createElement:()=>new Element()},byId,Option:class{constructor(text,value){this.text=text;this.value=value;}},STUDENT_LEVEL_LABELS:{PRE:'Preescolar',PRI:'Primaria',SEC:'Secundaria',BAC:'Bachillerato'}});
 vm.runInContext('let attendancePeriodsDraft=[];let institutionalAttendancePolicyDraft={};let levelAttendancePoliciesDraft={};let attendancePolicyScopeDraft="";',context);
 vm.runInContext(app.slice(app.indexOf('function configuredAttendancePolicyLevels()'),app.indexOf('function populateReportPeriods()')),context);
 byId('edit-level-PRI').checked=true; byId('edit-level-SEC').checked=true;
 return {context,byId,run:code=>vm.runInContext(code,context)};
}

test('editor conserva reglas, fechas pendientes y periodos independientes al cambiar nivel y modo',()=>{
 const {context,byId,run}=editor();context.school=school;
 byId('edit-journey-mode').value='levels';run('initializeAttendancePolicyEditor(school)');
 assert.equal(byId('attendance-policy-level-field').hidden,false);
 assert.equal(byId('edit-tolerance').value,15);
 byId('edit-tolerance').value='20';byId('attendance-period-start').value='2026-10-01';
 byId('attendance-policy-level').value='SEC';context.window.selectAttendancePolicyLevel();
 assert.equal(byId('edit-tolerance').value,5);
 assert.equal(byId('attendance-period-start').value,'');
 byId('attendance-period-start').value='2026-10-01';byId('attendance-period-end').value='2026-10-15';context.window.addAttendancePeriod();
 byId('attendance-policy-level').value='PRI';context.window.selectAttendancePolicyLevel();
 assert.equal(byId('edit-tolerance').value,20);assert.equal(byId('attendance-period-start').value,'2026-10-01');
 assert.equal(run('attendancePeriodsDraft.length'),1);
 byId('edit-journey-mode').value='institutional';context.window.changeAttendancePolicyMode();
 assert.equal(byId('attendance-policy-level-field').hidden,true);assert.equal(byId('edit-tolerance').value,10);
 byId('edit-tolerance').value='12';const profile=run('attendancePolicyProfile()');
 assert.equal(profile.tolerance,12);assert.equal(profile.levelAttendancePolicies.PRI.tolerance,20);
 assert.equal(profile.levelAttendancePolicies.SEC.attendancePeriods.length,2);
 context.saved=profile;run('initializeAttendancePolicyEditor(saved)');
 byId('edit-journey-mode').value='levels';context.window.changeAttendancePolicyMode();
 assert.equal(byId('edit-tolerance').value,20);
 byId('edit-tardies-per-absence').value='31';assert.throws(()=>run('attendancePolicyProfile()'));
});

test('agregar nivel hereda reglas institucionales y quitarlo del selector conserva los otros borradores',()=>{
 const {context,byId,run}=editor();context.school=school;byId('edit-journey-mode').value='levels';run('initializeAttendancePolicyEditor(school)');
 byId('edit-level-BAC').checked=true;context.window.refreshAttendancePolicyLevels();
 byId('attendance-policy-level').value='BAC';context.window.selectAttendancePolicyLevel();assert.equal(byId('edit-tolerance').value,10);
 byId('edit-level-BAC').checked=false;context.window.refreshAttendancePolicyLevels();assert.equal(byId('attendance-policy-level').value,'PRI');
 assert.equal(run('attendancePolicyProfile().levelAttendancePolicies.SEC.tolerance'),5);
});

test('Escuela elige jornada antes de los ajustes de asistencia y no duplica controles',()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.ok(html.indexOf('id="edit-journey-mode"')<html.indexOf('id="edit-tolerance"'));
 for(const id of ['edit-journey-mode','edit-tolerance','edit-tardies-per-absence','attendance-periods-list','attendance-policy-level'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
});

test('capturas reales por nivel respetan tolerancia, conversion y fin de periodo',async()=>{
 let instant='2026-09-07T14:10:00Z';
 const students={PRI:{level:'PRI',grupo:'1A',nombres:'Primaria'},SEC:{level:'SEC',grupo:'1A',nombres:'Secundaria'}};
 const records=new Map();
 const configured={...school,timetablePreferences:{...school.timetablePreferences,levelWorkDays:{PRI:[1],SEC:[1,2,3]}},timetable:{levelJourneys:{PRI:{entryTime:'08:00'},SEC:{entryTime:'07:00'}}}};
 const snap=data=>({exists:Boolean(data),data:()=>data,get:key=>data?.[key]});
 const read=path=>snap(path==='school'?configured:path.startsWith('alumnos/')?students[path.split('/')[1]]:path.startsWith('maestros/')?{}:records.get(path));
 const ref=path=>({path,get:async()=>read(path)});
 const context=vm.createContext({...utils,exports:{},onCall:fn=>fn,HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},
 Date:class extends Date{constructor(...args){super(...(args.length?args:[instant]));}},
 ATTENDANCE_ROLES:[],assertRole:async()=>({role:'porteria',teacherId:'GATE'}),assertSameSchool:(_,key)=>key,
 requireIdentifier:v=>v,normalizeText:v=>String(v||''),normalizeCode:v=>String(v||''),normalizeSchoolLevel:v=>v,normalizeGroupName:v=>v,
 schoolCollection:(_,name)=>({doc:id=>ref(`${name}/${id}`)}),schoolsRef:()=>({doc:()=>ref('school')}),FieldValue:{serverTimestamp:()=>1},
 db:{runTransaction:async fn=>fn({get:async r=>read(r.path),create:(r,data)=>records.set(r.path,data),set:(r,data)=>Object.assign(students[r.path.split('/')[1]],data)})}});
 const backend=fs.readFileSync('functions/index.js','utf8');
 vm.runInContext(backend.slice(backend.indexOf('exports.recordAttendance ='),backend.indexOf('exports.justifyAttendance =')),context);
 const capture=level=>context.exports.recordAttendance({data:{schoolKey:'SCHOOL',studentId:level}});
 assert.equal((await capture('PRI')).status,'A TIEMPO');
 assert.equal((await capture('SEC')).status,'RETARDO');
 assert.equal(students.SEC.pendingTardies,1);
 instant='2026-09-08T14:10:00Z';assert.equal((await capture('SEC')).status,'FALTA POR RETARDOS');
 assert.equal(students.SEC.pendingTardies,0);
 instant='2026-09-16T14:10:00Z';assert.equal((await capture('SEC')).status,'RETARDO');
 const outside=records.get('asistencias/2026-09-16_SEC');
 assert.equal(outside.attendancePeriodApplied,null);assert.equal(outside.tardyLimitApplied,0);
 assert.equal(outside.toleranceApplied,5);assert.equal(outside.attendancePolicyScopeApplied,'SEC');
 assert.equal(records.get('asistencias/2026-09-07_PRI').toleranceApplied,15);
 instant='2026-09-13T14:10:00Z';await assert.rejects(capture('SEC'),{code:'failed-precondition'});
 assert.equal(records.has('asistencias/2026-09-13_SEC'),false);
});

test('dias laborables se configuran despues de niveles y se conservan al cambiar nivel y jornada',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.ok(html.indexOf('id="edit-level-BAC"')<html.indexOf('id="edit-work-day-1"'));
 const {context,byId,run}=editor();context.school={...school,timetablePreferences:{journeyMode:'levels',workDays:[1,2,3,4,5],levelWorkDays:{PRI:[1,3,5],SEC:[2,4,6]}}};
 byId('edit-journey-mode').value='levels';run('initializeAttendancePolicyEditor(school)');
 assert.equal(byId('edit-work-day-1').checked,true);assert.equal(byId('edit-work-day-6').checked,false);
 byId('edit-work-day-5').checked=false;
 byId('attendance-policy-level').value='SEC';context.window.selectAttendancePolicyLevel();
 assert.equal(byId('edit-work-day-1').checked,false);assert.equal(byId('edit-work-day-6').checked,true);
 byId('edit-work-day-0').checked=true;
 const prefs=run('attendancePolicyProfile().timetablePreferences');
 assert.deepEqual([...prefs.levelWorkDays.PRI],[1,3]);assert.deepEqual([...prefs.levelWorkDays.SEC],[2,4,6,0]);
 byId('edit-journey-mode').value='institutional';context.window.changeAttendancePolicyMode();assert.equal(byId('edit-work-day-1').checked,true);assert.equal(byId('edit-work-day-6').checked,false);
 byId('edit-journey-mode').value='levels';context.window.changeAttendancePolicyMode();assert.equal(byId('edit-work-day-0').checked,true);
 for(const day of [0,1,2,3,4,5,6])byId(`edit-work-day-${day}`).checked=false;
 assert.throws(()=>run('attendancePolicyProfile()'),/día laborable/);
});

test('exportacion distingue dias no laborables y conserva capturas historicas existentes',()=>{
 const source=fs.readFileSync('attendance-report-export.js','utf8').replace(/^export /gm,'');
 const context=vm.createContext({});vm.runInContext(source,context);
 const report={students:[{id:'PRI1',name:'Primaria',level:'PRI'},{id:'SEC1',name:'Secundaria',level:'SEC'}],dates:['2026-09-07','2026-09-12'],rows:[],levelWorkDays:{PRI:[1],SEC:[6]}};
 const data=context.createAttendanceExportData({report});
 assert.equal(data.rows[7][1],'FALTA NORMAL');assert.equal(data.rows[7][2],'DÍA NO LABORABLE');
 assert.equal(data.rows[8][1],'DÍA NO LABORABLE');assert.equal(data.rows[8][2],'FALTA NORMAL');
 report.rows=[{studentId:'PRI1',date:'2026-09-12',status:'A TIEMPO'}];
 const historic=context.createAttendanceExportData({report});assert.equal(historic.rows[7][2],'ASISTENCIA');assert.equal(historic.rows[7][3],1);
});

test('los dias y reglas esperan a que se seleccione al menos un nivel ofrecido',()=>{
 const {context,byId,run}=editor();context.school=school;byId('edit-journey-mode').value='levels';
 byId('edit-level-PRI').checked=false;byId('edit-level-SEC').checked=false;run('initializeAttendancePolicyEditor(school)');
 assert.equal(byId('school-attendance-configuration').hidden,true);
 byId('edit-level-PRI').checked=true;context.window.refreshAttendancePolicyLevels();assert.equal(byId('school-attendance-configuration').hidden,false);
});

test('entrada visible por nivel recupera jornadas anteriores y conserva horas al alternar',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/id="edit-entry-time"[^>]+type="time"/);
 const {context,byId,run}=editor();context.school={...school,timetable:{journey:{entryTime:'07:30'},levelJourneys:{PRI:{entryTime:'07:00'},SEC:{entryTime:'08:00'}}}};
 byId('edit-journey-mode').value='levels';run('initializeAttendancePolicyEditor(school)');assert.equal(byId('edit-entry-time').value,'07:00');
 byId('edit-entry-time').value='07:15';byId('attendance-policy-level').value='SEC';context.window.selectAttendancePolicyLevel();assert.equal(byId('edit-entry-time').value,'08:00');
 byId('edit-entry-time').value='08:10';const profile=run('attendancePolicyProfile()');assert.equal(profile.levelEntryTimes.PRI,'07:15');assert.equal(profile.levelEntryTimes.SEC,'08:10');
 byId('edit-journey-mode').value='institutional';context.window.changeAttendancePolicyMode();assert.equal(byId('edit-entry-time').value,'07:30');
 byId('edit-entry-time').value='07:45';assert.equal(run('attendancePolicyProfile().entryTime'),'07:45');
 byId('edit-journey-mode').value='levels';context.window.changeAttendancePolicyMode();assert.equal(byId('edit-entry-time').value,'08:10');
 byId('edit-entry-time').value='';assert.throws(()=>run('attendancePolicyProfile()'),/hora de entrada/);
});

test('entrada general respeta alcance configurado y no reemplaza la clase docente',()=>{
 const config={...school,entryTime:'07:30',levelEntryTimes:{PRI:'07:00',SEC:'08:00'},timetable:{journey:{entryTime:'06:00'}},subjectSchedules:[{id:'lesson',teacherId:'DOC1',level:'SEC',group:'1A',day:1,entryTime:'09:00',endTime:'09:45'}]};
 const gate=utils.resolveAttendanceSchedule({school:config,role:'porteria',level:'SEC',teacher:{entryTime:'10:00'}});assert.equal(gate.entryTime,'08:00');
 const institutional=utils.resolveAttendanceSchedule({school:{...config,timetablePreferences:{journeyMode:'institutional'}},role:'porteria',level:'SEC'});assert.equal(institutional.entryTime,'07:30');
 const teacher=utils.resolveAttendanceSchedule({school:config,role:'docente',teacherId:'DOC1',level:'SEC',group:'1A',now:new Date('2026-09-07T15:06:00Z')});assert.equal(teacher.entryTime,'09:00');assert.equal(teacher.classDuration,45);assert.equal(utils.attendanceStatus('09:06',teacher.entryTime,teacher.tolerance,teacher.classDuration),'RETARDO');
 for(const invalid of [{SEC:'24:00'},{BAD:'08:00'},{SEC:'8:00'},{SEC:'08:00:00'},{SEC:''}])assert.throws(()=>utils.validateLevelEntryTimes(invalid));
});

test('la interfaz docente usa la clase activa y su duracion al cambiar de modulo',()=>{
 let instant='2026-09-07T14:06:00Z';
 const currentSchool={...school,classDuration:180,levelEntryTimes:{SEC:'06:30'},subjectSchedules:[{id:'first',teacherId:'DOC1',level:'SEC',group:'1A',day:1,entryTime:'08:00',endTime:'08:45'},{id:'second',teacherId:'DOC1',level:'SEC',group:'1A',day:1,entryTime:'08:45',endTime:'09:35'}]};
 const context=vm.createContext({currentSchool,loggedTeacher:{id:'DOC1',role:'docente',entryTime:'05:00',classDuration:200},normalizeSchoolLevel:v=>v,normalizeGroupName:v=>v,Date:class extends Date{constructor(...args){super(...(args.length?args:[instant]));}}});
 vm.runInContext(app.slice(app.indexOf('function activeTeacherClass('),app.indexOf('function studentMatchesSelectedAttendanceGroup(')),context);
 vm.runInContext(app.slice(app.indexOf('function effectiveSchedule('),app.indexOf('function populateScheduleForm(')),context);
 const first=context.effectiveSchedule('SEC','1A');assert.equal(first.entryTime,'08:00');assert.equal(first.classDuration,45);assert.equal(context.teacherAttendanceAvailability(first).allowed,true);
 instant='2026-09-07T14:45:00Z';assert.equal(context.teacherAttendanceAvailability(first).allowed,false);
 const second=context.effectiveSchedule('SEC','1A');assert.equal(second.entryTime,'08:45');assert.equal(second.classDuration,50);assert.equal(context.teacherAttendanceAvailability(second).allowed,true);
 instant='2026-09-07T15:35:00Z';assert.equal(context.teacherAttendanceAvailability(second).allowed,false);
});
