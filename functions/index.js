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
const ALLOWED_ROLES = new Set(["docente", "admin_jr", "admin_maestro"]);
const ADMIN_ROLES = new Set(["admin_jr", "admin_maestro"]);

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
  return {
    id: snapshot.id,
    name: normalizeText(data.name || snapshot.id),
    director: normalizeText(data.director),
    administrator: normalizeText(data.administrator),
    entryTime: String(data.entryTime || ""),
    recessReturnTime: String(data.recessReturnTime || ""),
    tolerance: Number(data.tolerance || 0),
    classDuration: Number(data.classDuration || 0),
    isPremium: data.isPremium === true,
    allowBranding: data.allowBranding === true,
    verificationStatus: new Set(["verified", "unverified", "disputed"]).has(data.verificationStatus) ? data.verificationStatus : "unverified",
    brandColor: /^#[0-9a-f]{6}$/i.test(String(data.brandColor || "")) ? data.brandColor : "#3b82f6",
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

async function assertAnotherMasterAdministrator(schoolKey, excludedTeacherId) {
  const snapshot = await schoolCollection(schoolKey, "maestros").where("role", "==", "admin_maestro").limit(5).get();
  if (!snapshot.docs.some((document) => document.id !== excludedTeacherId && document.get("status") !== "disabled")) {
    throw new HttpsError("failed-precondition", "Cada plantel debe conservar al menos un administrador maestro activo.");
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
  const isInitialAdministrator = teacher.role === "admin_maestro" && normalizeCode(schoolSnapshot.get("initialAdminId"), 160) === teacherId;
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
  if (token.role === "admin_jr" && role !== "docente") {
    throw new HttpsError("permission-denied", "Un administrador junior solo puede crear cuentas docentes.");
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

exports.changeTeacherId = onCall(async () => {
  throw new HttpsError("failed-precondition", "El ID de usuario ya no funciona como contraseña. Utilice el cambio de contraseña.");
});

exports.updateSchool = onCall(async (request) => {
  const token = await assertRole(request, new Set(["admin_maestro"]));
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
  if (!(await schoolRef.get()).exists) throw new HttpsError("not-found", "La CCT no está registrada. Créela desde el panel maestro.");
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
  const token = await assertRole(request, new Set(["admin_maestro"]));
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
  if (target.get("role") === "admin_maestro" && role !== "admin_maestro") {
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
    if (token.role === "admin_jr" && role !== "docente") {
      throw new HttpsError("permission-denied", "Un administrador junior solo puede corregir cuentas docentes.");
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
  if (token.role === "admin_jr" && target.get("role") !== "docente") {
    throw new HttpsError("permission-denied", "Un administrador junior solo puede eliminar cuentas docentes.");
  }
  if (target.get("role") === "admin_maestro") await assertAnotherMasterAdministrator(schoolKey, teacherId);
  const authUid = target.get("authUid") || teacherUid(schoolKey, teacherId);
  const batch = db.batch();
  batch.delete(targetRef);
  batch.delete(teacherCredentialRef(schoolKey, teacherId));
  await batch.commit();
  await revokeTeacherSessions(authUid);
  return {ok: true};
});

exports.recordAttendance = onCall(async (request) => {
  const token = await assertRole(request, new Set(["docente", "admin_jr", "admin_maestro"]));
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const studentId = requireIdentifier(request.data?.studentId, "ID del alumno");
  const studentSnapshot = await schoolCollection(schoolKey, "alumnos").doc(studentId).get();
  if (!studentSnapshot.exists) throw new HttpsError("not-found", "El alumno no está registrado.");
  const now = new Date();
  const fecha = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Mexico_City"}).format(now);
  const hora = new Intl.DateTimeFormat("es-MX", {timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(now);
  const attendanceRef = schoolCollection(schoolKey, "asistencias").doc(`${fecha}_${studentId}`);
  const student = studentSnapshot.data() || {};
  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(attendanceRef);
    if (existing.exists) return false;
    transaction.create(attendanceRef, {
      alumnoId: studentId,
      nombre: normalizeText(student.nombres, 100),
      apellido: normalizeText(student.paterno, 80),
      profesorId: token.teacherId,
      profesorNombre: normalizeText(token.name, 100),
      fecha,
      hora,
      timestamp: FieldValue.serverTimestamp(),
    });
    return true;
  });
  return {created, fecha, hora};
});

exports.deleteStudent = onCall(async (request) => {
  const token = await assertRole(request, ADMIN_ROLES);
  const schoolKey = assertSameSchool(token, request.data?.schoolKey);
  const studentId = requireIdentifier(request.data?.studentId, "ID del alumno");
  await schoolCollection(schoolKey, "alumnos").doc(studentId).delete();
  return {ok: true};
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

exports.toggleSchoolFlag = onCall(async (request) => {
  const token = await assertRole(request, new Set());
  if (token.role !== "super") throw new HttpsError("permission-denied", "Esta operación requiere el rol maestro global.");
  const schoolKey = normalizeCode(request.data?.schoolKey, 40);
  const field = String(request.data?.field || "");
  if (!new Set(["isPremium", "allowBranding"]).has(field)) throw new HttpsError("invalid-argument", "Campo no permitido.");
  await schoolsRef().doc(schoolKey).update({[field]: request.data?.value === true});
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
  await Promise.all([
    deleteCollection(schoolCollection(schoolKey, "alumnos")),
    deleteCollection(schoolCollection(schoolKey, "maestros")),
    deleteCollection(schoolCollection(schoolKey, "asistencias")),
    deleteCollection(privateDataRef().collection("teacher_credentials").where("schoolKey", "==", schoolKey)),
  ]);
  await Promise.all([
    schoolsRef().doc(schoolKey).delete(),
    privateDataRef().collection("school_secrets").doc(schoolKey).delete(),
  ]);
  return {ok: true};
});
