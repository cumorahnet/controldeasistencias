"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const cameraScanner = fs.readFileSync(path.join(projectRoot, "camera-data-scanner.js"), "utf8");
const attendanceExport = fs.readFileSync(path.join(projectRoot, "attendance-report-export.js"), "utf8");
const functions = fs.readFileSync(path.join(projectRoot, "functions", "index.js"), "utf8");
const {createAttendanceExportData} = new Function(`${attendanceExport.replace(/\bexport\s+/g, "")}\nreturn {createAttendanceExportData};`)();

test("el menú permite consultar el calendario escolar oficial de la SEP", () => {
  assert.match(html, /id="btn-school-calendar"[^>]+openSchoolCalendar/);
  assert.match(html, /id="modal-school-calendar"[^>]+role="dialog"/);
  assert.match(html, /id="school-calendar-image"[^>]+data-src="https:\/\/www\.planeacion\.sep\.gob\.mx\/Styles\/imagenes\/calendario\/Calendario\.png"/);
  assert.match(html, /href="https:\/\/calendarioescolar\.sep\.gob\.mx\/"[^>]+target="_blank"[^>]+rel="noopener noreferrer"/);
  assert.match(app, /window\.openSchoolCalendar = \(\) =>/);
  assert.match(app, /window\.closeSchoolCalendar = \(\) =>/);
});

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
    "student_moved",
    "student_group_deleted",
    "students_cleared",
    "attendance_cleared",
    "school_deleted",
  ]) {
    assert.match(`${app}\n${functions}`, new RegExp(`"${action}"`), `falta auditar ${action}`);
  }
});

