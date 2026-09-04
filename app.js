import {initializeApp} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-functions.js";
import {createCameraDataScanner} from "./camera-data-scanner.js?v=36.46.0";
import {attendanceExportFilename, createAttendanceExportData} from "./attendance-report-export.js?v=36.46.0";

const firebaseConfig = {
  apiKey: "AIzaSyBLH2OuKVr8ez5_9GeRJBcnHFlhfgeHD1o",
  authDomain: "controldeasistencias-8308c.firebaseapp.com",
  projectId: "controldeasistencias-8308c",
  storageBucket: "controldeasistencias-8308c.firebasestorage.app",
  messagingSenderId: "409924433431",
  appId: "1:409924433431:web:ee649dc98030edc4bece52",
};

const APP_ROOT_PATH = "listadeasistencia";
const DEFAULT_ACCENT = "#3b82f6";
const DEFAULT_APP_ICON = "./icons/app-icon-192.png?v=36.46.0";
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp, "us-central1");

const api = Object.fromEntries([
  "lookupSchool",
  "requestSchoolRegistration",
  "createSchool",
  "loginTeacher",
  "prepareTeacherPasswordRecovery",
  "loginTeacherWithEmail",
  "listTeachers",
  "createTeacher",
  "repairTeacherAccount",
  "changeTeacherPassword",
  "completeTeacherOnboarding",
  "updateOwnSchedule",
  "updateSchool",
  "updateTeacherRole",
  "approveTeacher",
  "deleteTeacher",
  "recordAttendance",
  "justifyAttendance",
  "deleteStudent",
  "setStudentActive",
  "moveStudent",
  "deleteStudentGroup",
  "renumberStudentGroup",
  "clearStudents",
  "listAttendanceReport",
  "createIncident",
  "listIncidents",
  "updateIncident",
  "clearAttendance",
  "toggleSchoolFlag",
  "setSchoolVerification",
  "correctSchoolCct",
  "deleteSchool",
  "listAuditLogs",
  "recordAuditEvent",
].map((name) => [name, httpsCallable(functions, name)]));

let schoolKey = "";
let schoolName = "";
let currentSchool = null;
let loggedTeacher = null;
let accessChallenge = "";
let sharedQrScanner = null;
let qrScannerMode = "attendance";
let isScannerRunning = false;
let isScannerTransitioning = false;
let qrScannerStartPromise = null;
let qrVerificationTorchEnabled = false;
let qrVerificationSessionVersion = 0;
let qrVerificationScanInFlight = false;
let unsubscribeAttendance = null;
let unsubscribeSchoolProfile = null;
let modalPreviousFocus = null;
let schoolCalendarPreviousFocus = null;
let teacherRecoveryPreviousFocus = null;
let teacherBeingRepaired = "";
let studentRegistrationInFlight = false;
let studentBeingMoved = "";
let studentGroupBeingDeleted = null;
let selectedAttendanceGroupKey = "";
let selectedManualStudentId = "";
let audioContext = null;
let audioUnlockPromise = null;
let studentCatalogCache = [];
let teacherCatalogCache = [];
let latestAttendanceReport = null;
let incidentCache = [];
let pendingLogoDataUrl = "";
const attendanceInFlight = new Set();
let schoolSelectionLoadVersion = 0;
let globalSchoolsLoadVersion = 0;
let auditHistory = [];

const byId = (id) => document.getElementById(id);

function primeAudioContext(context) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.01);
}

async function unlockAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioContext) {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "running") return audioContext;
    if (!audioUnlockPromise) {
      audioUnlockPromise = audioContext.resume()
        .then(() => {
          if (audioContext.state !== "running") return null;
          primeAudioContext(audioContext);
          return audioContext;
        })
        .catch(() => null)
        .finally(() => {
          audioUnlockPromise = null;
        });
    }
    return await audioUnlockPromise;
  } catch {
    return null;
  }
}

async function playScanSound(kind) {
  try {
    const context = await unlockAudio();
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const patterns = {
      scan: [
        {frequency: 1047, start: 0, duration: 0.13},
        {frequency: 1397, start: 0.14, duration: 0.16},
      ],
      success: [
        {frequency: 784, start: 0, duration: 0.2},
        {frequency: 1047, start: 0.21, duration: 0.22},
        {frequency: 1319, start: 0.44, duration: 0.34},
      ],
      error: [
        {frequency: 196, start: 0, duration: 0.32},
        {frequency: 147, start: 0.34, duration: 0.38},
        {frequency: 98, start: 0.74, duration: 0.48},
      ],
    };
    const tones = patterns[kind] || patterns.error;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, now);
    compressor.knee.setValueAtTime(6, now);
    compressor.ratio.setValueAtTime(16, now);
    compressor.attack.setValueAtTime(0.002, now);
    compressor.release.setValueAtTime(0.18, now);
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(1, now);
    masterGain.connect(compressor);
    compressor.connect(context.destination);
    for (const tone of tones) {
      const frequencies = kind === "error" ? [tone.frequency, tone.frequency * 1.5] : [tone.frequency, tone.frequency * 2];
      frequencies.forEach((frequency, layer) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === "error" ? "square" : layer === 0 ? "square" : "sine";
        oscillator.frequency.setValueAtTime(frequency, now + tone.start);
        gain.gain.setValueAtTime(0.0001, now + tone.start);
        gain.gain.exponentialRampToValueAtTime(layer === 0 ? 1 : 0.55, now + tone.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);
        oscillator.connect(gain);
        gain.connect(masterGain);
        oscillator.start(now + tone.start);
        oscillator.stop(now + tone.start + tone.duration);
      });
    }
  } catch {
    // El audio es auxiliar y nunca debe alterar el resultado de la asistencia.
  }
}

function setScannerStatus(message, kind = "neutral") {
  const status = byId("scanner-status");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("text-slate-600", "text-green-700", "text-red-700", "bg-green-50", "bg-red-50", "p-3", "rounded-2xl");
  if (kind === "success") status.classList.add("text-green-700", "bg-green-50", "p-3", "rounded-2xl");
  else if (kind === "error") status.classList.add("text-red-700", "bg-red-50", "p-3", "rounded-2xl");
  else status.classList.add("text-slate-600");
}

function unlockAudioFromGesture() {
  void unlockAudio().then((context) => {
    if (context?.state === "running") {
      document.removeEventListener("click", unlockAudioFromGesture);
      document.removeEventListener("keydown", unlockAudioFromGesture);
    }
  });
}

document.addEventListener("click", unlockAudioFromGesture, {passive: true});
document.addEventListener("keydown", unlockAudioFromGesture);

function installQrPrintCutStyles() {
  if (byId("qr-print-cut-styles")) return;
  const style = document.createElement("style");
  style.id = "qr-print-cut-styles";
  style.textContent = `
    @page {
      size: Letter portrait;
      margin: 6mm;
    }
    @media print {
      .student-qr-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        gap: 3mm !important;
      }
      .student-qr-grid.student-qr-single {
        grid-template-columns: 65.6mm !important;
      }
      .student-qr-card {
        min-width: 0 !important;
        padding: 1mm 0 !important;
      }
      /* 65.6 mm menos dos líneas de 0.3 mm deja 65 mm interiores:
         el QR de 59 mm queda separado exactamente 3 mm por lado. */
      .qr-print-code {
        width: 65.6mm !important;
        height: 65.6mm !important;
        box-sizing: border-box !important;
        border: 0.3mm dashed #111827 !important;
        background: none !important;
        overflow: visible !important;
      }
      .qr-print-code canvas,
      .qr-print-code img {
        width: 59mm !important;
        height: 59mm !important;
        box-sizing: border-box !important;
        padding: 7mm !important;
        background: #ffffff !important;
        image-rendering: pixelated;
      }
      .qr-print-code .qr-center-id {
        display: block !important;
        border: 0 !important;
        border-radius: 0 !important;
        padding: 1.8mm 2.2mm !important;
        background: #ffffff !important;
        font-size: 6pt !important;
      }
    }
  `;
  document.head.append(style);
}

installQrPrintCutStyles();

const normalizeCode = (value, max = 80) => String(value || "").trim().toUpperCase().slice(0, max);
const normalizeText = (value, max = 160) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
const normalizeSchoolLevel = (value) => {
  const key = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const map = { preescolar: "PRE", primaria: "PRI", secundaria: "SEC", bachillerato: "BAC", pre: "PRE", pri: "PRI", sec: "SEC", bac: "BAC" };
  return map[key] || normalizeCode(value, 3);
};
const normalizeGroupName = (value, max = 12) => String(value || "").trim().toUpperCase().replace(/\s+/g, " ").slice(0, max);
const studentInitials = (student) => `${normalizeText(student?.paterno).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").slice(0, 2)}${normalizeText(student?.nombres).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").slice(0, 2)}`.toUpperCase().padEnd(4, "X");
const buildStudentId = (level, group, list, student = {}) => `${normalizeSchoolLevel(level)}${normalizeGroupName(group).replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "")}${Number(list)}${studentInitials(student)}`.replace(/\s+/g, "");
function compareStudentsByName(first, second) {
  for (const field of ["paterno", "materno", "nombres"]) {
    const result = normalizeText(first?.[field]).localeCompare(normalizeText(second?.[field]), "es", {sensitivity: "base"});
    if (result) return result;
  }
  return normalizeText(first?.lista).localeCompare(normalizeText(second?.lista), "es", {numeric: true});
}
function studentListNumber(student) {
  const value = String(student?.lista ?? "").trim();
  if (!/^\d+$/.test(value)) return null;
  const listNumber = Number(value);
  return Number.isSafeInteger(listNumber) && listNumber > 0 ? listNumber : null;
}
function compareStudentsByList(first, second) {
  const firstListNumber = studentListNumber(first);
  const secondListNumber = studentListNumber(second);
  if (firstListNumber !== null && secondListNumber !== null) {
    return firstListNumber - secondListNumber || compareStudentsByName(first, second);
  }
  if (firstListNumber !== null) return -1;
  if (secondListNumber !== null) return 1;
  return compareStudentsByName(first, second);
}
const validPassword = (value) => String(value || "").length >= 8 && String(value || "").length <= 72 && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(String(value)) && /\d/.test(String(value));
const isAdmin = () => ["admin_maestro", "director", "admin_jr", "super"].includes(loggedTeacher?.role);
const canViewAttendanceReports = () => ["docente", "porteria", "admin_jr", "director", "admin_maestro", "super"].includes(loggedTeacher?.role);
const isMaster = () => ["admin_maestro", "director", "super"].includes(loggedTeacher?.role);
const normalizedAttendanceStatus = (value) => {
  const status = normalizeText(value, 30).toUpperCase();
  if (status === "FALTA POR RETARDOS") return status;
  return status === "RETARDO" ? "RETARDO" : "A TIEMPO";
};
const isTardyAbsence = (value) => normalizedAttendanceStatus(value) === "FALTA POR RETARDOS";

function showScannerStartTime(value = null) {
  const label = byId("scanner-start-label");
  if (!label) return;
  const time = value && new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
  label.textContent = `INICIO DE ESCANEO: ${time || "SIN INICIAR"}`;
}

function functionError(error, fallback = "No fue posible completar la operación.") {
  const friendlyMessages = {
    "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
    "auth/user-disabled": "La cuenta está desactivada.",
    "auth/unauthorized-domain": "Este sitio de pruebas no está autorizado en Firebase Authentication.",
    "auth/too-many-requests": "Se realizaron demasiados intentos. Espere unos minutos.",
    "auth/network-request-failed": "No fue posible conectarse con Firebase. Revise su conexión.",
    "functions/internal": "Firebase encontró un error interno al procesar la solicitud. Inténtelo nuevamente o contacte a soporte.",
    "functions/unavailable": "El servicio de acceso no está disponible temporalmente. Inténtelo nuevamente en unos minutos.",
    "permission-denied": "La sesión no tiene permisos para consultar los datos solicitados. Cierre la sesión e inténtelo nuevamente.",
  };
  if (friendlyMessages[error?.code]) return friendlyMessages[error.code];
  const message = error?.message || error?.details || "";
  return String(message).replace(/^Firebase:\s*/i, "").replace(/\s*\(functions\/[\w-]+\)\.?$/i, "").trim() || fallback;
}

function backendUnavailable(error) {
  return new Set([
    "functions/internal",
    "functions/unavailable",
    "functions/deadline-exceeded",
  ]).has(String(error?.code || ""));
}

function setConnection(connected, text = connected ? "Conectado" : "Sin conexión") {
  for (const suffix of ["", "-mini"]) {
    const dot = byId(`conn-dot${suffix}`);
    const label = byId(`conn-text${suffix}`);
    if (dot) dot.className = `status-dot ${connected ? "bg-green-500" : "bg-red-500"}`;
    if (label) label.textContent = text;
  }
  const button = byId("btn-validate-cct");
  if (button) {
    button.disabled = !connected;
    button.classList.toggle("opacity-50", !connected);
    button.classList.toggle("cursor-not-allowed", !connected);
  }
}

window.safeToggle = (id, hidden) => {
  const element = byId(id);
  if (!element) return;
  element.classList.toggle("hidden", Boolean(hidden));
  element.setAttribute("aria-hidden", String(Boolean(hidden)));
};

