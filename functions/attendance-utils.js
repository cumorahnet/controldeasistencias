"use strict";
const {validateWorkDays, validateLevelWorkDays} = require("./school-timetable");

function clockMinutes(value) {
  const match = /^(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function attendanceStatus(localTime, entryTime, tolerance, classDuration = 0) {
  let scannedAt = clockMinutes(localTime);
  const startsAt = clockMinutes(entryTime);
  if (scannedAt === null || startsAt === null) return "A TIEMPO";
  const endsAt = startsAt + Number(classDuration || 0);
  if (endsAt > 1440 && scannedAt < startsAt && scannedAt + 1440 < endsAt) scannedAt += 1440;
  const allowedMinutes = Math.max(0, Math.min(120, Number(tolerance || 0)));
  return scannedAt <= startsAt + allowedMinutes ? "A TIEMPO" : "RETARDO";
}

function normalizedClassDuration(value) {
  const duration = Math.trunc(Number(value));
  return Number.isFinite(duration) ? Math.max(1, Math.min(240, duration)) : 50;
}

function formatClockMinutes(value) {
  const minutes = ((Number(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function attendanceWindow(localTime, entryTime, classDuration) {
  const current = clockMinutes(localTime);
  const startsAt = clockMinutes(entryTime);
  const duration = normalizedClassDuration(classDuration);
  if (current === null || startsAt === null) {
    return {allowed: false, startTime: "", endTime: "", duration};
  }
  const endsAt = startsAt + duration;
  const comparableCurrent = endsAt > 1440 && current < startsAt ? current + 1440 : current;
  return {
    allowed: comparableCurrent >= startsAt && comparableCurrent < endsAt,
    startTime: formatClockMinutes(startsAt),
    endTime: formatClockMinutes(endsAt),
    duration,
  };
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

// Institutional periods include both boundary dates.
function validateAttendancePeriods(periods) {
  if (!Array.isArray(periods) || periods.length > 40) throw new Error("Capture hasta 40 periodos.");
  const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const rows = periods.map((row) => {
    if (!row || !validDate(row.start) || !validDate(row.end) || row.start > row.end || Date.parse(row.end) - Date.parse(row.start) > 366 * 86400000) {
      throw new Error("Cada periodo requiere fechas inicial y final válidas, en orden.");
    }
    return {start: row.start, end: row.end};
  }).sort((a, b) => a.start.localeCompare(b.start));
  if (rows.some((row, i) => i > 0 && row.start <= rows[i - 1].end)) throw new Error("Los periodos no pueden superponerse; ambas fechas están incluidas.");
  return rows;
}

function attendancePeriodForDate(periods, date) {
  return (periods || []).find((period) => period.start <= date && date <= period.end) || null;
}

function validateLevelAttendancePolicies(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((level) => !["PRE", "PRI", "SEC", "BAC"].includes(level))) throw new Error("Las reglas de asistencia requieren niveles válidos.");
  return Object.fromEntries(Object.entries(input).map(([level, policy]) => {
    if (!policy || typeof policy !== "object" || Array.isArray(policy)
      || !Number.isInteger(policy.tolerance) || policy.tolerance < 0 || policy.tolerance > 120
      || !Number.isInteger(policy.tardiesPerAbsence) || policy.tardiesPerAbsence < 0 || policy.tardiesPerAbsence > 30) throw new Error(`Revise la tolerancia y el límite de retardos de ${level}.`);
    const attendancePeriods = validateAttendancePeriods(policy.attendancePeriods);
    if (policy.tardiesPerAbsence > 0 && !attendancePeriods.length) throw new Error(`Configure al menos un periodo para ${level}.`);
    return [level, {tolerance: policy.tolerance, tardiesPerAbsence: policy.tardiesPerAbsence, attendancePeriods}];
  }));
}

function resolveAttendancePolicy(school = {}, level = "") {
  const key = normalizedGroupPart(level);
  const byLevel = school.timetablePreferences?.journeyMode === "levels";
  const policy = byLevel && school.levelAttendancePolicies?.[key];
  const source = policy || school;
  return {tolerance: Math.max(0, Math.min(120, Number(source.tolerance) || 0)),
    tardiesPerAbsence: tardyLimit(source.tardiesPerAbsence), attendancePeriods: source.attendancePeriods || [],
    scope: policy ? key : ""};
}

function validateLevelEntryTimes(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((level) => !["PRE", "PRI", "SEC", "BAC"].includes(level))) throw new Error("Seleccione niveles válidos para las horas de entrada.");
  return Object.fromEntries(Object.entries(input).map(([level, time]) => {
    if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Configure una hora de entrada válida para " + level + ".");
    return [level, time];
  }));
}

function resolveSchoolEntryTime(school = {}, level = "") {
  const key = normalizedGroupPart(level);
  if (school.levelEntryTimes !== undefined) {
    return school.timetablePreferences?.journeyMode === "levels"
      ? school.levelEntryTimes[key] || school.timetable?.levelJourneys?.[key]?.entryTime || school.timetable?.journey?.entryTime || school.entryTime || ""
      : school.entryTime || school.timetable?.journey?.entryTime || "";
  }
  return school.timetable?.levelJourneys?.[key]?.entryTime || school.timetable?.journey?.entryTime || school.entryTime || "";
}

function resolveSchoolWorkDays(school = {}, level = "") {
  const preferences = school.timetablePreferences || {};
  return (preferences.journeyMode === "levels" ? preferences.levelWorkDays?.[normalizedGroupPart(level)] : undefined)
    || preferences.workDays || school.timetable?.levelWorkDays?.[normalizedGroupPart(level)] || school.timetable?.workDays || [1, 2, 3, 4, 5];
}

function applyPeriodTardyPolicy(input = {}) {
  // Undefined is reserved for historical captures made before period configuration.
  const period = input.attendancePeriod;
  const periodKey = period ? `${period.start}/${period.end}` : (period === undefined ? "legacy" : "");
  const key = input.attendancePolicyScope ? `${input.attendancePolicyScope}:${periodKey}` : periodKey;
  const active = period === undefined || (period && period.start <= input.date && input.date <= period.end);
  const limit = active ? input.tardiesPerAbsence : 0;
  const pending = key === input.pendingAttendancePeriod ? input.pendingTardies : 0;
  const policy = applyTardyPolicy({...input, tardiesPerAbsence: limit, pendingTardies: tardyLimit(limit) ? pending : 0});
  return {...policy, pendingAttendancePeriod: key};
}

function normalizedGroupPart(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function schoolClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone: "America/Mexico_City", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return {day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")), time: `${value("hour")}:${value("minute")}`};
}

function activeSchoolSchedule(school, teacherId, date = new Date()) {
  if (!teacherId) return undefined;
  const {day, time} = schoolClock(date);
  const minute = clockMinutes(time);
  return (school.subjectSchedules || []).find((item) => item.teacherId === teacherId && item.day === day
    && minute >= clockMinutes(item.entryTime) && minute < clockMinutes(item.endTime));
}

function validateSubjectSchedules(rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw new Error("Capture hasta 500 clases por plantel.");
  for (const row of rows) {
    if (!row || ["subject", "level", "group"].some((key) => typeof row[key] !== "string" || !row[key].trim() || row[key].length > 100)
      || (row.teacherId !== undefined && (typeof row.teacherId !== "string" || row.teacherId.length > 100 || (row.teacherId !== "" && !row.teacherId.trim())))
      || row.subject.length > 80 || !Number.isInteger(row.day) || row.day < 0 || row.day > 6
      || !/^\d{2}:\d{2}$/.test(row.entryTime) || !/^\d{2}:\d{2}$/.test(row.endTime)
      || clockMinutes(row.entryTime) === null || clockMinutes(row.endTime) === null
      || clockMinutes(row.endTime) <= clockMinutes(row.entryTime)) throw new Error("Cada clase requiere materia, grupo, día e inicio y fin válidos dentro del mismo día. El docente puede asignarse después.");
  }
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i]; const b = rows[j];
    if (a.day === b.day && ((a.teacherId && a.teacherId === b.teacherId) || (a.level === b.level && a.group === b.group))
      && a.entryTime < b.endTime && b.entryTime < a.endTime) throw new Error("Hay clases superpuestas para un docente o grupo. Revise los horarios.");
  }
  return rows;
}

function resolveAttendanceSchedule({teacher = {}, school = {}, role = "", level = "", group = "", teacherId = "", now = new Date()} = {}) {
  const policy = resolveAttendancePolicy(school, level);
  if (role === "docente") {
    const active = activeSchoolSchedule(school, teacherId, now);
    const matches = active && normalizedGroupPart(active.level) === normalizedGroupPart(level) && normalizedGroupPart(active.group) === normalizedGroupPart(group);
    return {entryTime: matches ? active.entryTime : "", classDuration: matches ? clockMinutes(active.endTime) - clockMinutes(active.entryTime) : 0,
      tolerance: policy.tolerance, configuredForGroup: Boolean(matches), requiresTeacherSetup: !matches,
      subject: matches ? active.subject : "", scheduleId: matches ? active.id : "", scheduleDay: matches ? active.day : null};
  }
  const normalizedLevel = normalizedGroupPart(level);
  const normalizedGroup = normalizedGroupPart(group);
  const groupSchedule = (Array.isArray(teacher.groupSchedules) ? teacher.groupSchedules : []).find((item) => (
    normalizedGroupPart(item?.level) === normalizedLevel
      && normalizedGroupPart(item?.group) === normalizedGroup
  ));
  const journey = school.timetable?.levelJourneys?.[normalizedLevel] || school.timetable?.journey;
  const configuredEntry = school.levelEntryTimes !== undefined ? resolveSchoolEntryTime(school, normalizedLevel) : journey?.entryTime;
  const entryTime = String(configuredEntry || groupSchedule?.entryTime || teacher.entryTime || school.entryTime || "").slice(0, 5);
  const toleranceValue = school.levelAttendancePolicies ? policy.tolerance : (groupSchedule?.tolerance ?? teacher.tolerance ?? policy.tolerance);
  const tolerance = Math.max(0, Math.min(120, Number(toleranceValue ?? 0) || 0));
  const classDuration = normalizedClassDuration((role === "docente" ? school.classDuration : (groupSchedule?.classDuration ?? teacher.classDuration ?? school.classDuration)) ?? 50);
  const configuredForGroup = Boolean(groupSchedule && clockMinutes(groupSchedule.entryTime) !== null);
  return {
    entryTime,
    tolerance,
    classDuration,
    configuredForGroup,
    requiresTeacherSetup: role === "docente" && !configuredForGroup,
  };
}

module.exports = {
  resolveSchoolEntryTime, validateLevelEntryTimes,
  validateWorkDays, validateLevelWorkDays,
  resolveSchoolWorkDays,
  resolveAttendancePolicy,
  validateLevelAttendancePolicies,
  activeSchoolSchedule,
  validateSubjectSchedules,
  applyTardyPolicy,
  applyPeriodTardyPolicy,
  attendancePeriodForDate,
  validateAttendancePeriods,
  attendanceStatus,
  attendanceWindow,
  clockMinutes,
  normalizedClassDuration,
  resolveAttendanceSchedule,
  tardyLimit,
};
