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
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const functions = getFunctions(firebaseApp, "us-central1");

const api = Object.fromEntries([
  "lookupSchool",
  "requestSchoolRegistration",
  "createSchool",
  "loginTeacher",
  "listTeachers",
  "createTeacher",
  "repairTeacherAccount",
  "changeTeacherPassword",
  "updateSchool",
  "updateTeacherRole",
  "approveTeacher",
  "deleteTeacher",
  "recordAttendance",
  "deleteStudent",
  "renumberStudentGroup",
  "clearStudents",
  "toggleSchoolFlag",
  "setSchoolVerification",
  "correctSchoolCct",
  "deleteSchool",
].map((name) => [name, httpsCallable(functions, name)]));

let schoolKey = "";
let schoolName = "";
let currentSchool = null;
let loggedTeacher = null;
let accessChallenge = "";
let html5QrScanner = null;
let isScannerRunning = false;
let isScannerTransitioning = false;
let unsubscribeAttendance = null;
let modalPreviousFocus = null;
let teacherBeingRepaired = "";
const attendanceInFlight = new Set();

const byId = (id) => document.getElementById(id);
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
const validPassword = (value) => String(value || "").length >= 8 && String(value || "").length <= 72 && /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(String(value)) && /\d/.test(String(value));
const isAdmin = () => ["admin_maestro", "admin_jr", "super"].includes(loggedTeacher?.role);
const isMaster = () => ["admin_maestro", "super"].includes(loggedTeacher?.role);

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
  support.onclick = () => {
    const subject = encodeURIComponent(`Soporte CCT: ${schoolKey}`);
    window.location.href = `mailto:profetono102@gmail.com?subject=${subject}`;
  };
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
  const color = data.allowBranding && /^#[0-9a-f]{6}$/i.test(String(data.brandColor || ""))
    ? data.brandColor
    : DEFAULT_ACCENT;
  document.documentElement.style.setProperty("--accent-color", color);
  if (typeof data.name === "string") {
    if (byId("header-school-name")) byId("header-school-name").textContent = data.name;
    if (byId("login-logo-placeholder")) byId("login-logo-placeholder").setAttribute("aria-label", `Identidad de ${data.name}`);
  }
};

window.resetGateway = () => {
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
    "super-email",
    "super-password",
    "register-school-name",
    "register-director-name",
    "register-admin-name",
    "register-admin-id",
    "register-admin-password",
    "register-admin-password-confirm",
    "input-current-password",
    "input-new-password",
    "input-confirm-password",
  ]
    .forEach((id) => { if (byId(id)) byId(id).value = ""; });
  window.switchToStep("step-school-key");
};

window.logout = async () => {
  unsubscribeAttendance?.();
  unsubscribeAttendance = null;
  if (isScannerRunning) await window.stopScanner();
  loggedTeacher = null;
  attendanceInFlight.clear();
  document.querySelectorAll("header, main").forEach((element) => element.classList.add("hidden"));
  window.safeToggle("modal-change-password", true);
  window.safeToggle("section-gateway", false);
  window.resetGateway();
  await signOut(auth).catch(() => {});
};

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