function closeModal() {
  const modal = byId("custom-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modalPreviousFocus?.focus?.();
  modalPreviousFocus = null;
}

const SUPPORT_WHATSAPP_NUMBER = "522207315901";

function openSupportWhatsApp(message) {
  const url = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

window.contactSupportWhatsApp = () => openSupportWhatsApp("solicito más informacion sobre la version premium");

window.showModalMsg = (title, message, supportType = null) => {
  const modal = byId("custom-modal");
  if (!modal) return;
  modalPreviousFocus = document.activeElement;
  byId("modal-msg-title").textContent = title;
  byId("modal-msg-body").textContent = message;
  window.safeToggle("btn-modal-cancel", true);
  window.safeToggle("btn-modal-support", supportType !== "institutional");
  const confirm = byId("btn-modal-confirm");
  confirm.textContent = "Aceptar";
  confirm.disabled = false;
  confirm.onclick = closeModal;
  const support = byId("btn-modal-support");
  support.onclick = window.contactSupportWhatsApp;
  modal.classList.remove("hidden");
  confirm.focus();
};

window.showConfirmMsg = (title, message, onConfirm) => {
  const modal = byId("custom-modal");
  if (!modal) return;
  modalPreviousFocus = document.activeElement;
  byId("modal-msg-title").textContent = title;
  byId("modal-msg-body").textContent = message;
  window.safeToggle("btn-modal-support", true);
  window.safeToggle("btn-modal-cancel", false);
  const cancel = byId("btn-modal-cancel");
  const confirm = byId("btn-modal-confirm");
  cancel.onclick = closeModal;
  confirm.textContent = "Confirmar";
  confirm.disabled = false;
  confirm.onclick = async () => {
    confirm.disabled = true;
    try {
      await onConfirm();
      closeModal();
    } catch (error) {
      confirm.disabled = false;
      byId("modal-msg-body").textContent = functionError(error);
    }
  };
  modal.classList.remove("hidden");
  cancel.focus();
};

document.addEventListener("keydown", (event) => {
  const recoveryModal = byId("modal-teacher-recovery");
  if (event.key === "Escape" && recoveryModal && !recoveryModal.classList.contains("hidden")) {
    window.closeTeacherRecovery?.();
    return;
  }
  const modal = byId("custom-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  if (event.key === "Escape") return closeModal();
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => !element.classList.contains("hidden"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.openSchoolCalendar = () => {
  const modal = byId("modal-school-calendar");
  const calendarImage = byId("school-calendar-image");
  if (!modal || !calendarImage) return;
  schoolCalendarPreviousFocus = document.activeElement;
  calendarImage.onload = () => {
    calendarImage.classList.remove("hidden");
    window.safeToggle("school-calendar-error", true);
  };
  calendarImage.onerror = () => {
    calendarImage.classList.add("hidden");
    window.safeToggle("school-calendar-error", false);
  };
  if (!calendarImage.getAttribute("src")) calendarImage.setAttribute("src", calendarImage.dataset.src);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.setAttribute("aria-hidden", "false");
  byId("btn-school-calendar")?.setAttribute("aria-expanded", "true");
  document.body.classList.add("overflow-hidden");
  byId("btn-close-school-calendar")?.focus();
};

window.closeSchoolCalendar = () => {
  const modal = byId("modal-school-calendar");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  modal.setAttribute("aria-hidden", "true");
  byId("btn-school-calendar")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("overflow-hidden");
  schoolCalendarPreviousFocus?.focus?.();
  schoolCalendarPreviousFocus = null;
};

document.addEventListener("keydown", (event) => {
  const modal = byId("modal-school-calendar");
  if (!modal || modal.classList.contains("hidden")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    return window.closeSchoolCalendar();
  }
  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll("a[href], button:not([disabled])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.togglePass = (id, control) => {
  const input = byId(id);
  if (!input) return;
  const reveal = input.type === "password";
  input.type = reveal ? "text" : "password";
  const icon = control?.querySelector?.("i") || control;
  icon?.classList.toggle("fa-eye", !reveal);
  icon?.classList.toggle("fa-eye-slash", reveal);
  control?.setAttribute?.("aria-label", reveal ? "Ocultar contraseña" : "Mostrar contraseña");
  control?.setAttribute?.("aria-pressed", String(reveal));
  input.focus();
};

window.switchToStep = (stepId) => {
  document.querySelectorAll(".setup-step").forEach((step) => {
    step.classList.remove("active");
    step.setAttribute("aria-hidden", "true");
  });
  const target = byId(stepId);
  if (target) {
    target.classList.add("active");
    target.setAttribute("aria-hidden", "false");
    target.querySelector("input, button")?.focus();
  }
};

window.applySchoolBranding = (data = {}) => {
  const premium = data.isPremium === true;
  const primaryColor = premium && /^#[0-9a-f]{6}$/i.test(String(data.brandPrimaryColor || ""))
    ? data.brandPrimaryColor
    : "#1e293b";
  const accentColor = premium && /^#[0-9a-f]{6}$/i.test(String(data.brandAccentColor || data.brandColor || ""))
    ? String(data.brandAccentColor || data.brandColor)
    : DEFAULT_ACCENT;
  document.documentElement.style.setProperty("--primary-color", primaryColor);
  document.documentElement.style.setProperty("--accent-color", accentColor);
  const logoDataUrl = premium && /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(data.logoDataUrl || "")) ? data.logoDataUrl : "";
  const visibleLogoUrl = logoDataUrl || DEFAULT_APP_ICON;
  const logoBackgroundMode = data.brandLogoBackgroundMode === "color" ? "color" : "transparent";
  const logoBackgroundColor = /^#[0-9a-f]{6}$/i.test(String(data.brandLogoBackgroundColor || ""))
    ? data.brandLogoBackgroundColor
    : "#ffffff";
  for (const id of ["login-logo-placeholder", "header-logo-container"]) {
    const container = byId(id);
    if (!container) continue;
    container.replaceChildren();
    container.style.backgroundColor = logoDataUrl && logoBackgroundMode === "color" ? logoBackgroundColor : "transparent";
    const logo = document.createElement("img");
    logo.src = visibleLogoUrl;
    logo.alt = logoDataUrl && typeof data.name === "string" ? `Logotipo de ${data.name}` : "Logotipo de Control de Asistencia";
    logo.className = "logo-img";
    container.append(logo);
  }
  const browserIcon = document.querySelector('link[rel="icon"]');
  if (browserIcon) browserIcon.href = visibleLogoUrl;
  document.querySelectorAll("[data-free-ad]").forEach((element) => element.classList.toggle("hidden", premium));
  window.safeToggle("premium-upsell", premium);
  if (typeof data.name === "string") {
    if (byId("header-school-name")) byId("header-school-name").textContent = data.name;
    if (byId("login-logo-placeholder")) byId("login-logo-placeholder").setAttribute("aria-label", `Identidad de ${data.name}`);
  }
};

function stopSchoolProfileListener() {
  unsubscribeSchoolProfile?.();
  unsubscribeSchoolProfile = null;
}

function startSchoolProfileListener() {
  stopSchoolProfileListener();
  if (!schoolKey || schoolKey === "SISTEMA" || loggedTeacher?.role === "super") return;
  const schoolRef = doc(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios", schoolKey);
  unsubscribeSchoolProfile = onSnapshot(schoolRef, (snapshot) => {
    if (!snapshot.exists()) return;
    const previousPremium = currentSchool?.isPremium === true;
    currentSchool = {...snapshot.data(), id: schoolKey};
    schoolName = normalizeText(currentSchool.name || schoolKey);
    window.applySchoolBranding(currentSchool);
    if (byId("header-school-name")) byId("header-school-name").textContent = schoolName;
    if (previousPremium !== (currentSchool.isPremium === true)) {
      window.safeToggle("premium-badge-local", currentSchool.isPremium !== true);
      window.safeToggle("invite-branding-panel", currentSchool.isPremium === true);
      window.safeToggle("premium-branding-panel", currentSchool.isPremium !== true);
      if (byId("brand-logo-help")) {
        byId("brand-logo-help").textContent = currentSchool.isPremium === true
          ? "Este logotipo está activo en la identidad visual del plantel."
          : "Puede prepararlo ahora; se aplicará automáticamente cuando Soporte active Premium.";
      }
    }
  }, () => {});
}

window.resetGateway = () => {
  stopSchoolProfileListener();
  schoolKey = "";
  schoolName = "";
  currentSchool = null;
  accessChallenge = "";
  window.cancelTeacherRepair?.();
  window.applySchoolBranding({});
  [
    "input-school-key",
    "input-login-id",
    "input-login-password",
    "teacher-recovery-email",
    "super-email",
    "super-password",
    "register-school-name",
    "register-director-name",
    "register-admin-name",
    "register-admin-id",
    "register-admin-password",
    "register-admin-password-confirm",
    "input-current-password",
    "input-new-user-email",
    "input-new-password",
    "input-confirm-password",
  ]
    .forEach((id) => { if (byId(id)) byId(id).value = ""; });
  window.switchToStep("step-school-key");
};

window.logout = async () => {
  unsubscribeAttendance?.();
  unsubscribeAttendance = null;
  stopSchoolProfileListener();
  schoolSelectionLoadVersion += 1;
  globalSchoolsLoadVersion += 1;
  if (sharedQrScanner) await sharedQrScanner.destroy().catch(() => {});
  sharedQrScanner = null;
  qrScannerMode = "attendance";
  placeSharedQrReader("qr-reader-home");
  loggedTeacher = null;
  selectedAttendanceGroupKey = "";
  selectedManualStudentId = "";
  studentCatalogCache = [];
  incidentCache = [];
  studentBeingMoved = "";
  studentGroupBeingDeleted = null;
  attendanceInFlight.clear();
  if (byId("input-manual-student-search")) byId("input-manual-student-search").value = "";
  hideManualStudentResults();
  document.querySelectorAll("header, main").forEach((element) => element.classList.add("hidden"));
  window.safeToggle("modal-change-password", true);
  window.safeToggle("modal-teacher-recovery", true);
  window.safeToggle("modal-teacher-schedule", true);
  window.safeToggle("modal-move-student", true);
  window.safeToggle("modal-delete-student-group", true);
  window.closeSchoolCalendar();
  window.safeToggle("section-gateway", false);
  window.resetGateway();
  await signOut(auth).catch(() => {});
};

window.exitFirstAccess = () => window.logout();

function createCell(text, className = "") {
  const cell = document.createElement("td");
  cell.textContent = text;
  cell.className = className;
  return cell;
}

function createIconButton(label, iconClass, action, className = "text-red-500 p-2 rounded-lg hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-500") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  const icon = document.createElement("i");
  icon.className = iconClass;
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", action);
  return button;
}

async function loadTeachers(useCache = false) {
  const body = byId("teacher-table-body");
  if (!body || !schoolKey || !isAdmin()) return;
  try {
    if (!useCache || !teacherCatalogCache.length) {
      const response = await api.listTeachers({schoolKey});
      teacherCatalogCache = response.data.teachers;
    }
    const term = normalizeText(byId("teacher-search")?.value).toUpperCase();
    const teachers = teacherCatalogCache
      .filter((teacher) => teacher.id !== "DIR")
      .filter((teacher) => !term || normalizeText(teacher.nombre).toUpperCase().includes(term) || normalizeCode(teacher.id, 160).includes(term))
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
    body.replaceChildren();
    for (const teacher of teachers) {
      const row = document.createElement("tr");
      row.append(createCell(teacher.id, "p-3 text-center"));
      row.append(createCell(`${normalizeText(teacher.nombre)}${teacher.id === "DIR" ? " — DIRECTOR(A)" : ""}${teacher.status === "pending" ? " — PENDIENTE" : ""}`, "p-2 text-center"));
      const roleCell = document.createElement("td");
      roleCell.className = "p-2 text-center";
      if (isMaster()) {
        const select = document.createElement("select");
        select.className = "role-select";
        select.setAttribute("aria-label", `Rol de ${normalizeText(teacher.nombre)}`);
        for (const [value, label] of [["docente", "DOC"], ["porteria", "PORTERÍA"], ["admin_jr", "JR"], ["director", "DIRECTOR"], ["admin_maestro", "MASTER"]]) {
          const option = new Option(label, value, false, teacher.role === value);
          select.add(option);
        }
        select.disabled = loggedTeacher?.role !== "super" && teacher.id === loggedTeacher?.id;
        select.addEventListener("change", () => window.updateTeacherRole(teacher.id, select.value));
        roleCell.append(select);
      } else {
        roleCell.textContent = String(teacher.role || "docente").toUpperCase();
      }
      row.append(roleCell);
      const actionCell = document.createElement("td");
      actionCell.className = "text-center";
      const canManageTarget = isMaster() || new Set(["docente", "porteria"]).has(teacher.role) || !teacher.role;
      if (teacher.status === "pending" && canManageTarget) {
        const approve = document.createElement("button");
        approve.type = "button";
        approve.className = "text-green-700 p-2 rounded-lg hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-green-600";
        approve.setAttribute("aria-label", `Aprobar a ${normalizeText(teacher.nombre)}`);
        const approveIcon = document.createElement("i");
        approveIcon.className = "fas fa-check";
        approveIcon.setAttribute("aria-hidden", "true");
        approve.append(approveIcon);
        approve.addEventListener("click", () => window.approveTeacher(teacher.id));
        actionCell.append(approve);
      }
      if (canManageTarget) {
        actionCell.append(createIconButton(
          `Corregir o restablecer el acceso de ${normalizeText(teacher.nombre)}`,
          "fas fa-key",
          () => window.openTeacherRepair(teacher.id, teacher.nombre),
          "text-blue-700 p-2 rounded-lg hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600",
        ));
      }
      if (canManageTarget && (loggedTeacher?.role === "super" || teacher.id !== loggedTeacher?.id)) {
        actionCell.append(createIconButton(`Eliminar a ${normalizeText(teacher.nombre)}`, "fas fa-trash", () => window.deleteTeacher(teacher.id, teacher.role)));
      }
      row.append(actionCell);
      body.append(row);
    }
    if (!teachers.length) {
      const row = document.createElement("tr");
      const cell = createCell("No hay personal registrado", "p-8 text-slate-400 text-center");
      cell.colSpan = 4;
      row.append(cell);
      body.append(row);
    }
  } catch (error) {
    if (error?.code === "permission-denied" && body.children.length) return;
    window.showModalMsg("Error", functionError(error, "No fue posible cargar al personal."));
  }
}

window.filterTeacherCatalog = () => loadTeachers(true);

function configureTeacherCreationForm() {
  const roleSelect = byId("new-teacher-role");
  if (!roleSelect) return;
  const canAssignAdministrativeRoles = isMaster();
  for (const option of roleSelect.options) {
    option.disabled = !canAssignAdministrativeRoles && !new Set(["docente", "porteria"]).has(option.value);
  }
  if (!canAssignAdministrativeRoles && !new Set(["docente", "porteria"]).has(roleSelect.value)) roleSelect.value = "docente";
}

const STUDENT_LEVEL_LABELS = {PRE: "Preescolar", PRI: "Primaria", SEC: "Secundaria", BAC: "Bachillerato", "SIN NIVEL": "Sin nivel"};
const STUDENT_LEVEL_ORDER = new Map(["PRE", "PRI", "SEC", "BAC", "SIN NIVEL"].map((level, index) => [level, index]));

function groupStudentsBy(items, keyFor) {
  return items.reduce((groups, item) => {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) || []), item]);
    return groups;
  }, new Map());
}

function createCatalogButton(label, detail, active, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `min-w-[8rem] px-5 py-3 rounded-2xl border font-black uppercase transition-all ${active
    ? "theme-primary text-white border-transparent shadow-lg"
    : "bg-white theme-text border-slate-200 hover:border-slate-400 shadow-sm"}`;
  button.setAttribute("aria-pressed", String(active));
  const title = document.createElement("span");
  title.className = "block text-xs";
  title.textContent = label;
  const metadata = document.createElement("span");
  metadata.className = `block mt-1 text-[9px] ${active ? "text-white/80" : "text-slate-500"}`;
  metadata.textContent = detail;
  button.append(title, metadata);
  button.addEventListener("click", action);
  return button;
}

function studentDisplayName(student) {
  return [student?.paterno, student?.materno, student?.nombres].map((value) => normalizeText(value)).filter(Boolean).join(" ");
}

function studentRosterName(student) {
  const name = studentDisplayName(student);
  if (!isMovedStudent(student)) return name;
  const destination = [
    normalizeSchoolLevel(student?.movedToLevel),
    normalizeGroupName(student?.movedToGroup) && `GRUPO ${normalizeGroupName(student?.movedToGroup)}`,
  ].filter(Boolean).join(" · ");
  return `${name} — MOVIDO / ELIMINADO${destination ? ` (A ${destination})` : ""}`;
}

function isStudentInactive(student) {
  return student?.active === false || new Set(["inactive", "moved"]).has(normalizeText(student?.status).toLowerCase());
}

function isMovedStudent(student) {
  return normalizeText(student?.status).toLowerCase() === "moved" || Boolean(student?.movedToStudentId);
}

function normalizedStudentSearch(value) {
  return normalizeText(value, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchingManualStudents(value, limit = 8) {
  const terms = normalizedStudentSearch(value).split(" ").filter(Boolean);
  if (!terms.length) return [];
  return studentCatalogCache
    .filter((student) => !isStudentInactive(student))
    .filter((student) => studentMatchesSelectedAttendanceGroup(student))
    .filter((student) => {
      const name = normalizedStudentSearch(studentDisplayName(student));
      return terms.every((term) => name.includes(term));
    })
    .sort(compareStudentsByName)
    .slice(0, limit);
}

function hideManualStudentResults() {
  const results = byId("manual-student-results");
  if (!results) return;
  results.classList.add("hidden");
  results.replaceChildren();
  byId("input-manual-student-search")?.setAttribute("aria-expanded", "false");
}

window.selectManualStudent = (studentId) => {
  const student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === normalizeCode(studentId, 40));
  if (!student || isStudentInactive(student) || !studentMatchesSelectedAttendanceGroup(student)) return;
  selectedManualStudentId = normalizeCode(student.id, 40);
  const input = byId("input-manual-student-search");
  if (input) input.value = studentDisplayName(student);
  const level = normalizeSchoolLevel(student.level || student.nivel);
  const group = normalizeGroupName(student.grupo);
  const list = studentListNumber(student);
  const detail = [level, group && `Grupo ${group}`, list && `Lista ${list}`].filter(Boolean).join(" · ");
  if (byId("manual-student-selection")) byId("manual-student-selection").textContent = `Seleccionado: ${studentDisplayName(student)}${detail ? ` · ${detail}` : ""}`;
  hideManualStudentResults();
};

window.filterManualStudentSearch = () => {
  selectedManualStudentId = "";
  const input = byId("input-manual-student-search");
  const results = byId("manual-student-results");
  const selection = byId("manual-student-selection");
  if (!input || !results) return;
  const term = normalizedStudentSearch(input.value);
  results.replaceChildren();
  if (selection) selection.textContent = "Busque y seleccione un alumno.";
  if (term.length < 2) {
    results.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
    return;
  }

  const students = matchingManualStudents(term);
  if (!students.length) {
    const empty = document.createElement("p");
    empty.className = "p-3 text-center text-xs font-bold text-slate-500";
    empty.textContent = "No se encontraron alumnos activos con ese nombre.";
    results.append(empty);
  } else {
    for (const student of students) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.className = "block w-full rounded-xl px-4 py-3 text-left hover:bg-orange-50 focus:bg-orange-50";
      const name = document.createElement("strong");
      name.className = "block text-xs uppercase text-slate-800";
      name.textContent = studentDisplayName(student);
      const metadata = document.createElement("span");
      metadata.className = "mt-1 block text-[10px] font-bold uppercase text-slate-500";
      metadata.textContent = [
        normalizeSchoolLevel(student.level || student.nivel),
        normalizeGroupName(student.grupo) && `Grupo ${normalizeGroupName(student.grupo)}`,
        studentListNumber(student) && `Lista ${studentListNumber(student)}`,
      ].filter(Boolean).join(" · ");
      button.append(name, metadata);
      button.addEventListener("click", () => window.selectManualStudent(student.id));
      results.append(button);
    }
  }
  results.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
};

byId("input-manual-student-search")?.addEventListener("input", window.filterManualStudentSearch);
byId("input-manual-student-search")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  void window.manualAttendance();
});

function assignDisplayListNumbers(students) {
  return [...students].sort(compareStudentsByList).map((student) => ({
    ...student,
    displayListNumber: studentListNumber(student)?.toString().padStart(2, "0") || "",
  }));
}

function createStudentPrintHeader(title, levelLabel, groupLabel) {
  const header = document.createElement("header");
  header.className = "student-print-header";
  const school = document.createElement("h1");
  school.textContent = schoolName || "Control de asistencia";
  const detail = document.createElement("p");
  detail.textContent = `${title} · ${levelLabel} · ${groupLabel}`;
  const cct = document.createElement("p");
  cct.textContent = `CCT: ${schoolKey}`;
  header.append(school, detail, cct);
  return header;
}

function launchStudentPrint(content, afterMount) {
  const area = byId("student-print-area");
  if (!area) return;
  area.replaceChildren(content);
  try {
    afterMount?.();
  } catch (error) {
    area.replaceChildren();
    return window.showModalMsg("Impresión", functionError(error, "No fue posible generar los códigos QR."));
  }
  const cleanup = () => area.replaceChildren();
  window.addEventListener("afterprint", cleanup, {once: true});
  requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
}

function printGroupRoster(levelLabel, groupLabel, students) {
  recordClientAudit(
    "print_group_roster",
    `${levelLabel}-${groupLabel}`,
    `${levelLabel} · ${groupLabel}`,
    `Solicitó imprimir la lista de ${students.length} alumnos.`,
    {studentCount: students.length},
  );
  const content = document.createElement("div");
  content.append(createStudentPrintHeader("Lista del grupo", levelLabel, groupLabel));
  const table = document.createElement("table");
  table.className = "student-roster";
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const label of ["Núm. de lista", "Alumno"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement("tbody");
  [...students].sort(compareStudentsByList).forEach((student) => {
    const row = document.createElement("tr");
    const listCell = document.createElement("td");
    listCell.textContent = student.displayListNumber || "";
    const nameCell = document.createElement("td");
    nameCell.textContent = studentRosterName(student);
    if (isStudentInactive(student)) nameCell.classList.add("student-inactive-name");
    row.append(listCell, nameCell);
    body.append(row);
  });
  table.append(head, body);
  content.append(table);
  launchStudentPrint(content);
}

function printStudentQrs(levelLabel, groupLabel, students) {
  if (typeof window.QRCode !== "function") return window.showModalMsg("Códigos QR", "El generador de códigos QR no está disponible. Recargue la página e inténtelo nuevamente.");
  const content = document.createElement("div");
  const grid = document.createElement("div");
  recordClientAudit(
    "print_student_qr",
    students.map((student) => student.id).slice(0, 20).join(","),
    students.length === 1 ? studentDisplayName(students[0]) : `${levelLabel} · ${groupLabel}`,
    `Solicitó imprimir ${students.length} código${students.length === 1 ? "" : "s"} QR.`,
    {studentCount: students.length},
  );
  grid.className = `student-qr-grid${students.length === 1 ? " student-qr-single" : ""}`;
  const qrTargets = [];
  for (const student of [...students].sort(compareStudentsByList)) {
    if (isStudentInactive(student)) continue;
    const card = document.createElement("article");
    card.className = "student-qr-card";
    const name = document.createElement("h2");
    name.textContent = studentDisplayName(student);
    const qr = document.createElement("div");
    qr.className = "qr-print-code";
    card.append(name, qr);
    grid.append(card);
    qrTargets.push([qr, student.id]);
  }
  content.append(grid);
  launchStudentPrint(content, () => {
    for (const [target, id] of qrTargets) {
      new window.QRCode(target, {
        text: id,
        width: 256,
        height: 256,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H,
      });
      const centerLabel = document.createElement("span");
      centerLabel.className = "qr-center-id";
      centerLabel.textContent = id;
      target.appendChild(centerLabel);
    }
  });
}

function createPrintActionButton(label, iconClass, action, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `px-4 py-3 rounded-xl font-black uppercase text-[9px] shadow-sm ${primary ? "theme-primary text-white" : "bg-white theme-text border border-slate-200"}`;
  const icon = document.createElement("i");
  icon.className = `${iconClass} mr-2`;
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, document.createTextNode(label));
  button.addEventListener("click", action);
  return button;
}

function createStudentTable(levelLabel, groupLabel, students) {
  const wrapper = document.createElement("div");
  wrapper.className = "overflow-x-auto border-t border-slate-100";
  const table = document.createElement("table");
  table.className = "w-full border-collapse text-center";
  const caption = document.createElement("caption");
  caption.className = "sr-only";
  caption.textContent = `Alumnos de ${groupLabel}`;
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.className = "bg-slate-50 text-[9px] font-black uppercase border-b";
  for (const [label, className] of [["Núm. de lista", "p-4"], ["Alumno", ""], ["QR", ""], ["Acción", ""]]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.className = className;
    cell.textContent = label;
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement("tbody");
  body.className = "divide-y divide-slate-100 text-[11px] font-bold uppercase";
  for (const student of [...students].sort(compareStudentsByList)) {
    const row = document.createElement("tr");
    const fullName = studentDisplayName(student);
    const inactive = isStudentInactive(student);
    const moved = isMovedStudent(student);
    if (moved) row.className = "bg-red-50/80";
    row.append(createCell(student.displayListNumber || "", "p-3 font-black text-center"));
    const nameCell = createCell(studentRosterName(student), `text-left px-2${inactive ? " student-inactive-name" : ""}`);
    row.append(nameCell);
    const qrCell = document.createElement("td");
    qrCell.className = "text-center";
    if (!inactive) {
      qrCell.append(createIconButton(
        `Imprimir QR de ${fullName}`,
        "fas fa-qrcode",
        () => printStudentQrs(levelLabel, groupLabel, [student]),
        "theme-accent-text p-2 rounded-lg hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500",
      ));
    }
    row.append(qrCell);
    const actionCell = document.createElement("td");
    actionCell.className = "text-center whitespace-nowrap";
    if (!inactive) {
      const actionSelect = document.createElement("select");
      actionSelect.className = "max-w-[9rem] rounded-xl border border-slate-200 bg-white px-2 py-2 text-[9px] font-black uppercase text-slate-700 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500";
      actionSelect.setAttribute("aria-label", `Acción para ${fullName}`);
      actionSelect.add(new Option("Seleccionar…", ""));
      actionSelect.add(new Option("Mover de grupo", "move"));
      actionSelect.add(new Option("Dar de baja", "disable"));
      actionSelect.addEventListener("change", () => window.handleStudentAction(actionSelect, student.id));
      actionCell.append(actionSelect);
    } else if (!moved) {
      actionCell.append(createIconButton(
        `Reactivar a ${fullName}`,
        "fas fa-rotate-left",
        () => window.setStudentActive(student.id, true),
        "text-green-700 p-2 rounded-lg hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-green-600",
      ));
    }
    row.append(actionCell);
    body.append(row);
  }
  table.append(caption, head, body);
  wrapper.append(table);
  return wrapper;
}

window.handleStudentAction = (select, studentId) => {
  const action = select?.value;
  if (select) select.value = "";
  if (action === "move") return window.openMoveStudentModal(studentId);
  if (action === "disable") return window.setStudentActive(studentId, false);
};

function createGroupView(level, levelLabel, group, groupLabel, students) {
  const numberedStudents = assignDisplayListNumbers(students);
  const activeStudents = numberedStudents.filter((student) => !isStudentInactive(student));
  const view = document.createElement("div");
  const toolbar = document.createElement("div");
  toolbar.className = "p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50";
  const title = document.createElement("div");
  title.className = "text-center md:text-left";
  const heading = document.createElement("h4");
  heading.className = "font-black uppercase theme-text text-sm";
  heading.textContent = `${levelLabel} · ${groupLabel}`;
  const count = document.createElement("p");
  count.className = "mt-1 text-[9px] font-bold uppercase text-slate-500";
  count.textContent = `${activeStudents.length} activos de ${numberedStudents.length} ${numberedStudents.length === 1 ? "alumno" : "alumnos"}`;
  title.append(heading, count);
  const actions = document.createElement("div");
  actions.className = "flex flex-wrap justify-center gap-2";
  actions.append(
    createPrintActionButton("Imprimir lista", "fas fa-print", () => printGroupRoster(levelLabel, groupLabel, numberedStudents)),
    createPrintActionButton("Imprimir QR", "fas fa-qrcode", () => printStudentQrs(levelLabel, groupLabel, activeStudents), true),
  );
  if (isAdmin()) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[9px] font-black uppercase text-red-700 shadow-sm hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-red-700";
    const lockIcon = document.createElement("i");
    lockIcon.className = "fas fa-lock mr-2";
    lockIcon.setAttribute("aria-hidden", "true");
    deleteButton.append(lockIcon, document.createTextNode("Borrar grupo"));
    deleteButton.addEventListener("click", () => window.openDeleteStudentGroupModal(level, group));
    actions.append(deleteButton);
  }
  toolbar.append(title, actions);
  view.append(toolbar, createStudentTable(levelLabel, groupLabel, numberedStudents));
  return view;
}

async function loadStudents(useCache = false) {
  const container = byId("student-levels-container");
  if (!container || !schoolKey || schoolKey === "SISTEMA") return;
  const preserveSelection = container.dataset.schoolKey === schoolKey;
  const previousLevel = preserveSelection ? container.dataset.selectedLevel || "" : "";
  const previousGroup = preserveSelection ? container.dataset.selectedGroup || "" : "";
  container.replaceChildren();
  container.dataset.schoolKey = schoolKey;
  try {
    if (!useCache || !studentCatalogCache.length) {
      const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
      studentCatalogCache = snapshot.docs.map((entry) => ({...entry.data(), id: entry.id}));
    }
    populateScheduleGroupOptions();
    populateAttendanceGroupOptions();
    const term = normalizeText(byId("student-search")?.value).toUpperCase();
    const students = studentCatalogCache.filter((student) => !term
      || normalizeCode(student.id, 40).includes(term)
      || studentDisplayName(student).toUpperCase().includes(term));
    const studentsWithGroup = students.filter((student) => normalizeGroupName(student.grupo));
    const levels = groupStudentsBy(studentsWithGroup, (student) => normalizeSchoolLevel(student.level || student.nivel) || "SIN NIVEL");
    const levelNames = [...levels.keys()].sort((first, second) => {
      const order = (STUDENT_LEVEL_ORDER.get(first) ?? 99) - (STUDENT_LEVEL_ORDER.get(second) ?? 99);
      return order || first.localeCompare(second, "es", {numeric: true});
    });
    const groupsByLevel = new Map(levelNames.map((levelName) => [
      levelName,
      groupStudentsBy(levels.get(levelName), (student) => normalizeGroupName(student.grupo)),
    ]).filter(([, groups]) => groups.size));
    const availableLevels = levelNames.filter((levelName) => groupsByLevel.has(levelName));
    window.safeToggle("general-table-container", availableLevels.length === 0);
    if (!availableLevels.length) return;

    let selectedLevel = groupsByLevel.has(previousLevel) ? previousLevel : "";
    let selectedGroup = selectedLevel && groupsByLevel.get(selectedLevel).has(previousGroup) ? previousGroup : "";
    container.dataset.selectedLevel = selectedLevel;
    container.dataset.selectedGroup = selectedGroup;

    const levelSection = document.createElement("section");
    const levelHeading = document.createElement("h4");
    levelHeading.className = "mb-3 text-[10px] font-black uppercase text-slate-500";
    levelHeading.textContent = "Seleccione un nivel";
    const levelButtons = document.createElement("div");
    levelButtons.className = "flex flex-wrap justify-center gap-3";
    levelSection.append(levelHeading, levelButtons);

    const groupSection = document.createElement("section");
    groupSection.className = "rounded-[2rem] bg-slate-50 border border-slate-200 p-4 md:p-5";
    const tableSection = document.createElement("section");
    tableSection.className = "rounded-[2rem] border border-slate-200 bg-white overflow-hidden";
    tableSection.setAttribute("aria-live", "polite");
    container.append(levelSection, groupSection, tableSection);

    const showPrompt = (target, text) => {
      target.replaceChildren();
      const prompt = document.createElement("p");
      prompt.className = "py-4 text-xs font-bold text-slate-500";
      prompt.textContent = text;
      target.append(prompt);
    };

    const renderLevelButtons = () => {
      levelButtons.replaceChildren();
      for (const levelName of availableLevels) {
        const groups = groupsByLevel.get(levelName);
        const count = groups.size;
        levelButtons.append(createCatalogButton(
          STUDENT_LEVEL_LABELS[levelName] || levelName,
          `${count} ${count === 1 ? "grupo" : "grupos"}`,
          selectedLevel === levelName,
          () => selectLevel(levelName),
        ));
      }
    };

    const renderGroupButtons = () => {
      groupSection.replaceChildren();
      if (!selectedLevel) return showPrompt(groupSection, "Seleccione un nivel para ver sus grupos.");
      const heading = document.createElement("h4");
      heading.className = "mb-3 text-[10px] font-black uppercase text-slate-500";
      heading.textContent = `Grupos de ${STUDENT_LEVEL_LABELS[selectedLevel] || selectedLevel}`;
      const buttons = document.createElement("div");
      buttons.className = "flex flex-wrap justify-center gap-3";
      const groups = groupsByLevel.get(selectedLevel);
      for (const groupName of [...groups.keys()].sort((a, b) => a.localeCompare(b, "es", {numeric: true, sensitivity: "base"}))) {
        const groupStudents = groups.get(groupName);
        buttons.append(createCatalogButton(
          `Grupo ${groupName}`,
          `${groupStudents.length} ${groupStudents.length === 1 ? "alumno" : "alumnos"}`,
          selectedGroup === groupName,
          () => selectGroup(groupName),
        ));
      }
      groupSection.append(heading, buttons);
    };

    function selectLevel(levelName) {
      selectedLevel = levelName;
      selectedGroup = "";
      container.dataset.selectedLevel = selectedLevel;
      container.dataset.selectedGroup = "";
      renderLevelButtons();
      renderGroupButtons();
      showPrompt(tableSection, "Seleccione el grupo que desea visualizar.");
    }

    function selectGroup(groupName) {
      selectedGroup = groupName;
      container.dataset.selectedGroup = selectedGroup;
      renderGroupButtons();
      const levelLabel = STUDENT_LEVEL_LABELS[selectedLevel] || selectedLevel;
      const groupLabel = `Grupo ${groupName}`;
      tableSection.replaceChildren(createGroupView(selectedLevel, levelLabel, groupName, groupLabel, groupsByLevel.get(selectedLevel).get(groupName)));
    }

    renderLevelButtons();
    renderGroupButtons();
    if (selectedGroup) selectGroup(selectedGroup);
    else showPrompt(tableSection, selectedLevel ? "Seleccione el grupo que desea visualizar." : "Seleccione primero un nivel y después un grupo.");
  } catch (error) {
    window.showModalMsg("Error", functionError(error, "No fue posible cargar a los alumnos."));
  }
}

window.filterStudentCatalog = () => loadStudents(true);

function scheduleGroupKey(level, group) {
  return `${encodeURIComponent(normalizeSchoolLevel(level))}|${encodeURIComponent(normalizeGroupName(group))}`;
}

function selectedScheduleGroup() {
  const value = String(byId("schedule-group")?.value || "");
  const separator = value.indexOf("|");
  if (separator < 0) return null;
  try {
    return {
      level: normalizeSchoolLevel(decodeURIComponent(value.slice(0, separator))),
      group: normalizeGroupName(decodeURIComponent(value.slice(separator + 1))),
    };
  } catch {
    return null;
  }
}

function selectedAttendanceGroup() {
  const value = String(byId("attendance-group")?.value || selectedAttendanceGroupKey || "");
  const separator = value.indexOf("|");
  if (separator < 0) return null;
  try {
    return {
      level: normalizeSchoolLevel(decodeURIComponent(value.slice(0, separator))),
      group: normalizeGroupName(decodeURIComponent(value.slice(separator + 1))),
    };
  } catch {
    return null;
  }
}

function configuredGroupSchedule(level, group) {
  return (Array.isArray(loggedTeacher?.groupSchedules) ? loggedTeacher.groupSchedules : []).find((item) => (
    normalizeSchoolLevel(item?.level) === normalizeSchoolLevel(level)
      && normalizeGroupName(item?.group) === normalizeGroupName(group)
      && /^\d{2}:\d{2}$/.test(String(item?.entryTime || "").slice(0, 5))
  ));
}

function studentMatchesSelectedAttendanceGroup(student) {
  if (loggedTeacher?.role !== "docente") return true;
  const selection = selectedAttendanceGroup();
  return Boolean(selection
    && normalizeSchoolLevel(student?.level || student?.nivel) === selection.level
    && normalizeGroupName(student?.grupo) === selection.group);
}

function updateAttendanceGroupStatus() {
  const status = byId("attendance-group-status");
  const label = byId("current-schedule-label");
  const configureButton = byId("btn-configure-attendance-group");
  if (loggedTeacher?.role !== "docente") return;
  const selection = selectedAttendanceGroup();
  if (!selection) {
    if (status) status.textContent = "Seleccione el grupo antes de encender la cámara o registrar manualmente.";
    if (label) label.textContent = "Seleccione un grupo";
    if (configureButton) configureButton.textContent = "Configurar horario del grupo";
    return;
  }
  const schedule = configuredGroupSchedule(selection.level, selection.group);
  if (!schedule) {
    if (status) status.textContent = `${selection.level} · Grupo ${selection.group} todavía no tiene horario. Configúrelo para comenzar el pase de lista.`;
    if (label) label.textContent = `${selection.level} · Grupo ${selection.group} · horario pendiente`;
    if (configureButton) configureButton.textContent = "Configurar horario ahora";
    return;
  }
  if (status) status.textContent = `${selection.level} · Grupo ${selection.group} listo para pasar lista a las ${schedule.entryTime}.`;
  if (label) label.textContent = `${selection.level} · Grupo ${selection.group} · Pase ${schedule.entryTime} · tolerancia ${Number(schedule.tolerance || 0)} min`;
  if (configureButton) configureButton.textContent = "Modificar horario del grupo";
}

function populateAttendanceGroupOptions() {
  const panel = byId("teacher-attendance-group-panel");
  const select = byId("attendance-group");
  const teacher = loggedTeacher?.role === "docente";
  window.safeToggle("teacher-attendance-group-panel", !teacher);
  if (!teacher || !panel || !select) return;
  const groups = new Map();
  for (const student of studentCatalogCache) {
    if (isStudentInactive(student)) continue;
    const level = normalizeSchoolLevel(student.level || student.nivel);
    const group = normalizeGroupName(student.grupo);
    if (level && group) groups.set(scheduleGroupKey(level, group), {level, group});
  }
  const options = [...groups.entries()].sort(([, first], [, second]) => {
    const levelOrder = (STUDENT_LEVEL_ORDER.get(first.level) ?? 99) - (STUDENT_LEVEL_ORDER.get(second.level) ?? 99);
    return levelOrder || first.group.localeCompare(second.group, "es", {numeric: true, sensitivity: "base"});
  });
  select.replaceChildren(new Option(options.length ? "Seleccione un grupo" : "No hay grupos registrados", ""));
  for (const [value, item] of options) {
    const pending = configuredGroupSchedule(item.level, item.group) ? "" : " · CONFIGURAR HORARIO";
    select.add(new Option(`${STUDENT_LEVEL_LABELS[item.level] || item.level} · Grupo ${item.group}${pending}`, value));
  }
  if (options.some(([value]) => value === selectedAttendanceGroupKey)) select.value = selectedAttendanceGroupKey;
  else selectedAttendanceGroupKey = "";
  select.disabled = options.length === 0;
  updateAttendanceGroupStatus();
}

window.selectAttendanceGroup = async () => {
  if (isScannerRunning) await window.stopScanner();
  selectedAttendanceGroupKey = String(byId("attendance-group")?.value || "");
  selectedManualStudentId = "";
  if (byId("input-manual-student-search")) byId("input-manual-student-search").value = "";
  if (byId("manual-student-selection")) byId("manual-student-selection").textContent = "Busque y seleccione un alumno.";
  hideManualStudentResults();
  updateAttendanceGroupStatus();
  const selection = selectedAttendanceGroup();
  if (selection && !configuredGroupSchedule(selection.level, selection.group)) {
    window.openScheduleSetup(true, {level: selection.level, grupo: selection.group});
  }
};

window.openSelectedAttendanceSchedule = () => {
  const selection = selectedAttendanceGroup();
  if (!selection) return window.showModalMsg("Pase de lista", "Seleccione primero el grupo que desea atender.");
  window.openScheduleSetup(true, {level: selection.level, grupo: selection.group});
};

function attendanceGroupReady(openConfiguration = false) {
  if (loggedTeacher?.role !== "docente") return null;
  const selection = selectedAttendanceGroup();
  if (!selection) {
    updateAttendanceGroupStatus();
    if (openConfiguration) window.showModalMsg("Pase de lista", "Seleccione el grupo antes de comenzar.");
    return false;
  }
  if (!configuredGroupSchedule(selection.level, selection.group)) {
    updateAttendanceGroupStatus();
    if (openConfiguration) window.openScheduleSetup(true, {level: selection.level, grupo: selection.group});
    return false;
  }
  return selection;
}

function selectStudentScheduleGroup(student) {
  const select = byId("schedule-group");
  if (!select || !student) return;
  const value = scheduleGroupKey(student.level || student.nivel, student.grupo);
  if ([...select.options].some((option) => option.value === value)) {
    select.value = value;
    populateScheduleForm();
  }
}

window.openScheduleSetup = (required = false, student = null) => {
  populateScheduleGroupOptions();
  selectStudentScheduleGroup(student);
  const select = byId("schedule-group");
  if (!select || select.disabled || !select.value) {
    return window.showModalMsg("Horario", "No hay grupos con alumnos registrados. Solicite al administrador que registre primero a los alumnos.");
  }
  const status = byId("schedule-setup-status");
  if (status) status.textContent = required
    ? "Configure el horario de este grupo para poder pasar lista. Puede cerrar y hacerlo después."
    : "Seleccione cualquiera de sus grupos para consultar o modificar su horario. Puede hacerlo en cualquier momento.";
  window.safeToggle("btn-close-schedule", false);
  window.safeToggle("modal-teacher-schedule", false);
  byId("schedule-entry-time")?.focus();
};

window.closeScheduleSetup = () => {
  window.safeToggle("modal-teacher-schedule", true);
  updateAttendanceGroupStatus();
};

function populateScheduleGroupOptions() {
  const select = byId("schedule-group");
  if (!select) return;
  const previous = select.value;
  const groups = new Map();
  for (const student of studentCatalogCache) {
    if (isStudentInactive(student)) continue;
    const level = normalizeSchoolLevel(student.level || student.nivel);
    const group = normalizeGroupName(student.grupo);
    if (!level || !group) continue;
    groups.set(scheduleGroupKey(level, group), {level, group});
  }
  const options = [...groups.entries()].sort(([, first], [, second]) => {
    const levelOrder = (STUDENT_LEVEL_ORDER.get(first.level) ?? 99) - (STUDENT_LEVEL_ORDER.get(second.level) ?? 99);
    return levelOrder || first.group.localeCompare(second.group, "es", {numeric: true, sensitivity: "base"});
  });
  select.replaceChildren();
  if (!options.length) {
    select.add(new Option("No hay grupos registrados", ""));
    select.disabled = true;
    populateScheduleForm();
    return;
  }
  select.disabled = false;
  for (const [value, item] of options) {
    select.add(new Option(`${STUDENT_LEVEL_LABELS[item.level] || item.level} · Grupo ${item.group}`, value));
  }
  if (options.some(([value]) => value === previous)) select.value = previous;
  populateScheduleForm();
}

window.selectScheduleGroup = () => populateScheduleForm();

function effectiveSchedule(level, group) {
  const teacher = loggedTeacher || {};
  const school = currentSchool || {};
  const groupSchedule = (Array.isArray(teacher.groupSchedules) ? teacher.groupSchedules : []).find((item) =>
    normalizeSchoolLevel(item?.level) === level && normalizeGroupName(item?.group) === group);
  return {
    entryTime: String(groupSchedule?.entryTime || teacher.entryTime || school.entryTime || "").slice(0, 5),
    recessReturnTime: String(groupSchedule?.recessReturnTime || teacher.recessReturnTime || school.recessReturnTime || "").slice(0, 5),
    tolerance: Number(groupSchedule?.tolerance ?? teacher.tolerance ?? school.tolerance ?? 0),
    classDuration: Number(groupSchedule?.classDuration ?? teacher.classDuration ?? school.classDuration ?? 50),
    configuredForGroup: Boolean(groupSchedule),
  };
}

function populateScheduleForm() {
  const selection = selectedScheduleGroup();
  const schedule = effectiveSchedule(selection?.level, selection?.group);
  const fields = {
    "schedule-entry-time": schedule.entryTime,
    "schedule-recess-return": schedule.recessReturnTime,
    "schedule-tolerance": schedule.tolerance,
    "schedule-class-duration": schedule.classDuration,
  };
  for (const [id, value] of Object.entries(fields)) if (byId(id)) byId(id).value = value ?? "";
  const label = byId("current-schedule-label");
  if (!label) return;
  if (!selection) label.textContent = "Sin grupos registrados";
  else if (schedule.entryTime) label.textContent = `${selection.level} · Grupo ${selection.group} · Pase ${schedule.entryTime} · tolerancia ${schedule.tolerance} min${schedule.configuredForGroup ? "" : " · horario general"}`;
  else label.textContent = `${selection.level} · Grupo ${selection.group} · sin horario configurado`;
}

window.saveOwnSchedule = async () => {
  if (!loggedTeacher || loggedTeacher.role === "super") return;
  const selection = selectedScheduleGroup();
  if (!selection) return window.showModalMsg("Horario", "Primero registre alumnos en un grupo para poder asignarle un horario.");
  const schedule = {
    schoolKey,
    level: selection.level,
    group: selection.group,
    entryTime: byId("schedule-entry-time")?.value || "",
    recessReturnTime: byId("schedule-recess-return")?.value || "",
    tolerance: byId("schedule-tolerance")?.value || 0,
    classDuration: byId("schedule-class-duration")?.value || 50,
  };
  if (loggedTeacher.role === "docente" && !schedule.entryTime) {
    byId("schedule-entry-time")?.focus();
    if (byId("schedule-setup-status")) byId("schedule-setup-status").textContent = "Capture la hora en la que pasará lista para este grupo.";
    return;
  }
  const button = byId("btn-save-own-schedule");
  if (button) button.disabled = true;
  try {
    const response = await api.updateOwnSchedule(schedule);
    const saved = response.data.schedule;
    const groupSchedules = (Array.isArray(loggedTeacher.groupSchedules) ? loggedTeacher.groupSchedules : []).filter((item) =>
      normalizeSchoolLevel(item?.level) !== saved.level || normalizeGroupName(item?.group) !== saved.group);
    loggedTeacher = {...loggedTeacher, groupSchedules: [...groupSchedules, saved]};
    populateScheduleForm();
    populateAttendanceGroupOptions();
    updateAttendanceGroupStatus();
    window.safeToggle("modal-teacher-schedule", true);
    setScannerStatus(`Horario guardado para ${saved.level} · Grupo ${saved.group}.`, "success");
    window.showModalMsg("Horario", `El horario de ${saved.level} · Grupo ${saved.group} fue guardado.`);
  } catch (error) {
    if (byId("schedule-setup-status")) byId("schedule-setup-status").textContent = functionError(error);
  } finally {
    if (button) button.disabled = false;
  }
};

const INCIDENT_PRIORITY_LABELS = {baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente"};
const INCIDENT_AFFECTATION_LABELS = {alumno: "Alumna o alumno", personal: "Personal", servicio: "Servicio", infraestructura: "Infraestructura", mobiliario_equipo: "Mobiliario o equipo"};
const INCIDENT_TYPE_LABELS = {asistencia: "Asistencia", conducta: "Conducta", convivencia: "Convivencia escolar", acoso_violencia: "Acoso o violencia", accidente_salud: "Accidente o salud", aprendizaje: "Aprendizaje", proteccion_civil: "Protección civil", servicio: "Servicio del plantel", infraestructura: "Infraestructura", mobiliario_equipo: "Mobiliario o equipo", otro: "Otro"};
const INCIDENT_STATUS_LABELS = {abierta: "Abierta", seguimiento: "En seguimiento", resuelta: "Resuelta"};

function selectedIncidentGroup(value = byId("incident-group")?.value) {
  const raw = String(value || "");
  const separator = raw.indexOf("|");
  if (separator < 0) return null;
  try {
    return {
      level: normalizeSchoolLevel(decodeURIComponent(raw.slice(0, separator))),
      group: normalizeGroupName(decodeURIComponent(raw.slice(separator + 1))),
    };
  } catch {
    return null;
  }
}

function teacherIncidentGroups() {
  const groups = new Map();
  for (const student of studentCatalogCache) {
    if (isStudentInactive(student)) continue;
    const level = normalizeSchoolLevel(student.level || student.nivel);
    const group = normalizeGroupName(student.grupo);
    if (!level || !group) continue;
    groups.set(scheduleGroupKey(level, group), {level, group});
  }
  return [...groups.entries()].sort(([, first], [, second]) => {
    const levelOrder = (STUDENT_LEVEL_ORDER.get(first.level) ?? 99) - (STUDENT_LEVEL_ORDER.get(second.level) ?? 99);
    return levelOrder || first.group.localeCompare(second.group, "es", {numeric: true, sensitivity: "base"});
  });
}

function populateIncidentGroupOptions() {
  const groups = teacherIncidentGroups();
  const select = byId("incident-group");
  const filter = byId("incident-group-filter");
  const previous = select?.value || "";
  if (select) {
    select.replaceChildren(new Option(groups.length ? "Seleccione un grupo" : "No hay grupos activos", ""));
    groups.forEach(([value, item]) => select.add(new Option(`${STUDENT_LEVEL_LABELS[item.level] || item.level} · Grupo ${item.group}`, value)));
    select.disabled = groups.length === 0;
    if (groups.some(([value]) => value === previous)) select.value = previous;
  }
  if (filter) {
    const selectedFilter = filter.value;
    filter.replaceChildren(new Option("Todos", ""));
    groups.forEach(([value, item]) => filter.add(new Option(`${item.level} · ${item.group}`, value)));
    if (groups.some(([value]) => value === selectedFilter)) filter.value = selectedFilter;
  }
  window.populateIncidentStudents();
}

window.populateIncidentStudents = () => {
  const selection = selectedIncidentGroup();
  const select = byId("incident-student");
  if (!select) return;
  const previous = select.value;
  const students = studentCatalogCache
    .filter((student) => !isStudentInactive(student)
      && selection
      && normalizeSchoolLevel(student.level || student.nivel) === selection.level
      && normalizeGroupName(student.grupo) === selection.group)
    .sort(compareStudentsByName);
  select.replaceChildren(new Option(students.length ? "Seleccione o capture el nombre" : "Seleccione primero un grupo", ""));
  students.forEach((student) => select.add(new Option(studentDisplayName(student), student.id)));
  if (students.some((student) => student.id === previous)) select.value = previous;
  window.selectIncidentStudent();
};

window.selectIncidentStudent = () => {
  const student = studentCatalogCache.find((candidate) => candidate.id === byId("incident-student")?.value);
  if (student && byId("incident-affected-name")) byId("incident-affected-name").value = studentDisplayName(student);
};

window.updateIncidentAffectedFields = () => {
  const affectation = byId("incident-affectation")?.value || "alumno";
  const personAffected = new Set(["alumno", "personal"]).has(affectation);
  window.safeToggle("incident-student-field", affectation !== "alumno");
  window.safeToggle("incident-function-field", !personAffected);
  window.safeToggle("incident-age-field", !personAffected);
  window.safeToggle("incident-name-field", !personAffected);
  window.safeToggle("incident-service-field", personAffected);
  if (byId("incident-affected-name")) byId("incident-affected-name").required = personAffected;
  if (byId("incident-affected-service")) byId("incident-affected-service").required = !personAffected;
  if (affectation === "alumno" && byId("incident-affected-function")) byId("incident-affected-function").value = "alumno";
  if (affectation === "personal" && byId("incident-affected-function")?.value === "alumno") byId("incident-affected-function").value = "docente";
};

function mexicoDateAndTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).reduce((values, part) => ({...values, [part.type]: part.value}), {});
  return {date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`};
}

function prepareIncidentForm({reset = false} = {}) {
  const defaults = reset ? {
    group: byId("incident-group")?.value || "",
    municipality: byId("incident-municipality")?.value || "",
    shift: byId("incident-shift")?.value || "",
    administrativeUnit: byId("incident-administrative-unit")?.value || "",
    regionalOffice: byId("incident-regional-office")?.value || "",
  } : null;
  if (reset) byId("incident-form")?.reset();
  const now = mexicoDateAndTime();
  if (byId("incident-cct")) byId("incident-cct").value = schoolKey;
  if (byId("incident-school-name")) byId("incident-school-name").value = schoolName;
  if (byId("incident-reporter")) byId("incident-reporter").value = loggedTeacher?.nombre || "";
  if (byId("incident-report-type")) byId("incident-report-type").value = "Inicial";
  if (byId("incident-folio")) byId("incident-folio").value = "Se generará al guardar";
  if (byId("incident-date")) {
    byId("incident-date").max = now.date;
    byId("incident-date").value = now.date;
  }
  if (byId("incident-time")) byId("incident-time").value = now.time;
  populateIncidentGroupOptions();
  if (defaults) {
    if (byId("incident-group")) byId("incident-group").value = defaults.group;
    if (byId("incident-municipality")) byId("incident-municipality").value = defaults.municipality;
    if (byId("incident-shift")) byId("incident-shift").value = defaults.shift;
    if (byId("incident-administrative-unit")) byId("incident-administrative-unit").value = defaults.administrativeUnit;
    if (byId("incident-regional-office")) byId("incident-regional-office").value = defaults.regionalOffice;
    window.populateIncidentStudents();
  }
  window.updateIncidentAffectedFields();
};

function setIncidentFormStatus(message, error = false) {
  const status = byId("incident-form-status");
  if (!status) return;
  status.textContent = message;
  status.className = `min-h-5 text-center text-xs font-bold ${error ? "text-red-700" : "text-slate-600"}`;
}

window.createIncident = async (event) => {
  event?.preventDefault?.();
  if (loggedTeacher?.role !== "docente") return window.showModalMsg("Acceso", "Esta bitácora está disponible para cuentas docentes.");
  const form = byId("incident-form");
  if (!form?.reportValidity()) return;
  const selectedGroup = selectedIncidentGroup();
  if (!selectedGroup) return setIncidentFormStatus("Seleccione uno de sus grupos.", true);
  const button = byId("btn-create-incident");
  if (button) button.disabled = true;
  setIncidentFormStatus("Guardando la incidencia…");
  try {
    const result = await api.createIncident({
      schoolKey,
      schoolName,
      level: selectedGroup.level,
      group: selectedGroup.group,
      reportedDate: byId("incident-date")?.value,
      reportedTime: byId("incident-time")?.value,
      priority: byId("incident-priority")?.value,
      affectationType: byId("incident-affectation")?.value,
      incidentType: byId("incident-type")?.value,
      affectedStudentId: byId("incident-student")?.value,
      affectedFunction: byId("incident-affected-function")?.value,
      affectedPersonName: byId("incident-affected-name")?.value,
      affectedAge: byId("incident-affected-age")?.value,
      affectedService: byId("incident-affected-service")?.value,
      municipality: byId("incident-municipality")?.value,
      shift: byId("incident-shift")?.value,
      administrativeUnit: byId("incident-administrative-unit")?.value,
      regionalOffice: byId("incident-regional-office")?.value,
      description: byId("incident-description")?.value,
      immediateActions: byId("incident-immediate-actions")?.value,
      guardianNotified: byId("incident-guardian-notified")?.checked === true,
      nextFollowUpDate: byId("incident-next-follow-up")?.value,
    });
    const incident = result.data.incident;
    incidentCache.unshift(incident);
    prepareIncidentForm({reset: true});
    setIncidentFormStatus(`Incidencia ${incident.folio} guardada.`);
    window.renderIncidentList();
    window.showModalMsg("Incidencia guardada", `Se creó el folio ${incident.folio}. Puede actualizar su seguimiento desde la bitácora.`);
  } catch (error) {
    setIncidentFormStatus(functionError(error, "No fue posible guardar la incidencia."), true);
  } finally {
    if (button) button.disabled = false;
  }
};

function incidentTextElement(tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}

function formatIncidentDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {dateStyle: "medium", timeZone: "UTC"}).format(new Date(`${value}T00:00:00Z`));
}

function createIncidentHistory(incident) {
  const details = document.createElement("details");
  details.className = "rounded-2xl border border-slate-200 bg-slate-50 p-4";
  const summary = incidentTextElement("summary", `Historial (${incident.history?.length || 0})`, "cursor-pointer text-[10px] font-black uppercase text-slate-700");
  const list = document.createElement("ol");
  list.className = "mt-3 space-y-3";
  [...(incident.history || [])].reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.className = "border-l-2 border-violet-300 pl-3";
    item.append(
      incidentTextElement("p", `${INCIDENT_STATUS_LABELS[entry.status] || entry.status} · ${entry.authorName || "Docente"}`, "text-[9px] font-black uppercase text-violet-800"),
      incidentTextElement("p", entry.note || "Sin nota", "mt-1 text-xs leading-relaxed text-slate-700"),
      incidentTextElement("p", `${entry.guardianNotified ? "Familia notificada" : "Sin notificación familiar registrada"}${entry.nextFollowUpDate ? ` · Próximo seguimiento: ${formatIncidentDate(entry.nextFollowUpDate)}` : ""}`, "mt-1 text-[9px] font-bold text-slate-500"),
    );
    list.append(item);
  });
  details.append(summary, list);
  return details;
}

function createIncidentFollowUp(incident) {
  const panel = document.createElement("div");
  panel.className = "grid grid-cols-1 gap-3 rounded-2xl border border-violet-100 bg-violet-50 p-4 sm:grid-cols-2";
  const status = document.createElement("select");
  status.className = "w-full rounded-xl border bg-white px-3 py-3 text-xs font-bold";
  Object.entries(INCIDENT_STATUS_LABELS).forEach(([value, label]) => status.add(new Option(label, value)));
  status.value = incident.status;
  const nextDate = document.createElement("input");
  nextDate.type = "date";
  nextDate.value = incident.nextFollowUpDate || "";
  nextDate.className = "w-full rounded-xl border bg-white px-3 py-3 text-xs font-bold";
  const note = document.createElement("textarea");
  note.rows = 3;
  note.maxLength = 1200;
  note.placeholder = "Nota de seguimiento obligatoria";
  note.className = "w-full rounded-xl border bg-white px-3 py-3 text-xs leading-relaxed sm:col-span-2";
  const guardianLabel = document.createElement("label");
  guardianLabel.className = "flex items-center gap-2 text-[9px] font-black uppercase text-slate-700";
  const guardian = document.createElement("input");
  guardian.type = "checkbox";
  guardian.checked = incident.guardianNotified === true;
  guardian.className = "h-5 w-5 accent-violet-700";
  guardianLabel.append(guardian, document.createTextNode("Familia notificada"));
  const button = incidentTextElement("button", "Guardar seguimiento", "rounded-xl bg-violet-700 px-4 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50");
  button.type = "button";
  button.addEventListener("click", async () => {
    if (normalizeText(note.value, 1200).length < 3) {
      note.setCustomValidity("Capture una nota de seguimiento.");
      note.reportValidity();
      note.setCustomValidity("");
      return;
    }
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      const result = await api.updateIncident({schoolKey, incidentId: incident.id, status: status.value, note: note.value, guardianNotified: guardian.checked, nextFollowUpDate: nextDate.value});
      const updated = result.data.incident;
      incidentCache = incidentCache.map((item) => item.id === updated.id ? updated : item);
      window.renderIncidentList();
    } catch (error) {
      window.showModalMsg("Seguimiento", functionError(error, "No fue posible actualizar la incidencia."));
      button.disabled = false;
      button.textContent = "Guardar seguimiento";
    }
  });
  panel.append(status, nextDate, note, guardianLabel, button);
  return panel;
}

function createIncidentCard(incident) {
  const card = document.createElement("article");
  card.className = "space-y-4 rounded-[2rem] border border-slate-200 p-5 shadow-sm";
  const header = document.createElement("div");
  header.className = "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
  const title = document.createElement("div");
  title.append(
    incidentTextElement("p", `${incident.folio} · ${formatIncidentDate(incident.reportedDate)} · ${incident.reportedTime}`, "text-[9px] font-black uppercase text-violet-700"),
    incidentTextElement("h3", `${INCIDENT_TYPE_LABELS[incident.incidentType] || incident.incidentType} · ${incident.level} · Grupo ${incident.group}`, "mt-1 text-base font-black uppercase text-slate-900"),
  );
  const badges = document.createElement("div");
  badges.className = "flex flex-wrap gap-2";
  const priorityClasses = incident.priority === "urgente" ? "bg-red-100 text-red-800" : incident.priority === "alta" ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700";
  badges.append(
    incidentTextElement("span", INCIDENT_PRIORITY_LABELS[incident.priority] || incident.priority, `rounded-full px-3 py-1 text-[9px] font-black uppercase ${priorityClasses}`),
    incidentTextElement("span", INCIDENT_STATUS_LABELS[incident.status] || incident.status, "rounded-full bg-violet-100 px-3 py-1 text-[9px] font-black uppercase text-violet-800"),
  );
  header.append(title, badges);
  const affected = incident.affectedPersonName || incident.affectedService || INCIDENT_AFFECTATION_LABELS[incident.affectationType] || "Sin detalle";
  const facts = document.createElement("div");
  facts.className = "grid grid-cols-1 gap-3 text-xs sm:grid-cols-2";
  facts.append(
    incidentTextElement("p", `Afectación: ${INCIDENT_AFFECTATION_LABELS[incident.affectationType] || incident.affectationType} · ${affected}`, "rounded-xl bg-slate-50 p-3 font-bold text-slate-700"),
    incidentTextElement("p", `Plantel: ${incident.municipality} · Turno ${String(incident.shift || "").replace("_", " ")}`, "rounded-xl bg-slate-50 p-3 font-bold text-slate-700"),
  );
  card.append(
    header,
    facts,
    incidentTextElement("p", incident.description, "whitespace-pre-line text-sm leading-relaxed text-slate-700"),
    incidentTextElement("p", `Atención inicial: ${incident.immediateActions}`, "rounded-xl border-l-4 border-violet-400 bg-violet-50 p-3 text-xs font-bold leading-relaxed text-violet-950"),
    createIncidentHistory(incident),
    createIncidentFollowUp(incident),
  );
  return card;
}

window.renderIncidentList = () => {
  const list = byId("incident-list");
  const status = byId("incident-list-status");
  if (!list || !status) return;
  const statusFilter = byId("incident-status-filter")?.value || "";
  const groupFilter = selectedIncidentGroup(byId("incident-group-filter")?.value);
  const filtered = incidentCache.filter((incident) => (!statusFilter || incident.status === statusFilter)
    && (!groupFilter || (incident.level === groupFilter.level && incident.group === groupFilter.group)));
  list.replaceChildren(...filtered.map(createIncidentCard));
  status.textContent = filtered.length ? `${filtered.length} ${filtered.length === 1 ? "incidencia" : "incidencias"}` : "No hay incidencias con los filtros seleccionados.";
  const openCount = incidentCache.filter((incident) => incident.status !== "resuelta").length;
  if (byId("incident-open-count")) byId("incident-open-count").textContent = `${openCount} ${openCount === 1 ? "abierta" : "abiertas"}`;
};

window.loadIncidents = async () => {
  const status = byId("incident-list-status");
  if (status) status.textContent = "Cargando incidencias…";
  try {
    const result = await api.listIncidents({schoolKey});
    incidentCache = Array.isArray(result.data.incidents) ? result.data.incidents : [];
    window.renderIncidentList();
    if (result.data.truncated && status) status.textContent += " · Se muestran las 300 más recientes.";
  } catch (error) {
    incidentCache = [];
    if (status) status.textContent = functionError(error, "No fue posible cargar las incidencias.");
  }
};

async function enterApp() {
  if (!loggedTeacher) return;
  window.safeToggle("section-gateway", true);
  window.safeToggle("main-header", false);
  window.safeToggle("main-content", false);
  byId("header-school-name").textContent = schoolName;
  byId("user-display-name").textContent = loggedTeacher.nombre;
  byId("user-display-role").textContent = String(loggedTeacher.role || "docente").replace("_", " ");
  const superUser = loggedTeacher.role === "super";
  window.safeToggle("tab-admin", !canViewAttendanceReports());
  window.safeToggle("tab-super", !superUser);
  window.safeToggle("tab-scanner", superUser);
  window.safeToggle("tab-incidents", loggedTeacher.role !== "docente");
  window.safeToggle("maint-cat-institucion", !isMaster());
  if (superUser) await window.switchTab("global");
  else {
    startSchoolProfileListener();
    await loadStudents();
    listenToAttendanceToday();
    await window.switchTab("scanner");
  }
}

async function switchTab(tab) {
  const allowed = new Set(["scanner", "incidents", "admin", "global"]);
  if (!allowed.has(tab)) return;
  if (tab === "incidents" && loggedTeacher?.role !== "docente") return window.showModalMsg("Acceso", "Esta bitácora está disponible para cuentas docentes.");
  if (tab === "admin" && !canViewAttendanceReports()) return window.showModalMsg("Acceso", "No tiene permisos para consultar reportes.");
  if (tab === "global" && loggedTeacher?.role !== "super") return window.showModalMsg("Acceso", "Esta sección requiere el rol maestro global.");
  window.safeToggle("section-scanner", tab !== "scanner");
  window.safeToggle("section-incidents", tab !== "incidents");
  window.safeToggle("section-admin", tab !== "admin");
  window.safeToggle("section-global", tab !== "global");
  if (tab === "scanner" && loggedTeacher?.role === "docente") {
    populateAttendanceGroupOptions();
    updateAttendanceGroupStatus();
  } else if (tab === "scanner") await window.initScanner();
  else if (isScannerRunning) await window.stopScanner();
  if (tab === "admin" && loggedTeacher.role === "super") {
    window.safeToggle("super-school-selector", false);
    window.safeToggle("school-management-cards", true);
    await window.loadSchoolsForSelection();
  } else if (tab === "admin" && !isAdmin()) {
    window.safeToggle("super-school-selector", true);
    window.safeToggle("school-management-cards", true);
    window.safeToggle("maint-cat-alumnos", true);
    window.safeToggle("maint-cat-maestros", true);
    window.safeToggle("maint-cat-institucion", true);
    window.safeToggle("maint-cat-reportes", false);
    window.safeToggle("div-mantenimiento-alumnos", true);
    window.safeToggle("div-mantenimiento-maestros", true);
    window.safeToggle("div-mantenimiento-institucion", true);
    window.safeToggle("div-mantenimiento-reportes", false);
    window.safeToggle("student-search-panel", true);
    window.safeToggle("general-table-container", true);
    await loadReportGroupOptions();
  } else if (tab === "admin") {
    window.safeToggle("super-school-selector", true);
    window.safeToggle("school-management-cards", false);
  }
  if (tab === "incidents") {
    prepareIncidentForm();
    await window.loadIncidents();
  }
  if (tab === "global") await Promise.all([window.loadAllSchools(), window.loadAuditHistory()]);
}

window.loadSchoolsForSelection = async () => {
  if (loggedTeacher?.role !== "super") return;
  const loadVersion = ++schoolSelectionLoadVersion;
  const list = byId("school-selection-list");
  list.replaceChildren();
  try {
    const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios"));
    if (loadVersion !== schoolSelectionLoadVersion) return;
    for (const entry of snapshot.docs) {
      const data = entry.data();
      const button = document.createElement("button");
      button.type = "button";
      button.className = "school-card-select text-center";
      button.setAttribute("aria-label", `Gestionar ${normalizeText(data.name || entry.id)}`);
      const code = document.createElement("strong");
      code.className = "block font-black theme-text";
      code.textContent = entry.id;
      const name = document.createElement("span");
      name.className = "block font-bold text-xs uppercase text-slate-600";
      name.textContent = normalizeText(data.name);
      const director = document.createElement("span");
      director.className = "block text-xs text-slate-500 mt-1";
      director.textContent = normalizeText(data.director) || "Sin director";
      button.append(code, name, director);
      button.addEventListener("click", () => window.selectSchoolForManagement(entry.id));
      list.append(button);
    }
  } catch (error) {
    if (loadVersion !== schoolSelectionLoadVersion) return;
    window.showModalMsg("Error", functionError(error, "No fue posible cargar las instituciones."));
  }
};

window.selectSchoolForManagement = async (id) => {
  if (loggedTeacher?.role !== "super") return;
  const schoolId = normalizeCode(id, 40);
  window.cancelTeacherRepair?.();
  const snapshot = await getDoc(doc(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios", schoolId));
  if (!snapshot.exists()) return;
  schoolKey = schoolId;
  currentSchool = {...snapshot.data(), id: schoolId};
  schoolName = normalizeText(currentSchool.name || schoolId);
  window.applySchoolBranding(currentSchool);
  byId("header-school-name").textContent = `GESTIÓN: ${schoolName}`;
  window.safeToggle("super-school-selector", true);
  window.safeToggle("school-management-cards", false);
  await window.switchMaintCategory("alumnos");
};

window.validateSchoolCCT = async () => {
  const cct = normalizeCode(byId("input-school-key")?.value, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(cct)) return window.showModalMsg("CCT", "Capture una CCT válida.");
  try {
    const response = await api.lookupSchool({schoolKey: cct});
    schoolKey = cct;
    currentSchool = response.data;
    schoolName = normalizeText(response.data.name || cct);
    byId("display-school-name").textContent = schoolName;
    window.applySchoolBranding(currentSchool);
    window.switchToStep("step-login");
  } catch (error) {
    if (error?.code === "functions/not-found") {
      schoolKey = cct;
      const cctLabel = byId("register-school-cct");
      if (cctLabel) cctLabel.textContent = cct;
      window.switchToStep("step-school-register");
    } else if (error?.code === "functions/failed-precondition") {
      window.showModalMsg("CCT no disponible", functionError(error));
    } else if (backendUnavailable(error)) {
      setConnection(false, "Servicio no disponible");
      window.showModalMsg("Servicio no disponible", "La validación segura de CCT todavía no está desplegada en Firebase. Despliegue las Cloud Functions y vuelva a intentar.");
    } else {
      window.showModalMsg("Clave no registrada", functionError(error, "La CCT no está registrada."));
    }
  }
};

window.requestSchoolRegistration = async () => {
  const schoolNameInput = normalizeText(byId("register-school-name")?.value, 120).toUpperCase();
  const directorName = normalizeText(byId("register-director-name")?.value, 120).toUpperCase();
  const adminName = normalizeText(byId("register-admin-name")?.value, 120).toUpperCase();
  const adminEmailInput = byId("register-admin-id");
  const adminEmail = normalizeText(adminEmailInput?.value, 160).toLowerCase();
  const password = String(byId("register-admin-password")?.value || "");
  const passwordConfirmation = String(byId("register-admin-password-confirm")?.value || "");
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) return window.showModalMsg("Registro de plantel", "Vuelva a capturar la CCT.");
  if (!schoolNameInput || directorName.length < 5) return window.showModalMsg("Registro de plantel", "Capture el nombre de la escuela y el nombre completo del director o directora.");
  if (adminName.length < 5) return window.showModalMsg("Registro de plantel", "Capture el nombre completo del administrador o administradora.");
  if (!adminEmail || !adminEmailInput?.checkValidity()) return window.showModalMsg("Registro de plantel", "El usuario administrador debe ser un correo electrónico válido.");
  if (!validPassword(password)) return window.showModalMsg("Registro de plantel", "La contraseña debe tener entre 8 y 72 caracteres e incluir letras y números.");
  if (password !== passwordConfirmation) return window.showModalMsg("Registro de plantel", "La confirmación de la contraseña no coincide.");
  const button = byId("btn-request-school");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Enviando…";
  }
  try {
    const response = await api.requestSchoolRegistration({schoolKey, schoolName: schoolNameInput, directorName, adminName, adminEmail, password});
    const adminId = normalizeCode(response.data.administrator?.id || adminEmail, 160);
    currentSchool = response.data.school;
    schoolName = normalizeText(currentSchool.name || schoolKey);
    byId("display-school-name").textContent = schoolName;
    byId("input-login-id").value = adminId;
    byId("register-admin-password").value = "";
    byId("register-admin-password-confirm").value = "";
    window.applySchoolBranding(currentSchool);
    window.switchToStep("step-login");
    window.showModalMsg(
      "Plantel creado",
      `La CCT ${schoolKey} quedó activa con el administrador ${adminId}. Ya puede ingresar con el correo y la contraseña que registró.`,
    );
  } catch (error) {
    window.showModalMsg("Registro de plantel", functionError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Crear plantel y continuar";
    }
  }
};

window.loginSuper = async () => {
  const email = normalizeText(byId("super-email")?.value, 160).toLowerCase();
  const password = String(byId("super-password")?.value || "");
  if (!email || !password) return window.showModalMsg("Acceso maestro", "Capture correo y contraseña.");
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const token = await credential.user.getIdTokenResult(true);
    if (token.claims.role !== "super") {
      await signOut(auth);
      throw new Error("La cuenta no tiene autorización de maestro global.");
    }
  } catch (error) {
    window.showModalMsg("Acceso maestro", functionError(error, "No fue posible iniciar sesión."));
  }
};

window.recoverSuperPassword = async () => {
  const emailInput = byId("super-email");
  const email = normalizeText(emailInput?.value, 160).toLowerCase();
  if (!email || !emailInput?.checkValidity()) {
    emailInput?.focus();
    return window.showModalMsg("Recuperar contraseña", "Capture un correo electrónico válido.");
  }

  const button = byId("btn-recover-super");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Enviando…";
  }

  try {
    await sendPasswordResetEmail(auth, email);
    window.showModalMsg(
      "Revisa tu correo",
      "Si el correo pertenece a una cuenta registrada, recibirás un enlace para establecer una contraseña nueva. Revisa también la carpeta de correo no deseado.",
    );
  } catch (error) {
    const code = String(error?.code || "");
    if (code === "auth/invalid-email") {
      window.showModalMsg("Recuperar contraseña", "El correo electrónico no tiene un formato válido.");
    } else if (code === "auth/too-many-requests") {
      window.showModalMsg("Recuperar contraseña", "Se realizaron demasiados intentos. Espera unos minutos antes de volver a solicitar el enlace.");
    } else if (code === "auth/network-request-failed") {
      window.showModalMsg("Recuperar contraseña", "No fue posible conectarse con Firebase. Revisa tu conexión e inténtalo nuevamente.");
    } else {
      // El mensaje es deliberadamente genérico para no revelar qué correos están registrados.
      window.showModalMsg(
        "Revisa tu correo",
        "Si el correo pertenece a una cuenta registrada, recibirás un enlace para establecer una contraseña nueva.",
      );
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Olvidé mi contraseña";
    }
  }
};

window.explainInstitutionalRecovery = () => window.showModalMsg(
  "Recuperar clave institucional",
  "La clave institucional no se envía por correo. Solicita al administrador maestro global que establezca una clave nueva para el plantel.",
);

window.openTeacherRecovery = () => {
  const modal = byId("modal-teacher-recovery");
  const emailInput = byId("teacher-recovery-email");
  if (!modal) return;
  teacherRecoveryPreviousFocus = document.activeElement;
  const currentLogin = normalizeText(byId("input-login-id")?.value, 160).toLowerCase();
  if (emailInput && /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(currentLogin)) emailInput.value = currentLogin;
  window.safeToggle("modal-teacher-recovery", false);
  emailInput?.focus();
};

window.closeTeacherRecovery = () => {
  window.safeToggle("modal-teacher-recovery", true);
  teacherRecoveryPreviousFocus?.focus?.();
  teacherRecoveryPreviousFocus = null;
};

window.recoverTeacherPassword = async () => {
  const emailInput = byId("teacher-recovery-email");
  const email = normalizeText(emailInput?.value, 160).toLowerCase();
  if (!email || !emailInput?.checkValidity()) {
    emailInput?.focus();
    return window.showModalMsg("Recuperar acceso", "Capture el correo electrónico que registró en su primer acceso.");
  }
  if (!schoolKey) {
    window.closeTeacherRecovery();
    return window.showModalMsg("Recuperar acceso", "Primero capture y valide la CCT del plantel.");
  }

  const button = byId("btn-send-teacher-recovery");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Enviando…";
  }
  try {
    await api.prepareTeacherPasswordRecovery({schoolKey, email});
    auth.languageCode = "es";
    await sendPasswordResetEmail(auth, email);
    if (byId("input-login-id")) byId("input-login-id").value = email;
    window.closeTeacherRecovery();
    window.showModalMsg(
      "Revisa tu correo",
      "Si el correo está registrado en este plantel, recibirá un enlace de Firebase. Después de crear la contraseña nueva, vuelva aquí e ingrese usando ese correo como usuario.",
    );
  } catch (error) {
    const code = String(error?.code || "");
    if (code.includes("resource-exhausted") || code === "auth/too-many-requests") {
      window.showModalMsg("Recuperar acceso", "Se realizaron demasiados intentos. Espere unos minutos antes de solicitar otro enlace.");
    } else if (code === "auth/network-request-failed" || code.includes("unavailable")) {
      window.showModalMsg("Recuperar acceso", "No fue posible conectarse con Firebase. Revise su conexión e inténtelo nuevamente.");
    } else {
      // Respuesta deliberadamente genérica para no revelar si una cuenta existe.
      window.closeTeacherRecovery();
      window.showModalMsg(
        "Revisa tu correo",
        "Si el correo está registrado en este plantel, recibirá un enlace para recuperar el acceso.",
      );
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Enviar enlace de recuperación";
    }
  }
};

window.claimSchoolCct = () => {
  if (!schoolKey) return window.showModalMsg("Reclamar CCT", "Primero capture y valide la CCT que desea reclamar.");
  openSupportWhatsApp("Quiero reclamar el CTT");
};

window.verifySchoolAccess = async () => {
  const input = byId("input-school-access-key");
  const accessKey = normalizeCode(input?.value, 100);
  if (accessKey.length < 4) return window.showModalMsg("Acceso", "Capture la clave institucional.");
  try {
    const response = await api.verifySchoolAccess({schoolKey, accessKey});
    accessChallenge = response.data.challengeId;
    currentSchool = response.data.school;
    schoolName = normalizeText(currentSchool.name || schoolKey);
    input.value = "";
    byId("display-school-name").textContent = schoolName;
    window.switchToStep("step-login");
  } catch (error) {
    window.showModalMsg("Acceso", functionError(error), "institutional");
  }
};

async function attemptTeacherEmailLogin(teacherId, password) {
  const email = normalizeText(teacherId, 160).toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) return false;
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const tokenResult = await credential.user.getIdTokenResult(true);
    if (tokenResult.claims.role) {
      await signOut(auth).catch(() => {});
      return false;
    }
    const response = await api.loginTeacherWithEmail({schoolKey, password});
    await signInWithCustomToken(auth, response.data.token);
    return true;
  } catch {
    await signOut(auth).catch(() => {});
    return false;
  }
}

window.attemptLogin = async () => {
  const teacherId = normalizeCode(byId("input-login-id")?.value, 160);
  const password = String(byId("input-login-password")?.value || "");
  if (!teacherId || !password) return window.showModalMsg("Acceso", "Capture su usuario y contraseña.");
  try {
    const response = await api.loginTeacher({schoolKey, teacherId, password});
    byId("input-login-password").value = "";
    await signInWithCustomToken(auth, response.data.token);
  } catch (error) {
    if (await attemptTeacherEmailLogin(teacherId, password)) {
      byId("input-login-password").value = "";
      return;
    }
    window.showModalMsg("Acceso", functionError(error));
  }
};

window.registerTeacherSelf = async () => {
  const name = normalizeText(byId("self-reg-name")?.value, 100).toUpperCase();
  const teacherId = normalizeCode(byId("self-reg-id")?.value, 40);
  if (!accessChallenge) return window.showModalMsg("Registro", "La autorización institucional expiró.");
  try {
    await api.registerTeacherSelf({schoolKey, name, teacherId, challengeId: accessChallenge});
    accessChallenge = "";
    window.showModalMsg("Solicitud enviada", "Un administrador deberá autorizar la cuenta antes del primer acceso.");
    window.resetGateway();
  } catch (error) {
    window.showModalMsg("Registro", functionError(error));
  }
};

window.switchMaintCategory = async (category) => {
  if (!isAdmin()) return window.showModalMsg("Acceso", "No tiene permisos de administración.");
  if (!new Set(["alumnos", "maestros", "institucion", "reportes"]).has(category)) return;
  if (category === "institucion" && !isMaster()) return window.showModalMsg("Acceso", "Los ajustes institucionales requieren un administrador maestro.");
  ["alumnos", "maestros", "institucion", "reportes"].forEach((name) => {
    window.safeToggle(`div-mantenimiento-${name}`, name !== category);
    byId(`maint-cat-${name}`)?.classList.toggle("cat-active", name === category);
  });
  window.safeToggle("student-search-panel", category !== "alumnos");
  window.safeToggle("general-table-container", category !== "alumnos");
  if (category === "alumnos") return loadStudents();
  if (category === "maestros") {
    configureTeacherCreationForm();
    return loadTeachers();
  }
  if (category === "reportes") {
    const today = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
    if (byId("report-date-from") && !byId("report-date-from").value) byId("report-date-from").value = today;
    if (byId("report-date-to") && !byId("report-date-to").value) byId("report-date-to").value = today;
    window.safeToggle("btn-clear-attendance", !isMaster());
    await loadReportGroupOptions();
    return;
  }
  const snapshot = await getDoc(doc(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios", schoolKey));
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  const fields = {
    "edit-school-name": data.name,
    "edit-director-name": data.director,
    "edit-entry-time": data.entryTime,
    "edit-recess-return": data.recessReturnTime,
    "edit-tolerance": data.tolerance,
    "edit-class-duration": data.classDuration,
    "edit-tardies-per-absence": data.tardiesPerAbsence ?? 0,
    "display-school-cct-readonly": schoolKey,
    "edit-school-contact-email": data.contactEmail,
    "edit-brand-primary": data.brandPrimaryColor || "#1e293b",
    "edit-brand-accent": data.brandAccentColor || data.brandColor || DEFAULT_ACCENT,
    "edit-logo-background-mode": data.brandLogoBackgroundMode === "color" ? "color" : "transparent",
    "edit-logo-background-color": /^#[0-9a-f]{6}$/i.test(String(data.brandLogoBackgroundColor || "")) ? data.brandLogoBackgroundColor : "#ffffff",
  };
  for (const [id, value] of Object.entries(fields)) if (byId(id)) byId(id).value = value ?? "";
  pendingLogoDataUrl = String(data.isPremium === true ? data.logoDataUrl || "" : data.pendingLogoDataUrl || "");
  const logoPreview = byId("brand-logo-preview");
  if (logoPreview) {
    if (pendingLogoDataUrl) logoPreview.src = pendingLogoDataUrl;
    else logoPreview.removeAttribute("src");
  }
  byId("brand-logo-preview-frame")?.classList.toggle("hidden", !pendingLogoDataUrl);
  window.updateLogoBackgroundPreview();
  window.safeToggle("premium-badge-local", data.isPremium !== true);
  window.safeToggle("invite-branding-panel", data.isPremium === true);
  window.safeToggle("premium-branding-panel", data.isPremium !== true);
  if (byId("brand-logo-help")) {
    byId("brand-logo-help").textContent = data.isPremium === true
      ? "Este logotipo está activo en la identidad visual del plantel."
      : "Puede prepararlo ahora; se aplicará automáticamente cuando Soporte active Premium.";
  }
  window.safeToggle("super-cct-correction-panel", loggedTeacher?.role !== "super");
  if (byId("correct-school-cct")) byId("correct-school-cct").value = "";
};

async function resizeBrandLogo(file) {
  if (!file || !/^image\/(?:png|jpeg|webp)$/i.test(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Seleccione una imagen PNG, JPG o WebP de hasta 5 MB.");
  }
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No fue posible leer el logotipo."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const element = new Image();
    element.onerror = () => reject(new Error("El archivo no contiene una imagen válida."));
    element.onload = () => resolve(element);
    element.src = source;
  });
  const scale = Math.min(1, 512 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/webp", 0.82);
  if (dataUrl.length > 300000) throw new Error("El logotipo sigue siendo demasiado pesado después de optimizarlo.");
  return dataUrl;
}

window.handleLogoUpload = async (event) => {
  try {
    pendingLogoDataUrl = await resizeBrandLogo(event.target.files?.[0]);
    const preview = byId("brand-logo-preview");
    if (preview) {
      preview.src = pendingLogoDataUrl;
    }
    byId("brand-logo-preview-frame")?.classList.remove("hidden");
    window.updateLogoBackgroundPreview();
  } catch (error) {
    event.target.value = "";
    window.showModalMsg("Logotipo", functionError(error));
  }
};

window.removeBrandLogo = () => {
  pendingLogoDataUrl = "";
  const input = byId("edit-brand-logo");
  if (input) input.value = "";
  const preview = byId("brand-logo-preview");
  if (preview) {
    preview.removeAttribute("src");
  }
  byId("brand-logo-preview-frame")?.classList.add("hidden");
};

window.updateLogoBackgroundPreview = () => {
  const frame = byId("brand-logo-preview-frame");
  const colorInput = byId("edit-logo-background-color");
  const mode = byId("edit-logo-background-mode")?.value === "color" ? "color" : "transparent";
  const color = /^#[0-9a-f]{6}$/i.test(String(colorInput?.value || "")) ? colorInput.value : "#ffffff";
  if (frame) frame.style.backgroundColor = mode === "color" ? color : "transparent";
  if (colorInput) colorInput.disabled = mode !== "color";
};

window.updateSchoolGlobalData = async () => {
  if (!isAdmin()) return;
  const profile = {
    name: byId("edit-school-name").value,
    director: byId("edit-director-name").value,
    entryTime: byId("edit-entry-time").value,
    recessReturnTime: byId("edit-recess-return").value,
    tolerance: byId("edit-tolerance").value,
    classDuration: byId("edit-class-duration").value,
    tardiesPerAbsence: byId("edit-tardies-per-absence")?.value || 0,
    contactEmail: byId("edit-school-contact-email")?.value || "",
  };
  if (currentSchool?.isPremium === true || byId("premium-branding-panel")?.classList.contains("hidden") === false) {
    profile.brandPrimaryColor = byId("edit-brand-primary")?.value || "#1e293b";
    profile.brandAccentColor = byId("edit-brand-accent")?.value || DEFAULT_ACCENT;
    profile.brandLogoBackgroundMode = byId("edit-logo-background-mode")?.value === "color" ? "color" : "transparent";
    profile.brandLogoBackgroundColor = byId("edit-logo-background-color")?.value || "#ffffff";
    profile.logoDataUrl = pendingLogoDataUrl;
  } else {
    profile.pendingLogoDataUrl = pendingLogoDataUrl;
  }
  try {
    await api.updateSchool({schoolKey, profile});
    currentSchool = {...currentSchool, ...profile, isPremium: currentSchool?.isPremium === true};
    window.applySchoolBranding(currentSchool);
    window.showModalMsg("Éxito", "Los cambios fueron guardados.");
  } catch (error) {
    window.showModalMsg("Error", functionError(error));
  }
};

window.correctSchoolCct = () => {
  if (loggedTeacher?.role !== "super") return window.showModalMsg("Corregir CCT", "Esta operación requiere el acceso maestro global.");
  const oldSchoolKey = schoolKey;
  const newSchoolKey = normalizeCode(byId("correct-school-cct")?.value, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(newSchoolKey)) return window.showModalMsg("Corregir CCT", "Capture una CCT nueva válida.");
  if (newSchoolKey === oldSchoolKey) return window.showModalMsg("Corregir CCT", "La CCT nueva debe ser diferente de la actual.");
  window.showConfirmMsg(
    "Corregir CCT",
    `¿Cambiar ${oldSchoolKey} por ${newSchoolKey}? Se migrarán docentes, alumnos, asistencias y accesos. Todas las sesiones del plantel se cerrarán.`,
    async () => {
      await api.correctSchoolCct({oldSchoolKey, newSchoolKey});
      schoolKey = newSchoolKey;
      await window.selectSchoolForManagement(newSchoolKey);
    },
  );
};

function normalizedHeader(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const SURNAME_PARTICLES = new Set(["DA", "DAS", "DE", "DEL", "DO", "DOS", "LA", "LAS", "LOS", "SAN", "SANTA", "VAN", "VON"]);
const COMMON_GIVEN_NAMES = new Set((
  "AARON ABIGAIL ABRAHAM ADRIAN ADRIANA AGUSTIN ALAN ALEJANDRA ALEJANDRO ALEXIS ALFONSO ALFREDO "
  + "ALICIA ALMA AMANDA AMELIA ANA ANDREA ANDRES ANGEL ANGELA ANTONIA ANTONIO ARMANDO ARTURO "
  + "BEATRIZ BENJAMIN BERENICE BRENDA BRUNO CAMILA CARLA CARLOS CARMEN CAROLINA CATALINA CECILIA "
  + "CESAR CHRISTIAN CLAUDIA CRISTIAN CRISTINA DANIEL DANIELA DARIO DAVID DIANA DIEGO DULCE EDGAR "
  + "EDUARDO ELENA ELIZABETH EMILIANO EMILIO ENRIQUE ERICK ERIKA ESMERALDA ESTEBAN ESTELA ESTHER "
  + "EVA FABIOLA FATIMA FELIPE FERNANDO FRANCISCO GABRIEL GABRIELA GERARDO GLORIA GUADALUPE GUILLERMO "
  + "HECTOR HUGO IGNACIO INES IRENE ISAAC ISABEL ISABELA ISRAEL IVAN JACQUELINE JAIME JAVIER JESUS "
  + "JOAQUIN JORGE JOSE JOSEFINA JUAN JULIA JULIANA JULIO KARLA LAURA LEONARDO LETICIA LILIANA LORENA "
  + "LOURDES LUCIA LUIS LUZ MANUEL MARCO MARCOS MARGARITA MARIA MARIANA MARIO MARISOL MARTHA MARTIN "
  + "MATEO MATIAS MAURICIO MAXIMILIANO MAYRA MELANIE MERCEDES MIGUEL MIRANDA MONICA MONSERRAT NANCY "
  + "NATALIA NICOLAS NOEMI NORMA OCTAVIO OLGA OMAR OSCAR PABLO PAOLA PATRICIA PEDRO RAFAEL RAUL "
  + "REBECA REGINA RENATA RICARDO ROBERTO ROCIO RODRIGO ROSA RUBEN SALVADOR SAMANTHA SANDRA SANTIAGO "
  + "SARA SEBASTIAN SERGIO SILVIA SOFIA SUSANA TERESA VALENTINA VALERIA VANESSA VERONICA VICTOR "
  + "VICTORIA XIMENA YOLANDA YURIDIA"
).split(" "));
const NAME_HEADER_NAMES = new Set(["alumno", "apellido y nombre", "apellidos nombre", "apellidos y nombres", "estudiante", "nombre", "nombre completo", "nombre del alumno", "nombre del estudiante", "nombre y apellido", "nombre y apellidos", "nombres", "nombres y apellidos"]);

function compactHeader(value) {
  return normalizedHeader(value).replace(/[().:º°]/g, "").replace(/[,/]+/g, " ").replace(/\s+/g, " ");
}

function isNameHeader(value) {
  const header = compactHeader(value);
  return NAME_HEADER_NAMES.has(header)
    || header.startsWith("nombre del alumno")
    || header.startsWith("nombre del estudiante")
    || (header.includes("nombre") && header.includes("apellido"));
}

function nameParts(value) {
  return normalizeText(value, 200).toUpperCase().replace(/[,;]+/g, " ").split(" ").filter(Boolean);
}

function looksLikeStudentName(value) {
  const parts = nameParts(value);
  if (parts.length < 3) return false;
  const excluded = new Set(["ALUMNO", "ALUMNOS", "CICLO", "ESCUELA", "GRADO", "GRUPO", "LISTA", "NIVEL", "TOTAL"]);
  return !parts.some((part) => excluded.has(normalizedHeader(part).toUpperCase()));
}

function surnameFromStart(parts, start) {
  let end = start + 1;
  if (SURNAME_PARTICLES.has(parts[start])) {
    while (end < parts.length && SURNAME_PARTICLES.has(parts[end])) end += 1;
    if (end < parts.length) end += 1;
  }
  return {value: parts.slice(start, end).join(" "), next: end};
}

function surnameFromEnd(parts, end) {
  let start = end - 1;
  while (start > 0 && SURNAME_PARTICLES.has(parts[start - 1])) start -= 1;
  return {value: parts.slice(start, end).join(" "), next: start};
}

function splitStudentFullName(value, sourceOrder) {
  const parts = nameParts(value);
  if (parts.length < 3) return null;
  if (sourceOrder === "names-first") {
    const maternal = surnameFromEnd(parts, parts.length);
    const paternal = surnameFromEnd(parts, maternal.next);
    const names = parts.slice(0, paternal.next).join(" ");
    if (!paternal.value || !maternal.value || !names) return null;
    return {
      paterno: paternal.value,
      materno: maternal.value,
      nombres: names,
    };
  }
  const paternal = surnameFromStart(parts, 0);
  const maternal = surnameFromStart(parts, paternal.next);
  const names = parts.slice(maternal.next).join(" ");
  if (!paternal.value || !maternal.value || !names) return null;
  return {
    paterno: paternal.value,
    materno: maternal.value,
    nombres: names,
  };
}

function headerOrderHint(value) {
  const header = compactHeader(value);
  if (header.startsWith("apellido") && header.includes("nombre")) return "surnames-first";
  if (header.startsWith("nombre") && header.includes("apellido")) return "names-first";
  return "";
}

function findImportColumns(table) {
  const scanLimit = Math.min(table.length, 30);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = Array.isArray(table[rowIndex]) ? table[rowIndex] : [];
    const nameIndex = row.findIndex(isNameHeader);
    if (nameIndex >= 0) {
      return {nameIndex, startIndex: rowIndex + 1, orderHint: headerOrderHint(row[nameIndex])};
    }
  }
  let bestMatch = null;
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = Array.isArray(table[rowIndex]) ? table[rowIndex] : [];
    const nameIndexes = row.map((value, index) => looksLikeStudentName(value) ? index : -1).filter((index) => index >= 0);
    for (const nameIndex of nameIndexes) {
      let score = 0;
      for (let index = rowIndex; index < Math.min(table.length, rowIndex + 50); index += 1) {
        const candidate = Array.isArray(table[index]) ? table[index] : [];
        if (looksLikeStudentName(candidate[nameIndex])) score += 1;
      }
      if (!bestMatch || score > bestMatch.score) bestMatch = {nameIndex, startIndex: rowIndex, orderHint: "", score};
    }
  }
  if (!bestMatch) return null;
  const {score, ...columns} = bestMatch;
  return columns;
}

function extractImportRows(table) {
  const columns = findImportColumns(table);
  if (!columns) return null;
  const rows = [];
  let skippedRows = 0;
  for (let index = columns.startIndex; index < table.length; index += 1) {
    const row = Array.isArray(table[index]) ? table[index] : [];
    const fullName = normalizeText(row[columns.nameIndex], 200);
    if (!fullName) continue;
    if (!looksLikeStudentName(fullName)) {
      skippedRows += 1;
      continue;
    }
    rows.push({fullName, sourceRow: index + 1});
  }
  return {rows, skippedRows, orderHint: columns.orderHint};
}

function edgeGivenNameScore(parts, fromStart) {
  const edge = fromStart ? parts.slice(0, 3) : parts.slice(-3).reverse();
  return edge.reduce((score, part, index) => score + (COMMON_GIVEN_NAMES.has(normalizedHeader(part).toUpperCase()) ? 3 - index : 0), 0);
}

function detectNameOrder(rows, orderHint) {
  if (orderHint) return orderHint;
  let namesFirstScore = 0;
  let surnamesFirstScore = 0;
  for (const row of rows.slice(0, 100)) {
    const parts = nameParts(row.fullName);
    namesFirstScore += edgeGivenNameScore(parts, true);
    surnamesFirstScore += edgeGivenNameScore(parts, false);
  }
  return namesFirstScore > surnamesFirstScore ? "names-first" : "surnames-first";
}

function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder("utf-16le").decode(buffer);
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("\uFFFD") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

async function parseImportFile(file) {
  const buffer = await file.arrayBuffer();
  const tables = [];
  if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse(decodeCsvBuffer(buffer), {skipEmptyLines: "greedy"});
    if (parsed.errors?.length) throw new Error(`CSV inválido: ${parsed.errors[0].message}`);
    tables.push(parsed.data);
  } else if (/\.xlsx?$/i.test(file.name)) {
    const workbook = XLSX.read(buffer, {type: "array", cellDates: false});
    for (const sheetName of workbook.SheetNames) {
      tables.push(XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {header: 1, defval: "", raw: false, blankrows: false}));
    }
  } else {
    throw new Error("Seleccione un archivo Excel o CSV.");
  }
  for (const table of tables) {
    const extracted = extractImportRows(table);
    if (extracted?.rows.length) return extracted;
  }
  throw new Error("No fue posible localizar la columna con el nombre de los alumnos.");
}

function studentIdentityKey(student) {
  return [student?.paterno, student?.materno, student?.nombres].map(normalizedHeader).join("|");
}

async function existingStudentIdentityIndex(level, group) {
  const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
  const usedIds = new Set(snapshot.docs.map((entry) => entry.id));
  const idsByIdentity = new Map();
  const reservedListNumbers = new Set();
  for (const entry of snapshot.docs) {
    const student = entry.data();
    if (normalizeSchoolLevel(student.level || student.nivel) !== level || normalizeGroupName(student.grupo) !== group) continue;
    if (isMovedStudent(student)) {
      const listNumber = studentListNumber(student);
      if (listNumber !== null) reservedListNumbers.add(listNumber);
      continue;
    }
    const key = studentIdentityKey(student);
    idsByIdentity.set(key, [...(idsByIdentity.get(key) || []), entry.id]);
  }
  for (const ids of idsByIdentity.values()) ids.sort((a, b) => a.localeCompare(b, "es", {numeric: true}));
  return {idsByIdentity, reservedListNumbers, usedIds};
}

async function commitStudentChunks(students, progress) {
  const chunks = [];
  for (let index = 0; index < students.length; index += 400) chunks.push(students.slice(index, index + 400));
  let completed = 0;
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const student of chunk) {
      batch.set(doc(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`, student.id), student.data);
    }
    await batch.commit();
    completed += chunk.length;
    progress(completed / students.length);
  }
}

