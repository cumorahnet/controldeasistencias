"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const functions = fs.readFileSync(path.join(projectRoot, "functions", "index.js"), "utf8");

test("el menú docente ofrece una bitácora de incidencias separada", () => {
  assert.match(html, /<button[^>]+switchTab\('incidents'\)[^>]+id="tab-incidents"/);
  assert.match(html, /id="section-incidents"/);
  assert.match(app, /window\.safeToggle\("tab-incidents", loggedTeacher\.role !== "docente"\)/);
  assert.match(app, /tab === "incidents" && loggedTeacher\?\.role !== "docente"/);
});

test("el formulario contiene los datos de referencia SEP y el aviso de alcance", () => {
  for (const id of [
    "incident-cct",
    "incident-report-type",
    "incident-folio",
    "incident-reporter",
    "incident-date",
    "incident-time",
    "incident-priority",
    "incident-affectation",
    "incident-type",
    "incident-affected-function",
    "incident-affected-name",
    "incident-affected-age",
    "incident-affected-service",
    "incident-school-name",
    "incident-shift",
    "incident-municipality",
    "incident-administrative-unit",
    "incident-regional-office",
    "incident-description",
    "incident-immediate-actions",
  ]) assert.match(html, new RegExp(`id="${id}"`), `falta el campo ${id}`);
  assert.match(html, /no sustituye el aviso inmediato ni el formato que solicite la autoridad educativa local/i);
});

test("las incidencias se guardan y consultan solamente mediante funciones protegidas", () => {
  for (const callable of ["createIncident", "listIncidents", "updateIncident"]) {
    assert.match(app, new RegExp(`"${callable}"`));
    assert.match(functions, new RegExp(`exports\\.${callable} = onCall`));
  }
  assert.match(functions, /const INCIDENT_ROLES = new Set\(\["docente"\]\)/);
  assert.match(functions, /incident\.teacherId !== token\.teacherId/);
  assert.match(functions, /\.where\("teacherId", "==", token\.teacherId\)/);
  assert.doesNotMatch(html, /<script[^>]+firebase-firestore-compat/i);
});

test("cada incidencia conserva folio, estado e historial de seguimiento", () => {
  assert.match(functions, /const folio = `INC-\$\{reportedDate\.slice\(0, 4\)\}-/);
  assert.match(functions, /history\.push\(\{/);
  assert.match(functions, /history: Array\.isArray\(data\.history\)/);
  assert.match(app, /createIncidentHistory\(incident\)/);
  assert.match(app, /api\.updateIncident\(\{schoolKey, incidentId: incident\.id/);
});

test("la captura se limita a grupos y alumnos activos del plantel", () => {
  assert.match(app, /function teacherIncidentGroups\(\)/);
  assert.match(app, /if \(isStudentInactive\(student\)\) continue/);
  assert.match(functions, /El grupo seleccionado ya no tiene alumnos activos/);
  assert.match(functions, /El alumno seleccionado ya no pertenece al grupo indicado/);
});