async function loadTeachers() {
  const body = byId("teacher-table-body");
  if (!body || !schoolKey || !isAdmin()) return;
  try {
    const response = await api.listTeachers({schoolKey});
    const teachers = response.data.teachers
      .filter((teacher) => teacher.id !== "DIR")
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
        for (const [value, label] of [["docente", "DOC"], ["admin_jr", "JR"], ["admin_maestro", "MASTER"]]) {
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
      const canManageTarget = isMaster() || teacher.role === "docente" || !teacher.role;
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

function configureTeacherCreationForm() {
  const roleSelect = byId("new-teacher-role");
  if (!roleSelect) return;
  const canAssignAdministrativeRoles = isMaster();
  for (const option of roleSelect.options) {
    option.disabled = !canAssignAdministrativeRoles && option.value !== "docente";
  }
  if (!canAssignAdministrativeRoles) roleSelect.value = "docente";
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

function assignDisplayListNumbers(students) {
  return [...students].sort(compareStudentsByName).map((student, index) => ({
    ...student,
    displayListNumber: String(index + 1).padStart(2, "0"),
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
  [...students].sort(compareStudentsByName).forEach((student) => {
    const row = document.createElement("tr");
    for (const value of [student.displayListNumber || "", studentDisplayName(student)]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
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
  grid.className = `student-qr-grid${students.length === 1 ? " student-qr-single" : ""}`;
  const qrTargets = [];
  for (const student of [...students].sort(compareStudentsByName)) {
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
        width: 180,
        height: 180,
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
  for (const student of [...students].sort(compareStudentsByName)) {
    const row = document.createElement("tr");
    row.append(createCell(student.displayListNumber || "", "p-3 font-black text-center"));
    const fullName = studentDisplayName(student);
    row.append(createCell(fullName, "text-left px-2"));
    const qrCell = document.createElement("td");
    qrCell.className = "text-center";
    qrCell.append(createIconButton(
      `Imprimir QR de ${fullName}`,
      "fas fa-qrcode",
      () => printStudentQrs(levelLabel, groupLabel, [student]),
      "theme-accent-text p-2 rounded-lg hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500",
    ));
    row.append(qrCell);
    const actionCell = document.createElement("td");
    actionCell.className = "text-center";
    actionCell.append(createIconButton(
      `Eliminar a ${fullName}`,
      "fas fa-trash",
      () => window.deleteStudent(student.id, student.level || student.nivel, student.grupo),
    ));
    row.append(actionCell);
    body.append(row);
  }
  table.append(caption, head, body);
  wrapper.append(table);
  return wrapper;
}

function createGroupView(level, levelLabel, group, groupLabel, students) {
  const numberedStudents = assignDisplayListNumbers(students);
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
  count.textContent = `${numberedStudents.length} ${numberedStudents.length === 1 ? "alumno" : "alumnos"}`;
  title.append(heading, count);
  const actions = document.createElement("div");
  actions.className = "flex flex-wrap justify-center gap-2";
  actions.append(
    createPrintActionButton("Imprimir lista", "fas fa-print", () => printGroupRoster(levelLabel, groupLabel, numberedStudents)),
    createPrintActionButton("Imprimir QR", "fas fa-qrcode", () => printStudentQrs(levelLabel, groupLabel, numberedStudents), true),
  );
  toolbar.append(title, actions);
  view.append(toolbar, createStudentTable(levelLabel, groupLabel, numberedStudents));
  return view;
}

async function loadStudents() {
  const container = byId("student-levels-container");
  if (!container || !schoolKey || schoolKey === "SISTEMA") return;
  const preserveSelection = container.dataset.schoolKey === schoolKey;
  const previousLevel = preserveSelection ? container.dataset.selectedLevel || "" : "";
  const previousGroup = preserveSelection ? container.dataset.selectedGroup || "" : "";
  container.replaceChildren();
  container.dataset.schoolKey = schoolKey;
  try {
    const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
    const students = snapshot.docs.map((entry) => ({...entry.data(), id: entry.id}));
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

async function enterApp() {
  if (!loggedTeacher) return;
  window.safeToggle("section-gateway", true);
  window.safeToggle("main-header", false);
  window.safeToggle("main-content", false);
  byId("header-school-name").textContent = schoolName;
  byId("user-display-name").textContent = loggedTeacher.nombre;
  byId("user-display-role").textContent = String(loggedTeacher.role || "docente").replace("_", " ");
  const superUser = loggedTeacher.role === "super";
  window.safeToggle("tab-admin", !isAdmin());
  window.safeToggle("tab-super", !superUser);
  window.safeToggle("tab-scanner", superUser);
  window.safeToggle("maint-cat-institucion", !isMaster());
  if (superUser) await window.switchTab("global");
  else {
    await loadStudents();
    listenToAttendanceToday();
    await window.switchTab("scanner");
  }
}

async function switchTab(tab) {
  const allowed = new Set(["scanner", "admin", "global"]);
  if (!allowed.has(tab)) return;
  if (tab === "admin" && !isAdmin()) return window.showModalMsg("Acceso", "No tiene permisos de administración.");
  if (tab === "global" && loggedTeacher?.role !== "super") return window.showModalMsg("Acceso", "Esta sección requiere el rol maestro global.");
  window.safeToggle("section-scanner", tab !== "scanner");
  window.safeToggle("section-admin", tab !== "admin");
  window.safeToggle("section-global", tab !== "global");
  if (tab === "scanner") await window.initScanner();
  else if (isScannerRunning) await window.stopScanner();
  if (tab === "admin" && loggedTeacher.role === "super") {
    window.safeToggle("super-school-selector", false);
    window.safeToggle("school-management-cards", true);
    await window.loadSchoolsForSelection();
  } else if (tab === "admin") {
    window.safeToggle("super-school-selector", true);
    window.safeToggle("school-management-cards", false);
  }
  if (tab === "global") await window.loadAllSchools();
}

window.loadSchoolsForSelection = async () => {
  if (loggedTeacher?.role !== "super") return;
  const list = byId("school-selection-list");
  list.replaceChildren();
  try {
    const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios"));
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

window.explainTeacherRecovery = () => window.showModalMsg(
  "Recuperar contraseña",
  "Solicite al administrador del plantel una contraseña temporal nueva. Desde Personal puede elegir el botón de llave de su cuenta y restablecerla.",
);

window.claimSchoolCct = () => {
  if (!schoolKey) return window.showModalMsg("Reclamar CCT", "Primero capture y valide la CCT que desea reclamar.");
  const subject = encodeURIComponent(`Reclamación de CCT ${schoolKey}`);
  const body = encodeURIComponent(
    `Solicito revisar la titularidad de la CCT ${schoolKey} (${schoolName || "plantel registrado"}).\n\n` +
    "Motivo de la reclamación:\n\n" +
    "Nombre completo del solicitante:\nCargo:\nTeléfono:\n\n" +
    "Adjuntaré documentos probatorios de la CCT, nombramiento o representación del plantel e identificación oficial. Entiendo que Cumorahnet deliberará la disputa antes de modificar accesos o datos.",
  );
  window.location.href = `mailto:cumorahnet@gmail.com?subject=${subject}&body=${body}`;
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

window.attemptLogin = async () => {
  const teacherId = normalizeCode(byId("input-login-id")?.value, 160);
  const password = String(byId("input-login-password")?.value || "");
  if (!teacherId || !password) return window.showModalMsg("Acceso", "Capture su usuario y contraseña.");
  try {
    const response = await api.loginTeacher({schoolKey, teacherId, password});
    byId("input-login-password").value = "";
    await signInWithCustomToken(auth, response.data.token);
  } catch (error) {
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
  if (!new Set(["alumnos", "maestros", "institucion"]).has(category)) return;
  if (category === "institucion" && !isMaster()) return window.showModalMsg("Acceso", "Los ajustes institucionales requieren un administrador maestro.");
  ["alumnos", "maestros", "institucion"].forEach((name) => {
    window.safeToggle(`div-mantenimiento-${name}`, name !== category);
    byId(`maint-cat-${name}`)?.classList.toggle("cat-active", name === category);
  });
  window.safeToggle("general-table-container", category !== "alumnos");
  if (category === "alumnos") return loadStudents();
  if (category === "maestros") {
    configureTeacherCreationForm();
    return loadTeachers();
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
    "display-school-cct-readonly": schoolKey,
    "edit-school-contact-email": data.contactEmail,
  };
  for (const [id, value] of Object.entries(fields)) if (byId(id)) byId(id).value = value ?? "";
  window.safeToggle("premium-badge-local", data.isPremium !== true);
  window.safeToggle("invite-branding-panel", data.allowBranding === true);
  window.safeToggle("super-cct-correction-panel", loggedTeacher?.role !== "super");
  if (byId("correct-school-cct")) byId("correct-school-cct").value = "";
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
    contactEmail: byId("edit-school-contact-email")?.value || "",
  };
  try {
    await api.updateSchool({schoolKey, profile});
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

function studentIdentityHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, "0");
}

function buildImportedStudentId(level, group, student, usedIds) {
  const prefix = `${normalizeSchoolLevel(level)}${normalizeGroupName(group).replace(/[^A-Z0-9]/g, "")}`;
  const base = `${prefix}-${studentIdentityHash(studentIdentityKey(student))}`.slice(0, 40);
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    const ending = `-${suffix}`;
    id = `${base.slice(0, 40 - ending.length)}${ending}`;
    suffix += 1;
  }
  return id;
}

async function existingStudentIdentityIndex(level, group) {
  const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
  const usedIds = new Set(snapshot.docs.map((entry) => entry.id));
  const idsByIdentity = new Map();
  for (const entry of snapshot.docs) {
    const student = entry.data();
    if (normalizeSchoolLevel(student.level || student.nivel) !== level || normalizeGroupName(student.grupo) !== group) continue;
    const key = studentIdentityKey(student);
    idsByIdentity.set(key, [...(idsByIdentity.get(key) || []), entry.id]);
  }
  for (const ids of idsByIdentity.values()) ids.sort((a, b) => a.localeCompare(b, "es", {numeric: true}));
  return {idsByIdentity, usedIds};
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
    const {idsByIdentity, usedIds} = await existingStudentIdentityIndex(level, group);
    const students = [];
    parsedStudents.forEach((parsedStudent, index) => {
      const identity = studentIdentityKey(parsedStudent);
      const existingIds = idsByIdentity.get(identity) || [];
      const id = existingIds.shift() || buildImportedStudentId(level, group, parsedStudent, usedIds);
      usedIds.add(id);
      const list = String(index + 1).padStart(2, "0");
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
  if (!isAdmin()) return;
  const level = normalizeSchoolLevel(byId("input-a-nivel").value);
  const group = normalizeGroupName(byId("input-a-grupo").value, 12);
  const paterno = normalizeText(byId("input-a-paterno").value, 80).toUpperCase();
  const materno = normalizeText(byId("input-a-materno").value, 80).toUpperCase();
  const names = normalizeText(byId("input-a-nombres").value, 100).toUpperCase();
  if (!level || !group || !paterno || !names) {
    return window.showModalMsg("Datos", "Capture nivel, grupo, apellido paterno y nombre(s).");
  }
  try {
    const groupSnapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`));
    const groupStudents = groupSnapshot.docs
      .map((entry) => entry.data())
      .filter((student) => normalizeSchoolLevel(student.level || student.nivel) === level && normalizeGroupName(student.grupo) === group);
    if (groupStudents.length >= 99) return window.showModalMsg("Datos", "Un grupo no puede contener más de 99 alumnos.");
    const usedIds = new Set(groupSnapshot.docs.map((entry) => entry.id));
    let listNumber = groupStudents.length + 1;
    let list = String(listNumber).padStart(2, "0");
    let id = buildStudentId(level, group, list, {paterno, nombres: names});
    while (usedIds.has(id) && listNumber < 99) {
      listNumber += 1;
      list = String(listNumber).padStart(2, "0");
      id = buildStudentId(level, group, list, {paterno, nombres: names});
    }
    if (usedIds.has(id)) return window.showModalMsg("Datos", "No hay un número de lista disponible para este grupo.");
    const ref = doc(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_alumnos`, id);
    await setDoc(ref, {
      paterno,
      materno,
      nombres: names,
      grupo: group,
      lista: list,
      level,
      createdAt: serverTimestamp(),
    });
    ["input-a-paterno", "input-a-materno", "input-a-nombres", "input-a-grupo", "input-a-nivel"].forEach((field) => { byId(field).value = ""; });
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
  }
};
window.clearAllStudents = () => window.showConfirmMsg("Limpieza", "¿Borrar todo el catálogo de alumnos? Esta acción no se puede deshacer.", async () => {
  await api.clearStudents({schoolKey});
  await loadStudents();
});

window.deleteStudent = (id, rawLevel = "", rawGroup = "") => window.showConfirmMsg(
  "Eliminar",
  `¿Eliminar al alumno ${id}? El grupo se renumerará y deberán imprimirse nuevamente sus QR.`,
  async () => {
    const level = normalizeSchoolLevel(rawLevel);
    const group = normalizeGroupName(rawGroup, 12);
    await api.deleteStudent({schoolKey, studentId: id});
    if (level && group) {
      try {
        await api.renumberStudentGroup({schoolKey, level, group});
      } catch (error) {
        if (!String(error?.code || "").includes("not-found")) throw error;
      }
    }
    await loadStudents();
  },
);

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

window.createTeacher = async () => {
  if (!isAdmin() || !schoolKey || schoolKey === "SISTEMA") {
    return window.showModalMsg("Alta de personal", "Seleccione primero el plantel que desea administrar.");
  }
  const name = normalizeText(byId("new-teacher-name")?.value, 100).toUpperCase();
  const teacherId = normalizeCode(byId("new-teacher-id")?.value, 40);
  const role = String(byId("new-teacher-role")?.value || "docente");
  const temporaryPassword = String(byId("new-teacher-password")?.value || "");
  if (name.length < 5) return window.showModalMsg("Alta de personal", "Capture el nombre completo del docente.");
  if (!/^[A-Z0-9._-]{4,40}$/.test(teacherId)) {
    return window.showModalMsg("Alta de personal", "El usuario debe tener entre 4 y 40 caracteres alfanuméricos.");
  }
  if (!validPassword(temporaryPassword)) return window.showModalMsg("Alta de personal", "La contraseña temporal debe tener entre 8 y 72 caracteres e incluir letras y números.");

  const button = byId("btn-create-teacher");
  const originalLabel = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Guardando…";
  }
  try {
    await api.createTeacher({schoolKey, name, teacherId, role, temporaryPassword});
    byId("new-teacher-name").value = "";
    byId("new-teacher-id").value = "";
    byId("new-teacher-password").value = "";
    byId("new-teacher-role").value = "docente";
    await loadTeachers();
    window.showModalMsg(
      "Cuenta creada",
      `La cuenta ${teacherId} fue creada. Entregue la contraseña temporal de forma privada; deberá cambiarla en el primer acceso.`,
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
  teacherBeingRepaired = normalizeCode(teacherId, 40);
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
    await window.loadAllSchools();
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

window.loadAllSchools = async () => {
  if (loggedTeacher?.role !== "super") return;
  const body = byId("global-schools-body");
  body.replaceChildren();
  try {
    const snapshot = await getDocs(collection(db, "artifacts", APP_ROOT_PATH, "public", "data", "colegios"));
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
        button.className = `px-3 py-2 rounded-lg font-black ${school[field] ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`;
        button.textContent = school[field] ? "SÍ" : "NO";
        button.setAttribute("aria-label", `${field === "isPremium" ? "Publicidad desactivada" : "Identidad visual"} para ${normalizeText(school.name)}: ${button.textContent}`);
        button.addEventListener("click", () => window.togglePremiumMaster(entry.id, field, school[field] === true));
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
    await window.loadAllSchools();
  });
};

window.togglePremiumMaster = async (id, field, current) => {
  try {
    await api.toggleSchoolFlag({schoolKey: id, field, value: !current});
    await window.loadAllSchools();
  } catch (error) {
    window.showModalMsg("Error", functionError(error));
  }
};

window.deleteSchoolGlobal = (id) => window.showConfirmMsg("Eliminar escuela", `¿Borrar permanentemente ${id}, incluyendo alumnos, docentes y asistencias?`, async () => {
  await api.deleteSchool({schoolKey: id});
  await window.loadAllSchools();
});

window.initScanner = async () => {
  if (isScannerTransitioning || isScannerRunning || !loggedTeacher) return;
  isScannerTransitioning = true;
  try {
    if (!html5QrScanner) html5QrScanner = new Html5Qrcode("qr-reader");
    await html5QrScanner.start({facingMode: "environment"}, {fps: 8, qrbox: 250}, (text) => window.processAttendance(text));
    isScannerRunning = true;
    byId("btn-camera").textContent = "Apagar cámara";
    byId("btn-camera").setAttribute("aria-pressed", "true");
  } catch (error) {
    byId("btn-camera").textContent = "Encender cámara";
    window.showModalMsg("Cámara", "No se pudo iniciar la cámara. Revise el permiso del navegador o use la captura manual.");
  } finally {
    isScannerTransitioning = false;
  }
};

window.stopScanner = async () => {
  if (isScannerTransitioning || !isScannerRunning || !html5QrScanner) return;
  isScannerTransitioning = true;
  try {
    await html5QrScanner.stop();
    isScannerRunning = false;
    byId("btn-camera").textContent = "Encender cámara";
    byId("btn-camera").setAttribute("aria-pressed", "false");
  } finally {
    isScannerTransitioning = false;
  }
};

window.toggleCamera = () => isScannerRunning ? window.stopScanner() : window.initScanner();

window.processAttendance = async (rawId) => {
  if (!loggedTeacher) return;
  const studentId = normalizeCode(rawId, 40);
  if (!/^[A-Z0-9._-]{4,40}$/.test(studentId) || attendanceInFlight.has(studentId)) return;
  attendanceInFlight.add(studentId);
  try {
    const response = await api.recordAttendance({schoolKey, studentId});
    const status = byId("scanner-status");
    if (status) status.textContent = response.data.created ? `Asistencia registrada: ${studentId}` : `El alumno ${studentId} ya tenía asistencia hoy.`;
  } catch (error) {
    window.showModalMsg("Asistencia", functionError(error));
  } finally {
    setTimeout(() => attendanceInFlight.delete(studentId), 2500);
  }
};

window.manualAttendance = () => {
  const input = byId("input-manual-id");
  const value = input?.value;
  if (!value) return;
  input.value = "";
  window.processAttendance(value);
};

window.processPasswordChange = async () => {
  const currentPassword = String(byId("input-current-password")?.value || "");
  const newPassword = String(byId("input-new-password")?.value || "");
  const confirmation = String(byId("input-confirm-password")?.value || "");
  if (!currentPassword) return window.showModalMsg("Contraseña", "Capture la contraseña temporal actual.");
  if (!validPassword(newPassword) || newPassword !== confirmation) return window.showModalMsg("Contraseña", "Las contraseñas nuevas deben coincidir, tener entre 8 y 72 caracteres e incluir letras y números.");
  try {
    const response = await api.changeTeacherPassword({currentPassword, newPassword});
    loggedTeacher.passwordChangeRequired = false;
    byId("input-current-password").value = "";
    byId("input-new-password").value = "";
    byId("input-confirm-password").value = "";
    window.safeToggle("modal-change-password", true);
    await signInWithCustomToken(auth, response.data.token);
  } catch (error) {
    window.showModalMsg("Contraseña", functionError(error));
  }
};

function attendanceTimestamp(value) {
  return value?.toMillis?.() || 0;
}

function listenToAttendanceToday() {
  unsubscribeAttendance?.();
  const today = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(new Date());
  const attendanceQuery = query(
    collection(db, "artifacts", APP_ROOT_PATH, "public", "data", `${schoolKey}_asistencias`),
    where("fecha", "==", today),
  );
  unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
    const logs = snapshot.docs.map((entry) => entry.data()).sort((a, b) => attendanceTimestamp(b.timestamp) - attendanceTimestamp(a.timestamp));
    byId("scan-count").textContent = `${logs.length} HOY`;
    const list = byId("recent-logs");
    list.replaceChildren();
    for (const log of logs.slice(0, 10)) {
      const item = document.createElement("li");
      item.className = "p-4 flex justify-between items-center";
      const description = document.createElement("div");
      const name = document.createElement("p");
      name.className = "font-black uppercase";
      name.textContent = [log.nombre, log.apellido].map((value) => normalizeText(value)).filter(Boolean).join(" ");
      const time = document.createElement("p");
      time.className = "text-xs text-slate-500";
      time.textContent = normalizeText(log.hora);
      description.append(name, time);
      const state = document.createElement("span");
      state.className = "text-green-600 font-black uppercase text-xs";
      state.textContent = "Presente";
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

onAuthStateChanged(auth, async (user) => {
  setConnection(true);
  if (!user) {
    window.safeToggle("section-gateway", false);
    return;
  }
  try {
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult.claims;
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
      loggedTeacher = {id: teacherId, nombre: normalizeText(claims.name || teacherId), role: claims.role, passwordChangeRequired: true};
      window.safeToggle("section-gateway", true);
      window.safeToggle("modal-change-password", false);
      byId("input-current-password")?.focus();
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