window.handleBatchImport = async (event) => {
  if (!isAdmin()) return;
  const file = event.target.files?.[0];
  const level = normalizeSchoolLevel(byId("batch-level")?.value);
  const group = normalizeGroupName(byId("batch-group")?.value, 12);
  const orderPreference = byId("batch-name-order")?.value || "auto";
  if (!level || !group || !file) {
    event.target.value = "";
    return window.showModalMsg("Faltan datos", "Indique nivel, grupo y archivo.");
  }
  const container = byId("batch-progress-container");
  const bar = byId("batch-progress-bar");
  const text = byId("batch-progress-text");
  container.style.display = "block";
  bar.style.width = "0%";
  bar.classList.remove("progress-success");
  text.textContent = "Validando archivo…";
  try {
    const imported = await parseImportFile(file);
    const detectedOrder = detectNameOrder(imported.rows, imported.orderHint);
    const sourceOrder = new Set(["names-first", "surnames-first"]).has(orderPreference) ? orderPreference : detectedOrder;
    const parsedStudents = [];
    for (const row of imported.rows) {
      const parsedName = splitStudentFullName(row.fullName, sourceOrder);
      if (!parsedName) {
        throw new Error(`Fila ${row.sourceRow}: el nombre completo debe incluir nombre(s), apellido paterno y apellido materno.`);
      }
      parsedStudents.push({
        paterno: normalizeText(parsedName.paterno, 80),
        materno: normalizeText(parsedName.materno, 80),
        nombres: normalizeText(parsedName.nombres, 100),
      });
    }
    if (!parsedStudents.length) throw new Error("No se encontraron nombres de alumnos válidos en el archivo.");
    if (parsedStudents.length > 99) throw new Error("Un grupo no puede contener más de 99 alumnos.");
    parsedStudents.sort(compareStudentsByName);
    const {idsByIdentity, reservedListNumbers, usedIds} = await existingStudentIdentityIndex(level, group);
    const availableListNumbers = Array.from({length: 99}, (_, index) => index + 1)
      .filter((listNumber) => !reservedListNumbers.has(listNumber));
    if (parsedStudents.length > availableListNumbers.length) throw new Error("El grupo no tiene suficientes lugares disponibles sin alterar los espacios eliminados.");
    const students = [];
    parsedStudents.forEach((parsedStudent, index) => {
      const identity = studentIdentityKey(parsedStudent);
      const existingIds = idsByIdentity.get(identity) || [];
      const existingId = existingIds.shift();
      const listNumber = availableListNumbers[index];
      const id = existingId || buildStudentId(level, group, listNumber, parsedStudent);
      if (!existingId && usedIds.has(id)) {
        throw new Error(`No se puede generar ${id}: otro alumno ya utiliza ese identificador.`);
      }
      usedIds.add(id);
      const list = String(listNumber).padStart(2, "0");
      students.push({
        id,
        data: {
          paterno: parsedStudent.paterno,
          materno: parsedStudent.materno,
          nombres: parsedStudent.nombres,
          grupo: group,
          lista: list,
          level,
          createdAt: serverTimestamp(),
        },
      });
    });
    text.textContent = `Importando ${students.length} alumnos…`;
    await commitStudentChunks(students, (ratio) => { bar.style.width = `${Math.round(ratio * 100)}%`; });
    text.textContent = "Aplicando numeración y nuevos identificadores QR…";
    await api.renumberStudentGroup({schoolKey, level, group});
    recordClientAudit(
      "students_imported",
      `${level}-${group}`,
      `${level} · Grupo ${group}`,
      `Importó ${students.length} alumnos desde ${file.name}.`,
      {studentCount: students.length, fileName: file.name},
    );
    bar.classList.add("progress-success");
    const orderLabel = sourceOrder === "names-first" ? "nombres primero" : "apellidos primero";
    const skippedLabel = imported.skippedRows ? ` Se omitieron ${imported.skippedRows} filas incompletas.` : "";
    text.textContent = `Carga completada: ${students.length} alumnos (${orderLabel}).${skippedLabel}`;
    event.target.value = "";
    await loadStudents();
  } catch (error) {
    event.target.value = "";
    text.textContent = functionError(error, "La importación falló.");
    bar.style.width = "0%";
    window.showModalMsg("Importación", text.textContent);
  }
};

