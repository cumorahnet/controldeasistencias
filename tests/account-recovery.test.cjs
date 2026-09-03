"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const app = fs.readFileSync(path.join(projectRoot, "app.js"), "utf8");
const functions = fs.readFileSync(path.join(projectRoot, "functions", "index.js"), "utf8");

test("el acceso permite recuperar tanto el usuario como la contraseña mediante el correo registrado", () => {
  assert.match(html, /Olvidé mi usuario o contraseña/);
  assert.match(html, /id="modal-teacher-recovery"/);
  assert.match(html, /id="teacher-recovery-email"[^>]+type="email"/);
  assert.match(app, /api\.prepareTeacherPasswordRecovery\(\{schoolKey, email\}\)/);
  assert.match(app, /sendPasswordResetEmail\(auth, email\)/);
  assert.match(app, /byId\("input-login-id"\)\.value = email/);
});

test("la preparación del correo no revela si la cuenta docente existe", () => {
  assert.match(functions, /exports\.prepareTeacherPasswordRecovery = onCall/);
  assert.match(functions, /enforceRateLimit\(request, "teacher_password_recovery"/);
  assert.match(functions, /confirmedTeacherEmail\(teacherId, teacher, credential\)/);
  assert.match(functions, /console\.error\("No fue posible preparar la recuperación docente\."/);
  assert.match(functions, /return \{ok: true\};/);
});

test("el correo de recuperación no recibe permisos hasta revalidar plantel y cuenta", () => {
  assert.match(functions, /token\.firebase\?\.sign_in_provider !== "password"/);
  assert.match(functions, /token\.firebase\?\.sign_in_provider !== "password" \|\| token\.role/);
  assert.match(functions, /confirmedTeacherEmail\(teacherId, teacher, credential\) !== email/);
  assert.match(functions, /authUid !== token\.sub/);
  assert.match(functions, /teacher\.passwordChangeRequired !== false/);
  assert.match(app, /!claims\.role && claims\.firebase\?\.sign_in_provider === "password"/);
});

test("una contraseña restablecida en Firebase se sincroniza con la credencial interna", () => {
  assert.match(app, /signInWithEmailAndPassword\(auth, email, password\)/);
  assert.match(app, /api\.loginTeacherWithEmail\(\{schoolKey, password\}\)/);
  assert.match(functions, /exports\.loginTeacherWithEmail = onCall/);
  assert.match(functions, /passwordHash: hashSecret\(password\)/);
  assert.match(functions, /action: "teacher_password_recovered"/);
});

test("el primer acceso ofrece salir sin omitir el cambio obligatorio", () => {
  assert.match(html, /id="btn-exit-first-access"[^>]+window\.exitFirstAccess\(\)/);
  assert.match(html, />Salir y hacerlo después<\/button>/);
  assert.match(app, /window\.exitFirstAccess = \(\) => window\.logout\(\)/);
  assert.match(app, /window\.safeToggle\("modal-change-password", true\)/);
  assert.match(app, /await signOut\(auth\)\.catch/);
});
