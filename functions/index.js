"use strict";

const {createHash, randomBytes, scryptSync, timingSafeEqual} = require("node:crypto");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {FieldPath, FieldValue, Timestamp, getFirestore} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const {HttpsError, onCall} = require("firebase-functions/v2/https");

initializeApp();
setGlobalOptions({region: "us-central1", maxInstances: 20});

const db = getFirestore();
const ROOT = "listadeasistencia";
const MASTER_ROLES = new Set(["admin_maestro", "director"]);
const ALLOWED_ROLES = new Set(["docente", "porteria", "admin_jr", ...MASTER_ROLES]);
const ADMIN_ROLES = new Set(["admin_jr", ...MASTER_ROLES]);
const ATTENDANCE_ROLES = new Set(["docente", "porteria", ...ADMIN_ROLES]);

function publicDataRef() {
  return db.collection("artifacts").doc(ROOT).collection("public").doc("data");
}

function privateDataRef() {
  return db.collection("artifacts").doc(ROOT).collection("private").doc("security");
}

function schoolsRef() {
  return publicDataRef().collection("colegios");
}

function schoolCollection(schoolKey, suffix) {
  return publicDataRef().collection(`${schoolKey}_${suffix}`);
}

function teacherCredentialRef(schoolKey, teacherId) {
  const credentialId = createHash("sha256").update(`${schoolKey}:${teacherId}`).digest("hex");
  return privateDataRef().collection("teacher_credentials").doc(credentialId);
}

function schoolRegistrationRequestsRef() {
  return privateDataRef().collection("school_registration_requests");
}

function normalizeCode(value, maxLength = 80) {
  return String(value || "").trim().toUpperCase().slice(0, maxLength);
}

function normalizeText(value, maxLength = 160) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeSchoolLevel(value) {
  const key = normalizeText(value, 20).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const levels = {preescolar: "PRE", primaria: "PRI", secundaria: "SEC", bachillerato: "BAC", pre: "PRE", pri: "PRI", sec: "SEC", bac: "BAC"};
  const level = levels[key] || normalizeCode(value, 3);
  if (!new Set(["PRE", "PRI", "SEC", "BAC"]).has(level)) throw new HttpsError("invalid-argument", "El nivel escolar no es válido.");
  return level;
}

function normalizeGroupName(value) {
  const group = normalizeCode(value, 12).replace(/\s+/g, " ");
  if (!group || !/[A-Z0-9]/.test(group)) throw new HttpsError("invalid-argument", "El grupo no es válido.");
  return group;
}

function clockMinutes(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function attendanceStatus(localTime, entryTime, tolerance) {
  const scannedAt = clockMinutes(localTime);
  const startsAt = clockMinutes(entryTime);
  if (scannedAt === null || startsAt === null) return "A TIEMPO";
  return scannedAt <= startsAt + Math.max(0, Math.min(120, Number(tolerance || 0))) ? "A TIEMPO" : "RETARDO";
}

function studentInitials(student) {
  const clean = (value) => normalizeText(value, 100).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `${clean(student?.paterno).slice(0, 2)}${clean(student?.nombres).slice(0, 2)}`.padEnd(4, "X");
}

function buildStudentId(level, group, listNumber, student = {}) {
  const groupCode = normalizeGroupName(group).replace(/[^A-Z0-9]/g, "");
  return `${normalizeSchoolLevel(level)}${groupCode}${Number(listNumber)}${studentInitials(student)}`;
}

function compareStudentNames(first, second) {
  for (const field of ["paterno", "materno", "nombres"]) {
    const result = normalizeText(first?.[field]).localeCompare(normalizeText(second?.[field]), "es", {sensitivity: "base"});
    if (result) return result;
  }
  return normalizeText(first?.id).localeCompare(normalizeText(second?.id), "es", {numeric: true});
}

function requireIdentifier(value, label = "identificador") {
  const normalized = normalizeCode(value, 160);
  const isLegacyIdentifier = /^[A-Z0-9._-]{4,40}$/.test(normalized);
  const isEmail = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(normalized);
  if (!isLegacyIdentifier && !isEmail) {
    throw new HttpsError("invalid-argument", `El ${label} debe ser un correo electrónico válido o un identificador de 4 a 40 caracteres.`);
  }
  return normalized;
}

function requireEmail(value, label = "correo electrónico") {
  const email = normalizeText(value, 160).toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) {
    throw new HttpsError("invalid-argument", `El ${label} no tiene un formato válido.`);
  }
  return email;
}

function requirePassword(value, label = "contraseña") {
  const password = String(value || "");
  if (password.length < 8 || password.length > 72 || !/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(password) || !/\d/.test(password)) {
    throw new HttpsError("invalid-argument", `La ${label} debe tener entre 8 y 72 caracteres e incluir letras y números.`);
  }
  return password;
}

function requestIpHash(request) {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.rawRequest?.ip || "unknown")
      .split(",")[0]
      .trim();
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function enforceRateLimit(request, action, scope, maxAttempts, windowMs) {
  const key = createHash("sha256")
      .update(`${action}:${scope}:${requestIpHash(request)}`)
      .digest("hex");
  const ref = privateDataRef().collection("rate_limits").doc(key);
  const now = Date.now();
  const allowed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const startedAt = data?.startedAt?.toMillis?.() || 0;
    if (!data || now - startedAt >= windowMs) {
      transaction.set(ref, {action, count: 1, startedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + windowMs * 2)});
      return true;
    }
    if (Number(data.count || 0) >= maxAttempts) return false;
    transaction.update(ref, {count: FieldValue.increment(1)});
    return true;
  });
  if (!allowed) throw new HttpsError("resource-exhausted", "Demasiados intentos. Espere unos minutos antes de volver a intentar.");
}

function rateLimitRef(request, action, scope) {
  const key = createHash("sha256")
      .update(`${action}:${scope}:${requestIpHash(request)}`)
      .digest("hex");
  return privateDataRef().collection("rate_limits").doc(key);
}

async function assertFailedAttemptLimit(request, action, scope, maxAttempts, windowMs) {
  const snapshot = await rateLimitRef(request, action, scope).get();
  const data = snapshot.data();
  const startedAt = data?.startedAt?.toMillis?.() || 0;
  if (data && Date.now() - startedAt < windowMs && Number(data.count || 0) >= maxAttempts) {
    throw new HttpsError("resource-exhausted", "Demasiados intentos incorrectos. Espere unos minutos antes de volver a intentar.");
  }
}

async function recordFailedAttempt(request, action, scope, windowMs) {
  const ref = rateLimitRef(request, action, scope);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    const startedAt = data?.startedAt?.toMillis?.() || 0;
    if (!data || now - startedAt >= windowMs) {
      transaction.set(ref, {action, count: 1, startedAt: Timestamp.fromMillis(now), expiresAt: Timestamp.fromMillis(now + windowMs * 2)});
    } else {
      transaction.update(ref, {count: FieldValue.increment(1)});
    }
  });
}

async function clearFailedAttempts(request, action, scope) {
  await rateLimitRef(request, action, scope).delete();
}