window.addStudent = async () => {
  if (!isAdmin() || studentRegistrationInFlight) return;
  const level = normalizeSchoolLevel(byId("input-a-nivel").value);
  const group = normalizeGroupName(byId("input-a-grupo").value, 12);
  const paterno = normalizeText(byId("input-a-paterno").value, 80).toUpperCase();
  const materno = normalizeText(byId("input-a-materno").value, 80).toUpperCase();
  const names = normalizeText(byId("input-a-nombres").value, 100).toUpperCase();
  const manualId = normalizeCode(byId("input-a-id")?.value, 40);
  if (!level || !group || !paterno || !names) {
    return window.showModalMsg("Datos", "Capture nivel, grupo, apellido paterno y nombre(s).");
  }
  if (manualId && !/^[A-Z0-9._-]{4,40}$/.test(manualId)) {
    return window.showModalMsg("Datos", "El ID manual debe tener entre 4 y 40 caracteres y usar solo letras, números, punto, guión o guion bajo.");
  }
  const button = byId("btn-add-student");
  const originalLabel = button?.textContent;
  studentRegistrationInFlight = true;
  if (button) {
    button.disabled = true;
    button.textContent = "Guardando…";
  }
  try {
    const groupSnapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
    const groupStudents = groupSnapshot.docs
      .map((entry) => ({...entry.data(), id: entry.id}))
      .filter((student) => normalizeSchoolLevel(student.level || student.nivel) === level && normalizeGroupName(student.grupo) === group);
    const existingStudent = groupStudents.find((student) => (
      normalizeText(student.paterno, 80).toUpperCase() === paterno
      && normalizeText(student.materno, 80).toUpperCase() === materno
      && normalizeText(student.nombres, 100).toUpperCase() === names
    ));
    if (existingStudent) {
      return window.showModalMsg(
        "Alumno ya registrado",
        `${[paterno, materno, names].filter(Boolean).join(" ")} ya tiene el número de lista ${studentListNumber(existingStudent)?.toString().padStart(2, "0") || "registrado"}.`,
      );
    }
    if (groupStudents.length >= 99) return window.showModalMsg("Datos", "Un grupo no puede contener más de 99 alumnos.");
    const usedIds = new Set(groupSnapshot.docs.map((entry) => entry.id));
    const lastListNumber = groupStudents.reduce((highest, student) => Math.max(highest, studentListNumber(student) || 0), 0);
    const listNumber = lastListNumber + 1;
    if (listNumber > 99) return window.showModalMsg("Datos", "No hay un número de lista disponible para este grupo.");
    const list = String(listNumber).padStart(2, "0");
    const id = manualId || buildStudentId(level, group, list, {paterno, nombres: names});
    if (usedIds.has(id)) return window.showModalMsg("Datos", manualId ? "Ese ID de alumno ya está registrado." : "No fue posible asignar el siguiente número de lista. Recargue la página e inténtelo nuevamente.");
    const ref = doc(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`, id);
    await setDoc(ref, {
      paterno,
      materno,
      nombres: names,
      grupo: group,
      lista: list,
      level,
      manualId: Boolean(manualId),
      createdAt: serverTimestamp(),
    });
    recordClientAudit(
      "student_created",
      id,
      [paterno, materno, names].filter(Boolean).join(" "),
      `Registró al alumno en ${level} · Grupo ${group}.`,
      {level, group, list},
    );
    ["input-a-id", "input-a-paterno", "input-a-materno", "input-a-nombres", "input-a-grupo", "input-a-nivel"].forEach((field) => { if (byId(field)) byId(field).value = ""; });
    await loadStudents();
    window.openSingleStudentQRPrintModal({
      id,
      nivel: level,
      grupo: group,
      lista: list,
      nombreCompleto: [paterno, materno, names].filter(Boolean).join(" "),
      qrContent: id,
    });
  } catch (error) {
    window.showModalMsg("Error", functionError(error));
  } finally {
    studentRegistrationInFlight = false;
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Guardar";
    }
  }
};
window.clearAllStudents = () => window.openDeleteStudentCatalogModal();

window.setStudentActive = (id, active) => window.showConfirmMsg(
  active ? "Reactivar alumno" : "Dar de baja",
  active
    ? `¿Reactivar al alumno ${id}? Su mismo número de lista y QR volverán a funcionar.`
    : `¿Dar de baja al alumno ${id}? Conservará su número de lista, pero su QR dejará de registrar asistencia.`,
  async () => {
    await api.setStudentActive({schoolKey, studentId: id, active});
    await loadStudents();
  },
);

function moveStudentDestinationGroups(level, student) {
  const destinationLevel = normalizeSchoolLevel(level);
  const sourceLevel = normalizeSchoolLevel(student?.level || student?.nivel);
  const sourceGroup = normalizeGroupName(student?.grupo);
  return [...new Set(studentCatalogCache
    .filter((candidate) => normalizeSchoolLevel(candidate.level || candidate.nivel) === destinationLevel)
    .map((candidate) => normalizeGroupName(candidate.grupo))
    .filter((group) => group && (destinationLevel !== sourceLevel || group !== sourceGroup)))]
    .sort((first, second) => first.localeCompare(second, "es", {numeric: true}));
}

window.populateMoveStudentGroupOptions = () => {
  const select = byId("move-student-group");
  const level = byId("move-student-level")?.value;
  if (!select) return;
  const student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === studentBeingMoved);
  const groups = student ? moveStudentDestinationGroups(level, student) : [];
  select.replaceChildren(new Option(groups.length ? "Seleccione un grupo" : "No hay grupos disponibles", ""));
  for (const group of groups) select.add(new Option(group, group));
  select.disabled = groups.length === 0;
};

window.openMoveStudentModal = (id) => {
  if (!isAdmin()) return window.showModalMsg("Acceso", "No tiene permisos para corregir grupos.");
  const student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === normalizeCode(id, 40));
  if (!student || isStudentInactive(student)) return window.showModalMsg("Corregir grupo", "Seleccione un alumno activo.");
  studentBeingMoved = normalizeCode(student.id, 40);
  if (byId("move-student-name")) byId("move-student-name").textContent = studentDisplayName(student);
  if (byId("move-student-origin")) {
    byId("move-student-origin").textContent = `Ubicación actual: ${normalizeSchoolLevel(student.level || student.nivel)} · Grupo ${normalizeGroupName(student.grupo)} · Lista ${studentListNumber(student)?.toString().padStart(2, "0") || "—"}`;
  }
  if (byId("move-student-level")) byId("move-student-level").value = normalizeSchoolLevel(student.level || student.nivel);
  window.populateMoveStudentGroupOptions();
  window.safeToggle("modal-move-student", false);
  byId("move-student-group")?.focus();
};

window.closeMoveStudentModal = () => {
  studentBeingMoved = "";
  if (byId("move-student-group")) byId("move-student-group").value = "";
  window.safeToggle("modal-move-student", true);
};

window.submitMoveStudent = async () => {
  const student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === studentBeingMoved);
  const level = normalizeSchoolLevel(byId("move-student-level")?.value);
  const group = normalizeGroupName(byId("move-student-group")?.value, 12);
  if (!student || isStudentInactive(student)) return window.closeMoveStudentModal();
  if (!level || !group) return window.showModalMsg("Corregir grupo", "Seleccione un grupo destino existente.");
  if (!moveStudentDestinationGroups(level, student).includes(group)) {
    window.populateMoveStudentGroupOptions();
    return window.showModalMsg("Corregir grupo", "El grupo seleccionado ya no esta disponible. Seleccione uno de la lista.");
  }
  if (level === normalizeSchoolLevel(student.level || student.nivel) && group === normalizeGroupName(student.grupo)) {
    return window.showModalMsg("Corregir grupo", "El grupo destino debe ser diferente al grupo actual.");
  }
  const button = byId("btn-confirm-move-student");
  if (button) {
    button.disabled = true;
    button.textContent = "Corrigiendo…";
  }
  try {
    const response = await api.moveStudent({schoolKey, studentId: student.id, level, group});
    const moved = response.data || {};
    window.closeMoveStudentModal();
    await loadStudents();
    window.openSingleStudentQRPrintModal({
      id: moved.studentId,
      nivel: moved.level,
      grupo: moved.group,
      lista: moved.list,
      nombreCompleto: moved.name,
      qrContent: moved.studentId,
      modalTitle: "Nuevo QR por corrección de grupo",
    });
  } catch (error) {
    window.showModalMsg("No se realizó el cambio", `${functionError(error)} El alumno permanece activo en su grupo de origen.`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Corregir grupo";
    }
  }
};

function deleteStudentGroupPhrase(level, group) {
  return `BORRAR ${normalizeSchoolLevel(level)} ${normalizeGroupName(group)}`;
}

function studentDeletionPhrase(selection) {
  return selection?.scope === "catalog"
    ? "BORRAR CATALOGO COMPLETO"
    : deleteStudentGroupPhrase(selection?.level, selection?.group);
}

function prepareStudentDeletionModal(selection) {
  studentGroupBeingDeleted = selection;
  const phrase = studentDeletionPhrase(selection);
  if (byId("delete-student-group-phrase")) byId("delete-student-group-phrase").textContent = phrase;
  if (byId("delete-student-group-confirmation")) byId("delete-student-group-confirmation").value = "";
  if (byId("delete-student-group-status")) byId("delete-student-group-status").textContent = "";
  if (byId("btn-confirm-delete-student-group")) byId("btn-confirm-delete-student-group").disabled = true;
  window.safeToggle("modal-delete-student-group", false);
  byId("delete-student-group-confirmation")?.focus();
}

window.openDeleteStudentGroupModal = (level, group) => {
  if (!isAdmin()) return window.showModalMsg("Acceso", "No tiene permisos para borrar grupos.");
  const normalizedLevel = normalizeSchoolLevel(level);
  const normalizedGroup = normalizeGroupName(group);
  const members = studentCatalogCache.filter((student) => (
    normalizeSchoolLevel(student.level || student.nivel) === normalizedLevel
    && normalizeGroupName(student.grupo) === normalizedGroup
  ));
  if (!members.length) return window.showModalMsg("Borrar grupo", "El grupo ya no contiene alumnos.");
  const selection = {scope: "group", level: normalizedLevel, group: normalizedGroup, count: members.length};
  if (byId("delete-student-group-details")) {
    byId("delete-student-group-details").textContent = `${normalizedLevel} · Grupo ${normalizedGroup} · ${members.length} ${members.length === 1 ? "registro" : "registros"}`;
  }
  if (byId("delete-student-group-warning")) {
    byId("delete-student-group-warning").textContent = "Se eliminarán permanentemente todos los alumnos activos, dados de baja y movidos que pertenezcan a este grupo. Los datos y sus códigos QR no podrán recuperarse.";
  }
  if (byId("delete-student-group-submit-label")) byId("delete-student-group-submit-label").textContent = "Borrar grupo";
  prepareStudentDeletionModal(selection);
};

window.openDeleteStudentCatalogModal = () => {
  if (!isAdmin()) return window.showModalMsg("Acceso", "No tiene permisos para borrar el catálogo.");
  const count = studentCatalogCache.length;
  if (!count) return window.showModalMsg("Borrar catálogo", "El catálogo de alumnos ya está vacío.");
  if (byId("delete-student-group-details")) {
    byId("delete-student-group-details").textContent = `CATÁLOGO COMPLETO · ${count} ${count === 1 ? "registro" : "registros"}`;
  }
  if (byId("delete-student-group-warning")) {
    byId("delete-student-group-warning").textContent = "Se eliminará permanentemente todo el catálogo: alumnos activos, dados de baja y movidos de todos los niveles y grupos. Los datos y sus códigos QR no podrán recuperarse.";
  }
  if (byId("delete-student-group-submit-label")) byId("delete-student-group-submit-label").textContent = "Borrar catálogo";
  prepareStudentDeletionModal({scope: "catalog", count});
};

window.validateDeleteStudentGroupConfirmation = () => {
  const button = byId("btn-confirm-delete-student-group");
  if (!button || !studentGroupBeingDeleted) return;
  const expected = studentDeletionPhrase(studentGroupBeingDeleted);
  const captured = normalizeText(byId("delete-student-group-confirmation")?.value, 50).toUpperCase();
  button.disabled = captured !== expected;
};

window.closeDeleteStudentGroupModal = () => {
  studentGroupBeingDeleted = null;
  if (byId("delete-student-group-confirmation")) byId("delete-student-group-confirmation").value = "";
  if (byId("delete-student-group-status")) byId("delete-student-group-status").textContent = "";
  window.safeToggle("modal-delete-student-group", true);
};

window.submitDeleteStudentGroup = async () => {
  const selection = studentGroupBeingDeleted;
  const confirmation = normalizeText(byId("delete-student-group-confirmation")?.value, 50).toUpperCase();
  if (!selection || confirmation !== studentDeletionPhrase(selection)) return;
  const button = byId("btn-confirm-delete-student-group");
  if (button) {
    button.disabled = true;
    const label = byId("delete-student-group-submit-label");
    if (label) label.textContent = "Borrando…";
  }
  try {
    const response = selection.scope === "catalog"
      ? await api.clearStudents({schoolKey})
      : await api.deleteStudentGroup({schoolKey, level: selection.level, group: selection.group});
    const deleted = Number(response.data?.deletedStudents) || selection.count;
    window.closeDeleteStudentGroupModal();
    await loadStudents();
    const target = selection.scope === "catalog" ? "del catálogo completo" : `del grupo ${selection.group}`;
    window.showModalMsg(selection.scope === "catalog" ? "Catálogo eliminado" : "Grupo eliminado", `Se eliminaron permanentemente ${deleted} ${deleted === 1 ? "registro" : "registros"} ${target}.`);
  } catch (error) {
    if (byId("delete-student-group-status")) byId("delete-student-group-status").textContent = functionError(error);
    window.validateDeleteStudentGroupConfirmation();
  } finally {
    if (button) {
      const label = byId("delete-student-group-submit-label");
      if (label) label.textContent = selection.scope === "catalog" ? "Borrar catálogo" : "Borrar grupo";
      window.validateDeleteStudentGroupConfirmation();
    }
  }
};

window.renumberStudentGroup = (level, group) => window.showConfirmMsg(
  "Actualizar numeración y QR",
  "Se asignarán nuevos identificadores QR según el orden alfabético actual. Los QR impresos anteriormente dejarán de ser válidos. ¿Desea continuar?",
  async () => {
    const response = await api.renumberStudentGroup({schoolKey, level, group});
    await loadStudents();
    const result = response.data || {};
    setTimeout(() => window.showModalMsg(
      "QR actualizados",
      `Se actualizaron ${result.students || 0} alumnos y ${result.attendanceRecords || 0} registros de asistencia.`,
    ), 0);
  },
);

window.updateTeacherRole = async (id, role) => {
  try {
    await api.updateTeacherRole({schoolKey, teacherId: id, role});
    await loadTeachers();
  } catch (error) {
    window.showModalMsg("Rol", functionError(error));
    await loadTeachers();
  }
};

function teacherIdSegment(value) {
  return normalizeText(value, 100)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

window.previewNewTeacherId = () => {
  const names = teacherIdSegment(byId("new-teacher-given-names")?.value).slice(0, 32);
  const paternal = teacherIdSegment(byId("new-teacher-paternal-surname")?.value).slice(0, 2);
  const maternal = teacherIdSegment(byId("new-teacher-maternal-surname")?.value).slice(0, 2);
  const preview = byId("new-teacher-id-preview");
  if (preview) preview.value = names && paternal.length === 2 && maternal.length === 2 ? `${names}${paternal}${maternal}` : "—";
};

window.createTeacher = async () => {
  if (!isAdmin() || !schoolKey || schoolKey === "SISTEMA") {
    return window.showModalMsg("Alta de personal", "Seleccione primero el plantel que desea administrar.");
  }
  const givenNames = normalizeText(byId("new-teacher-given-names")?.value, 60).toUpperCase();
  const paternalSurname = normalizeText(byId("new-teacher-paternal-surname")?.value, 40).toUpperCase();
  const maternalSurname = normalizeText(byId("new-teacher-maternal-surname")?.value, 40).toUpperCase();
  const role = String(byId("new-teacher-role")?.value || "docente");
  if (teacherIdSegment(givenNames).length < 2) return window.showModalMsg("Alta de personal", "Capture el nombre o nombres del usuario.");
  if (teacherIdSegment(paternalSurname).length < 2 || teacherIdSegment(maternalSurname).length < 2) {
    return window.showModalMsg("Alta de personal", "Capture al menos dos letras de cada apellido.");
  }

  const button = byId("btn-create-teacher");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Guardando…";
  }
  try {
    const response = await api.createTeacher({schoolKey, givenNames, paternalSurname, maternalSurname, role});
    const teacherId = response.data.teacher.id;
    byId("new-teacher-given-names").value = "";
    byId("new-teacher-paternal-surname").value = "";
    byId("new-teacher-maternal-surname").value = "";
    byId("new-teacher-role").value = "docente";
    window.previewNewTeacherId();
    await loadTeachers();
    window.showModalMsg(
      "Cuenta creada",
      `Usuario temporal: ${teacherId}. Contraseña temporal: usuarionuevo. Entréguelos de forma privada; en el primer acceso la persona sustituirá este usuario por su correo y creará una contraseña propia.`,
    );
  } catch (error) {
    window.showModalMsg("Alta de personal", functionError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Crear cuenta";
    }
  }
};

window.openTeacherRepair = (teacherId, teacherName) => {
  teacherBeingRepaired = normalizeCode(teacherId, 160);
  byId("repair-teacher-name").value = normalizeText(teacherName, 100);
  byId("repair-teacher-password").value = "";
  byId("repair-teacher-label").textContent = `Cuenta seleccionada: ${normalizeText(teacherName, 100)}`;
  window.safeToggle("teacher-repair-panel", false);
  byId("repair-teacher-name").focus();
};

window.cancelTeacherRepair = () => {
  teacherBeingRepaired = "";
  byId("repair-teacher-name").value = "";
  byId("repair-teacher-password").value = "";
  window.safeToggle("teacher-repair-panel", true);
};

window.saveTeacherRepair = async () => {
  if (!teacherBeingRepaired) return window.showModalMsg("Corregir cuenta", "Seleccione primero una cuenta de la tabla.");
  const name = normalizeText(byId("repair-teacher-name")?.value, 100).toUpperCase();
  const temporaryPassword = String(byId("repair-teacher-password")?.value || "");
  if (name.length < 5) return window.showModalMsg("Corregir cuenta", "Capture el nombre completo del docente.");
  if (temporaryPassword && !validPassword(temporaryPassword)) return window.showModalMsg("Corregir cuenta", "La contraseña temporal debe tener entre 8 y 72 caracteres e incluir letras y números.");
  const button = byId("btn-repair-teacher");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Guardando…";
  }
  try {
    await api.repairTeacherAccount({schoolKey, teacherId: teacherBeingRepaired, name, temporaryPassword: temporaryPassword || null});
    window.cancelTeacherRepair();
    await loadTeachers();
    window.showModalMsg(
      "Cuenta actualizada",
      temporaryPassword
        ? "Entregue la contraseña temporal de forma privada. Las sesiones anteriores dejaron de ser válidas."
        : "El nombre de la cuenta fue corregido.",
    );
  } catch (error) {
    window.showModalMsg("Corregir cuenta", functionError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Guardar corrección";
    }
  }
};

window.approveTeacher = (id) => window.showConfirmMsg("Autorizar docente", `¿Autorizar el ID ${id} para ingresar al sistema?`, async () => {
  await api.approveTeacher({schoolKey, teacherId: id});
  await loadTeachers();
});

window.deleteTeacher = (id) => window.showConfirmMsg("Eliminar personal", `¿Eliminar el ID ${id}?`, async () => {
  await api.deleteTeacher({schoolKey, teacherId: id});
  await loadTeachers();
});

window.createSchool = async () => {
  if (loggedTeacher?.role !== "super") return window.showModalMsg("Alta de plantel", "Esta operación requiere el acceso maestro global.");
  const newSchoolKey = normalizeCode(byId("school-create-cct")?.value, 40);
  const schoolNameInput = normalizeText(byId("school-create-name")?.value, 120).toUpperCase();
  const directorName = normalizeText(byId("school-create-director")?.value, 120).toUpperCase();
  const adminName = normalizeText(byId("school-create-admin-name")?.value, 120).toUpperCase();
  const adminEmailInput = byId("school-create-admin-id");
  const adminId = normalizeText(adminEmailInput?.value, 160).toLowerCase();
  const password = String(byId("school-create-password")?.value || "");
  const passwordConfirmation = String(byId("school-create-password-confirm")?.value || "");
  if (!/^[A-Z0-9-]{5,40}$/.test(newSchoolKey)) return window.showModalMsg("Alta de plantel", "Capture una CCT válida.");
  if (!schoolNameInput || directorName.length < 5) return window.showModalMsg("Alta de plantel", "Capture el nombre de la escuela y del director o directora.");
  if (adminName.length < 5) return window.showModalMsg("Alta de plantel", "Capture el nombre del administrador o administradora.");
  if (!adminId || !adminEmailInput?.checkValidity()) return window.showModalMsg("Alta de plantel", "El usuario administrador debe ser un correo electrónico válido.");
  if (!validPassword(password)) return window.showModalMsg("Alta de plantel", "La contraseña debe tener entre 8 y 72 caracteres e incluir letras y números.");
  if (password !== passwordConfirmation) return window.showModalMsg("Alta de plantel", "La confirmación de la contraseña no coincide.");
  const button = byId("btn-create-school");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Creando…";
  }
  try {
    await api.createSchool({schoolKey: newSchoolKey, schoolName: schoolNameInput, directorName, adminName, adminId, password});
    ["school-create-cct", "school-create-name", "school-create-director", "school-create-admin-name", "school-create-admin-id", "school-create-password", "school-create-password-confirm"]
      .forEach((id) => { byId(id).value = ""; });
    await Promise.all([window.loadAllSchools(), window.loadAuditHistory()]);
    window.showModalMsg("Plantel creado", `La CCT ${newSchoolKey} quedó registrada con el administrador ${adminId}. La contraseña capturada quedó activa como contraseña definitiva.`);
  } catch (error) {
    window.showModalMsg("Alta de plantel", functionError(error));
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel || "Crear plantel y administrador";
    }
  }
};

const AUDIT_ACTION_LABELS = {
  school_created: "Plantel creado",
  school_updated: "Plantel actualizado",
  school_deleted: "Plantel eliminado",
  school_cct_corrected: "CCT corregida",
  school_verification_changed: "Verificación modificada",
  premium_enabled: "Premium activado",
  premium_disabled: "Premium desactivado",
  teacher_created: "Usuario creado",
  teacher_onboarding_completed: "Primer acceso completado",
  teacher_password_recovered: "Acceso recuperado por correo",
  teacher_updated: "Usuario actualizado",
  teacher_role_changed: "Rol modificado",
  teacher_approved: "Usuario aprobado",
  teacher_deleted: "Usuario eliminado",
  student_created: "Alumno creado",
  students_imported: "Alumnos importados",
  student_disabled: "Alumno dado de baja",
  student_enabled: "Alumno reactivado",
  student_moved: "Grupo del alumno corregido",
  student_group_deleted: "Grupo de alumnos eliminado",
  students_cleared: "Catálogo eliminado",
  student_group_renumbered: "Grupo renumerado",
  attendance_cleared: "Asistencias eliminadas",
  print_group_roster: "Solicitó imprimir lista",
  print_student_qr: "Solicitó imprimir QR",
  print_attendance_report: "Solicitó imprimir reporte",
  export_attendance_xls: "Exportó reporte XLS",
};

function auditCategory(action) {
  if (/print|export/.test(action)) return "print";
  if (/deleted|disabled|cleared/.test(action)) return "delete";
  if (/premium/.test(action)) return "premium";
  if (/teacher|role/.test(action)) return "security";
  return "school";
}

function auditDateLabel(milliseconds) {
  if (!Number.isFinite(Number(milliseconds))) return "Pendiente";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Mexico_City",
  }).format(new Date(Number(milliseconds)));
}

window.renderAuditHistory = () => {
  const body = byId("audit-history-body");
  if (!body) return;
  const search = normalizeText(byId("audit-history-search")?.value, 120).toUpperCase();
  const category = String(byId("audit-history-filter")?.value || "");
  const visible = auditHistory.filter((entry) => {
    if (category && auditCategory(entry.action) !== category) return false;
    if (!search) return true;
    return [entry.schoolKey, entry.actorName, entry.actorId, entry.action, entry.targetId, entry.targetLabel, entry.summary]
      .some((value) => normalizeText(value, 240).toUpperCase().includes(search));
  });
  body.replaceChildren();
  for (const entry of visible) {
    const row = document.createElement("tr");
    row.append(
      createCell(auditDateLabel(entry.createdAt), "p-3 whitespace-nowrap text-slate-600"),
      createCell(`${normalizeText(entry.actorName || entry.actorId)} · ${normalizeText(entry.actorRole)}`, "font-bold text-slate-800"),
      createCell(normalizeCode(entry.schoolKey, 40) || "SISTEMA", "font-black"),
      createCell(AUDIT_ACTION_LABELS[entry.action] || normalizeText(entry.action), "font-bold"),
      createCell(normalizeText(entry.targetLabel || entry.targetId) || "—"),
      createCell(normalizeText(entry.summary) || "—", "max-w-sm normal-case text-slate-600"),
    );
    body.append(row);
  }
  if (!visible.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "p-8 text-center text-slate-400";
    cell.textContent = auditHistory.length ? "Ninguna acción coincide con los filtros." : "Todavía no hay acciones registradas.";
    row.append(cell);
    body.append(row);
  }
  if (byId("audit-history-status")) byId("audit-history-status").textContent = `${visible.length} de ${auditHistory.length} acciones`;
};

window.loadAuditHistory = async () => {
  if (loggedTeacher?.role !== "super") return;
  if (byId("audit-history-status")) byId("audit-history-status").textContent = "Cargando historial…";
  try {
    const response = await api.listAuditLogs({limit: 250});
    auditHistory = Array.isArray(response.data?.logs) ? response.data.logs : [];
    window.renderAuditHistory();
  } catch (error) {
    if (byId("audit-history-status")) byId("audit-history-status").textContent = functionError(error, "No fue posible cargar el historial.");
  }
};

function recordClientAudit(action, targetId, targetLabel, summary = "", metadata = {}) {
  if (!loggedTeacher || !schoolKey || schoolKey === "SISTEMA") return;
  api.recordAuditEvent({schoolKey, action, targetId, targetLabel, summary, metadata}).catch(() => {});
}

window.loadAllSchools = async () => {
  if (loggedTeacher?.role !== "super") return;
  const loadVersion = ++globalSchoolsLoadVersion;
  const body = byId("global-schools-body");
  body.replaceChildren();
  try {
    const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios"));
    if (loadVersion !== globalSchoolsLoadVersion) return;
    for (const entry of snapshot.docs) {
      const school = entry.data();
      const row = document.createElement("tr");
      row.append(createCell(entry.id));
      row.append(createCell(normalizeText(school.name)));
      const verificationCell = document.createElement("td");
      const verificationStatus = new Set(["verified", "unverified", "disputed"]).has(school.verificationStatus)
        ? school.verificationStatus
        : "unverified";
      const verificationLabel = {verified: "VALIDADA", unverified: "SIN VALIDAR", disputed: "EN DISPUTA"}[verificationStatus];
      verificationCell.textContent = verificationLabel;
      verificationCell.className = verificationStatus === "verified"
        ? "text-green-700 font-black"
        : verificationStatus === "disputed" ? "text-red-700 font-black" : "text-amber-700 font-black";
      row.append(verificationCell);
      for (const field of ["isPremium", "allowBranding"]) {
        const cell = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        const enabled = field === "allowBranding" ? school.isPremium === true : school[field] === true;
        button.className = `px-3 py-2 rounded-lg font-black ${enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`;
        button.textContent = enabled ? "SÍ" : "NO";
        button.setAttribute("aria-label", `${field === "isPremium" ? "Publicidad desactivada" : "Identidad visual"} para ${normalizeText(school.name)}: ${button.textContent}`);
        if (field === "isPremium") button.addEventListener("click", () => window.togglePremiumMaster(entry.id, field, enabled));
        else button.disabled = true;
        cell.append(button);
        row.append(cell);
      }
      const actions = document.createElement("td");
      actions.className = "whitespace-nowrap";
      actions.append(createIconButton(
        `Gestionar usuarios y datos de ${normalizeText(school.name)}`,
        "fas fa-tools",
        () => window.manageSchoolGlobal(entry.id),
        "text-blue-700 p-2 rounded-lg hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600",
      ));
      actions.append(createIconButton(
        `Validar la CCT ${entry.id}`,
        "fas fa-shield-alt",
        () => window.setSchoolVerification(entry.id, "verified"),
        "text-green-700 p-2 rounded-lg hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-green-600",
      ));
      actions.append(createIconButton(
        `Marcar la CCT ${entry.id} en disputa`,
        "fas fa-exclamation-triangle",
        () => window.setSchoolVerification(entry.id, "disputed"),
        "text-amber-700 p-2 rounded-lg hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-amber-600",
      ));
      actions.append(createIconButton(`Eliminar escuela ${normalizeText(school.name)}`, "fas fa-trash", () => window.deleteSchoolGlobal(entry.id)));
      row.append(actions);
      body.append(row);
    }
  } catch (error) {
    if (loadVersion !== globalSchoolsLoadVersion) return;
    window.showModalMsg("Error", functionError(error));
  }
};

window.manageSchoolGlobal = async (id) => {
  await window.switchTab("admin");
  await window.selectSchoolForManagement(id);
};

window.setSchoolVerification = (id, verificationStatus) => {
  const cct = normalizeCode(id, 40);
  const action = verificationStatus === "verified" ? "validar" : "marcar en disputa";
  window.showConfirmMsg("Verificación de CCT", `¿Confirmar que desea ${action} la CCT ${cct}?`, async () => {
    await api.setSchoolVerification({schoolKey: cct, verificationStatus});
    await Promise.all([window.loadAllSchools(), window.loadAuditHistory()]);
  });
};

window.togglePremiumMaster = (id, field, current) => {
  const enabling = !current;
  const message = enabling
    ? `¿Activar Premium para ${id}? Si el administrador ya preparó un logotipo, se aplicará automáticamente.`
    : `¿Desactivar Premium para ${id}? El logotipo institucional se conservará, pero dejará de mostrarse mientras el plantel sea Free.`;
  window.showConfirmMsg(enabling ? "Activar Premium" : "Desactivar Premium", message, async () => {
    try {
      const response = await api.toggleSchoolFlag({schoolKey: id, field, value: enabling});
      await Promise.all([window.loadAllSchools(), window.loadAuditHistory()]);
      const logoMessage = response.data?.logoApplied
        ? " También se aplicó el logotipo preparado por el administrador."
        : response.data?.logoAvailable ? " También se reactivó el logotipo institucional existente."
        : enabling ? " El administrador ya puede configurar o cambiar su logotipo." : "";
      window.showModalMsg("Premium", `${enabling ? "Premium activado." : "Premium desactivado."}${logoMessage}`);
    } catch (error) {
      window.showModalMsg("Error", functionError(error));
    }
  });
};

window.deleteSchoolGlobal = (id) => window.showConfirmMsg("Eliminar escuela", `¿Borrar permanentemente ${id}, incluyendo alumnos, docentes y asistencias?`, async () => {
  await api.deleteSchool({schoolKey: id});
  await Promise.all([window.loadAllSchools(), window.loadAuditHistory()]);
});

function reportGroupFromStudent(student) {
  const level = normalizeSchoolLevel(student?.level || student?.nivel);
  const group = normalizeGroupName(student?.grupo);
  if (!level || !group) return null;
  return {
    key: scheduleGroupKey(level, group),
    level,
    group,
    label: `${STUDENT_LEVEL_LABELS[level] || level} · Grupo ${group}`,
  };
}

async function loadReportGroupOptions() {
  const container = byId("report-group-options");
  if (!container || !schoolKey || schoolKey === "SISTEMA") return;
  const priorSelection = new Set([...container.querySelectorAll("input[type='checkbox']:checked")].map((input) => input.value));
  const preserveSelection = container.dataset.schoolKey === schoolKey && container.querySelector("input[type='checkbox']") !== null;
  container.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "text-xs text-slate-500";
  loading.textContent = "Cargando grupos…";
  container.append(loading);
  try {
    const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
    studentCatalogCache = snapshot.docs.map((entry) => ({...entry.data(), id: entry.id}));
    populateScheduleGroupOptions();
    const groups = new Map();
    for (const student of studentCatalogCache) {
      const details = reportGroupFromStudent(student);
      if (details) groups.set(details.key, details);
    }
    const orderedGroups = [...groups.values()].sort((first, second) => {
      const levelOrder = (STUDENT_LEVEL_ORDER.get(first.level) ?? 99) - (STUDENT_LEVEL_ORDER.get(second.level) ?? 99);
      return levelOrder || first.group.localeCompare(second.group, "es", {numeric: true, sensitivity: "base"});
    });
    container.replaceChildren();
    container.dataset.schoolKey = schoolKey;
    orderedGroups.forEach((details, index) => {
      const label = document.createElement("label");
      label.className = "flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase text-slate-700";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = details.key;
      checkbox.checked = preserveSelection ? priorSelection.has(details.key) : true;
      checkbox.id = `report-group-${index}`;
      checkbox.dataset.level = details.level;
      checkbox.dataset.group = details.group;
      checkbox.dataset.label = details.label;
      checkbox.className = "h-4 w-4 accent-orange-500";
      label.append(checkbox, document.createTextNode(details.label));
      container.append(label);
    });
    if (!orderedGroups.length) {
      const empty = document.createElement("p");
      empty.className = "text-xs text-slate-500";
      empty.textContent = "No hay grupos con alumnos registrados.";
      container.append(empty);
    }
  } catch (error) {
    container.replaceChildren();
    const failed = document.createElement("p");
    failed.className = "text-xs font-bold text-red-700";
    failed.textContent = "No fue posible cargar los grupos.";
    container.append(failed);
    window.showModalMsg("Reporte", functionError(error));
  }
}

window.toggleAllReportGroups = (checked) => {
  byId("report-group-options")?.querySelectorAll("input[type='checkbox']").forEach((input) => { input.checked = checked; });
};

function selectedReportGroups() {
  return [...(byId("report-group-options")?.querySelectorAll("input[type='checkbox']:checked") || [])].map((input) => ({
    key: input.value,
    level: input.dataset.level || "",
    group: input.dataset.group || "",
    label: input.dataset.label || input.value,
  }));
}

function attendanceReportDates(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const last = new Date(`${to}T12:00:00Z`);
  while (cursor <= last && dates.length <= 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function visibleReportDate(value, includeYear = false) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    ...(includeYear ? {year: "numeric"} : {}),
  }).format(new Date(`${value}T12:00:00Z`));
}

function createAttendanceReportHeader(report, sectionLabel = "") {
  const header = document.createElement("header");
  header.className = "attendance-report-header";
  const logoFrame = document.createElement("div");
  logoFrame.className = "attendance-report-logo-frame";
  const schoolLogo = currentSchool?.isPremium === true && /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(currentSchool.logoDataUrl || ""))
    ? currentSchool.logoDataUrl
    : "./icons/app-icon-192.png";
  const usesCustomLogo = schoolLogo !== "./icons/app-icon-192.png";
  if (usesCustomLogo && currentSchool?.brandLogoBackgroundMode === "color" && /^#[0-9a-f]{6}$/i.test(String(currentSchool.brandLogoBackgroundColor || ""))) {
    logoFrame.style.backgroundColor = currentSchool.brandLogoBackgroundColor;
  } else {
    logoFrame.style.backgroundColor = "transparent";
  }
  const logo = document.createElement("img");
  logo.className = "attendance-report-logo";
  logo.src = schoolLogo;
  logo.alt = usesCustomLogo ? `Logotipo de ${schoolName}` : "Logotipo predeterminado de Control de Asistencia";
  logoFrame.append(logo);
  const details = document.createElement("div");
  const title = document.createElement("h1");
  title.className = "text-base font-black uppercase text-slate-900";
  title.textContent = schoolName || "Control de asistencia";
  const groups = document.createElement("p");
  groups.className = "mt-1 text-[9px] font-black uppercase text-slate-700";
  groups.textContent = `Grupos: ${report.groups.map((group) => group.label).join(" · ")}`;
  const period = document.createElement("p");
  period.className = "mt-1 text-[9px] font-bold uppercase text-slate-600";
  period.textContent = `Periodo: ${visibleReportDate(report.from, true)} a ${visibleReportDate(report.to, true)} · CCT: ${schoolKey}${sectionLabel ? ` · ${sectionLabel}` : ""}`;
  details.append(title, groups, period);
  header.append(logoFrame, details);
  return header;
}

function attendanceCountsByStudent(report) {
  const counts = new Map();
  const recordedAttendances = new Set();
  for (const attendance of report.rows || []) {
    const studentId = normalizeCode(attendance?.studentId, 40);
    const date = String(attendance?.date || "");
    if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isTardyAbsence(attendance?.status) || isJustifiedAbsence(attendance) || /^FALTA\b/i.test(normalizeText(attendance?.status, 40))) continue;
    const key = `${studentId}|${date}`;
    if (recordedAttendances.has(key)) continue;
    recordedAttendances.add(key);
    counts.set(studentId, (counts.get(studentId) || 0) + 1);
  }
  return counts;
}

function isJustifiedAbsence(attendance) {
  return attendance?.justified === true || normalizedAttendanceStatus(attendance?.status) === "FALTA JUSTIFICADA";
}

const ATTENDANCE_PRINT_DATES_PER_PAGE = 50;

function createAttendanceMatrixTable(report, dates = report.dates) {
  const attendanceByStudentAndDate = new Map(report.rows.map((row) => [`${row.studentId}|${row.date}`, row]));
  const attendanceCounts = attendanceCountsByStudent(report);
  const table = document.createElement("table");
  table.className = "attendance-report-grid";
  const thead = document.createElement("thead");
  const headingRow = document.createElement("tr");
  const nameHeading = document.createElement("th");
  nameHeading.className = "attendance-name-cell";
  nameHeading.textContent = "Nombre del alumno";
  headingRow.append(nameHeading);
  dates.forEach((date) => {
    const dateHeading = document.createElement("th");
    dateHeading.className = "attendance-date-cell";
    dateHeading.title = visibleReportDate(date, true);
    const label = document.createElement("span");
    label.className = "attendance-date-label";
    label.textContent = visibleReportDate(date);
    dateHeading.append(label);
    headingRow.append(dateHeading);
  });
  const totalHeading = document.createElement("th");
  totalHeading.className = "attendance-total-cell";
  totalHeading.title = "Total de asistencias en el periodo";
  totalHeading.textContent = "Total asist.";
  headingRow.append(totalHeading);
  thead.append(headingRow);
  const tbody = document.createElement("tbody");
  report.students.forEach((student) => {
    const row = document.createElement("tr");
    row.append(createCell(student.name, "attendance-name-cell"));
    dates.forEach((date) => {
      const attendance = attendanceByStudentAndDate.get(`${student.id}|${date}`);
      const status = attendance ? normalizedAttendanceStatus(attendance.status) : "FALTA NORMAL";
      const justified = isJustifiedAbsence(attendance);
      const mark = justified ? "J" : status === "FALTA POR RETARDOS" ? "R" : status === "RETARDO" ? "T" : attendance ? "●" : "/";
      const color = justified ? "text-blue-700" : status === "FALTA POR RETARDOS"
        ? "text-red-700"
        : status === "RETARDO" ? "text-amber-700" : attendance ? "text-green-800" : "text-slate-500";
      const cell = createCell(mark, `attendance-mark-cell ${color}`);
      cell.title = attendance
        ? `${visibleReportDate(date, true)} · ${justified ? "FALTA JUSTIFICADA" : status} · ${attendance.time || "Sin hora"}`
        : `${visibleReportDate(date, true)} · Falta normal`;
      cell.setAttribute("aria-label", cell.title);
      row.append(cell);
    });
    const total = attendanceCounts.get(normalizeCode(student.id, 40)) || 0;
    const totalCell = createCell(String(total), "attendance-total-cell");
    totalCell.title = `${student.name}: ${total} ${total === 1 ? "asistencia" : "asistencias"} en el periodo`;
    totalCell.setAttribute("aria-label", totalCell.title);
    row.append(totalCell);
    tbody.append(row);
  });
  table.append(thead, tbody);
  return table;
}

function renderAttendanceReport(report) {
  const preview = byId("attendance-report-preview");
  const summary = byId("attendance-report-summary");
  if (!preview || !summary) return;
  preview.replaceChildren();
  if (!report) {
    const prompt = document.createElement("p");
    prompt.className = "p-10 text-center text-slate-500 italic";
    prompt.textContent = "Seleccione grupos, indique el rango y consulte el reporte.";
    preview.append(prompt);
    summary.textContent = "0 registros";
    window.safeToggle("btn-print-attendance", true);
    window.safeToggle("btn-export-attendance-xls", true);
    return;
  }
  preview.append(createAttendanceReportHeader(report));
  const scroller = document.createElement("div");
  scroller.className = "attendance-report-scroller overflow-x-auto";
  scroller.append(createAttendanceMatrixTable(report));
  const legend = document.createElement("p");
  legend.className = "p-3 text-right text-[9px] font-black uppercase text-slate-600";
  legend.textContent = "● A tiempo · T Retardo · R Falta por retardos · J Falta justificada · / Falta normal · Total: asistencias del periodo";
  preview.append(scroller, legend);
  summary.textContent = `${report.students.length} ${report.students.length === 1 ? "alumno" : "alumnos"} · ${report.dates.length} ${report.dates.length === 1 ? "fecha" : "fechas"} · ${report.groups.length} ${report.groups.length === 1 ? "grupo" : "grupos"}${report.truncated ? " · historial limitado a 5000 registros" : ""}`;
  window.safeToggle("btn-print-attendance", report.students.length === 0 || report.dates.length === 0);
  window.safeToggle("btn-export-attendance-xls", report.students.length === 0 || report.dates.length === 0);
}

window.loadAttendanceReport = async () => {
  const from = byId("report-date-from")?.value || "";
  const to = byId("report-date-to")?.value || "";
  if (!from || !to || from > to) return window.showModalMsg("Reporte", "Seleccione un rango de fechas válido.");
  const groups = selectedReportGroups();
  if (!groups.length) return window.showModalMsg("Reporte", "Seleccione al menos un grupo para generar el reporte.");
  const selectedGroupKeys = new Set(groups.map((group) => group.key));
  const students = studentCatalogCache
    .filter((student) => !isStudentInactive(student) && selectedGroupKeys.has(reportGroupFromStudent(student)?.key))
    .map((student) => ({
      id: normalizeCode(student.id, 40),
      name: studentDisplayName(student),
      attendanceIds: [...new Set([
        student.id,
        ...(Array.isArray(student.previousStudentIds) ? student.previousStudentIds : []),
      ].map((id) => normalizeCode(id, 40)).filter(Boolean))],
    }))
    .filter((student) => student.id && student.name)
    .sort((first, second) => first.name.localeCompare(second.name, "es", {sensitivity: "base"}));
  if (!students.length) return window.showModalMsg("Reporte", "Los grupos seleccionados no tienen alumnos activos.");
  const button = byId("btn-load-attendance");
  if (button) button.disabled = true;
  try {
    const response = await api.listAttendanceReport({schoolKey, from, to});
    const currentStudentIdByAttendanceId = new Map(students.flatMap((student) => student.attendanceIds.map((id) => [id, student.id])));
    latestAttendanceReport = {
      from,
      to,
      groups,
      students,
      dates: attendanceReportDates(from, to),
      rows: (response.data.rows || [])
        .filter((row) => currentStudentIdByAttendanceId.has(normalizeCode(row.studentId, 40)))
        .map((row) => ({...row, studentId: currentStudentIdByAttendanceId.get(normalizeCode(row.studentId, 40))})),
      truncated: response.data.truncated === true,
    };
    renderAttendanceReport(latestAttendanceReport);
  } catch (error) {
    window.showModalMsg("Reporte", functionError(error));
  } finally {
    if (button) button.disabled = false;
  }
};

window.justifySelectedAbsence = async ({studentId, date}) => {
  const student = studentCatalogCache.find((entry) => normalizeCode(entry.id, 40) === normalizeCode(studentId, 40));
  if (!student || isStudentInactive(student)) return window.showModalMsg("Justificar falta", "Seleccione un alumno activo del plantel.");
  const button = byId("btn-submit-justify-absence");
  if (button) button.disabled = true;
  try {
    await api.justifyAttendance({schoolKey, studentId: student.id, date});
    window.closeJustifyAbsenceModal();
    window.showModalMsg("Falta justificada", "La falta quedó marcada con J para fines informativos y seguirá contando como falta.");
    if (byId("report-date-from")?.value && byId("report-date-to")?.value) await window.loadAttendanceReport();
  } catch (error) {
    window.showModalMsg("Justificar falta", functionError(error));
  } finally {
    if (button) button.disabled = false;
  }
};

window.searchJustificationStudents = (query) => studentCatalogCache
  .filter((student) => !isStudentInactive(student))
  .map((student) => ({
    id: normalizeCode(student.id, 40),
    name: studentDisplayName(student),
    level: normalizeSchoolLevel(student.level || student.nivel),
    group: normalizeGroupName(student.grupo),
  }))
  .filter((student) => student.name.toLowerCase().includes(query) || student.id.toLowerCase().includes(query));

window.printAttendanceReport = () => {
  if (!latestAttendanceReport?.students?.length || !latestAttendanceReport?.dates?.length) {
    return window.showModalMsg("Impresión", "Primero genere un reporte de asistencia.");
  }
  recordClientAudit(
    "print_attendance_report",
    `${latestAttendanceReport.from}_${latestAttendanceReport.to}`,
    `${latestAttendanceReport.from} a ${latestAttendanceReport.to}`,
    `Solicitó imprimir el reporte de ${latestAttendanceReport.students.length} alumnos y ${latestAttendanceReport.groups.length} grupos.`,
    {studentCount: latestAttendanceReport.students.length, groupCount: latestAttendanceReport.groups.length},
  );
  const content = document.createElement("div");
  content.className = "attendance-report-document";
  const dateChunks = [];
  for (let index = 0; index < latestAttendanceReport.dates.length; index += ATTENDANCE_PRINT_DATES_PER_PAGE) {
    dateChunks.push(latestAttendanceReport.dates.slice(index, index + ATTENDANCE_PRINT_DATES_PER_PAGE));
  }
  dateChunks.forEach((dates, index) => {
    const section = document.createElement("section");
    section.className = "attendance-print-section";
    const sectionLabel = dateChunks.length > 1 ? `Bloque ${index + 1} de ${dateChunks.length}` : "";
    section.append(
      createAttendanceReportHeader(latestAttendanceReport, sectionLabel),
      createAttendanceMatrixTable(latestAttendanceReport, dates),
    );
    const legend = document.createElement("p");
    legend.className = "mt-2 text-right text-[8px] font-black uppercase";
    legend.textContent = "● A tiempo · T Retardo · R Falta por retardos · J Falta justificada · / Falta normal · Total: asistencias del periodo";
    section.append(legend);
    content.append(section);
  });
  launchStudentPrint(content);
};

window.exportAttendanceReportXls = () => {
  if (!latestAttendanceReport?.students?.length || !latestAttendanceReport?.dates?.length) {
    return window.showModalMsg("Exportación", "Primero genere un reporte de asistencia.");
  }
  const xlsx = window.XLSX;
  if (!xlsx?.utils?.aoa_to_sheet || !xlsx?.utils?.book_new || typeof xlsx.writeFile !== "function") {
    return window.showModalMsg("Exportación", "El exportador de Excel no está disponible. Recargue la página e inténtelo nuevamente.");
  }
  try {
    const exportData = createAttendanceExportData({
      report: latestAttendanceReport,
      schoolName,
      schoolKey,
      attendanceLabel: (attendance) => normalizedAttendanceStatus(attendance.status),
    });
    const worksheet = xlsx.utils.aoa_to_sheet(exportData.rows, {cellDates: true, dateNF: "dd/mm/yyyy"});
    worksheet["!cols"] = [
      {wch: 38},
      ...Array.from({length: exportData.dateColumnCount}, () => ({wch: 11})),
      {wch: 14},
    ];
    worksheet["!merges"] = [{
      s: {r: 0, c: 0},
      e: {r: 0, c: exportData.totalColumnIndex},
    }];
    worksheet["!autofilter"] = {
      ref: xlsx.utils.encode_range({
        s: {r: exportData.headerRowIndex, c: 0},
        e: {r: exportData.lastRowIndex, c: exportData.totalColumnIndex},
      }),
    };
    for (let index = 0; index < exportData.dateColumnCount; index += 1) {
      const dateCell = worksheet[xlsx.utils.encode_cell({r: exportData.headerRowIndex, c: exportData.dateColumnStart + index})];
      if (dateCell) dateCell.z = "dd/mm/yyyy";
    }
    for (let row = exportData.studentRowStart; row <= exportData.lastRowIndex; row += 1) {
      const firstDateCell = xlsx.utils.encode_cell({r: row, c: exportData.dateColumnStart});
      const lastDateCell = xlsx.utils.encode_cell({r: row, c: exportData.totalColumnIndex - 1});
      const totalCellRef = xlsx.utils.encode_cell({r: row, c: exportData.totalColumnIndex});
      worksheet[totalCellRef] = {
        t: "n",
        v: Number(exportData.rows[row][exportData.totalColumnIndex] || 0),
        f: `COUNTIF(${firstDateCell}:${lastDateCell},"A TIEMPO")+COUNTIF(${firstDateCell}:${lastDateCell},"RETARDO")`,
        z: "0",
      };
    }
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Asistencias");
    const filename = attendanceExportFilename({schoolKey, from: latestAttendanceReport.from, to: latestAttendanceReport.to});
    xlsx.writeFile(workbook, filename, {bookType: "xls", cellDates: true});
    recordClientAudit(
      "export_attendance_xls",
      `${latestAttendanceReport.from}_${latestAttendanceReport.to}`,
      `${latestAttendanceReport.from} a ${latestAttendanceReport.to}`,
      `Exportó a XLS el reporte de ${latestAttendanceReport.students.length} alumnos y ${latestAttendanceReport.groups.length} grupos.`,
      {studentCount: latestAttendanceReport.students.length, groupCount: latestAttendanceReport.groups.length},
    );
    return true;
  } catch (error) {
    window.showModalMsg("Exportación", functionError(error, "No fue posible generar el archivo XLS."));
    return false;
  }
};

window.clearAttendanceHistory = () => window.showConfirmMsg(
  "Vaciar asistencias",
  "¿Eliminar definitivamente todas las asistencias del plantel? Los alumnos y usuarios se conservarán.",
  async () => {
    await api.clearAttendance({schoolKey});
    latestAttendanceReport = null;
    renderAttendanceReport(null);
  },
);

function placeSharedQrReader(targetId = "qr-reader-home") {
  const reader = byId("qr-reader");
  const target = byId(targetId);
  if (!reader || !target || reader.parentElement === target) return false;
  target.append(reader);
  return true;
}

function updateAttendanceScannerUi() {
  const button = byId("btn-camera");
  if (!button) return;
  const running = isScannerRunning && qrScannerMode === "attendance";
  button.disabled = isScannerTransitioning;
  button.classList.toggle("opacity-50", isScannerTransitioning);
  button.textContent = running ? "Apagar cámara" : isScannerTransitioning ? "Preparando cámara…" : "Encender cámara";
  button.setAttribute("aria-pressed", String(running));
}

function updateSharedQrScannerState(state) {
  isScannerRunning = state === "running";
  isScannerTransitioning = new Set(["starting", "stopping", "scanning-file"]).has(state);
  updateAttendanceScannerUi();
  updateQrVerificationCameraUi(qrScannerMode === "verification" ? state : "idle");
  if (state === "running" && qrScannerMode === "verification") void refreshQrVerificationCameraOptions();
}

function ensureSharedQrScanner() {
  if (sharedQrScanner) return sharedQrScanner;
  sharedQrScanner = createCameraDataScanner({
    elementId: "qr-reader",
    Html5QrcodeClass: window.Html5Qrcode,
    scanConfig: {fps: 8, qrbox: 250},
    dedupeMs: 1800,
    onDecoded: ({raw, captureMethod, format, capturedAt}) => qrScannerMode === "verification"
      ? window.processQrVerification(raw, {captureMethod, format, capturedAt, sessionVersion: qrVerificationSessionVersion})
      : window.processAttendance(raw, {captureMethod: "qr", format, capturedAt}),
    onStateChange: ({state}) => updateSharedQrScannerState(state),
    onError: ({operation, message}) => {
      if (operation === "process") return;
      if (qrScannerMode === "verification") {
        setQrVerificationStatus(operation === "scan-file"
          ? "No se detectó un QR válido en la imagen. Pruebe con otra foto."
          : message);
      } else {
        setScannerStatus(message, "error");
      }
    },
  });
  return sharedQrScanner;
}

async function stopSharedQrScanner() {
  if (qrScannerStartPromise) await qrScannerStartPromise.catch(() => {});
  if (!sharedQrScanner) return false;
  return sharedQrScanner.stop();
}

async function startSharedQrScanner(mode, camera = {facingMode: "environment"}) {
  if (!loggedTeacher || !new Set(["attendance", "verification"]).has(mode)) return false;
  if (isScannerRunning && qrScannerMode !== mode) await stopSharedQrScanner();
  qrScannerMode = mode;
  placeSharedQrReader(mode === "verification" ? "qr-verification-reader" : "qr-reader-home");
  const scanner = ensureSharedQrScanner();
  if (scanner.getState() === "running") return false;
  qrScannerStartPromise = scanner.start(camera);
  try {
    return await qrScannerStartPromise;
  } finally {
    qrScannerStartPromise = null;
  }
}

window.initScanner = async () => {
  if (isScannerTransitioning || isScannerRunning || !loggedTeacher) return;
  if (loggedTeacher.role === "docente" && !attendanceGroupReady(false)) return;
  showScannerStartTime();
  try {
    const started = await startSharedQrScanner("attendance");
    if (!started) return;
    showScannerStartTime(new Date());
    setScannerStatus("Escáner activo. Avisos al máximo; verifique que el volumen multimedia del celular esté alto.", "success");
    await playScanSound("scan");
  } catch (error) {
    updateAttendanceScannerUi();
    window.showModalMsg("Cámara", functionError(error, "No se pudo iniciar la cámara. Revise el permiso del navegador o use la captura manual."));
  }
};

window.stopScanner = async () => {
  try {
    return await stopSharedQrScanner();
  } catch (error) {
    setScannerStatus(functionError(error, "No se pudo apagar la cámara."), "error");
    return false;
  }
};

function setQrVerificationStatus(message) {
  const status = byId("qr-verification-status");
  if (status) status.textContent = message;
}

function resetQrVerificationResult() {
  for (const id of ["verified-student-name", "verified-student-details"]) {
    const element = byId(id);
    if (!element) continue;
    element.textContent = "";
    element.classList.add("hidden");
  }
}

function showQrVerificationResult(name, detail) {
  const nameElement = byId("verified-student-name");
  const detailElement = byId("verified-student-details");
  if (nameElement) {
    nameElement.textContent = name;
    nameElement.classList.remove("hidden");
  }
  if (detailElement) {
    detailElement.textContent = detail;
    detailElement.classList.remove("hidden");
  }
}

function updateQrVerificationCameraUi(state = sharedQrScanner?.getState?.() || "idle") {
  const button = byId("btn-start-qr-verification");
  const select = byId("qr-verification-camera-select");
  const running = state === "running";
  const busy = new Set(["starting", "stopping", "scanning-file"]).has(state);
  if (button) {
    button.disabled = busy;
    button.classList.toggle("opacity-50", busy);
    button.setAttribute("aria-pressed", String(running));
    button.textContent = running ? "Apagar cámara" : busy ? "Preparando cámara…" : "Encender cámara";
  }
  if (select) select.disabled = busy;
  if (!running) {
    qrVerificationTorchEnabled = false;
    const torchButton = byId("btn-qr-verification-torch");
    torchButton?.classList.add("hidden");
    torchButton?.setAttribute("aria-pressed", "false");
    if (torchButton) torchButton.textContent = "Encender linterna";
  }
}

async function refreshQrVerificationCameraOptions() {
  const container = byId("qr-verification-camera-field");
  const select = byId("qr-verification-camera-select");
  if (!container || !select || !sharedQrScanner) return;
  try {
    const devices = await sharedQrScanner.listCameras();
    const selectedDeviceId = sharedQrScanner?.getCameraSettings?.()?.deviceId || select.value;
    select.replaceChildren();
    devices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.id || device.deviceId;
      option.textContent = device.label || `Cámara ${index + 1}`;
      option.selected = Boolean(selectedDeviceId && option.value === selectedDeviceId);
      select.append(option);
    });
    container.classList.toggle("hidden", devices.length < 2);
  } catch {
    container.classList.add("hidden");
  }
}

window.initQrVerificationScanner = async () => {
  if (!loggedTeacher || !isAdmin()) return false;
  resetQrVerificationResult();
  setQrVerificationStatus("Iniciando lector...");
  try {
    const cameraId = byId("qr-verification-camera-select")?.value;
    const started = await startSharedQrScanner("verification", cameraId || {facingMode: "environment"});
    if (!started && sharedQrScanner?.getState() !== "running") return false;
    setQrVerificationStatus("Lector activo. Enfoque el código QR del alumno.");
    const capabilities = sharedQrScanner.getCameraCapabilities?.() || {};
    byId("btn-qr-verification-torch")?.classList.toggle("hidden", !("torch" in capabilities));
    return true;
  } catch (error) {
    updateQrVerificationCameraUi("error");
    setQrVerificationStatus(functionError(error, "No se pudo iniciar la cámara. Revise el permiso del navegador o seleccione una foto del QR."));
    return false;
  }
};

window.stopQrVerificationScanner = async () => {
  if (!sharedQrScanner || qrScannerMode !== "verification") return false;
  try {
    return await stopSharedQrScanner();
  } catch (error) {
    setQrVerificationStatus(functionError(error, "No se pudo apagar la cámara."));
    return false;
  }
};

window.toggleQrVerificationScanner = async () => {
  if (qrScannerMode === "verification" && sharedQrScanner?.getState() === "running") {
    const stopped = await window.stopQrVerificationScanner();
    if (stopped) setQrVerificationStatus("Cámara apagada. Puede encenderla de nuevo o seleccionar una foto del QR.");
    return stopped;
  }
  return window.initQrVerificationScanner();
};

window.startQrVerificationScanner = window.toggleQrVerificationScanner;

window.switchQrVerificationCamera = async (cameraId) => {
  if (!cameraId || !sharedQrScanner || qrScannerMode !== "verification") return false;
  setQrVerificationStatus("Cambiando de cámara...");
  try {
    await sharedQrScanner.switchCamera(cameraId);
    setQrVerificationStatus(sharedQrScanner.getState() === "running"
      ? "Lector activo. Enfoque el código QR del alumno."
      : "Cámara seleccionada. Presione Encender cámara para usarla.");
    return true;
  } catch (error) {
    setQrVerificationStatus(functionError(error, "No se pudo cambiar de cámara."));
    return false;
  }
};

window.toggleQrVerificationTorch = async () => {
  if (!sharedQrScanner || qrScannerMode !== "verification" || sharedQrScanner.getState() !== "running") return false;
  const nextValue = !qrVerificationTorchEnabled;
  try {
    const supported = await sharedQrScanner.setTorch(nextValue);
    if (!supported) {
      byId("btn-qr-verification-torch")?.classList.add("hidden");
      return false;
    }
    qrVerificationTorchEnabled = nextValue;
    const button = byId("btn-qr-verification-torch");
    button?.setAttribute("aria-pressed", String(nextValue));
    if (button) button.textContent = nextValue ? "Apagar linterna" : "Encender linterna";
    return true;
  } catch (error) {
    setQrVerificationStatus(functionError(error, "No se pudo controlar la linterna."));
    return false;
  }
};

window.scanQrVerificationImage = async (event) => {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return false;
  resetQrVerificationResult();
  setQrVerificationStatus("Analizando imagen...");
  try {
    if (qrScannerMode !== "verification") await stopSharedQrScanner();
    qrScannerMode = "verification";
    placeSharedQrReader("qr-verification-reader");
    await ensureSharedQrScanner().scanImage(file, true);
    return true;
  } catch {
    return false;
  } finally {
    input.value = "";
  }
};

window.openVerifyQrModal = async () => {
  if (!isAdmin()) return window.showModalMsg("Acceso", "No tiene permisos para verificar códigos QR.");
  qrVerificationSessionVersion += 1;
  window.safeToggle("modal-verify-qr", false);
  resetQrVerificationResult();
  setQrVerificationStatus("Preparando cámara...");
  updateQrVerificationCameraUi("idle");
  await window.initQrVerificationScanner();
  byId("btn-start-qr-verification")?.focus();
};

window.processQrVerification = async (rawId, options = {}) => {
  if (qrVerificationScanInFlight || !loggedTeacher || !isAdmin()) return false;
  const sessionVersion = Number(options.sessionVersion || qrVerificationSessionVersion);
  const studentId = normalizeCode(rawId, 40);
  if (!/^[A-Z0-9._-]{4,40}$/.test(studentId)) {
    setQrVerificationStatus("El QR no contiene un identificador de alumno válido.");
    return false;
  }
  qrVerificationScanInFlight = true;
  if (options.captureMethod !== "file") await window.stopQrVerificationScanner();
  setQrVerificationStatus("QR detectado. Consultando alumno...");
  try {
    let student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === studentId);
    if (sessionVersion !== qrVerificationSessionVersion || byId("modal-verify-qr")?.classList.contains("hidden")) return false;
    if (!student) {
      const studentRef = doc(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`, studentId);
      const snapshot = await getDoc(studentRef);
      if (snapshot.exists()) student = {...snapshot.data(), id: snapshot.id};
    }
    if (!student) {
      showQrVerificationResult("Alumno no encontrado", "El código no corresponde a un alumno registrado en este plantel.");
      setQrVerificationStatus("Verificación fallida.");
      return false;
    }
    const level = normalizeSchoolLevel(student.level || student.nivel) || "SIN NIVEL";
    const group = normalizeGroupName(student.grupo) || "SIN GRUPO";
    const list = studentListNumber(student);
    const moved = isMovedStudent(student);
    const inactive = moved
      ? ` · ELIMINADO · MOVIDO A ${normalizeSchoolLevel(student.movedToLevel)} · GRUPO ${normalizeGroupName(student.movedToGroup)}`
      : isStudentInactive(student) ? " · BAJA" : "";
    showQrVerificationResult(
      studentDisplayName(student) || student.id,
      `${level} · Grupo ${group}${list ? ` · Lista ${String(list).padStart(2, "0")}` : ""}${inactive}`,
    );
    setQrVerificationStatus(moved
      ? "QR anterior identificado. Este lugar fue eliminado al corregir el grupo; use el QR nuevo del alumno."
      : isStudentInactive(student) ? "Alumno identificado, actualmente dado de baja." : "Alumno identificado.");
    return true;
  } catch (error) {
    if (sessionVersion !== qrVerificationSessionVersion) return false;
    showQrVerificationResult("No fue posible verificar el QR", functionError(error, "Revise su conexión e inténtelo nuevamente."));
    setQrVerificationStatus("Verificación fallida.");
    return false;
  } finally {
    qrVerificationScanInFlight = false;
  }
};

