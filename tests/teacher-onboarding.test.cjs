"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const functions = fs.readFileSync(path.join(projectRoot, "functions", "index.js"), "utf8");

test("el administrador captura nombres y apellidos sin elegir credenciales", () => {
  for (const id of ["new-teacher-given-names", "new-teacher-paternal-surname", "new-teacher-maternal-surname", "new-teacher-id-preview"]) {
    assert.match(html, new RegExp(`id="${id}"`), `falta ${id}`);
  }
  assert.doesNotMatch(html, /id="new-teacher-password"/);
  assert.doesNotMatch(html, /id="new-teacher-password-confirm"/);
  assert.match(html, /for="new-teacher-id-preview"[^>]*>Usuario temporal<\/label>/i);
  assert.match(html, /id="new-teacher-password-preview"[^>]+value="usuarionuevo"/i);
});

test("el usuario temporal combina los nombres con dos letras de cada apellido", () => {
  assert.match(app, /`\$\{names\}\$\{paternal\}\$\{maternal\}`/);
  assert.match(functions, /`\$\{names\.slice\(0, 32\)\}\$\{paternal\.slice\(0, 2\)\}\$\{maternal\.slice\(0, 2\)\}`/);
  assert.match(functions, /suffix === 1 \? baseTeacherId : `\$\{baseTeacherId\.slice\(0, 38\)\}\$\{suffix\}`/);
});

test("Firebase asigna la contraseña predeterminada y marca la identidad como temporal", () => {
  assert.match(functions, /const DEFAULT_NEW_USER_PASSWORD = "usuarionuevo"/);
  assert.match(functions, /passwordHash: hashSecret\(DEFAULT_NEW_USER_PASSWORD\)/);
  assert.match(functions, /passwordChangeRequired: true/);
  assert.match(functions, /identityChangeRequired: true/);
  assert.match(functions, /temporaryLogin: true/);
});

test("el alta temporal no solicita correo electrónico", () => {
  assert.match(app, /api\.createTeacher\(\{schoolKey, givenNames, paternalSurname, maternalSurname, role\}\)/);
  assert.doesNotMatch(app, /api\.createTeacher\(\{[^}]*email/);
  assert.doesNotMatch(html, /id="new-teacher-email"/);
});

test("el primer acceso sustituye el usuario temporal por un correo", () => {
  assert.match(html, /id="input-new-user-email"[^>]+type="email"/);
  assert.match(html, /Correo personal o cuenta de Google/);
  assert.match(app, /api\.completeTeacherOnboarding\(\{email, currentPassword, newPassword\}\)/);
  assert.match(app, /claims\.identityChangeRequired === true/);
  assert.match(functions, /exports\.completeTeacherOnboarding = onCall/);
  assert.match(functions, /requireEmail\(request\.data\?\.email, "correo personal o cuenta de Google"\)/);
});

test("la confirmación migra la cuenta y elimina las credenciales temporales", () => {
  assert.match(functions, /transaction\.create\(newTeacherRef, migratedTeacher\)/);
  assert.match(functions, /transaction\.create\(newCredentialRef,/);
  assert.match(functions, /transaction\.delete\(currentTeacherRef\)/);
  assert.match(functions, /transaction\.delete\(currentCredentialRef\)/);
  assert.match(functions, /passwordHash: hashSecret\(newPassword\)/);
  assert.match(functions, /teacher_onboarding_completed/);
});

test("las cuentas creadas durante la versión defectuosa recuperan el cambio de usuario", () => {
  assert.match(functions, /teacher\.temporaryLogin === true/);
  assert.match(functions, /credentialSnapshot\.ref\.set\(\{identityChangeRequired\}/);
});
