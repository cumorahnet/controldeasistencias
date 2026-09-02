/**
 * Adaptador de adquisición para Html5Qrcode.
 * La aplicación que lo usa conserva la normalización, validación y consulta.
 */
export function createCameraDataScanner({
  elementId,
  Html5QrcodeClass = globalThis.Html5Qrcode,
  scanConfig = {fps: 8, qrbox: 250},
  dedupeMs = 1500,
  onDecoded,
  onStateChange = () => {},
  onError = () => {},
} = {}) {
  if (!elementId) throw new TypeError("elementId es obligatorio.");
  if (typeof onDecoded !== "function") throw new TypeError("onDecoded debe ser una función.");

  let reader = null;
  let state = "idle";
  let activeCamera = {facingMode: "environment"};
  let transitionTail = Promise.resolve();
  const inFlight = new Set();
  const recentlySeen = new Map();

  function emitState(next, detail = {}) {
    state = next;
    onStateChange({state, ...detail});
  }

  function ensureReader() {
    if (typeof Html5QrcodeClass !== "function") throw new Error("Html5Qrcode no está disponible.");
    if (!reader) reader = new Html5QrcodeClass(elementId);
    return reader;
  }

  function isReaderScanning() {
    return Boolean(reader?.isScanning);
  }

  function serialize(task) {
    const result = transitionTail.then(task, task);
    transitionTail = result.catch(() => undefined);
    return result;
  }

  function reportError(error, operation) {
    onError({error, operation, message: describeCameraError(error)});
  }

  async function deliver(rawValue, decodedResult, captureMethod) {
    const raw = String(rawValue ?? "").trim();
    if (!raw) throw new Error("El lector devolvió contenido vacío.");

    const now = Date.now();
    const lastSeenAt = recentlySeen.get(raw) || 0;
    if (inFlight.has(raw) || now - lastSeenAt < dedupeMs) return false;

    inFlight.add(raw);
    recentlySeen.set(raw, now);
    try {
      await onDecoded({
        raw,
        format: decodedResult?.result?.format?.formatName
          || decodedResult?.result?.format?.format
          || decodedResult?.format?.formatName
          || "UNKNOWN",
        captureMethod,
        capturedAt: new Date(now).toISOString(),
        decodedResult,
      });
      return true;
    } catch (error) {
      reportError(error, "process");
      throw error;
    } finally {
      inFlight.delete(raw);
      for (const [value, seenAt] of recentlySeen) {
        if (now - seenAt > dedupeMs * 4) recentlySeen.delete(value);
      }
    }
  }

  async function startNow(camera = activeCamera) {
    if (state === "running" || isReaderScanning()) return false;
    const scanner = ensureReader();
    activeCamera = camera || {facingMode: "environment"};
    emitState("starting");
    try {
      await scanner.start(
        activeCamera,
        scanConfig,
        (text, result) => {
          void deliver(text, result, "camera").catch(() => {});
        },
        () => {},
      );
      emitState("running", {camera: activeCamera});
      return true;
    } catch (error) {
      emitState("error", {operation: "start"});
      reportError(error, "start");
      throw error;
    }
  }

  async function stopNow() {
    if (state !== "running" && !isReaderScanning()) return false;
    emitState("stopping");
    try {
      await ensureReader().stop();
      emitState("idle");
      return true;
    } catch (error) {
      emitState("error", {operation: "stop"});
      reportError(error, "stop");
      throw error;
    }
  }

  function start(camera = activeCamera) {
    return serialize(() => startNow(camera));
  }

  function stop() {
    return serialize(stopNow);
  }

  function toggle(camera = activeCamera) {
    return serialize(() => state === "running" ? stopNow() : startNow(camera));
  }

  async function listCameras() {
    if (typeof Html5QrcodeClass?.getCameras !== "function") {
      throw new Error("La versión instalada no permite enumerar cámaras.");
    }
    try {
      return await Html5QrcodeClass.getCameras();
    } catch (error) {
      reportError(error, "list-cameras");
      throw error;
    }
  }

  function switchCamera(cameraId) {
    if (!cameraId) throw new TypeError("cameraId es obligatorio.");
    return serialize(async () => {
      const wasRunning = state === "running" || isReaderScanning();
      if (wasRunning) await stopNow();
      activeCamera = cameraId;
      if (wasRunning) await startNow(activeCamera);
      return true;
    });
  }

  function setTorch(enabled) {
    return serialize(async () => {
      if (state !== "running") throw new Error("La cámara debe estar activa para controlar la linterna.");
      const scanner = ensureReader();
      const capabilities = scanner.getRunningTrackCapabilities?.() || {};
      if (!("torch" in capabilities)) return false;
      await scanner.applyVideoConstraints({advanced: [{torch: Boolean(enabled)}]});
      return true;
    });
  }

  function scanImage(file, showImage = true) {
    if (!(file instanceof File) || !String(file.type).startsWith("image/")) {
      throw new TypeError("Seleccione un archivo de imagen válido.");
    }
    return serialize(async () => {
      if (state === "running" || isReaderScanning()) await stopNow();
      emitState("scanning-file");
      try {
        const raw = await ensureReader().scanFile(file, showImage);
        await deliver(raw, null, "file");
        emitState("idle");
        return raw;
      } catch (error) {
        emitState("error", {operation: "scan-file"});
        reportError(error, "scan-file");
        throw error;
      }
    });
  }

  function getCameraSettings() {
    if (state !== "running") return null;
    return ensureReader().getRunningTrackSettings?.() || null;
  }

  function getCameraCapabilities() {
    if (state !== "running") return null;
    return ensureReader().getRunningTrackCapabilities?.() || null;
  }

  function destroy() {
    return serialize(async () => {
      if (state === "running" || isReaderScanning()) await stopNow();
      try {
        reader?.clear?.();
      } finally {
        reader = null;
        inFlight.clear();
        recentlySeen.clear();
        emitState("destroyed");
      }
    });
  }

  return {
    start,
    stop,
    toggle,
    listCameras,
    switchCamera,
    setTorch,
    scanImage,
    getCameraSettings,
    getCameraCapabilities,
    getState: () => state,
    destroy,
  };
}

export function describeCameraError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || error || "");
  if (name === "NotAllowedError" || /permission|permiso|denied/i.test(message)) {
    return "No se autorizó la cámara. Revise el permiso del navegador o use una foto del QR.";
  }
  if (name === "NotFoundError" || /not found|no camera/i.test(message)) {
    return "No se encontró una cámara disponible. Puede seleccionar una foto del QR.";
  }
  if (name === "NotReadableError" || /could not start|in use|ocupada/i.test(message)) {
    return "La cámara está ocupada por otra aplicación o pestaña.";
  }
  if (name === "OverconstrainedError") return "La cámara no admite la configuración solicitada.";
  if (name === "SecurityError" || globalThis.isSecureContext === false) {
    return "La cámara requiere una conexión segura (HTTPS o localhost).";
  }
  return message || "No se pudo usar la cámara.";
}
