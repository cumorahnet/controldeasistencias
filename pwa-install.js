(function configurePwaInstallation() {
  "use strict";

  const INSTALL_FLOW_VERSION = 3;
  const INSTALL_STATUS_KEY = `control-asistencia-install-v${INSTALL_FLOW_VERSION}`;
  const STATUS_ACCEPTED = "accepted";
  const STATUS_DISMISSED = "dismissed";
  const STATUS_INSTALLED = "installed";
  const FALLBACK_DELAY_MS = 1500;

  let deferredInstallPrompt = null;
  let fallbackTimer = null;
  let installRequestInProgress = false;
  let domIsReady = false;

  const byId = (id) => document.getElementById(id);

  function readInstallStatus() {
    try {
      return window.localStorage.getItem(INSTALL_STATUS_KEY) || "";
    } catch {
      return "";
    }
  }

  function writeInstallStatus(status) {
    try {
      window.localStorage.setItem(INSTALL_STATUS_KEY, status);
    } catch {
      // El modo privado puede impedir la persistencia; el flujo sigue disponible.
    }
  }

  function isInstalledApp() {
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

  function isWebView() {
    return /; wv\)|\bWebView\b|FBAN|FBAV|Instagram/i.test(window.navigator.userAgent);
  }

  function setElementVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("hidden", !visible);
    element.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setRetryButtonVisible(visible) {
    const button = byId("btn-install-pwa");
    if (!button) return;
    button.classList.toggle("hidden", !visible);
    button.classList.toggle("flex", visible);
    button.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function closeInstallModal() {
    const modal = byId("install-app-modal");
    const shouldRestoreFocus = modal?.contains(document.activeElement);
    setElementVisible(modal, false);
    if (shouldRestoreFocus && !isInstalledApp()) byId("btn-install-pwa")?.focus();
  }

  function showInstallModal({title, message, primaryLabel, primaryAction, secondaryLabel = "Cerrar", secondaryAction = "close"}) {
    const modal = byId("install-app-modal");
    const titleElement = byId("install-app-title");
    const messageElement = byId("install-app-message");
    const primaryButton = byId("btn-install-app");
    const secondaryButton = byId("btn-install-later");
    if (!modal || !titleElement || !messageElement || !primaryButton || !secondaryButton) return;

    titleElement.textContent = title;
    messageElement.textContent = message;
    primaryButton.textContent = primaryLabel;
    primaryButton.dataset.action = primaryAction;
    primaryButton.disabled = false;
    secondaryButton.textContent = secondaryLabel;
    secondaryButton.dataset.action = secondaryAction;
    secondaryButton.classList.toggle("hidden", !secondaryLabel);
    setElementVisible(modal, true);
    window.setTimeout(() => primaryButton.focus(), 0);
  }

  function manualInstallMessage() {
    if (isWebView()) {
      return "Abra esta liga en Chrome o Safari. Los navegadores internos de otras aplicaciones normalmente no permiten crear el acceso directo.";
    }
    if (isIos()) {
      return "En Safari, toque Compartir y después Agregar a pantalla de inicio. Confirme el nombre y toque Agregar.";
    }
    if (isAndroid()) {
      return "Abra el menú ⋮ del navegador y elija Instalar aplicación o Agregar a pantalla principal.";
    }
    return "Use el icono de instalación de la barra de direcciones o abra el menú del navegador y elija Instalar Control de Asistencia.";
  }

  function showManualInstructions() {
    showInstallModal({
      title: "Crear acceso directo",
      message: manualInstallMessage(),
      primaryLabel: "Entendido",
      primaryAction: "manual-complete",
      secondaryLabel: "Cerrar",
      secondaryAction: "close",
    });
  }

  function showInstallInvitation() {
    if (isInstalledApp() || readInstallStatus()) return;
    if (deferredInstallPrompt) {
      showInstallModal({
        title: "Crear acceso directo",
        message: "Instale Control de Asistencia para abrirlo desde su pantalla de inicio con su propio icono.",
        primaryLabel: "Instalar aplicación",
        primaryAction: "native-install",
        secondaryLabel: "Ahora no",
        secondaryAction: "dismiss",
      });
      return;
    }
    showInstallModal({
      title: "Crear acceso directo",
      message: manualInstallMessage(),
      primaryLabel: "Ver cómo instalar",
      primaryAction: "manual-instructions",
      secondaryLabel: "Ahora no",
      secondaryAction: "dismiss",
    });
  }

  function scheduleFirstVisitInvitation() {
    if (isInstalledApp() || readInstallStatus() || fallbackTimer) return;
    if (deferredInstallPrompt || isIos() || isWebView()) {
      showInstallInvitation();
      return;
    }
    fallbackTimer = window.setTimeout(() => {
      fallbackTimer = null;
      showInstallInvitation();
    }, FALLBACK_DELAY_MS);
  }

  function markInstalled() {
    deferredInstallPrompt = null;
    installRequestInProgress = false;
    writeInstallStatus(STATUS_INSTALLED);
    setRetryButtonVisible(false);
  }

  async function requestNativeInstall() {
    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) {
      showManualInstructions();
      return;
    }

    deferredInstallPrompt = null;
    installRequestInProgress = true;
    closeInstallModal();
    setRetryButtonVisible(false);

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      installRequestInProgress = false;
      if (readInstallStatus() === STATUS_INSTALLED) return;
      if (choice?.outcome === "accepted") {
        writeInstallStatus(STATUS_ACCEPTED);
        setRetryButtonVisible(true);
        showInstallModal({
          title: "Instalación solicitada",
          message: "El navegador aceptó la solicitud. El acceso aparecerá cuando el sistema termine de instalar la aplicación.",
          primaryLabel: "Entendido",
          primaryAction: "close",
          secondaryLabel: "",
        });
        return;
      }
      writeInstallStatus(STATUS_DISMISSED);
      setRetryButtonVisible(true);
    } catch {
      installRequestInProgress = false;
      showManualInstructions();
    }
  }

  function handlePrimaryAction(event) {
    const action = event.currentTarget.dataset.action;
    if (action === "native-install") {
      void requestNativeInstall();
      return;
    }
    if (action === "manual-instructions") {
      showManualInstructions();
      return;
    }
    if (action === "manual-complete") {
      writeInstallStatus(STATUS_DISMISSED);
    }
    closeInstallModal();
  }

  function handleSecondaryAction(event) {
    if (event.currentTarget.dataset.action === "dismiss") {
      writeInstallStatus(STATUS_DISMISSED);
    }
    closeInstallModal();
  }

  function initializeInstallUi() {
    domIsReady = true;
    if (isInstalledApp()) {
      markInstalled();
      return;
    }

    setRetryButtonVisible(true);
    byId("btn-install-pwa")?.addEventListener("click", () => {
      if (deferredInstallPrompt) {
        showInstallModal({
          title: "Crear acceso directo",
          message: "Instale Control de Asistencia para abrirlo desde su pantalla de inicio con su propio icono.",
          primaryLabel: "Instalar aplicación",
          primaryAction: "native-install",
          secondaryLabel: "Cerrar",
          secondaryAction: "close",
        });
      } else {
        showManualInstructions();
      }
    });
    byId("btn-install-app")?.addEventListener("click", handlePrimaryAction);
    byId("btn-install-later")?.addEventListener("click", handleSecondaryAction);
    scheduleFirstVisitInvitation();
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isInstalledApp()) return;
    deferredInstallPrompt = event;
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (!domIsReady) return;
    setRetryButtonVisible(true);
    if (!readInstallStatus()) showInstallInvitation();
  });

  window.addEventListener("appinstalled", () => {
    const wasRequestedByUser = installRequestInProgress;
    markInstalled();
    closeInstallModal();
    if (wasRequestedByUser) {
      showInstallModal({
        title: "Aplicación instalada",
        message: "Control de Asistencia ya está disponible desde el icono de inicio.",
        primaryLabel: "Entendido",
        primaryAction: "close",
        secondaryLabel: "",
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeInstallUi, {once: true});
  } else {
    initializeInstallUi();
  }

  if ("serviceWorker" in window.navigator) {
    window.addEventListener("load", () => {
      window.navigator.serviceWorker.register("./sw.js", {scope: "./"}).catch(() => {});
    }, {once: true});
  }
}());
