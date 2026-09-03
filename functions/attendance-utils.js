"use strict";

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
  const allowedMinutes = Math.max(0, Math.min(120, Number(tolerance || 0)));
  return scannedAt <= startsAt + allowedMinutes ? "A TIEMPO" : "RETARDO";
}

function tardyLimit(value) {
  const limit = Math.trunc(Number(value));
  return Number.isFinite(limit) ? Math.max(0, Math.min(30, limit)) : 0;
}

function applyTardyPolicy({arrivalStatus, tardiesPerAbsence, pendingTardies} = {}) {
  const status = String(arrivalStatus || "").trim().toUpperCase() === "RETARDO" ? "RETARDO" : "A TIEMPO";
  const limit = tardyLimit(tardiesPerAbsence);
  const currentPending = Math.max(0, Math.trunc(Number(pendingTardies) || 0));
  if (status !== "RETARDO" || limit === 0) {
    return {status, convertedToAbsence: false, pendingTardies: currentPending, tardyLimit: limit};
  }
  const nextPending = currentPending + 1;
  const convertedToAbsence = nextPending >= limit;
  return {
    status: convertedToAbsence ? "FALTA POR RETARDOS" : "RETARDO",
    convertedToAbsence,
    pendingTardies: convertedToAbsence ? 0 : nextPending,
    tardyLimit: limit,
  };
}

function normalizedGroupPart(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function resolveAttendanceSchedule({teacher = {}, school = {}, role = "", level = "", group = ""} = {}) {
  const normalizedLevel = normalizedGroupPart(level);
  const normalizedGroup = normalizedGroupPart(group);
  const groupSchedule = (Array.isArray(teacher.groupSchedules) ? teacher.groupSchedules : []).find((item) => (
    normalizedGroupPart(item?.level) === normalizedLevel
      && normalizedGroupPart(item?.group) === normalizedGroup
  ));
  const entryTime = String(groupSchedule?.entryTime || teacher.entryTime || school.entryTime || "").slice(0, 5);
  const tolerance = Math.max(0, Math.min(120, Number(groupSchedule?.tolerance ?? teacher.tolerance ?? school.tolerance ?? 0)));
  const configuredForGroup = Boolean(groupSchedule && clockMinutes(groupSchedule.entryTime) !== null);
  return {
    entryTime,
    tolerance,
    configuredForGroup,
    requiresTeacherSetup: role === "docente" && !configuredForGroup,
  };
}

module.exports = {
  applyTardyPolicy,
  attendanceStatus,
  clockMinutes,
  resolveAttendanceSchedule,
  tardyLimit,
};
