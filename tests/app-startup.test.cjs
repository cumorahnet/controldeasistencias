const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function startup(protocol = "http:") {
  const nodes = new Map([["conn-text", {textContent: "Iniciando..."}]]);
  const events = {};
  let timeout, cleared = false;
  const context = {
    window: {addEventListener: (name, fn) => {events[name] = fn;}},
    navigator: {onLine: true}, location: {protocol, reload() {}},
    setTimeout: (fn) => {timeout = fn; return 1;}, clearTimeout: () => {cleared = true;},
    document: {
      body: {prepend: (node) => nodes.set(node.id, node)},
      getElementById: (id) => nodes.get(id), addEventListener: (name, fn) => {events[name] = fn;},
      createElement: () => ({style: {}, setAttribute() {}, addEventListener() {}, replaceChildren() {this.children = [];}, append(...children) {this.children.push(...children);}, remove() {nodes.delete(this.id);}}),
    },
  };
  vm.runInNewContext(fs.readFileSync("app-startup.js", "utf8"), context);
  return {context, nodes, events, timeout: () => timeout(), cleared: () => cleared};
}
test("avisa inmediatamente al abrir como archivo local", () => {
  const {nodes, cleared} = startup("file:");
  assert.match(nodes.get("startup-error").children[0].textContent, /servidor local HTTP/);
  assert.equal(nodes.get("conn-text").textContent, "No se pudo iniciar");
  assert.equal(cleared(), true);
});
test("detecta un módulo que falla y un arranque que no termina", () => {
  const app = startup();
  app.events.error({target: {id: "app-runtime"}});
  assert.match(app.nodes.get("startup-error").children[0].textContent, /Firebase/);
  const offline = startup(); offline.context.navigator.onLine = false; offline.timeout();
  assert.match(offline.nodes.get("startup-error").children[0].textContent, /No hay conexión/);
});
test("un arranque tardío elimina el aviso y los errores posteriores no se tratan como errores de inicio", () => {
  const app = startup(); app.timeout();
  assert.ok(app.nodes.has("startup-error"));
  app.context.window.AppStartup.ready();
  assert.equal(app.nodes.has("startup-error"), false);
  assert.equal(app.cleared(), true);
  app.events.error({error: new Error("Posterior"), message: "Posterior"});
  assert.equal(app.nodes.has("startup-error"), false);
});
test("el módulo principal termina el arranque con dependencias de Firebase simuladas", () => {
  const nodes = new Map(); let ready = false;
  const context = {window: {addEventListener() {}, AppStartup: {ready() {ready = true;}}}, navigator: {onLine: true}, setInterval() {},
    document: {addEventListener() {}, getElementById(id) {if (!nodes.has(id)) nodes.set(id, {classList: {toggle() {}}, addEventListener() {}}); return nodes.get(id);}}};
  const source = fs.readFileSync("app.js", "utf8").replace(/import\s*\{([\s\S]*?)\}\s*from\s*"[^"]+";/g, (_, names) => {
    for (const name of names.split(",").map((s) => s.trim()).filter(Boolean)) context[name] = () => ({});
    return "";
  });
  vm.runInNewContext(source, context);
  assert.equal(ready, true);
  assert.equal(nodes.get("conn-text").textContent, "Conectado");
});
