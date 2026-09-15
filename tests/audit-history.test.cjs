const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('app.js', 'utf8');
const backend = fs.readFileSync('functions/index.js', 'utf8');
function element(tag) { return {tag, children: [], dataset: {}, append(...items) {this.children.push(...items);}, replaceChildren() {this.children=[];}, querySelectorAll() {return [];}}; }
test('history groups schools, sorts newest first and hides expired records', () => {
  const body=element('div'), status={};
  const now=Date.now();
  const context={window:{}, document:{createElement:element}, byId:id=>id==='audit-history-body'?body:id==='audit-history-status'?status:null,
    normalizeText:v=>String(v||''), auditCategory:()=>'', auditDateLabel:String, AUDIT_ACTION_LABELS:{}, createCell:v=>v,
    auditSchoolNames:new Map(), auditHistory:[{schoolKey:'A',createdAt:now-5},{schoolKey:'B',createdAt:now},{schoolKey:'A',createdAt:now-1},{schoolKey:'OLD',createdAt:now-15*86400000}]};
  vm.runInNewContext(app.slice(app.indexOf('window.renderAuditHistory ='),app.indexOf('window.loadAuditHistory =')),context);
  context.window.renderAuditHistory();
  assert.deepEqual(body.children.map(x=>x.dataset.schoolKey),['B','A']);
  const rows=body.children[1].children[1].children[0].children[1].children;
  assert.equal(rows[0].children[0],String(now-1));
  assert.equal(rows[1].children[0],String(now-5));
});
test('history loads all pages and rejects obsolete simultaneous results', async () => {
  let calls=0, renders=0;
  const context={window:{renderAuditHistory:()=>renders++}, loggedTeacher:{role:'super'}, byId:()=>({}), auditHistoryLoadVersion:0,
    api:{listAuditLogs:async()=>({data:{logs:[{id:++calls}],nextCursor:calls===1?{id:'next'}:null}})}, functionError:String};
  vm.runInNewContext(app.slice(app.indexOf('window.loadAuditHistory ='),app.indexOf('function recordClientAudit')),context);
  await context.window.loadAuditHistory();
  assert.equal(calls,2); assert.equal(context.auditHistory.length,2); assert.equal(renders,1);
  let resolve;
  context.api.listAuditLogs=()=>new Promise(r=>resolve=r);
  const pending=context.window.loadAuditHistory();
  context.auditHistoryLoadVersion++;
  resolve({data:{logs:[{id:'obsolete'}]}});
  await pending;
  assert.equal(context.auditHistory.length,2); assert.equal(renders,1);
});
test('cleanup deletes expired audit batches only and awaits commits', async () => {
  let calls=0,commits=0; const deleted=[], predicates=[];
  const query={where:(...args)=>{predicates.push(args);return query;},orderBy:()=>query,limit:()=>query,get:async()=>++calls===1?{empty:false,size:2,docs:[{ref:'old1'},{ref:'old2'}]}:{empty:true}};
  const context={exports:{},onSchedule:(_,fn)=>fn,AUDIT_RETENTION_MS:14*86400000,Timestamp:{fromMillis:v=>v},auditLogsRef:()=>query,
    console:{info:()=>{}},db:{batch:()=>({delete:ref=>deleted.push(ref),commit:async()=>commits++})}};
  vm.runInNewContext(backend.slice(backend.indexOf('exports.cleanupAuditLogs ='),backend.indexOf('exports.listAuditLogs =')),context);
  const before=Date.now()-14*86400000;
  await context.exports.cleanupAuditLogs();
  assert.deepEqual(deleted,['old1','old2']); assert.equal(commits,1);
  assert.equal(predicates[0][0],'createdAt'); assert.equal(predicates[0][1],'<'); assert.ok(predicates[0][2]>=before);
});