function hashSecret(secret) {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

function secretMatches(secret, stored) {
  const [saltHex, hashHex] = String(stored || "").split(":");
  if (!saltHex || !hashHex) return false;
  try {
    const actual = scryptSync(secret, Buffer.from(saltHex, "hex"), 64);
    const expected = Buffer.from(hashHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function verifySchoolSecret(schoolKey, suppliedSecret) {
  const secret = normalizeCode(suppliedSecret, 100);
  if (secret.length < 4) return false;
  const schoolRef = schoolsRef().doc(schoolKey);
  const secretRef = privateDataRef().collection("school_secrets").doc(schoolKey);
  const [schoolSnapshot, secretSnapshot] = await Promise.all([schoolRef.get(), secretRef.get()]);
  if (!schoolSnapshot.exists) return false;
  if (secretSnapshot.exists) return secretMatches(secret, secretSnapshot.get("passwordHash"));

  // Migración compatible: valida una sola vez la clave heredada y la retira del documento público.
  const legacySecret = normalizeCode(schoolSnapshot.get("accessKey"), 100);
  if (!legacySecret || legacySecret !== secret) return false;
  const batch = db.batch();
  batch.set(secretRef, {passwordHash: hashSecret(secret), migratedAt: FieldValue.serverTimestamp()});
  batch.update(schoolRef, {accessKey: FieldValue.delete()});
  await batch.commit();
  return true;
}

function safeSchoolProfile(snapshot) {
  const data = snapshot.data() || {};
  const premium = data.isPremium === true;
  const primaryColor = /^#[0-9a-f]{6}$/i.test(String(data.brandPrimaryColor || "")) ? data.brandPrimaryColor : "#1e293b";
  const accentColor = /^#[0-9a-f]{6}$/i.test(String(data.brandAccentColor || data.brandColor || ""))
    ? String(data.brandAccentColor || data.brandColor)
    : "#3b82f6";
  const logoDataUrl = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(String(data.logoDataUrl || ""))
    ? String(data.logoDataUrl)
    : "";
  return {
    id: snapshot.id,
    name: normalizeText(data.name || snapshot.id),
    director: normalizeText(data.director),
    administrator: normalizeText(data.administrator),
    entryTime: String(data.entryTime || ""),
    recessReturnTime: String(data.recessReturnTime || ""),
    tolerance: Number(data.tolerance || 0),
    classDuration: Number(data.classDuration || 0),
    isPremium: premium,
    allowBranding: premium,
    verificationStatus: new Set(["verified", "unverified", "disputed"]).has(data.verificationStatus) ? data.verificationStatus : "unverified",
    brandPrimaryColor: primaryColor,
    brandAccentColor: accentColor,
    brandColor: accentColor,
    brandLogoBackgroundMode: data.brandLogoBackgroundMode === "color" ? "color" : "transparent",
    brandLogoBackgroundColor: /^#[0-9a-f]{6}$/i.test(String(data.brandLogoBackgroundColor || "")) ? data.brandLogoBackgroundColor : "#ffffff",
    logoDataUrl: premium ? logoDataUrl : "",
  };
}

function assertSignedIn(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Inicie sesión para continuar.");
  return request.auth.token;
}

async function assertActiveTeacher(token, allowPasswordChange = false) {
  if (token.role === "super") return null;
  const schoolKey = requireIdentifier(token.schoolKey, "CCT de la sesión");
  const teacherId = requireIdentifier(token.teacherId, "ID de la sesión");
  const [snapshot, school] = await Promise.all([
    schoolCollection(schoolKey, "maestros").doc(teacherId).get(),
    schoolsRef().doc(schoolKey).get(),
  ]);
  if (!school.exists || String(school.get("status") || "active") !== "active") {
    throw new HttpsError("failed-precondition", "El plantel no está disponible temporalmente.");
  }
  if (!snapshot.exists) throw new HttpsError("permission-denied", "La cuenta ya no existe o fue restablecida. Inicie sesión nuevamente.");
  const teacher = snapshot.data() || {};
  if (["pending", "disabled"].includes(teacher.status)) {
    throw new HttpsError("permission-denied", "La cuenta no está activa.");
  }
  const currentRole = ALLOWED_ROLES.has(teacher.role) ? teacher.role : "docente";
  if (currentRole !== token.role) {
    throw new HttpsError("permission-denied", "Los permisos de la cuenta cambiaron. Inicie sesión nuevamente.");
  }
  if (teacher.authUid && teacher.authUid !== token.sub) {
    throw new HttpsError("permission-denied", "La sesión fue reemplazada. Inicie sesión nuevamente.");
  }
  if (!allowPasswordChange && (teacher.passwordChangeRequired !== false || token.passwordChangeRequired !== false)) {
    throw new HttpsError("failed-precondition", "Debe cambiar la contraseña temporal antes de continuar.");
  }
  return teacher;
}

async function assertRole(request, roles) {
  const token = assertSignedIn(request);
  if (token.role === "super") return token;
  if (!roles.has(token.role)) throw new HttpsError("permission-denied", "No tiene permisos para realizar esta operación.");
  await assertActiveTeacher(token);
  return token;
}

function assertSameSchool(token, requestedSchool) {
  const schoolKey = normalizeCode(requestedSchool || token.schoolKey, 40);
  if (token.role !== "super" && token.schoolKey !== schoolKey) {
    throw new HttpsError("permission-denied", "La institución no corresponde a su sesión.");
  }
  return schoolKey;
}

function teacherUid(schoolKey, teacherId) {
  return `teacher_${createHash("sha256").update(`${schoolKey}:${teacherId}`).digest("hex").slice(0, 48)}`;
}

function newTeacherUid() {
  return `teacher_${randomBytes(24).toString("hex")}`;
}

async function revokeTeacherSessions(authUid) {
  if (!authUid) return;
  try {
    await getAuth().revokeRefreshTokens(authUid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }
}

async function deleteAuthUsers(authUids) {
  const uniqueUids = [...new Set(authUids.filter(Boolean))];
  for (let offset = 0; offset < uniqueUids.length; offset += 100) {
    const chunk = uniqueUids.slice(offset, offset + 100);
    await Promise.all(chunk.map(async (authUid) => {
      try {
        await getAuth().deleteUser(authUid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
    }));
  }
}

async function assertAnotherMasterAdministrator(schoolKey, excludedTeacherId) {
  const snapshot = await schoolCollection(schoolKey, "maestros").where("role", "in", [...MASTER_ROLES]).limit(10).get();
  if (!snapshot.docs.some((document) => document.id !== excludedTeacherId && document.get("status") !== "disabled")) {
    throw new HttpsError("failed-precondition", "Cada plantel debe conservar al menos un administrador maestro o director activo.");
  }
}

function teacherClaims(schoolKey, teacherId, teacher, passwordChangeRequired = false) {
  const role = ALLOWED_ROLES.has(teacher.role) ? teacher.role : "docente";
  return {schoolKey, teacherId, role, name: normalizeText(teacher.nombre || teacher.name || teacherId, 80), passwordChangeRequired};
}

async function createTeacherSessionToken(authUid, claims) {
  try {
    return await getAuth().createCustomToken(authUid, claims);
  } catch (error) {
    console.error("No fue posible firmar el token de sesión docente.", {code: error?.code || "unknown"});
    throw new HttpsError("unavailable", "No fue posible iniciar sesión temporalmente. Inténtelo nuevamente o contacte a soporte.");
  }
}

async function getValidChallenge(request, challengeId, schoolKey) {
  const id = String(challengeId || "").trim();
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpsError("permission-denied", "La autorización institucional no es válida.");
  const ref = privateDataRef().collection("login_challenges").doc(id);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!snapshot.exists || data.schoolKey !== schoolKey || data.ipHash !== requestIpHash(request) || data.expiresAt.toMillis() < Date.now()) {
    throw new HttpsError("permission-denied", "La autorización institucional expiró. Vuelva a introducir la clave del plantel.");
  }
  if (Number(data.attempts || 0) >= 5) {
    await ref.delete();
    throw new HttpsError("resource-exhausted", "Se agotaron los intentos con esta autorización. Introduzca nuevamente la clave del plantel.");
  }
  return {ref, data};
}

exports.lookupSchool = onCall(async (request) => {
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  await enforceRateLimit(request, "lookup_school", schoolKey, 30, 10 * 60 * 1000);
  const snapshot = await schoolsRef().doc(schoolKey).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "La CCT no está registrada.");
  if (snapshot.get("status") === "disabled") throw new HttpsError("permission-denied", "El plantel está desactivado.");
  if (snapshot.get("status") === "migrating") throw new HttpsError("failed-precondition", "La CCT se está corrigiendo. Intente nuevamente en unos minutos.");
  return safeSchoolProfile(snapshot);
});

exports.requestSchoolRegistration = onCall(async (request) => {
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  const schoolName = normalizeText(request.data?.schoolName, 120).toUpperCase();
  const directorName = normalizeText(request.data?.directorName, 120).toUpperCase();
  const adminName = normalizeText(request.data?.adminName, 120).toUpperCase();
  const adminEmail = requireEmail(request.data?.adminEmail || request.data?.adminId, "correo del administrador");
  const adminId = normalizeCode(adminEmail, 160);
  const contactEmail = adminEmail;
  const password = requirePassword(request.data?.password || request.data?.temporaryPassword, "contraseña");
  if (!schoolName) throw new HttpsError("invalid-argument", "El nombre de la escuela es obligatorio.");
  if (directorName.length < 5) throw new HttpsError("invalid-argument", "Capture el nombre completo del director o directora.");
  if (adminName.length < 5) throw new HttpsError("invalid-argument", "Capture el nombre completo del administrador o administradora.");

  await enforceRateLimit(request, "request_school_registration", schoolKey, 3, 60 * 60 * 1000);
  const schoolRef = schoolsRef().doc(schoolKey);
  const requestRef = schoolRegistrationRequestsRef().doc(schoolKey);
  const adminRef = schoolCollection(schoolKey, "maestros").doc(adminId);
  const credentialRef = teacherCredentialRef(schoolKey, adminId);
  const authUid = newTeacherUid();
  await db.runTransaction(async (transaction) => {
    const [school, legacyRequest] = await Promise.all([
      transaction.get(schoolRef),
      transaction.get(requestRef),
    ]);
    if (school.exists) throw new HttpsError("already-exists", "La CCT ya está registrada. Inicie sesión con una cuenta del plantel.");
    transaction.create(schoolRef, {
      name: schoolName,
      director: directorName,
      administrator: adminName,
      contactEmail,
      initialAdminId: adminId,
      status: "active",
      verificationStatus: "unverified",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "self-registration",
    });
    transaction.create(adminRef, {
      nombre: adminName,
      role: "admin_maestro",
      status: "active",
      authUid,
      passwordChangeRequired: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: "self-registration",
    });
    transaction.create(credentialRef, {
      schoolKey,
      teacherId: adminId,
      authUid,
      passwordHash: hashSecret(password),
      mustChange: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (legacyRequest.exists) transaction.delete(requestRef);
  });
  return {
    ok: true,
    status: "active",
    school: {id: schoolKey, name: schoolName, director: directorName, verificationStatus: "unverified"},
    administrator: {id: adminId, nombre: adminName},
  };
});

exports.listSchoolRegistrationRequests = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const snapshot = await schoolRegistrationRequestsRef().where("status", "==", "pending").limit(100).get();
  return {
    requests: snapshot.docs.map((document) => {
      const data = document.data() || {};
      return {
        schoolKey: document.id,
        schoolName: normalizeText(data.schoolName),
        directorName: normalizeText(data.directorName),
        adminId: normalizeCode(data.adminId, 160),
        adminName: normalizeText(data.adminName || data.directorName, 120),
        contactEmail: normalizeText(data.contactEmail, 160),
      };
    }),
  };
});

exports.approveSchoolRegistration = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  const requestRef = schoolRegistrationRequestsRef().doc(schoolKey);
  const schoolRef = schoolsRef().doc(schoolKey);
  await db.runTransaction(async (transaction) => {
    const [registration, school] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(schoolRef),
    ]);
    if (!registration.exists) throw new HttpsError("not-found", "La solicitud ya no existe.");
    if (school.exists) throw new HttpsError("already-exists", "La CCT ya está registrada.");
    const data = registration.data() || {};
    if (data.status !== "pending") throw new HttpsError("failed-precondition", "La solicitud ya fue procesada.");
    const adminId = requireIdentifier(data.adminId, "usuario administrador");
    const adminRef = schoolCollection(schoolKey, "maestros").doc(adminId);
    const credentialRef = teacherCredentialRef(schoolKey, adminId);
    transaction.create(schoolRef, {
      name: normalizeText(data.schoolName, 120).toUpperCase(),
      director: normalizeText(data.directorName, 120).toUpperCase(),
      administrator: normalizeText(data.adminName || data.directorName, 120).toUpperCase(),
      contactEmail: normalizeText(data.contactEmail, 160).toLowerCase(),
      initialAdminId: adminId,
      status: "active",
      verificationStatus: "verified",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: token.sub,
      verifiedAt: FieldValue.serverTimestamp(),
      verifiedBy: token.sub,
      approvedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(adminRef, {
      nombre: normalizeText(data.adminName || data.directorName, 120).toUpperCase(),
      role: "admin_maestro",
      status: "active",
      authUid: data.authUid,
      passwordChangeRequired: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: token.sub,
    });
    transaction.create(credentialRef, {
      schoolKey,
      teacherId: adminId,
      authUid: data.authUid,
      passwordHash: data.passwordHash,
      mustChange: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.delete(requestRef);
  });
  return {ok: true, schoolKey};
});

exports.rejectSchoolRegistration = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  const requestRef = schoolRegistrationRequestsRef().doc(schoolKey);
  const snapshot = await requestRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "La solicitud ya no existe.");
  await requestRef.delete();
  return {ok: true, schoolKey};
});

exports.createSchool = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  const schoolName = normalizeText(request.data?.schoolName, 120).toUpperCase();
  const directorName = normalizeText(request.data?.directorName, 120).toUpperCase();
  const adminName = normalizeText(request.data?.adminName || request.data?.directorName, 120).toUpperCase();
  const adminId = normalizeCode(requireEmail(request.data?.adminId, "correo del administrador"), 160);
  const password = requirePassword(request.data?.password || request.data?.temporaryPassword, "contraseña");
  if (!schoolName) throw new HttpsError("invalid-argument", "El nombre de la escuela es obligatorio.");
  if (directorName.length < 5) throw new HttpsError("invalid-argument", "Capture el nombre completo del director o directora.");
  if (adminName.length < 5) throw new HttpsError("invalid-argument", "Capture el nombre completo del administrador o administradora.");

  const schoolRef = schoolsRef().doc(schoolKey);
  const adminRef = schoolCollection(schoolKey, "maestros").doc(adminId);
  const credentialRef = teacherCredentialRef(schoolKey, adminId);
  const pendingRequestRef = schoolRegistrationRequestsRef().doc(schoolKey);
  const authUid = newTeacherUid();
  await db.runTransaction(async (transaction) => {
    const [existingSchool, pendingRequest] = await Promise.all([
      transaction.get(schoolRef),
      transaction.get(pendingRequestRef),
    ]);
    if (existingSchool.exists) throw new HttpsError("already-exists", "La CCT ya está registrada. No se permiten planteles duplicados.");
    transaction.create(schoolRef, {
      name: schoolName,
      director: directorName,
      administrator: adminName,
      contactEmail: adminId.toLowerCase(),
      initialAdminId: adminId,
      status: "active",
      verificationStatus: "verified",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: token.sub,
      verifiedAt: FieldValue.serverTimestamp(),
      verifiedBy: token.sub,
    });
    transaction.create(adminRef, {
      nombre: adminName,
      role: "admin_maestro",
      status: "active",
      authUid,
      passwordChangeRequired: false,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: token.sub,
    });
    transaction.create(credentialRef, {
      schoolKey,
      teacherId: adminId,
      authUid,
      passwordHash: hashSecret(password),
      mustChange: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    if (pendingRequest.exists) transaction.delete(pendingRequestRef);
  });
  return {ok: true, school: {id: schoolKey, name: schoolName}, administrator: {id: adminId, nombre: adminName}};
});

exports.verifySchoolAccess = onCall(async (request) => {
  throw new HttpsError("failed-precondition", "La clave institucional compartida fue reemplazada por contraseñas individuales.");
});

exports.loginTeacher = onCall(async (request) => {
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  const teacherId = requireIdentifier(request.data?.teacherId, "ID personal");
  const password = String(request.data?.password || "");
  const rateScope = `${schoolKey}:${teacherId}`;
  const rateWindow = 15 * 60 * 1000;
  await assertFailedAttemptLimit(request, "teacher_password_failures", rateScope, 5, rateWindow);
  const [schoolSnapshot, teacherSnapshot, credentialSnapshot] = await Promise.all([
    schoolsRef().doc(schoolKey).get(),
    schoolCollection(schoolKey, "maestros").doc(teacherId).get(),
    teacherCredentialRef(schoolKey, teacherId).get(),
  ]);
  if (!schoolSnapshot.exists) throw new HttpsError("not-found", "La CCT no está registrada.");
  const schoolStatus = String(schoolSnapshot.get("status") || "active");
  if (schoolStatus === "disabled") throw new HttpsError("permission-denied", "El plantel está desactivado.");
  if (schoolStatus !== "active") throw new HttpsError("failed-precondition", "El plantel aún no está activo.");
  if (!teacherSnapshot.exists) {
    await recordFailedAttempt(request, "teacher_password_failures", rateScope, rateWindow);
    throw new HttpsError("permission-denied", "El usuario o la contraseña son incorrectos.");
  }
  const teacher = teacherSnapshot.data() || {};
  if (teacher.status === "pending") throw new HttpsError("failed-precondition", "La cuenta continúa pendiente de autorización.");
  if (teacher.status === "disabled") throw new HttpsError("permission-denied", "La cuenta está desactivada. Contacte al administrador del plantel.");
  if (!credentialSnapshot.exists) {
    throw new HttpsError("failed-precondition", "La cuenta necesita una contraseña temporal. Solicite al administrador que restablezca el acceso.");
  }
  if (!secretMatches(password, credentialSnapshot.get("passwordHash"))) {
    await recordFailedAttempt(request, "teacher_password_failures", rateScope, rateWindow);
    throw new HttpsError("permission-denied", "El usuario o la contraseña son incorrectos.");
  }
  await clearFailedAttempts(request, "teacher_password_failures", rateScope);
  const authUid = teacher.authUid || credentialSnapshot.get("authUid") || teacherUid(schoolKey, teacherId);
  const isInitialAdministrator = MASTER_ROLES.has(teacher.role) && normalizeCode(schoolSnapshot.get("initialAdminId"), 160) === teacherId;
  const passwordChangeRequired = isInitialAdministrator ? false : credentialSnapshot.get("mustChange") === true || teacher.passwordChangeRequired === true;
  const sessionData = {};
  if (teacher.authUid !== authUid) sessionData.authUid = authUid;
  if (teacher.passwordChangeRequired !== passwordChangeRequired) sessionData.passwordChangeRequired = passwordChangeRequired;
  const sessionUpdates = [];
  if (Object.keys(sessionData).length) sessionUpdates.push(teacherSnapshot.ref.set({...sessionData, updatedAt: FieldValue.serverTimestamp()}, {merge: true}));
  if (isInitialAdministrator && credentialSnapshot.get("mustChange") !== false) {
    sessionUpdates.push(credentialSnapshot.ref.set({mustChange: false, madePermanentAt: FieldValue.serverTimestamp()}, {merge: true}));
  }
  if (sessionUpdates.length) await Promise.all(sessionUpdates);
  const claims = teacherClaims(schoolKey, teacherId, teacher, passwordChangeRequired);
  const token = await createTeacherSessionToken(authUid, claims);
  return {token, teacher: {id: teacherId, nombre: claims.name, role: claims.role, passwordChangeRequired}};
});

exports.registerTeacherSelf = onCall(async (request) => {
  throw new HttpsError("failed-precondition", "El autorregistro está desactivado. El administrador del plantel debe crear la cuenta.");
});

exports.listTeachers = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const snapshot = await schoolCollection(schoolKey, "maestros").get();
  const teachers = snapshot.docs.map((document) => {
    const teacher = document.data() || {};
    return {
      id: document.id,
      nombre: normalizeText(teacher.nombre),
      role: ALLOWED_ROLES.has(teacher.role) ? teacher.role : "docente",
      status: ["active", "pending", "disabled"].includes(teacher.status) ? teacher.status : "active",
    };
  });
  return {teachers};
});

