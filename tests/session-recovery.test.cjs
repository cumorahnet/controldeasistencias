const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
function harness() {
  const visible = new Map(); const messages = []; let handler; let signedOut = 0;
  const ctx = {auth: {}, loggedTeacher: {role: 'docente'}, unsubscribeAttendance: null,
    stopSchoolProfileListener() {}, document: {body: {classList: {remove() {}}}},
    window: {safeToggle: (id, hidden) => visible.set(id, !hidden), showModalMsg: (...args) => messages.push(args)},
    onAuthStateChanged: (_, fn) => {handler = fn;}, setConnection() {},
    enterApp: async () => {throw new Error('Fallo al preparar cámara');},
    functionError: (e) => e.message, normalizeText: (s) => s,
    signOut: async () => {signedOut++;},
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('async function openAuthenticatedApp()'), source.indexOf('async function enterApp()')), ctx);
  vm.runInContext(source.slice(source.indexOf('let authStateVersion ='), source.indexOf('window.addEventListener("online"')), ctx);
  return {ctx, visible, messages, handler, signedOut: () => signedOut};
}
test('un fallo de interfaz muestra el error sin cerrar una sesión válida', async () => {
  const app = harness();
  await app.handler({getIdTokenResult: async () => ({claims: {role: 'super'}})});
  assert.equal(app.signedOut(), 0);
  assert.match(app.messages[0][1], /cámara/);
  assert.equal(app.ctx.loggedTeacher.role, 'super');
});
test('la pérdida de sesión oculta datos privados y recupera la portada', async () => {
  const app = harness();
  await app.handler(null);
  assert.equal(app.visible.get('section-gateway'), true);
  assert.equal(app.visible.get('main-content'), false);
  assert.equal(app.visible.get('main-header'), false);
  assert.equal(app.ctx.loggedTeacher, null);
});
test('un token inválido recupera la portada y muestra el error', async () => {
  const app = harness();
  await app.handler({getIdTokenResult: async () => {throw new Error('Token vencido');}});
  assert.equal(app.visible.get('section-gateway'), true);
  assert.equal(app.signedOut(), 1);
  assert.match(app.messages[0][1], /Token vencido/);
});
test('una comprobación atrasada no reabre una sesión que ya se cerró', async () => {
  const app = harness(); let resolve;
  const pending = app.handler({getIdTokenResult: () => new Promise((r) => {resolve = r;})});
  await app.handler(null);
  resolve({claims: {role: 'super'}});
  await pending;
  assert.equal(app.ctx.loggedTeacher, null);
  assert.equal(app.messages.length, 0);
  assert.equal(app.visible.get('section-gateway'), true);
});
