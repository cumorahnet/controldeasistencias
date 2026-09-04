const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.join(__dirname, "..");
const installScript = fs.readFileSync(path.join(projectRoot, "pwa-install.js"), "utf8");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(projectRoot, "sw.js"), "utf8");
const SEEN_KEY = "control-asistencia-pwa-install-seen-v6";
const STATUS_KEY = "control-asistencia-pwa-install-status-v6";

function createElement(initialClasses = ["hidden"]) {
  const classes = new Set(initialClasses);
  const listeners = new Map();
  return {
    attributes: new Map(),
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
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    contains: () => false,
    focus() {},
    querySelector(selector) {
      return selector === "[data-pwa-install-label]" ? this.installLabel || null : null;
    },
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
  seen = false,
  standalone = false,
  status = "",
  withServiceWorker = false,
} = {}) {
  const ids = [
    "btn-install-pwa",
    "btn-install-pwa-header",
    "install-app-modal",
    "install-app-platform",
    "install-app-title",
    "install-app-message",
    "install-app-benefits",
    "install-app-steps",
    "install-step-1",
    "install-step-2",
    "install-step-3",
    "btn-install-app",
    "btn-install-later",
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, createElement()]));
  const installButtons = [elements["btn-install-pwa"], elements["btn-install-pwa-header"]];
  installButtons.forEach((button) => {
    button.installLabel = createElement([]);
  });
  const storage = new Map();
  if (seen) storage.set(SEEN_KEY, "seen");
  if (status) storage.set(STATUS_KEY, status);
  const windowListeners = new Map();
  const timers = new Map();
  const serviceWorkerRegistrations = [];
  const serviceWorkerListeners = new Map();
  let serviceWorkerUpdateCalls = 0;
  let nextTimerId = 1;
  const document = {
    activeElement: null,
    readyState: "complete",
    addEventListener() {},
    getElementById: (id) => elements[id] || null,
    querySelectorAll: (selector) => selector === "[data-pwa-install-action]" ? installButtons : [],
  };
  const navigator = {maxTouchPoints, standalone, userAgent};
  if (typeof userAgentDataMobile === "boolean") navigator.userAgentData = {mobile: userAgentDataMobile};
  if (withServiceWorker) {
    navigator.serviceWorker = {
      addEventListener(type, listener) {
        serviceWorkerListeners.set(type, listener);
      },
      register(scriptUrl, options) {
        serviceWorkerRegistrations.push({options, scriptUrl});
        return Promise.resolve({
          update() {
            serviceWorkerUpdateCalls += 1;
            return Promise.resolve();
          },
        });
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
    location: {reload() {}},
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
    serviceWorkerListeners,
    serviceWorkerUpdateCalls: () => serviceWorkerUpdateCalls,
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

test("iOS muestra una guía visual de Safari y nunca simula un botón nativo", () => {
  const harness = createHarness({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  });

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), false);
  assert.equal(harness.elements["install-app-platform"].textContent, "iPhone / iPad · Safari");
  assert.equal(harness.elements["install-app-title"].textContent, "Añádela a tu pantalla de inicio");
  assert.equal(harness.elements["btn-install-app"].dataset.action, "instructions-complete");
  assert.equal(harness.elements["btn-install-app"].textContent, "Entendido");
  assert.match(harness.elements["install-step-1"].textContent, /Compartir/);
  assert.match(harness.elements["install-step-2"].textContent, /Agregar a pantalla de inicio/);
  assert.equal(harness.storage.get(SEEN_KEY), "seen");
});

test("un navegador interno de iOS pide abrir Safari antes de mostrar pasos de instalación", () => {
  const harness = createHarness({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0",
  });

  assert.equal(harness.elements["install-app-platform"].textContent, "Navegador interno");
  assert.equal(harness.elements["install-app-title"].textContent, "Continúa en tu navegador");
  assert.equal(harness.elements["btn-install-pwa"].installLabel.textContent, "Abrir en navegador");
  assert.match(harness.elements["install-step-2"].textContent, /Chrome|Safari/);
});

test("la primera visita Android presenta beneficios antes de cualquier guía manual", () => {
  const harness = createHarness();
  harness.runTimers();

  assert.equal(harness.elements["install-app-title"].textContent, "Tus listas, a un toque");
  assert.equal(harness.elements["btn-install-app"].dataset.action, "show-manual-options");
  assert.equal(harness.elements["install-app-benefits"].classList.contains("hidden"), false);
  assert.equal(harness.elements["install-app-steps"].classList.contains("hidden"), true);

  harness.elements["btn-install-app"].trigger("click");
  assert.equal(harness.elements["install-app-title"].textContent, "Añádela desde Chrome");
  assert.equal(harness.elements["install-app-steps"].classList.contains("hidden"), false);
});

test("una visita posterior no repite el aviso ni deja una acción falsa en Android", () => {
  const harness = createHarness({seen: true, status: "dismissed"});
  harness.runTimers();

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});

test("escritorio no recibe aviso automático y muestra acción solo al ser elegible", () => {
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
  assert.equal(harness.elements["btn-install-pwa"].installLabel.textContent, "Instalar app");
});

test("beforeinstallprompt convierte la primera experiencia móvil en oferta nativa", () => {
  const harness = createHarness();
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(harness.elements["install-app-title"].textContent, "Instala la app en este dispositivo");
  assert.equal(harness.elements["btn-install-app"].dataset.action, "native-install");
  assert.equal(harness.elements["btn-install-app"].textContent, "Instalar app");
  assert.equal(harness.storage.get(SEEN_KEY), "seen");
});

test("un evento tardío actualiza el aviso abierto en vez de mostrar instrucciones antiguas", () => {
  const harness = createHarness();
  harness.runTimers();
  assert.equal(harness.elements["btn-install-app"].dataset.action, "show-manual-options");

  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(harness.elements["btn-install-app"].dataset.action, "native-install");
  assert.equal(harness.elements["install-app-title"].textContent, "Instala la app en este dispositivo");
});

test("un evento tardío tras descartar no repite el aviso y conserva la acción elegible", () => {
  const harness = createHarness();
  harness.runTimers();
  harness.elements["btn-install-later"].trigger("click");

  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "dismissed"}),
  });

  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), false);
  assert.equal(harness.elements["btn-install-pwa"].installLabel.textContent, "Instalar app");
});