exports.createTeacher = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const teacherId = requireIdentifier(request.data?.teacherId, "usuario");
  const name = normalizeText(request.data?.name, 100).toUpperCase();
  const role = String(request.data?.role || "docente");
  const temporaryPassword = requirePassword(request.data?.temporaryPassword, "contraseña temporal");

  if (name.length < 5) throw new HttpsError("invalid-argument", "Capture el nombre completo del docente.");
  if (!ALLOWED_ROLES.has(role)) throw new HttpsError("invalid-argument", "El rol solicitado no es válido.");
  if (token.role === "admin_jr" && !new Set(["docente", "porteria"]).has(role)) {
    throw new HttpsError("permission-denied", "Un administrador junior solo puede crear cuentas docentes o de portería.");
  }

  const schoolRef = schoolsRef().doc(schoolKey);
  const ref = schoolCollection(schoolKey, "maestros").doc(teacherId);
  const credentialRef = teacherCredentialRef(schoolKey, teacherId);
  const authUid = newTeacherUid();
  await db.runTransaction(async (transaction) => {
    const [school, existing] = await Promise.all([transaction.get(schoolRef), transaction.get(ref)]);
    if (!school.exists) throw new HttpsError("not-found", "La CCT no está registrada.");
    if (existing.exists) throw new HttpsError("already-exists", "Ese ID ya está registrado.");
    transaction.create(ref, {
      nombre: name,
      role,
      status: "active",
      authUid,
      passwordChangeRequired: true,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: token.teacherId || token.role,
    });
    transaction.create(credentialRef, {
      schoolKey,
      teacherId,
      authUid,
      passwordHash: hashSecret(temporaryPassword),
      mustChange: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return {ok: true, teacher: {id: teacherId, nombre: name, role, passwordChangeRequired: true}};
});

exports.changeTeacherPassword = onCall(async (request) => {
  const token = assertSignedIn(request);
  if (token.role === "super") throw new HttpsError("failed-precondition", "El usuario maestro administra su contraseña mediante Firebase Authentication.");
  const teacher = await assertActiveTeacher(token, true);
  const schoolKey = assertSameSchool(token, token.schoolKey);
  const teacherId = requireIdentifier(token.teacherId, "usuario");
  const currentPassword = String(request.data?.currentPassword || "");
  const newPassword = requirePassword(request.data?.newPassword, "contraseña nueva");
  const credentialRef = teacherCredentialRef(schoolKey, teacherId);
  const teacherRef = schoolCollection(schoolKey, "maestros").doc(teacherId);
  const credential = await credentialRef.get();
  if (!credential.exists || !secretMatches(currentPassword, credential.get("passwordHash"))) {
    throw new HttpsError("permission-denied", "La contraseña temporal actual es incorrecta.");
  }
  if (secretMatches(newPassword, credential.get("passwordHash"))) {
    throw new HttpsError("invalid-argument", "La contraseña nueva debe ser diferente de la contraseña temporal.");
  }
  const batch = db.batch();
  batch.set(credentialRef, {
    schoolKey,
    teacherId,
    authUid: token.sub,
    passwordHash: hashSecret(newPassword),
    mustChange: false,
    changedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  batch.set(teacherRef, {passwordChangeRequired: false, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  await batch.commit();
  const claims = teacherClaims(schoolKey, teacherId, teacher, false);
  const customToken = await createTeacherSessionToken(token.sub, claims);
  return {ok: true, token: customToken};
});

exports.updateOwnSchedule = onCall(async (request) => {
  const token = await assertRole(request, ATTENDANCE_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const level = normalizeSchoolLevel(request.data?.level);
  const group = normalizeGroupName(request.data?.group);
  const entryTime = String(request.data?.entryTime || "").slice(0, 5);
  const recessReturnTime = String(request.data?.recessReturnTime || "").slice(0, 5);
  const tolerance = Math.max(0, Math.min(120, Number(request.data?.tolerance || 0)));
  const classDuration = Math.max(1, Math.min(240, Number(request.data?.classDuration || 50)));
  if (entryTime && clockMinutes(entryTime) === null) throw new HttpsError("invalid-argument", "La hora de entrada no es válida.");
  if (recessReturnTime && clockMinutes(recessReturnTime) === null) throw new HttpsError("invalid-argument", "La hora de regreso no es válida.");
  const schedule = {
    level,
    group,
    entryTime,
    recessReturnTime,
    tolerance,
    classDuration,
    scheduleConfigured: true,
  };
  const teacherRef = schoolCollection(schoolKey, "maestros").doc(token.teacherId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(teacherRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "La cuenta ya no existe.");
    const currentSchedules = Array.isArray(snapshot.get("groupSchedules")) ? snapshot.get("groupSchedules") : [];
    const groupSchedules = currentSchedules.filter((item) => {
      try {
        return normalizeSchoolLevel(item?.level) !== level || normalizeGroupName(item?.group) !== group;
      } catch {
        return false;
      }
    });
    groupSchedules.push(schedule);
    transaction.set(teacherRef, {
      groupSchedules: groupSchedules.slice(-200),
      scheduleUpdatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  });
  return {ok: true, schedule};
});

exports.changeTeacherId = onCall(async () => {
  throw new HttpsError("failed-precondition", "El ID de usuario ya no funciona como contraseña. Utilice el cambio de contraseña.");
});

exports.updateSchool = onCall(async (request) => {
  const token = await assertRole(request, MASTER_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const input = request.data?.profile || {};
  const profile = {
    name: normalizeText(input.name, 120).toUpperCase(),
    director: normalizeText(input.director, 120).toUpperCase(),
    entryTime: String(input.entryTime || "").slice(0, 5),
    recessReturnTime: String(input.recessReturnTime || "").slice(0, 5),
    tolerance: Math.max(0, Math.min(120, Number(input.tolerance || 0))),
    classDuration: Math.max(1, Math.min(240, Number(input.classDuration || 50))),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const contactEmail = normalizeText(input.contactEmail, 160).toLowerCase();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new HttpsError("invalid-argument", "Capture un correo de contacto válido.");
  }
  if (contactEmail) profile.contactEmail = contactEmail;
  if (!profile.name) throw new HttpsError("invalid-argument", "El nombre de la escuela es obligatorio.");
  const schoolRef = schoolsRef().doc(schoolKey);
  const schoolSnapshot = await schoolRef.get();
  if (!schoolSnapshot.exists) throw new HttpsError("not-found", "La CCT no está registrada. Créela desde el panel maestro.");
  const brandingRequested = ["brandPrimaryColor", "brandAccentColor", "brandLogoBackgroundMode", "brandLogoBackgroundColor", "logoDataUrl"].some((field) => Object.hasOwn(input, field));
  if (brandingRequested) {
    if (schoolSnapshot.get("isPremium") !== true) {
      throw new HttpsError("failed-precondition", "La identidad visual se habilita después de confirmar el pago Premium.");
    }
    const primaryColor = String(input.brandPrimaryColor || "");
    const accentColor = String(input.brandAccentColor || "");
    const logoBackgroundMode = input.brandLogoBackgroundMode === "color" ? "color" : "transparent";
    const logoBackgroundColor = String(input.brandLogoBackgroundColor || "");
    const logoDataUrl = String(input.logoDataUrl || "");
    if (!/^#[0-9a-f]{6}$/i.test(primaryColor) || !/^#[0-9a-f]{6}$/i.test(accentColor) || !/^#[0-9a-f]{6}$/i.test(logoBackgroundColor)) {
      throw new HttpsError("invalid-argument", "Los colores institucionales no son válidos.");
    }
    if (logoDataUrl && (!/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logoDataUrl) || logoDataUrl.length > 300000)) {
      throw new HttpsError("invalid-argument", "El logotipo debe ser PNG, JPG o WebP y pesar menos de 220 KB.");
    }
    profile.brandPrimaryColor = primaryColor;
    profile.brandAccentColor = accentColor;
    profile.brandColor = accentColor;
    profile.brandLogoBackgroundMode = logoBackgroundMode;
    profile.brandLogoBackgroundColor = logoBackgroundColor;
    profile.logoDataUrl = logoDataUrl;
    profile.allowBranding = true;
  }
  const batch = db.batch();
  batch.set(schoolRef, profile, {merge: true});
  const newAccessKey = normalizeCode(input.accessKey, 100);
  if (newAccessKey) {
    if (newAccessKey.length < 4) throw new HttpsError("invalid-argument", "La clave institucional debe tener al menos cuatro caracteres.");
    batch.set(privateDataRef().collection("school_secrets").doc(schoolKey), {passwordHash: hashSecret(newAccessKey), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  }
  await batch.commit();
  return {ok: true};
});

exports.updateTeacherRole = onCall(async (request) => {
  const token = await assertRole(request, MASTER_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const teacherId = requireIdentifier(request.data?.teacherId, "ID docente");
  const role = String(request.data?.role || "");
  if (!ALLOWED_ROLES.has(role)) throw new HttpsError("invalid-argument", "El rol solicitado no es válido.");
  if (token.role !== "super" && teacherId === token.teacherId) {
    throw new HttpsError("failed-precondition", "No puede cambiar su propio rol durante una sesión activa.");
  }
  const targetRef = schoolCollection(schoolKey, "maestros").doc(teacherId);
  const target = await targetRef.get();
  if (!target.exists) throw new HttpsError("not-found", "La cuenta ya no existe.");
  if (MASTER_ROLES.has(target.get("role")) && !MASTER_ROLES.has(role)) {
    await assertAnotherMasterAdministrator(schoolKey, teacherId);
  }
  await targetRef.update({role, updatedAt: FieldValue.serverTimestamp(), updatedBy: token.teacherId || token.role});
  await revokeTeacherSessions(target.get("authUid") || teacherUid(schoolKey, teacherId));
  return {ok: true};
});

exports.repairTeacherAccount = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const teacherId = requireIdentifier(request.data?.teacherId, "usuario");
  const temporaryPassword = request.data?.temporaryPassword ? requirePassword(request.data.temporaryPassword, "contraseña temporal") : "";
  const name = normalizeText(request.data?.name, 100).toUpperCase();
  if (name.length < 5) throw new HttpsError("invalid-argument", "Capture el nombre completo del docente.");
  if (temporaryPassword && token.role !== "super" && teacherId === token.teacherId) {
    throw new HttpsError("failed-precondition", "Otro administrador debe restablecer su acceso.");
  }

  const currentRef = schoolCollection(schoolKey, "maestros").doc(teacherId);
  const credentialRef = teacherCredentialRef(schoolKey, teacherId);
  let authUid = "";
  let role = "docente";
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(currentRef);
    if (!current.exists) throw new HttpsError("not-found", "La cuenta ya no existe.");
    const teacher = current.data() || {};
    role = ALLOWED_ROLES.has(teacher.role) ? teacher.role : "docente";
    if (token.role === "admin_jr" && !new Set(["docente", "porteria"]).has(role)) {
      throw new HttpsError("permission-denied", "Un administrador junior solo puede corregir cuentas docentes o de portería.");
    }
    authUid = teacher.authUid || teacherUid(schoolKey, teacherId);
    const repaired = {
      ...teacher,
      nombre: name,
      role,
      status: temporaryPassword ? "active" : (teacher.status || "active"),
      authUid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: token.teacherId || token.role,
    };
    if (temporaryPassword) {
      repaired.passwordChangeRequired = true;
      repaired.accessResetAt = FieldValue.serverTimestamp();
      repaired.accessResetBy = token.teacherId || token.role;
      transaction.set(credentialRef, {
        schoolKey,
        teacherId,
        authUid,
        passwordHash: hashSecret(temporaryPassword),
        mustChange: true,
        resetAt: FieldValue.serverTimestamp(),
        resetBy: token.teacherId || token.role,
      }, {merge: true});
    }
    transaction.set(currentRef, repaired);
  });
  if (temporaryPassword) await revokeTeacherSessions(authUid);
  return {ok: true, teacher: {id: teacherId, nombre: name, role, accessReset: Boolean(temporaryPassword)}};
});

exports.approveTeacher = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const teacherId = requireIdentifier(request.data?.teacherId, "ID docente");
  await schoolCollection(schoolKey, "maestros").doc(teacherId).update({status: "active", approvedAt: FieldValue.serverTimestamp(), approvedBy: token.teacherId || token.role});
  return {ok: true};
});

exports.deleteTeacher = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const teacherId = requireIdentifier(request.data?.teacherId, "ID docente");
  if (teacherId === token.teacherId) throw new HttpsError("failed-precondition", "No puede eliminar su propia cuenta durante una sesión activa.");
  const targetRef = schoolCollection(schoolKey, "maestros").doc(teacherId);
  const target = await targetRef.get();
  if (!target.exists) throw new HttpsError("not-found", "El docente ya no existe.");
  if (token.role === "admin_jr" && !new Set(["docente", "porteria"]).has(target.get("role"))) {
    throw new HttpsError("permission-denied", "Un administrador junior solo puede eliminar cuentas docentes o de portería.");
  }
  if (MASTER_ROLES.has(target.get("role"))) await assertAnotherMasterAdministrator(schoolKey, teacherId);
  const authUid = target.get("authUid") || teacherUid(schoolKey, teacherId);
  const batch = db.batch();
  batch.delete(targetRef);
  batch.delete(teacherCredentialRef(schoolKey, teacherId));
  await batch.commit();
  await revokeTeacherSessions(authUid);
  return {ok: true};
});

exports.recordAttendance = onCall(async (request) => {
  const token = await assertRole(request, ATTENDANCE_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const studentId = requireIdentifier(request.data?.studentId, "ID del alumno");
  const [studentSnapshot, teacherSnapshot, schoolSnapshot] = await Promise.all([
    schoolCollection(schoolKey, "alumnos").doc(studentId).get(),
    schoolCollection(schoolKey, "maestros").doc(token.teacherId).get(),
    schoolsRef().doc(schoolKey).get(),
  ]);
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "El alumno no está registrado.");
  const student = studentSnapshot.data() || {};
  if (student.active === false || normalizeText(student.status, 20).toLowerCase() === "inactive") {
    throw new HttpsError("failed-precondition", "El alumno está dado de baja y su QR no puede registrar asistencia.");
  }
  const now = new Date();
  const fecha = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(now);
  const hora = new Intl.DateTimeFormat("es-MX", {timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(now);
  const teacher = teacherSnapshot.data() || {};
  const school = schoolSnapshot.data() || {};
  const studentLevel = normalizeSchoolLevel(student.level || student.nivel);
  const studentGroup = normalizeGroupName(student.grupo);
  const groupSchedule = (Array.isArray(teacher.groupSchedules) ? teacher.groupSchedules : []).find((item) => {
    try {
      return normalizeSchoolLevel(item?.level) === studentLevel && normalizeGroupName(item?.group) === studentGroup;
    } catch {
      return false;
    }
  });
  const entryTime = String(groupSchedule?.entryTime || teacher.entryTime || school.entryTime || "").slice(0, 5);
  const tolerance = Math.max(0, Math.min(120, Number(groupSchedule?.tolerance ?? teacher.tolerance ?? school.tolerance ?? 0)));
  const status = attendanceStatus(hora, entryTime, tolerance);
  const attendanceRef = schoolCollection(schoolKey, "asistencias").doc(`${fecha}_${studentId}`);
  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(attendanceRef);
    if (existing.exists) return false;
    transaction.create(attendanceRef, {
      alumnoId: studentId,
      nombre: normalizeText(student.nombres, 100),
      apellido: normalizeText(student.paterno, 80),
      materno: normalizeText(student.materno, 80),
      studentIdRevision: normalizeText(student.studentIdRevision, 40),
      profesorId: token.teacherId,
      profesorNombre: normalizeText(token.name, 100),
      fecha,
      hora,
      status,
      scheduleLevel: studentLevel,
      scheduleGroup: studentGroup,
      entryTimeApplied: entryTime,
      toleranceApplied: tolerance,
      timestamp: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return {created, fecha, hora, status};
});

exports.deleteStudent = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const studentId = requireIdentifier(request.data?.studentId, "ID del alumno");
  const studentRef = schoolCollection(schoolKey, "alumnos").doc(studentId);
  const student = await studentRef.get();
  if (!student.exists) throw new HttpsError("not-found", "El alumno ya no existe.");
  await studentRef.update({
    active: false,
    status: "inactive",
    statusUpdatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: token.teacherId || token.role,
  });
  return {ok: true, active: false};
});

exports.setStudentActive = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const studentId = requireIdentifier(request.data?.studentId, "ID del alumno");
  const active = request.data?.active === true;
  const studentRef = schoolCollection(schoolKey, "alumnos").doc(studentId);
  const student = await studentRef.get();
  if (!student.exists) throw new HttpsError("not-found", "El alumno ya no existe.");
  await studentRef.update({
    active,
    status: active ? "active" : "inactive",
    statusUpdatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: token.teacherId || token.role,
  });
  return {ok: true, active};
});

exports.renumberStudentGroup = onCall({timeoutSeconds: 540, memory: "512MiB"}, async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const level = normalizeSchoolLevel(request.data?.level);
  const group = normalizeGroupName(request.data?.group);
  const studentsRef = schoolCollection(schoolKey, "alumnos");
  const studentsSnapshot = await studentsRef.get();
  const groupStudents = [];
  for (const document of studentsSnapshot.docs) {
    const data = document.data() || {};
    let studentLevel = "";
    try {
      studentLevel = normalizeSchoolLevel(data.level || data.nivel);
    } catch {
      continue;
    }
    if (studentLevel !== level || normalizeCode(data.grupo, 12).replace(/\s+/g, " ") !== group) continue;
    groupStudents.push({id: document.id, ref: document.ref, data});
  }
  if (!groupStudents.length) throw new HttpsError("not-found", "El grupo no contiene alumnos para renumerar.");
  if (groupStudents.length > 99) throw new HttpsError("failed-precondition", "Un grupo no puede contener más de 99 alumnos.");
  groupStudents.sort((first, second) => compareStudentNames({...first.data, id: first.id}, {...second.data, id: second.id}));

  const desiredStudents = groupStudents.map((student, index) => ({
    ...student,
    list: String(index + 1).padStart(2, "0"),
    newId: student.data.manualId === true ? student.id : buildStudentId(level, group, index + 1, student.data),
  }));
  const revision = createHash("sha256").update(desiredStudents.map((student) => [
    student.newId,
    normalizeText(student.data.paterno, 80),
    normalizeText(student.data.materno, 80),
    normalizeText(student.data.nombres, 100),
  ].join(":" )).join("|")).digest("hex").slice(0, 20);
  const idChanges = new Map(desiredStudents.map((student) => [student.id, student.newId]));

  const attendanceRef = schoolCollection(schoolKey, "asistencias");
  const attendanceSnapshot = await attendanceRef.get();
  const attendanceDocumentsByPath = new Map(attendanceSnapshot.docs.map((document) => [document.ref.path, document]));
  const attendanceByDate = new Map();
  for (const document of attendanceSnapshot.docs) {
    const data = document.data() || {};
    if (data.studentIdArchived === true) continue;
    const oldStudentId = normalizeCode(data.alumnoId, 40);
    if (!idChanges.has(oldStudentId)) continue;
    const newStudentId = idChanges.get(oldStudentId);
    if (data.studentIdRevision === revision) continue;
    const date = normalizeText(data.fecha, 20);
    const targetId = date
      ? `${date}_${newStudentId}`
      : document.id.endsWith(`_${oldStudentId}`) ? `${document.id.slice(0, -oldStudentId.length)}${newStudentId}` : document.id;
    const key = date || `document:${document.id}`;
    attendanceByDate.set(key, [...(attendanceByDate.get(key) || []), {
      document,
      targetRef: attendanceRef.doc(targetId),
      data: {
        ...data,
        alumnoId: newStudentId,
        studentIdRevision: revision,
        studentIdMigratedAt: FieldValue.serverTimestamp(),
      },
    }]);
  }

  for (const migrations of attendanceByDate.values()) {
    const batch = db.batch();
    const sourcePaths = new Set(migrations.map((migration) => migration.document.ref.path));
    const conflicts = new Map();
    for (const migration of migrations) {
      const conflict = attendanceDocumentsByPath.get(migration.targetRef.path);
      if (conflict && !sourcePaths.has(conflict.ref.path)) conflicts.set(conflict.ref.path, conflict);
    }
    for (const conflict of conflicts.values()) {
      const archiveRef = attendanceRef.doc(`${conflict.id}_ARCHIVED_${revision.slice(0, 8)}`);
      batch.delete(conflict.ref);
      batch.set(archiveRef, {
        ...conflict.data(),
        studentIdArchived: true,
        studentIdArchivedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const migration of migrations) {
      if (migration.document.ref.path !== migration.targetRef.path) batch.delete(migration.document.ref);
    }
    for (const migration of migrations) batch.set(migration.targetRef, migration.data);
    await batch.commit();
  }

  const studentBatch = db.batch();
  for (const student of desiredStudents) {
    if (student.ref.id !== student.newId) studentBatch.delete(student.ref);
  }
  for (const student of desiredStudents) {
    studentBatch.set(studentsRef.doc(student.newId), {
      ...student.data,
      level,
      grupo: group,
      lista: student.list,
      studentIdRevision: revision,
      studentIdMigratedAt: FieldValue.serverTimestamp(),
    });
  }
  await studentBatch.commit();
  return {
    ok: true,
    students: desiredStudents.length,
    changedIds: desiredStudents.filter((student) => student.id !== student.newId).length,
    attendanceRecords: [...attendanceByDate.values()].reduce((total, migrations) => total + migrations.length, 0),
  };
});

async function deleteCollection(collectionRef) {
  while (true) {
    const snapshot = await collectionRef.limit(400).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

async function copyCollection(sourceRef, targetRef) {
  let lastDocument = null;
  while (true) {
    let page = sourceRef.orderBy(FieldPath.documentId()).limit(300);
    if (lastDocument) page = page.startAfter(lastDocument);
    const snapshot = await page.get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.set(targetRef.doc(document.id), document.data()));
    await batch.commit();
    lastDocument = snapshot.docs.at(-1);
  }
}

exports.clearStudents = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  await deleteCollection(schoolCollection(schoolKey, "alumnos"));
  return {ok: true};
});

exports.listAttendanceReport = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const from = normalizeText(request.data?.from, 10);
  const to = normalizeText(request.data?.to, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new HttpsError("invalid-argument", "Seleccione un rango de fechas válido.");
  }
  const fromDate = Date.parse(`${from}T00:00:00Z`);
  const toDate = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(fromDate) || !Number.isFinite(toDate) || toDate - fromDate > 366 * 86400000) {
    throw new HttpsError("invalid-argument", "El reporte no puede abarcar más de 366 días.");
  }
  const snapshot = await schoolCollection(schoolKey, "asistencias")
      .where("fecha", ">=", from)
      .where("fecha", "<=", to)
      .orderBy("fecha")
      .limit(5000)
      .get();
  const rows = snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      studentId: normalizeCode(data.alumnoId, 40),
      studentName: [normalizeText(data.apellido, 80), normalizeText(data.materno, 80), normalizeText(data.nombre, 100)].filter(Boolean).join(" "),
      teacherName: normalizeText(data.profesorNombre, 100),
      date: normalizeText(data.fecha, 10),
      time: normalizeText(data.hora, 8),
      status: normalizeText(data.status, 20).toUpperCase() === "RETARDO" ? "RETARDO" : "A TIEMPO",
    };
  }).sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time));
  return {rows, truncated: snapshot.size === 5000};
});