window.closeVerifyQrModal = async () => {
  qrVerificationSessionVersion += 1;
  if (qrScannerMode === "verification") await stopSharedQrScanner().catch(() => {});
  qrVerificationTorchEnabled = false;
  qrVerificationScanInFlight = false;
  window.safeToggle("modal-verify-qr", true);
  qrScannerMode = "attendance";
  placeSharedQrReader("qr-reader-home");
  resetQrVerificationResult();
  setQrVerificationStatus("Esperando QR...");
  updateQrVerificationCameraUi("idle");
};

window.toggleCamera = async () => {
  if (!isScannerRunning && loggedTeacher?.role === "docente" && !attendanceGroupReady(true)) return;
  const context = await unlockAudio();
  if (!context || context.state !== "running") {
    setScannerStatus("Toque nuevamente Encender cámara para habilitar el sonido.", "error");
    return;
  }
  return isScannerRunning ? window.stopScanner() : window.initScanner();
};

window.processAttendance = async (rawId, options = {}) => {
  if (!loggedTeacher) return false;
  const attendanceGroup = loggedTeacher.role === "docente" ? attendanceGroupReady(true) : null;
  if (loggedTeacher.role === "docente" && !attendanceGroup) return false;
  const studentId = normalizeCode(rawId, 40);
  if (!/^[A-Z0-9._-]{4,40}$/.test(studentId)) {
    setScannerStatus("Se detectó un QR, pero su contenido no es válido para un alumno.", "error");
    await playScanSound("error");
    return false;
  }
  const student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === studentId);
  const captureMethod = options.captureMethod === "manual" ? "manual" : "qr";
  const studentName = studentDisplayName(student) || studentId;
  if (loggedTeacher.role === "docente" && (!student || !studentMatchesSelectedAttendanceGroup(student))) {
    const selectedLabel = `${attendanceGroup.level} · Grupo ${attendanceGroup.group}`;
    setScannerStatus(`${studentName} no pertenece a ${selectedLabel}.`, "error");
    await playScanSound("error");
    return false;
  }
  if (attendanceInFlight.has(studentId)) return false;
  attendanceInFlight.add(studentId);
  setScannerStatus(`${captureMethod === "manual" ? "Alumno seleccionado" : "QR detectado"}: ${studentName}. Validando asistencia…`);
  await playScanSound("scan");
  try {
    const response = await api.recordAttendance({
      schoolKey,
      studentId,
      captureMethod,
      scheduleLevel: attendanceGroup?.level || "",
      scheduleGroup: attendanceGroup?.group || "",
    });
    if (response.data.created) {
      const attendanceState = normalizedAttendanceStatus(response.data.status);
      if (response.data.convertedToAbsence === true || attendanceState === "FALTA POR RETARDOS") {
        const limit = Number(response.data.tardyLimit || currentSchool?.tardiesPerAbsence || 0);
        const notice = `${studentName} alcanzó ${limit} ${limit === 1 ? "retardo" : "retardos"}. Se aplicó una FALTA POR RETARDOS, distinta de una falta normal.`;
        setScannerStatus(notice, "error");
        await playScanSound("error");
        window.showModalMsg("Falta por retardos", notice);
      } else {
        setScannerStatus(`Asistencia registrada: ${studentName} · ${response.data.hora} · ${attendanceState}`, "success");
        await playScanSound("success");
      }
      return true;
    } else {
      setScannerStatus(`${studentName} ya tenía asistencia hoy.`, "error");
      await playScanSound("error");
      return false;
    }
  } catch (error) {
    const message = functionError(error);
    setScannerStatus(`${studentName}: ${message}`, "error");
    await playScanSound("error");
    window.showModalMsg("Asistencia", message);
    return false;
  } finally {
    setTimeout(() => attendanceInFlight.delete(studentId), 2500);
  }
};