test("los retardos pueden convertirse en una falta diferenciada", () => {
  assert.match(html, /id="edit-tardies-per-absence"[^>]+min="0"[^>]+max="30"/);
  assert.match(app, /tardiesPerAbsence: byId\("edit-tardies-per-absence"\)/);
  assert.match(functions, /applyTardyPolicy\(/);
  assert.match(functions, /status: policy\.status/);
  assert.match(app, /FALTA POR RETARDOS/);
  assert.match(app, /R Falta por retardos/);
  assert.match(app, /\/ Falta normal/);
  assert.match(attendanceExport, /return "FALTA NORMAL"/);
  assert.match(attendanceExport, /!\/\^FALTA\\b\/i\.test\(label\)/);
});

test("el XLS no suma las faltas por retardos como asistencias", () => {
  const exported = createAttendanceExportData({
    report: {
      from: "2026-09-01",
      to: "2026-09-03",
      groups: [],
      students: [{id: "ALUMNO1", name: "ALUMNO DE PRUEBA"}],
      dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
      rows: [
        {studentId: "ALUMNO1", date: "2026-09-01", status: "RETARDO"},
        {studentId: "ALUMNO1", date: "2026-09-02", status: "FALTA POR RETARDOS"},
      ],
    },
    attendanceLabel: (attendance) => attendance.status,
  });
  assert.deepEqual(exported.rows.at(-1).slice(1), ["RETARDO", "FALTA POR RETARDOS", "FALTA NORMAL", 1]);
});

test("la falta justificada se muestra como J y no suma como asistencia", () => {
  assert.match(html, /id="modal-justify-absence"/);
  assert.match(html, /window\.justifySelectedAbsence\(\{studentId, date\}\)/);
  assert.match(app, /api\.justifyAttendance\(\{schoolKey, studentId: student\.id, date\}\)/);
  assert.match(app, /const mark = justified \? "J"/);
  assert.match(app, /isJustifiedAbsence\(attendance\)/);
  assert.match(functions, /exports\.justifyAttendance = onCall/);
  assert.match(functions, /status: "FALTA JUSTIFICADA"/);
  assert.match(functions, /justified: true/);
  assert.match(functions, /FALTA JUSTIFICADA/);
});

test("el administrador corrige el grupo sin reutilizar el lugar ni el QR anterior", () => {
  assert.match(html, /id="modal-move-student"/);
  assert.match(html, /<select id="move-student-group"/);
  assert.doesNotMatch(html, /<input id="move-student-group"/);
  assert.match(html, /No se reordenará ni se cambiará el QR de ningún otro alumno/);
  assert.match(app, /window\.openMoveStudentModal/);
  assert.match(app, /function moveStudentDestinationGroups/);
  assert.match(app, /moveStudentDestinationGroups\(level, student\)\.includes\(group\)/);
  assert.match(app, /return `\$\{name\} — MOVIDO \/ ELIMINADO/);
  assert.doesNotMatch(app, /movedBadge/);
  assert.doesNotMatch(app, /label\.textContent = "MOVIDO"/);
  assert.match(app, /if \(moved\) row\.className = "bg-red-50\/80"/);
  assert.match(app, /actionSelect\.add\(new Option\("Mover de grupo", "move"\)\)/);
  assert.match(app, /actionSelect\.add\(new Option\("Dar de baja", "disable"\)\)/);
  assert.match(app, /window\.handleStudentAction/);
  assert.doesNotMatch(app, /state\.textContent = moved \? "MOVIDO \/ ELIMINADO" : inactive \? "BAJA" : "ACTIVO"/);
  assert.match(app, /El alumno permanece activo en su grupo de origen/);
  assert.match(app, /api\.moveStudent\(/);
  assert.match(functions, /exports\.moveStudent = onCall/);
  assert.match(functions, /El grupo destino ya no existe/);
  assert.match(functions, /status: "moved"/);
  assert.match(functions, /movedToStudentId: newStudentId/);
  assert.match(functions, /const listNumber = lastListNumber \+ 1/);
  assert.match(app, /function assignDisplayListNumbers\(students\) \{[\s\S]*?sort\(compareStudentsByList\)/);
  assert.match(app, /for \(const student of \[\.\.\.students\]\.sort\(compareStudentsByList\)\)/);
  assert.match(functions, /previousStudentIds/);
  assert.match(functions, /newId: student\.id/);
});

test("el borrado irreversible de un grupo requiere desbloqueo y elimina todos sus alumnos", () => {
  assert.match(html, /id="modal-delete-student-group"/);
  assert.match(html, /fa-lock/);
  assert.match(html, /id="btn-confirm-delete-student-group"[^>]+disabled/);
  assert.match(html, /Los datos y sus códigos QR no podrán recuperarse/);
  assert.match(app, /deleteStudentGroupPhrase/);
  assert.match(app, /button\.disabled = captured !== expected/);
  assert.match(app, /api\.deleteStudentGroup\(/);
  assert.match(functions, /exports\.deleteStudentGroup = onCall/);
  assert.match(functions, /action: "student_group_deleted"/);
  assert.match(functions, /batch\.delete\(document\.ref\)/);
});

test("el borrado del catálogo completo usa el mismo candado de confirmación", () => {
  assert.match(app, /window\.clearAllStudents = \(\) => window\.openDeleteStudentCatalogModal\(\)/);
  assert.match(app, /window\.openDeleteStudentCatalogModal/);
  assert.match(app, /BORRAR CATALOGO COMPLETO/);
  assert.match(app, /selection\.scope === "catalog"[\s\S]*?api\.clearStudents/);
  assert.doesNotMatch(app, /window\.clearAllStudents = \(\) => window\.showConfirmMsg/);
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

test("el reporte de asistencia imprime hasta 52 columnas en una hoja Carta horizontal", () => {
  assert.match(app, /function attendanceCountsByStudent\(report\)/);
  assert.match(app, /recordedAttendances\.has\(key\)/);
  assert.match(app, /totalHeading\.textContent = "Total asist\."/);
  assert.match(app, /attendanceCounts\.get\(normalizeCode\(student\.id, 40\)\) \|\| 0/);
  assert.match(app, /ATTENDANCE_PRINT_DATES_PER_PAGE = 50/);
  assert.match(app, /dates\.slice\(index, index \+ ATTENDANCE_PRINT_DATES_PER_PAGE\)/);
  assert.doesNotMatch(app, /numberHeading/);
  assert.match(html, /@page attendance-report \{ size: Letter landscape; margin: 5mm; \}/);
  assert.match(html, /\.attendance-name-cell \{ width: 50mm; min-width: 50mm;/);
  assert.match(html, /\.attendance-date-cell \{ width: 4mm; min-width: 4mm;/);
  assert.match(html, /\.attendance-total-cell \{ display: table-cell !important; width: 14mm !important;/);
  assert.match(html, /\.attendance-total-cell/);
  assert.match(html, /display: table-cell !important/);
  assert.match(html, /position: sticky; right: 0/);
});
