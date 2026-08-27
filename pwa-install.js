(function configurePwaInstallation() {
  "use strict";

  const INSTALL_FLOW_VERSION = 4;
  const INSTALL_SEEN_KEY = `control-asistencia-pwa-install-seen-v${INSTALL_FLOW_VERSION}`;
  const INSTALL_STATUS_KEY = `control-asistencia-pwa-install-status-v${INSTALL_FLOW_VERSION}`;
  const STATUS_ACCEPTED = "accepted";
  const STATUS_DISMISSED = "dismissed";
  const STATUS_INSTALLED = "installed";
  const STATUS_INSTRUCTIONS_SHOWN = "instructions-shown";
  const FALLBACK_DELAY_MS = 1500;

  let deferredInstallPrompt = null;
  let fallbackTimer = null;
  let domIsReady = false;

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

  function isMobileDevice() {
    if (typeof window.navigator.userAgentData?.mobile === "boolean") {
      return window.navigator.userAgentData.mobile || isIos();
    }
    return isIos() || isAndroid() || /Mobile|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
  }

  function isWebView() {
    return /; wv\)|\bWebView\b|FBAN|FBAV|Instagram/i.test(window.navigator.userAgent);
  }

  function getInstallState() {
    const status = readStorage(INSTALL_STATUS_KEY);
    return {
      installed: isInstalledApp(),
      nativeAvailable: deferredInstallPrompt !== null,
      iosInstructions: isIos(),
      mobile: isMobileDevice(),
      firstVisitPending: readStorage(INSTALL_SEEN_KEY) !== "seen",
      dismissed: status === STATUS_DISMISSED,
      status,
    };
  }

  function setElementVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("hidden", !visible);
    element.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setInstallAction({visible, label = "Instalar app"}) {
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
    const state = getInstallState();
    if (state.installed) {
      setInstallAction({visible: false});
      return;
    }
    if (state.nativeAvailable) {
      setInstallAction({visible: true, label: "Instalar app"});
      return;
    }
    if (state.mobile) {
      setInstallAction({
        visible: true,
        label: isWebView() ? "Abrir en navegador" : "Cómo instalar",
      });
      return;
    }
    setInstallAction({visible: false});
  }

  function closeInstallModal() {
    const modal = byId("install-app-modal");
    const shouldRestoreFocus = modal?.contains(document.activeElement);
    setElementVisible(modal, false);
    const installAction = byId("btn-install-pwa");
    if (shouldRestoreFocus && !isInstalledApp() && !installAction?.classList.contains("hidden")) {
      installAction.focus();
    }
  }

  function showInstallModal({title, message, primaryLabel, primaryAction, secondaryLabel = "Cerrar", secondaryAction = "close"}) {
    const modal = byId("install-app-modal");
    const titleElement = byId("install-app-title");
    const messageElement = byId("install-app-message");
    const primaryButton = byId("btn-install-app");
    const secondaryButton = byId("btn-install-later");
    if (!modal || !titleElement || !messageElement || !primaryButton || !secondaryButton) return false;

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
    return true;
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
    const state = getInstallState();
    if (state.installed || !state.mobile || !state.firstVisitPending) return false;

    const shown = state.nativeAvailable
      ? showInstallModal({
        title: "Instala Control de Asistencia",
        message: "Ábrelo desde tu pantalla de inicio con su propio icono y accede más rápido a tus listas.",
        primaryLabel: "Instalar app",
        primaryAction: "native-install",
        secondaryLabel: "Ahora no",
        secondaryAction: "dismiss",
      })
      : showInstallModal({
        title: "Agrega Control de Asistencia",
        message: `${manualInstallMessage()} Así podrás abrirlo directamente desde tu pantalla de inicio.`,
        primaryLabel: state.iosInstructions ? "Ver instrucciones" : "Cómo instalar",
        primaryAction: "manual-instructions",
        secondaryLabel: "Ahora no",
        secondaryAction: "dismiss",
      });

    if (shown) writeStorage(INSTALL_SEEN_KEY, "seen");
    return shown;
  }

  function upgradeVisibleInvitationToNativeInstall() {
    const modal = byId("install-app-modal");
    const primaryButton = byId("btn-install-app");
    if (!modal || modal.classList.contains("hidden") || primaryButton?.dataset.action !== "manual-instructions") {
      return false;
    }
    return showInstallModal({
      title: "Instala Control de Asistencia",
      message: "Ábrelo desde tu pantalla de inicio con su propio icono y accede más rápido a tus listas.",
      primaryLabel: "Instalar app",
      primaryAction: "native-install",
      secondaryLabel: "Ahora no",
      secondaryAction: "dismiss",
    });
  }

  function scheduleFirstVisitInvitation() {
    const state = getInstallState();
    if (state.installed || !state.mobile || !state.firstVisitPending || fallbackTimer) return;
    if (state.nativeAvailable || state.iosInstructions || isWebView()) {
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
    if (fallbackTimer) {
      window.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    writeStorage(INSTALL_STATUS_KEY, STATUS_INSTALLED);
    setInstallAction({visible: false});
  }

  async function requestNativeInstall() {
    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) {
      showManualInstructions();
      return;
    }

    deferredInstallPrompt = null;
    closeInstallModal();
    setInstallAction({visible: false});

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (readStorage(INSTALL_STATUS_KEY) === STATUS_INSTALLED) return;
      if (choice?.outcome === "accepted") {
        writeStorage(INSTALL_STATUS_KEY, STATUS_ACCEPTED);
        showInstallModal({
          title: "Instalación solicitada",
          message: "El navegador aceptó la solicitud. El icono aparecerá cuando el sistema termine de instalar la aplicación.",
          primaryLabel: "Entendido",
          primaryAction: "close",
          secondaryLabel: "",
        });
        return;
      }
      writeStorage(INSTALL_STATUS_KEY, STATUS_DISMISSED);
      refreshInstallAction();
    } catch {
      refreshInstallAction();
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
      writeStorage(INSTALL_STATUS_KEY, STATUS_INSTRUCTIONS_SHOWN);
    }
    closeInstallModal();
  }

  function handleSecondaryAction(event) {
    if (event.currentTarget.dataset.action === "dismiss") {
      writeStorage(INSTALL_STATUS_KEY, STATUS_DISMISSED);
    }
    closeInstallModal();
  }

  function initializeInstallUi() {
    domIsReady = true;
    if (isInstalledApp()) {
      markInstalled();
      closeInstallModal();
      return;
    }

    refreshInstallAction();
    byId("btn-install-pwa")?.addEventListener("click", () => {
      if (deferredInstallPrompt) {
        showInstallModal({
          title: "Instala Control de Asistencia",
          message: "Ábrelo desde tu pantalla de inicio con su propio icono y accede más rápido a tus listas.",
          primaryLabel: "Instalar app",
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
    refreshInstallAction();
    if (!showInstallInvitation()) upgradeVisibleInvitationToNativeInstall();
  });

  window.addEventListener("appinstalled", () => {
    markInstalled();
    closeInstallModal();
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