exports.clearAttendance = onCall(async (request) => {
  const token = await assertRole(request, MASTER_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  await deleteCollection(schoolCollection(schoolKey, "asistencias"));
  return {ok: true};
});

exports.toggleSchoolFlag = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  const field = String(request.data?.field || "");
  if (!new Set(["isPremium", "allowBranding"]).has(field)) throw new HttpsError("invalid-argument", "Campo no permitido.");
  const enabled = request.data?.value === true;
  const updates = field === "isPremium"
    ? {isPremium: enabled, allowBranding: enabled, premiumUpdatedAt: FieldValue.serverTimestamp(), premiumUpdatedBy: token.sub}
    : {[field]: enabled};
  await schoolsRef().doc(schoolKey).update(updates);
  return {ok: true};
});

exports.setSchoolVerification = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  const verificationStatus = String(request.data?.verificationStatus || "");
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  if (!new Set(["verified", "unverified", "disputed"]).has(verificationStatus)) {
    throw new HttpsError("invalid-argument", "El estado de verificación no es válido.");
  }
  const schoolRef = schoolsRef().doc(schoolKey);
  const school = await schoolRef.get();
  if (!school.exists) throw new HttpsError("not-found", "La CCT no está registrada.");
  await schoolRef.update({
    verificationStatus,
    verificationUpdatedAt: FieldValue.serverTimestamp(),
    verificationUpdatedBy: token.sub,
    ...(verificationStatus === "verified" ? {verifiedAt: FieldValue.serverTimestamp(), verifiedBy: token.sub} : {}),
  });
  return {ok: true, schoolKey, verificationStatus};
});

