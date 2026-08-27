(function initializePwaInstallExperience() {
  "use strict";

  const EXPERIENCE_VERSION = 5;
  const SEEN_KEY = `control-asistencia-pwa-install-seen-v${EXPERIENCE_VERSION}`;
  const STATUS_KEY = `control-asistencia-pwa-install-status-v${EXPERIENCE_VERSION}`;
  const FIRST_VISIT_DELAY_MS = 2000;
  const STATUS = Object.freeze({
    accepted: "accepted",
    dismissed: "dismissed",
    installed: "installed",
    instructions: "instructions-shown",
  });
  const VIEW = Object.freeze({
    androidGuide: "android-guide",
    hidden: "hidden",
    invitation: "invitation",
    iosGuide: "ios-guide",
    nativeOffer: "native-offer",
    webviewGuide: "webview-guide",
  });

  let activeView = VIEW.hidden;
  let deferredPrompt = null;
  let domReady = false;
  let firstVisitTimer = null;

  const byId = (id) => document.getElementById(id);

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // El flujo continúa aunque el navegador no permita almacenamiento local.
    }
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  function isIos() {
    return /iPhone|iPad|iPod/i.test(window.navigator.userAgent)
      || (/Macintosh/i.test(window.navigator.userAgent) && window.navigator.maxTouchPoints > 1);
  }

  function isAndroid() {
    return /Android/i.test(window.navigator.userAgent);
  }

  function isMobile() {
    if (typeof window.navigator.userAgentData?.mobile === "boolean") {
      return window.navigator.userAgentData.mobile || isIos();
    }
    return isIos() || isAndroid() || /Mobile|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
  }

  function isEmbeddedBrowser() {
    return /; wv\)|\bWebView\b|FBAN|FBAV|Instagram/i.test(window.navigator.userAgent);
  }

  function installState() {
    return {
      dismissed: readStorage(STATUS_KEY) === STATUS.dismissed,
      firstVisitPending: readStorage(SEEN_KEY) !== "seen",
      installed: isStandalone(),
      iosInstructions: isIos(),
      mobile: isMobile(),
      nativeAvailable: deferredPrompt !== null,
    };
  }

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("hidden", !visible);
    element.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setInstallAction(visible, label = "Instalar app") {
    const button = byId("btn-install-pwa");
    if (!button) return;
    button.classList.toggle("hidden", !visible);
    button.classList.toggle("flex", visible);
    button.setAttribute("aria-hidden", visible ? "false" : "true");
    button.setAttribute("aria-label", label);
    const labelElement = byId("install-pwa-label");
    if (labelElement) labelElement.textContent = label;
  }

  function refreshInstallAction() {
    const state = installState();
    if (state.installed) {
      setInstallAction(false);
    } else if (state.nativeAvailable) {
      setInstallAction(true, "Instalar app");
    } else if (state.mobile && isEmbeddedBrowser()) {
      setInstallAction(true, "Abrir en navegador");
    } else if (state.iosInstructions) {
      setInstallAction(true, "Agregar al inicio");
    } else {
      setInstallAction(false);
    }
  }

  function setSteps(steps) {
    const container = byId("install-app-steps");
    const stepElements = [byId("install-step-1"), byId("install-step-2"), byId("install-step-3")];
    stepElements.forEach((element, index) => {
      if (!element) return;
      element.textContent = steps[index] || "";
      setVisible(element.closest?.("li") || element, Boolean(steps[index]));
    });
    setVisible(container, steps.length > 0);
  }

  function renderSheet({
    benefits = false,
    message,
    platform,
    primaryAction,
    primaryLabel,
    secondaryAction = "close",
    secondaryLabel = "Cerrar",
    steps = [],
    title,
    view,
  }) {
    const modal = byId("install-app-modal");
    const primaryButton = byId("btn-install-app");
    const secondaryButton = byId("btn-install-later");
    if (!modal || !primaryButton || !secondaryButton) return false;

    activeView = view;
    byId("install-app-platform").textContent = platform;
    byId("install-app-title").textContent = title;
    byId("install-app-message").textContent = message;
    primaryButton.textContent = primaryLabel;
    primaryButton.dataset.action = primaryAction;
    primaryButton.disabled = false;
    secondaryButton.textContent = secondaryLabel;
    secondaryButton.dataset.action = secondaryAction;
    setVisible(secondaryButton, Boolean(secondaryLabel));
    setVisible(byId("install-app-benefits"), benefits);
    setSteps(steps);
    setVisible(modal, true);
    window.setTimeout(() => primaryButton.focus(), 0);
    return true;
  }

  function closeSheet() {
    const modal = byId("install-app-modal");
    const restoreFocus = modal?.contains(document.activeElement);
    setVisible(modal, false);
    activeView = VIEW.hidden;
    const action = byId("btn-install-pwa");
    if (restoreFocus && !action?.classList.contains("hidden")) action.focus();
  }

  function nativeOffer(firstVisit = false) {
    return renderSheet({
      benefits: true,
      message: "El navegador está listo para añadir la app. La instalación comienza únicamente cuando toques el botón.",
      platform: "Instalación disponible",
      primaryAction: "native-install",
      primaryLabel: "Instalar app",
      secondaryAction: firstVisit ? "dismiss" : "close",
      secondaryLabel: firstVisit ? "Ahora no" : "Cerrar",
      title: "Instala la app en este dispositivo",
      view: VIEW.nativeOffer,
    });
  }

  function firstVisitInvitation() {
    return renderSheet({
      benefits: true,
      message: "Añade Control de Asistencia a tu pantalla de inicio para entrar directamente, sin buscar la dirección cada vez.",
      platform: "Acceso desde tu celular",
      primaryAction: "show-manual-options",
      primaryLabel: "Ver opciones",
      secondaryAction: "dismiss",
      secondaryLabel: "Ahora no",
      title: "Tus listas, a un toque",
      view: VIEW.invitation,
    });
  }

  function iosGuide(firstVisit = false) {
    return renderSheet({
      message: "En iPhone y iPad, Safari añade la app desde su menú Compartir.",
      platform: "iPhone / iPad · Safari",
      primaryAction: "instructions-complete",
      primaryLabel: "Entendido",
      secondaryAction: firstVisit ? "dismiss" : "close",
      secondaryLabel: firstVisit ? "Ahora no" : "Cerrar",
      steps: [
        "Toca Compartir: el cuadro con una flecha hacia arriba.",
        "Desliza el menú y elige Agregar a pantalla de inicio.",
        "Revisa el nombre y toca Agregar.",
      ],
      title: "Añádela a tu pantalla de inicio",
      view: VIEW.iosGuide,
    });
  }

  function androidGuide(firstVisit = false) {
    return renderSheet({
      message: "Si Chrome no ofrece el botón automático, puedes añadir la app desde las opciones del navegador.",
      platform: "Android · Chrome",
      primaryAction: "instructions-complete",
      primaryLabel: "Entendido",
      secondaryAction: firstVisit ? "dismiss" : "close",
      secondaryLabel: firstVisit ? "Ahora no" : "Cerrar",
      steps: [
        "Toca los tres puntos de Chrome.",
        "Elige Instalar aplicación o Agregar a pantalla principal.",
        "Confirma para crear el icono.",
      ],
      title: "Añádela desde Chrome",
      view: VIEW.androidGuide,
    });
  }

  function embeddedBrowserGuide(firstVisit = false) {
    return renderSheet({
      message: "El navegador interno de esta aplicación no puede instalar accesos directos.",
      platform: "Navegador interno",
      primaryAction: "instructions-complete",
      primaryLabel: "Entendido",
      secondaryAction: firstVisit ? "dismiss" : "close",
      secondaryLabel: firstVisit ? "Ahora no" : "Cerrar",
      steps: [
        "Abre el menú de esta aplicación.",
        "Selecciona Abrir en Chrome o Abrir en Safari.",
        "Desde ese navegador vuelve a elegir Agregar al inicio.",
      ],
      title: "Continúa en tu navegador",
      view: VIEW.webviewGuide,
    });
  }

  function manualGuide(firstVisit = false) {
    if (isEmbeddedBrowser()) return embeddedBrowserGuide(firstVisit);
    if (isIos()) return iosGuide(firstVisit);
    return androidGuide(firstVisit);
  }

  function showFirstVisitExperience() {
    const state = installState();
    if (state.installed || !state.mobile || !state.firstVisitPending) return false;

    let shown;
    if (state.nativeAvailable) shown = nativeOffer(true);
    else if (isEmbeddedBrowser()) shown = embeddedBrowserGuide(true);
    else if (state.iosInstructions) shown = iosGuide(true);
    else shown = firstVisitInvitation();

    if (shown) writeStorage(SEEN_KEY, "seen");
    return shown;
  }

  function scheduleFirstVisitExperience() {
    const state = installState();
    if (state.installed || !state.mobile || !state.firstVisitPending || firstVisitTimer) return;
    if (state.nativeAvailable || state.iosInstructions || isEmbeddedBrowser()) {
      showFirstVisitExperience();
      return;
    }
    firstVisitTimer = window.setTimeout(() => {
      firstVisitTimer = null;
      showFirstVisitExperience();
    }, FIRST_VISIT_DELAY_MS);
  }

  function markInstalled() {
    deferredPrompt = null;
    if (firstVisitTimer) {
      window.clearTimeout(firstVisitTimer);
      firstVisitTimer = null;
    }
    writeStorage(STATUS_KEY, STATUS.installed);
    setInstallAction(false);
    closeSheet();
  }

  async function requestNativeInstall() {
    const promptEvent = deferredPrompt;
    if (!promptEvent) {
      manualGuide();
      return;
    }

    deferredPrompt = null;
    closeSheet();
    setInstallAction(false);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (readStorage(STATUS_KEY) === STATUS.installed) return;
      if (choice?.outcome === "accepted") {
        writeStorage(STATUS_KEY, STATUS.accepted);
      } else {
        writeStorage(STATUS_KEY, STATUS.dismissed);
      }
    } catch {
      manualGuide();
    }
    refreshInstallAction();
  }

  function handlePrimaryAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === "native-install") {
      void requestNativeInstall();
      return;
    }
    if (action === "show-manual-options") {
      manualGuide();
      return;
    }
    if (action === "instructions-complete") {
      writeStorage(STATUS_KEY, STATUS.instructions);
    }
    closeSheet();
  }

  function handleSecondaryAction(event) {
    if (event.currentTarget.dataset.action === "dismiss") {
      writeStorage(STATUS_KEY, STATUS.dismissed);
    }
    closeSheet();
  }

  function initializeUi() {
    domReady = true;
    if (isStandalone()) {
      markInstalled();
      return;
    }

    refreshInstallAction();
    byId("btn-install-pwa")?.addEventListener("click", () => {
      if (deferredPrompt) nativeOffer();
      else manualGuide();
    });
    byId("btn-install-app")?.addEventListener("click", handlePrimaryAction);
    byId("btn-install-later")?.addEventListener("click", handleSecondaryAction);
    scheduleFirstVisitExperience();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isStandalone()) return;
    deferredPrompt = event;
    if (firstVisitTimer) {
      window.clearTimeout(firstVisitTimer);
      firstVisitTimer = null;
    }
    if (!domReady) return;

    refreshInstallAction();
    const state = installState();
    if (state.mobile && state.firstVisitPending) {
      showFirstVisitExperience();
    } else if (activeView === VIEW.invitation) {
      nativeOffer(true);
    }
  });

  window.addEventListener("appinstalled", markInstalled);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeUi, {once: true});
  } else {
    initializeUi();
  }

  if ("serviceWorker" in window.navigator) {
    window.addEventListener("load", () => {
      window.navigator.serviceWorker.register("./sw.js", {scope: "./"}).catch(() => {});
    }, {once: true});
  }
}());
