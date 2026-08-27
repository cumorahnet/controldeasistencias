const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const installScript = fs.readFileSync(path.join(projectRoot, "pwa-install.js"), "utf8");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(projectRoot, "sw.js"), "utf8");
const SEEN_KEY = "control-asistencia-pwa-install-seen-v4";
const STATUS_KEY = "control-asistencia-pwa-install-status-v4";

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

function createHarness({
  userAgent = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36 Chrome/126",
  userAgentDataMobile,
  maxTouchPoints = 0,
  standalone = false,
  seen = false,
  status = "",
  withServiceWorker = false,
} = {}) {
  const ids = [
    "btn-install-pwa",
    "install-pwa-label",
    "install-app-modal",
    "install-app-title",
    "install-app-message",
    "btn-install-app",
    "btn-install-later",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, createElement()]));
  const storage = new Map();
  if (seen) storage.set(SEEN_KEY, "seen");
  if (status) storage.set(STATUS_KEY, status);
  const windowListeners = new Map();
  const timers = new Map();
  const serviceWorkerRegistrations = [];
  let nextTimerId = 1;
  const document = {
    activeElement: null,
    readyState: "complete",
    addEventListener() {},
    getElementById: (id) => elements[id] || null,
  };
  const navigator = {maxTouchPoints, standalone, userAgent};
  if (typeof userAgentDataMobile === "boolean") navigator.userAgentData = {mobile: userAgentDataMobile};
  if (withServiceWorker) {
    navigator.serviceWorker = {
      register(scriptUrl, options) {
        serviceWorkerRegistrations.push({options, scriptUrl});
        return Promise.resolve();
      },
    };
  }
  const window = {
    clearTimeout(id) {
      timers.delete(id);
    },
    document,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
    matchMedia: () => ({matches: standalone}),
    navigator,
    setTimeout(callback) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, callback);
      return id;
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
    serviceWorkerRegistrations,
    storage,
    dispatch(type, event = {}) {
      for (const listener of windowListeners.get(type) || []) listener(event);
    },
    runTimers() {
      while (timers.size) {
        const pending = [...timers.entries()];
        timers.clear();
        for (const [, callback] of pending) callback();
      }
    },
  };
}

async function flushPromises() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test("muestra instrucciones reales de Safari una sola vez en la primera visita de iOS", () => {
  const harness = createHarness({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });

  assert.match(harness.elements["install-app-message"].textContent, /Safari.*Compartir.*Agregar a pantalla de inicio/);
  assert.equal(harness.elements["btn-install-app"].textContent, "Ver instrucciones");
  assert.equal(harness.elements["install-pwa-label"].textContent, "Cómo instalar");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), false);
  assert.equal(harness.storage.get(SEEN_KEY), "seen");
  assert.equal(harness.storage.has(STATUS_KEY), false);
});

test("no repite la invitación vista y mantiene una acción manual discreta en móvil", () => {
  const harness = createHarness({seen: true, status: "dismissed"});
  harness.runTimers();

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), false);
  assert.equal(harness.elements["install-pwa-label"].textContent, "Cómo instalar");
});

test("no abre el aviso inicial en escritorio y solo ofrece la acción si llega el evento nativo", () => {
  const harness = createHarness({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    userAgentDataMobile: false,
  });
  let prevented = false;

  harness.runTimers();
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);

  harness.dispatch("beforeinstallprompt", {
    preventDefault() {
      prevented = true;
    },
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(prevented, true);
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), false);
  assert.equal(harness.elements["install-pwa-label"].textContent, "Instalar app");
});

test("un evento nativo tardío no repite el aviso visto y sí actualiza la acción discreta", () => {
  const harness = createHarness();
  harness.runTimers();
  harness.elements["btn-install-later"].trigger("click");

  assert.equal(harness.storage.get(SEEN_KEY), "seen");
  assert.equal(harness.storage.get(STATUS_KEY), "dismissed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);

  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["install-pwa-label"].textContent, "Instalar app");
});

test("actualiza a instalación nativa si el evento llega mientras sigue abierto el aviso manual", () => {
  const harness = createHarness();
  harness.runTimers();

  assert.equal(harness.elements["btn-install-app"].dataset.action, "manual-instructions");
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), false);
  assert.equal(harness.elements["btn-install-app"].dataset.action, "native-install");
  assert.equal(harness.elements["btn-install-app"].textContent, "Instalar app");
});

test("solo invoca el diálogo nativo después de un toque y deja coherente el rechazo", async () => {
  const harness = createHarness();
  let promptCalls = 0;
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {
      promptCalls += 1;
    },
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(promptCalls, 0);
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), false);
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();

  assert.equal(promptCalls, 1);
  assert.equal(harness.storage.get(STATUS_KEY), "dismissed");
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), false);
  assert.equal(harness.elements["install-pwa-label"].textContent, "Cómo instalar");
});

test("registra la aceptación sin afirmar que la app ya quedó instalada", async () => {
  const harness = createHarness();
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "accepted"}),
  });
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();

  assert.equal(harness.storage.get(STATUS_KEY), "accepted");
  assert.equal(harness.elements["install-app-title"].textContent, "Instalación solicitada");
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});

test("appinstalled confirma la instalación y oculta todas las acciones y avisos", async () => {
  const harness = createHarness();
  let resolveChoice;
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: new Promise((resolve) => {
      resolveChoice = resolve;
    }),
  });
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();

  harness.dispatch("appinstalled");
  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);

  resolveChoice({outcome: "accepted"});
  await flushPromises();
  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
});

test("el modo standalone se registra como instalado y nunca muestra controles", () => {
  const harness = createHarness({standalone: true});
  harness.runTimers();

  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});

test("registra el service worker con una ruta y un alcance relativos", () => {
  const harness = createHarness({withServiceWorker: true});
  harness.dispatch("load");

  assert.equal(harness.serviceWorkerRegistrations.length, 1);
  assert.equal(harness.serviceWorkerRegistrations[0].scriptUrl, "./sw.js");
  assert.equal(harness.serviceWorkerRegistrations[0].options.scope, "./");
});

test("el manifiesto, los iconos y el app shell cumplen los requisitos de instalación", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Control de Asistencia");
  assert.equal(manifest.short_name, "Asistencia");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.background_color);
  assert.ok(manifest.theme_color);
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-mobile-web-app-title/);
  assert.match(html, /<link rel="apple-touch-icon"[^>]+href="\.\/icons\/apple-touch-icon\.png">/);

  for (const requiredSize of [192, 512]) {
    const icon = manifest.icons.find((candidate) => candidate.sizes === `${requiredSize}x${requiredSize}` && candidate.type === "image/png");
    assert.ok(icon, `falta el icono PNG ${requiredSize}x${requiredSize}`);
    const iconPath = path.join(projectRoot, icon.src.replace(/^\//, ""));
    const png = fs.readFileSync(iconPath);
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), requiredSize);
    assert.equal(png.readUInt32BE(20), requiredSize);
    assert.match(serviceWorker, new RegExp(icon.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(serviceWorker, /"\/manifest\.webmanifest"/);
  assert.match(serviceWorker, /"\/pwa-install\.js"/);
});