window.manualAttendance = async () => {
  if (loggedTeacher?.role === "docente" && !attendanceGroupReady(true)) return;
  const input = byId("input-manual-student-search");
  const value = normalizedStudentSearch(input?.value);
  if (!value) return;
  let student = studentCatalogCache.find((item) => normalizeCode(item.id, 40) === selectedManualStudentId && !isStudentInactive(item));
  if (!student) {
    const exactMatches = matchingManualStudents(value, studentCatalogCache.length)
      .filter((item) => normalizedStudentSearch(studentDisplayName(item)) === value);
    if (exactMatches.length === 1) student = exactMatches[0];
  }
  if (!student) {
    window.filterManualStudentSearch();
    return window.showModalMsg("Registro manual", "Seleccione un alumno de los resultados del buscador antes de registrar la asistencia.");
  }
  await unlockAudio();
  const created = await window.processAttendance(student.id, {captureMethod: "manual"});
  if (created) {
    selectedManualStudentId = "";
    if (input) input.value = "";
    if (byId("manual-student-selection")) byId("manual-student-selection").textContent = "Busque y seleccione un alumno.";
    hideManualStudentResults();
  }
};

window.processPasswordChange = async () => {
  const identityChangeRequired = loggedTeacher?.identityChangeRequired === true;
  const email = normalizeText(byId("input-new-user-email")?.value, 160).toLowerCase();
  const currentPassword = String(byId("input-current-password")?.value || "");
  const newPassword = String(byId("input-new-password")?.value || "");
  const confirmation = String(byId("input-confirm-password")?.value || "");
  if (identityChangeRequired && !/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
    return window.showModalMsg("Primer acceso", "Capture un correo personal o el correo de su cuenta de Google.");
  }
  if (!currentPassword) return window.showModalMsg("Contraseña", "Capture la contraseña temporal actual.");
  if (!validPassword(newPassword) || newPassword !== confirmation) return window.showModalMsg("Contraseña", "Las contraseñas nuevas deben coincidir, tener entre 8 y 72 caracteres e incluir letras y números.");
  const button = byId("btn-complete-first-access");
  if (button) button.disabled = true;
  try {
    const response = identityChangeRequired
      ? await api.completeTeacherOnboarding({email, currentPassword, newPassword})
      : await api.changeTeacherPassword({currentPassword, newPassword});
    loggedTeacher = response.data.teacher
      ? {...loggedTeacher, ...response.data.teacher}
      : {...loggedTeacher, passwordChangeRequired: false, identityChangeRequired: false};
    if (byId("input-new-user-email")) byId("input-new-user-email").value = "";
    byId("input-current-password").value = "";
    byId("input-new-password").value = "";
    byId("input-confirm-password").value = "";
    window.safeToggle("modal-change-password", true);
    await signInWithCustomToken(auth, response.data.token);
  } catch (error) {
    window.showModalMsg(identityChangeRequired ? "Primer acceso" : "Contraseña", functionError(error));
  } finally {
    if (button) button.disabled = false;
  }
};

