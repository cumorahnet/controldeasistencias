"use strict";

const {applicationDefault, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");

const [uid, ...nameParts] = process.argv.slice(2);
if (!uid) {
  console.error("Uso: npm run set-super -- <UID_FIREBASE_AUTH> [Nombre]");
  process.exit(1);
}

initializeApp({credential: applicationDefault()});

getAuth().setCustomUserClaims(uid, {
  role: "super",
  name: nameParts.join(" ").trim() || "SGE GLOBAL",
}).then(() => {
  console.log(`Rol super asignado al UID ${uid}. El usuario debe cerrar sesión y volver a entrar.`);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