test("el diálogo nativo solo se invoca después de tocar Instalar app", async () => {
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
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();

  assert.equal(promptCalls, 1);
  assert.equal(harness.storage.get(STATUS_KEY), "dismissed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});

test("aceptar la solicitud no se confunde con appinstalled", async () => {
  const harness = createHarness();
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "accepted"}),
  });
  harness.elements["btn-install-app"].trigger("click");
  await flushPromises();

  assert.equal(harness.storage.get(STATUS_KEY), "accepted");
  assert.notEqual(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
});

test("appinstalled confirma instalación y oculta toda la experiencia", () => {
  const harness = createHarness();
  harness.dispatch("beforeinstallprompt", {
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({outcome: "accepted"}),
  });
  harness.dispatch("appinstalled");

  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});

test("standalone nunca muestra avisos ni acciones", () => {
  const harness = createHarness({standalone: true});
  harness.runTimers();

  assert.equal(harness.storage.get(STATUS_KEY), "installed");
  assert.equal(harness.elements["install-app-modal"].classList.contains("hidden"), true);
  assert.equal(harness.elements["btn-install-pwa"].classList.contains("hidden"), true);
});

test("registra el service worker sin caché y prepara la recarga al actualizar", () => {
  const harness = createHarness({withServiceWorker: true});
  harness.dispatch("load");

  assert.equal(harness.serviceWorkerRegistrations.length, 1);
  assert.equal(harness.serviceWorkerRegistrations[0].scriptUrl, "./sw.js?v=36.46.0");
  assert.equal(harness.serviceWorkerRegistrations[0].options.scope, "./");
  assert.equal(harness.serviceWorkerRegistrations[0].options.updateViaCache, "none");
  assert.equal(typeof harness.serviceWorkerListeners.get("controllerchange"), "function");
});

test("la versión 6 no conserva textos ni claves de los intentos anteriores", () => {
  assert.doesNotMatch(installScript, /control-asistencia-pwa-install-seen-v5/);
  assert.doesNotMatch(installScript, /Crear acceso directo|Abra esta liga|Ver cómo instalar/);
  assert.match(html, /pwa-install\.js\?v=36\.46\.0/);
  assert.equal((html.match(/data-pwa-install-action/g) || []).length, 2);
  assert.match(html, /id="install-app-benefits"/);
  assert.match(html, /id="install-app-steps"/);
});

test("manifiesto, iconos y app shell cumplen los requisitos PWA", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.webmanifest"), "utf8"));
  assert.equal(manifest.name, "Control de Asistencia");
  assert.equal(manifest.short_name, "Asistencia");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.background_color);
  assert.ok(manifest.theme_color);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /apple-mobile-web-app-title/);
  assert.match(html, /apple-touch-icon/);

  for (const requiredSize of [192, 512]) {
    const icon = manifest.icons.find((candidate) => candidate.sizes === `${requiredSize}x${requiredSize}` && candidate.type === "image/png");
    assert.ok(icon, `falta el icono PNG ${requiredSize}x${requiredSize}`);
    const png = fs.readFileSync(path.join(projectRoot, icon.src.replace(/^\.?\//, "")));
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
    assert.equal(png.readUInt32BE(16), requiredSize);
    assert.equal(png.readUInt32BE(20), requiredSize);
  }

  assert.match(serviceWorker, /control-asistencia-36\.46\.0-pwa-v17/);
  assert.match(serviceWorker, /"camera-data-scanner\.js"/);
  assert.match(serviceWorker, /"manifest\.webmanifest"/);
  assert.match(serviceWorker, /"pwa-install\.js"/);
});
