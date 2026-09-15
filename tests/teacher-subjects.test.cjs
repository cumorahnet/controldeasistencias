const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../functions/index.js"), "utf8");

function harness(actor = "admin_maestro", targetRole = "docente") {
  const state = {role: targetRole, assignedSubjects: ["Anterior"], groupSchedules: [{subject: "Anterior", entryTime: "08:00"}]};
  const audits = [];
  const context = vm.createContext({
    exports: {}, onCall: (fn) => fn, MASTER_ROLES: new Set(["admin_maestro", "director"]),
    assertRole: async (_, roles) => {
      if (actor !== "super" && !roles.has(actor)) throw Object.assign(new Error(), {code: "permission-denied"});
      return {role: actor, schoolKey: "A", teacherId: "ADMIN"};
    },
    assertSameSchool: (_, key) => {
      if (key !== "A") throw Object.assign(new Error(), {code: "permission-denied"});
      return key;
    },
    requireIdentifier: (value) => value,
    normalizeText: (value) => value.trim(),
    schoolCollection: () => ({doc: () => ({})}),
    HttpsError: class extends Error {constructor(code, message) {super(message); this.code = code;}},
    FieldValue: {serverTimestamp: () => "time"},
    db: {runTransaction: async (fn) => fn({get: async () => ({exists: true, get: (key) => state[key]}), update: (_, data) => Object.assign(state, data)})},
    writeAuditLog: async (_, data) => audits.push(data),
  });
  vm.runInContext(source.slice(source.indexOf("exports.updateTeacherSubjects ="), source.indexOf("exports.updateTeacherRole =")), context);
  return {state, audits, save: (assignedSubjects, schoolKey = "A") => context.exports.updateTeacherSubjects({data: {schoolKey, teacherId: "DOC", assignedSubjects}})};
}

test("maestro, director y super pueden editar materias conservando horarios", async () => {
  for (const actor of ["admin_maestro", "director", "super"]) {
    const {state, audits, save} = harness(actor);
    await save([" Matemáticas ", "Matemáticas", "Español"]);
    assert.equal(JSON.stringify(state.assignedSubjects), JSON.stringify(["Matemáticas", "Español"]));
    assert.equal(state.groupSchedules[0].subject, "Anterior");
    assert.equal(audits[0].action, "teacher_subjects_changed");
    await save([]);
    assert.equal(state.assignedSubjects.length, 0);
  }
});

test("rechaza roles no autorizados, otros planteles y cuentas no docentes", async () => {
  for (const role of ["admin_jr", "docente", "porteria"]) {
    await assert.rejects(harness(role).save(["Nueva"]), {code: "permission-denied"});
  }
  await assert.rejects(harness().save(["Nueva"], "B"), {code: "permission-denied"});
  await assert.rejects(harness("admin_maestro", "director").save(["Nueva"]), {code: "failed-precondition"});
});

test("rechaza listas inválidas sin modificar la asignación", async () => {
  const {state, save} = harness();
  for (const values of [null, "Materia", [123], [" "], ["A".repeat(81)], Array(41).fill("Materia")]) {
    await assert.rejects(save(values), {code: "invalid-argument"});
    assert.deepEqual(state.assignedSubjects, ["Anterior"]);
  }
});