exports.correctSchoolCct = onCall({timeoutSeconds: 540, memory: "512MiB"}, async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const oldSchoolKey = normalizeCode(request.data?.oldSchoolKey, 40);
  const newSchoolKey = normalizeCode(request.data?.newSchoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(oldSchoolKey) || !/^[A-Z0-9-]{5,40}$/.test(newSchoolKey)) {
    throw new HttpsError("invalid-argument", "Capture una CCT actual y una CCT nueva válidas.");
  }
  if (oldSchoolKey === newSchoolKey) throw new HttpsError("invalid-argument", "La CCT nueva debe ser diferente.");

  const oldSchoolRef = schoolsRef().doc(oldSchoolKey);
  const newSchoolRef = schoolsRef().doc(newSchoolKey);
  const [initialOldSchool, initialNewSchool] = await Promise.all([oldSchoolRef.get(), newSchoolRef.get()]);
  if (!initialOldSchool.exists) {
    if (initialNewSchool.exists && initialNewSchool.get("previousCct") === oldSchoolKey) {
      return {ok: true, oldSchoolKey, newSchoolKey, alreadyCorrected: true};
    }
    throw new HttpsError("not-found", "La CCT actual no está registrada.");
  }
  await db.runTransaction(async (transaction) => {
    const [oldSchool, newSchool] = await Promise.all([
      transaction.get(oldSchoolRef),
      transaction.get(newSchoolRef),
    ]);
    if (!oldSchool.exists) throw new HttpsError("aborted", "La CCT cambió durante el proceso. Vuelva a intentarlo.");
    const resuming = newSchool.exists && oldSchool.get("migrationTarget") === newSchoolKey && oldSchool.get("status") === "migrating";
    if (newSchool.exists && !resuming) throw new HttpsError("already-exists", "La CCT nueva ya está registrada.");
    const previousStatus = oldSchool.get("migrationPreviousStatus") || oldSchool.get("status") || "active";
    transaction.set(oldSchoolRef, {
      status: "migrating",
      migrationTarget: newSchoolKey,
      migrationPreviousStatus: previousStatus,
      migrationStartedAt: FieldValue.serverTimestamp(),
      migrationStartedBy: token.sub,
    }, {merge: true});
    if (!newSchool.exists) {
      const oldData = oldSchool.data() || {};
      delete oldData.migrationTarget;
      delete oldData.migrationPreviousStatus;
      transaction.create(newSchoolRef, {
        ...oldData,
        status: "migrating",
        previousCct: oldSchoolKey,
        cctCorrectionStartedAt: FieldValue.serverTimestamp(),
        cctCorrectionStartedBy: token.sub,
      });
    }
  });

  const teachersSnapshot = await schoolCollection(oldSchoolKey, "maestros").get();
  await Promise.all([
    copyCollection(schoolCollection(oldSchoolKey, "alumnos"), schoolCollection(newSchoolKey, "alumnos")),
    copyCollection(schoolCollection(oldSchoolKey, "maestros"), schoolCollection(newSchoolKey, "maestros")),
    copyCollection(schoolCollection(oldSchoolKey, "asistencias"), schoolCollection(newSchoolKey, "asistencias")),
  ]);

  const credentials = await privateDataRef().collection("teacher_credentials").where("schoolKey", "==", oldSchoolKey).get();
  for (let offset = 0; offset < credentials.docs.length; offset += 300) {
    const batch = db.batch();
    for (const credential of credentials.docs.slice(offset, offset + 300)) {
      const teacherId = requireIdentifier(credential.get("teacherId"), "usuario almacenado");
      batch.set(teacherCredentialRef(newSchoolKey, teacherId), {...credential.data(), schoolKey: newSchoolKey, migratedAt: FieldValue.serverTimestamp()});
    }
    await batch.commit();
  }

  const oldSecretRef = privateDataRef().collection("school_secrets").doc(oldSchoolKey);
  const newSecretRef = privateDataRef().collection("school_secrets").doc(newSchoolKey);
  const oldSecret = await oldSecretRef.get();
  if (oldSecret.exists) await newSecretRef.set({...oldSecret.data(), migratedAt: FieldValue.serverTimestamp()});

  await db.runTransaction(async (transaction) => {
    const [oldSchool, newSchool] = await Promise.all([
      transaction.get(oldSchoolRef),
      transaction.get(newSchoolRef),
    ]);
    if (!newSchool.exists) throw new HttpsError("internal", "No fue posible crear la CCT corregida.");
    if (oldSchool.exists && oldSchool.get("migrationTarget") !== newSchoolKey) {
      throw new HttpsError("aborted", "La migración cambió durante el proceso. Inténtelo nuevamente.");
    }
    const restoredStatus = oldSchool.get("migrationPreviousStatus") || "active";
    transaction.set(newSchoolRef, {
      status: restoredStatus === "migrating" ? "active" : restoredStatus,
      cctCorrectedAt: FieldValue.serverTimestamp(),
      cctCorrectedBy: token.sub,
    }, {merge: true});
    if (oldSchool.exists) transaction.delete(oldSchoolRef);
    if (oldSecret.exists) transaction.delete(oldSecretRef);
  });

  await Promise.all(teachersSnapshot.docs.map((teacher) => revokeTeacherSessions(teacher.get("authUid"))));
  await Promise.all([
    deleteCollection(schoolCollection(oldSchoolKey, "alumnos")),
    deleteCollection(schoolCollection(oldSchoolKey, "maestros")),
    deleteCollection(schoolCollection(oldSchoolKey, "asistencias")),
    deleteCollection(privateDataRef().collection("teacher_credentials").where("schoolKey", "==", oldSchoolKey)),
  ]);
  return {ok: true, oldSchoolKey, newSchoolKey};
});

