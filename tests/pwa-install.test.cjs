const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const installScript = fs.readFileSync(path.join(__dirname, "..", "pwa-install.js"), "utf8");
const STATUS_KEY = "control-asistencia-install-v3";

function createElement(initialClasses = ["hidden"]) {
  const classes = new Set(initialClasses);
  const listeners = new Map();
  return {
    classList: {
      contains: (name) => classes.has(name),
      toggle(name, force) {
        if (force === true) classes.add(name);
        else if (force === false) classes.delete(name);
        else if (classes.has(name)) classes.delete(name);
        else classes.add(name);
      },
    },
    dataset: {},
    disabled: false,
    textContent: "",
    attributes: new Map(),
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    contains: () => false,
    focus() {},
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    trigger(type) {
      const listener = listeners.get(type);
      if (listener) listener({currentTarget: this});
    },
  };
}

function createHarness({userAgent = "Mozilla/5.0 (Linux; Android 14) Chrome/126", maxTouchPoints = 0, standalone = false, status = ""} = {}) {
  const ids = [
    "btn-install-pwa",
    "install-app-modal",
    "install-app-title",
    "install-app-message",
    "btn-install-app",
    "btn-install-later",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, createElement()]));
  const storage = new Map(status ? [[STATUS_KEY, status]] : []);
  const windowListeners = new Map();
  const document = {
    activeElement: null,
    readyState: "complete",
    addEventListener() {},
    getElementById: (id) => elements[id] || null,
  };
  const window = {
    clearTimeout() {},
    document,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    matchMedia: () => ({matches: standalone}),
    navigator: {maxTouchPoints, standalone, userAgent},
    setTimeout(callback) {
      callback();
      return 1;
    },
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
  };
  window.window = window;

  vm.runInNewContext(installScript, {document, window});

  return {
    elements,
    storage,
    dispatch(type, event = {}) {
      for (const listener of windowListeners.get(type) || []) listener(event);
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test("muestra instrucciones de Safari en la primera visita de iOS", () => {
  const harness = createHarness({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });

  assert.match(harness.elements["install-app-message"].textContent, /Safari.*Compartir.*Agregar a pantalla de inicio/);
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), false);
});

test("no repite la invitación después de Ahora no y mantiene el reintento", () => {
  const harness = createHarness({status: "dismissed"});

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), false);
});

test("registra el rechazo nativo sin ocultar permanentemente el reintento", async () => {
  const harness = createHarness();
  const promptEvent = {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  };

  harness.dispatch("beforeinstallprompt", promptEvent);
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();

  assert.equal(harness.storage.get(STATUS_KEY), "dismissed");
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), false);
});

test("appinstalled es quien confirma la instalación", async () => {
  const harness = createHarness();
  let resolveChoice;
  const promptEvent = {
    preventDefault() {},
    prompt: async () => {},
    userChoice: new Promise((resolve) => {
      resolveChoice = resolve;
    }),
  };

  harness.dispatch("beforeinstallprompt", promptEvent);
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();
  assert.notEqual(harness.storage.get(STATUS_KEY), "installed");

  harness.dispatch("appinstalled");
  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-title"].textContent, "Aplicación instalada");

  resolveChoice({outcome: "accepted"});
  await flushPromises();
  assert.equal(harness.storage.get(STATUS_KEY), "installed");
});

test("el modo standalone se registra como instalado y oculta los controles", () => {
  const harness = createHarness({standalone: true});

  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});