function configureFirstAccessModal(identityChangeRequired) {
  window.safeToggle("identity-change-fields", !identityChangeRequired);
  if (byId("input-new-user-email")) byId("input-new-user-email").required = identityChangeRequired;
  if (byId("change-password-description")) {
    byId("change-password-description").textContent = identityChangeRequired
      ? "Sustituya el usuario temporal por su correo personal o cuenta de Google y cree una contraseña propia."
      : "La contraseña temporal debe cambiarse antes de continuar.";
  }
  if (byId("btn-complete-first-access")) {
    byId("btn-complete-first-access").textContent = identityChangeRequired
      ? "Guardar correo y contraseña"
      : "Cambiar contraseña e iniciar";
  }
}

function attendanceTimestamp(value) {
  return value?.toMillis?.() || 0;
}

function listenToAttendanceToday() {
  unsubscribeAttendance?.();
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(now);
  const visibleDate = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(now).toUpperCase();
  if (byId("attendance-date-label")) byId("attendance-date-label").textContent = visibleDate;
  const attendanceQuery = query(
    collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_asistencias`),
    where("fecha", "==", today),
  );
  unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
    const logs = snapshot.docs.map((entry) => entry.data()).sort((a, b) => attendanceTimestamp(b.timestamp) - attendanceTimestamp(a.timestamp));
    const tardyAbsences = logs.filter((log) => isTardyAbsence(log.status)).length;
    const attendances = logs.length - tardyAbsences;
    byId("scan-count").textContent = `${attendances} ${attendances === 1 ? "ASISTENCIA" : "ASISTENCIAS"}${tardyAbsences ? ` · ${tardyAbsences} ${tardyAbsences === 1 ? "FALTA POR RETARDOS" : "FALTAS POR RETARDOS"}` : ""}`;
    const list = byId("recent-logs");
    list.replaceChildren();
    for (const log of logs.slice(0, 10)) {
      const item = document.createElement("li");
      item.className = "p-4 flex justify-between items-center";
      const description = document.createElement("div");
      const name = document.createElement("p");
      name.className = "font-black uppercase";
      name.textContent = [log.apellido, log.materno, log.nombre].map((value) => normalizeText(value)).filter(Boolean).join(" ");
      const time = document.createElement("p");
      time.className = "text-xs text-slate-500";
      time.textContent = `Hora de registro: ${normalizeText(log.hora)} · ${log.captureMethod === "manual" ? "Manual" : "QR"} · ${normalizeText(log.profesorNombre) || "Sin responsable"}`;
      description.append(name, time);
      const state = document.createElement("span");
      const attendanceState = normalizedAttendanceStatus(log.status);
      state.className = `${attendanceState === "FALTA POR RETARDOS" ? "text-red-700" : attendanceState === "RETARDO" ? "text-amber-700" : "text-green-700"} font-black uppercase text-xs`;
      state.textContent = attendanceState;
      item.append(description, state);
      list.append(item);
    }
    if (!logs.length) {
      const empty = document.createElement("li");
      empty.className = "p-14 text-center text-slate-400 italic font-bold uppercase";
      empty.textContent = "Sin actividad";
      list.append(empty);
    }
  }, (error) => window.showModalMsg("Asistencias", functionError(error, "No fue posible actualizar la lista.")));
}

window.loadTeachers = loadTeachers;
window.loadStudents = loadStudents;
window.enterApp = enterApp;
window.switchTab = switchTab;
byId("move-student-level")?.addEventListener("change", window.populateMoveStudentGroupOptions);

onAuthStateChanged(auth, async (user) => {
  setConnection(true);
  if (!user) {
    window.safeToggle("section-gateway", false);
    return;
  }
  try {
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult.claims;
    if (!claims.role && claims.firebase?.sign_in_provider === "password") {
      window.safeToggle("section-gateway", false);
      return;
    }
    if (!claims.role) throw new Error("La sesión no contiene un rol autorizado.");
    if (claims.role === "super") {
      loggedTeacher = {id: "MASTER", nombre: normalizeText(claims.name || "SGE GLOBAL"), role: "super", passwordChangeRequired: false};
      schoolKey = "SISTEMA";
      schoolName = "SGE GLOBAL";
      await enterApp();
      return;
    }
    schoolKey = normalizeCode(claims.schoolKey, 40);
    const teacherId = normalizeCode(claims.teacherId, 160);
    if (claims.passwordChangeRequired === true) {
      loggedTeacher = {id: teacherId, nombre: normalizeText(claims.name || teacherId), role: claims.role, passwordChangeRequired: true, identityChangeRequired: claims.identityChangeRequired === true};
      window.safeToggle("section-gateway", true);
      configureFirstAccessModal(loggedTeacher.identityChangeRequired);
      window.safeToggle("modal-change-password", false);
      (loggedTeacher.identityChangeRequired ? byId("input-new-user-email") : byId("input-current-password"))?.focus();
      return;
    }
    const [schoolSnapshot, teacherSnapshot] = await Promise.all([
      getDoc(doc(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios", schoolKey)),
      getDoc(doc(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_maestros`, teacherId)),
    ]);
    if (!schoolSnapshot.exists() || !teacherSnapshot.exists()) throw new Error("La escuela o el usuario ya no existen.");
    currentSchool = {...schoolSnapshot.data(), id: schoolKey};
    schoolName = normalizeText(currentSchool.name || schoolKey);
    loggedTeacher = {...teacherSnapshot.data(), id: teacherId, nombre: normalizeText(claims.name || teacherSnapshot.get("nombre")), role: claims.role};
    window.applySchoolBranding(currentSchool);
    await enterApp();
  } catch (error) {
    await signOut(auth).catch(() => {});
    window.showModalMsg("Sesión", functionError(error, "La sesión no es válida. Inicie nuevamente."));
  }
});

window.addEventListener("online", () => setConnection(true));
window.addEventListener("offline", () => setConnection(false));
setConnection(navigator.onLine, navigator.onLine ? "Conectado" : "Sin conexión");