exports.deleteSchool = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  if (!/^[A-Z0-9-]{5,40}$/.test(schoolKey)) throw new HttpsError("invalid-argument", "La CCT no tiene un formato válido.");
  const schoolRef = schoolsRef().doc(schoolKey);
  const [schoolSnapshot, teachersSnapshot] = await Promise.all([
    schoolRef.get(),
    schoolCollection(schoolKey, "maestros").get(),
  ]);
  if (schoolSnapshot.exists) {
    await schoolRef.set({
      status: "deleting",
      deletionStartedAt: FieldValue.serverTimestamp(),
      deletionStartedBy: token.sub,
    }, {merge: true});
  }
  const authUids = teachersSnapshot.docs.map((teacher) => teacher.get("authUid")).filter(Boolean);
  await Promise.all(authUids.map((authUid) => revokeTeacherSessions(authUid)));
  await deleteAuthUsers(authUids);
  await Promise.all([
    deleteCollection(schoolCollection(schoolKey, "alumnos")),
    deleteCollection(schoolCollection(schoolKey, "maestros")),
    deleteCollection(schoolCollection(schoolKey, "asistencias")),
    deleteCollection(privateDataRef().collection("teacher_credentials").where("schoolKey", "==", schoolKey)),
    deleteCollection(privateDataRef().collection("login_challenges").where("schoolKey", "==", schoolKey)),
  ]);
  await Promise.all([
    schoolRef.delete(),
    privateDataRef().collection("school_secrets").doc(schoolKey).delete(),
    schoolRegistrationRequestsRef().doc(schoolKey).delete(),
  ]);
  return {ok: true, deletedAuthUsers: authUids.length};
});
