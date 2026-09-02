"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const cameraScanner = fs.readFileSync(path.join(projectRoot, "camera-data-scanner.js"), "utf8");
const functions = fs.readFileSync(path.join(projectRoot, "functions", "index.js"), "utf8");

test("el acceso maestro queda oculto en la etiqueta de versión", () => {
  assert.match(html, /id="btn-super-access"[^>]+switchToStep\('step-super-login'\)/);
  assert.doesNotMatch(html, />Acceso maestro<\/button>/i);
});

test("un administrador puede preparar el logotipo antes de activar Premium", () => {
  assert.match(html, /id="branding-logo-editor"/);
  assert.match(app, /profile\.pendingLogoDataUrl = pendingLogoDataUrl/);
  assert.match(functions, /profile\.pendingLogoDataUrl = pendingLogoDataUrl/);
  assert.match(functions, /updates\.logoDataUrl = preparedLogo/);
  assert.match(functions, /updates\.pendingLogoDataUrl = FieldValue\.delete\(\)/);
});

test("el historial global usa almacenamiento privado y lectura exclusiva del superusuario", () => {
  assert.match(functions, /privateDataRef\(\)\.collection\("audit_logs"\)/);
  assert.match(functions, /exports\.listAuditLogs = onCall/);
  assert.match(functions, /token\.role !== "super"/);
  assert.match(functions, /exports\.recordAuditEvent = onCall/);
  assert.match(html, /id="audit-history-body"/);
  assert.match(app, /window\.loadAuditHistory = async/);
});

test("las impresiones y eliminaciones sensibles generan eventos auditables", () => {
  for (const action of [
    "print_group_roster",
    "print_student_qr",
    "print_attendance_report",
    "teacher_deleted",
    "student_disabled",
    "students_cleared",
    "attendance_cleared",
    "school_deleted",
  ]) {
    assert.match(`${app}\n${functions}`, new RegExp(`"${action}"`), `falta auditar ${action}`);
  }
});

test("el localizador QR reutiliza el mismo lector del pase de lista y consulta alumnos reales", () => {
  assert.match(html, /id="modal-verify-qr"/);
  assert.match(html, /id="qr-reader-home"/);
  assert.match(html, /id="qr-verification-reader"/);
  assert.match(html, /id="qr-verification-file"[^>]+accept="image\/\*"[^>]+capture="environment"/);
  assert.doesNotMatch(html, /window\.allStudents|STUDENT-1001|findStudentByQrContent/);
  assert.match(app, /window\.initQrVerificationScanner = async/);
  assert.equal((app.match(/createCameraDataScanner\(/g) || []).length, 1);
  assert.match(app, /elementId: "qr-reader"/);
  assert.match(app, /startSharedQrScanner\("attendance"\)/);
  assert.match(app, /startSharedQrScanner\("verification",/);
  assert.match(app, /placeSharedQrReader\("qr-verification-reader"\)/);
  assert.match(app, /placeSharedQrReader\("qr-reader-home"\)/);
  assert.doesNotMatch(app, /elementId: "qr-verification-reader"/);
  assert.match(app, /window\.processQrVerification = async/);
  assert.match(app, /getDoc\(studentRef\)/);
  assert.match(app, /\$\{schoolKey\}_alumnos/);
  assert.match(app, /window\.closeVerifyQrModal = async/);
  for (const method of ["start", "stop", "toggle", "listCameras", "switchCamera", "setTorch", "scanImage", "destroy"]) {
    assert.match(cameraScanner, new RegExp(`\\b${method}\\b`), `falta el método ${method} del adaptador`);
  }
  assert.match(cameraScanner, /captureMethod,/);
  assert.match(cameraScanner, /capturedAt: new Date\(now\)\.toISOString\(\)/);
});

test("el reporte de asistencia agrega el total único del periodo al final de cada fila", () => {
  assert.match(app, /function attendanceCountsByStudent\(report\)/);
  assert.match(app, /recordedAttendances\.has\(key\)/);
  assert.match(app, /totalHeading\.textContent = "Total asist\."/);
  assert.match(app, /attendanceCounts\.get\(normalizeCode\(student\.id, 40\)\) \|\| 0/);
  assert.match(app, /ATTENDANCE_PRINT_DATES_PER_PAGE = 20/);
  assert.match(app, /dates\.slice\(index, index \+ ATTENDANCE_PRINT_DATES_PER_PAGE\)/);
  assert.match(html, /\.attendance-total-cell/);
  assert.match(html, /display: table-cell !important/);
  assert.match(html, /position: sticky; right: 0/);
});
