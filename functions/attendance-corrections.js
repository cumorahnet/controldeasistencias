"use strict";

const {applyPeriodTardyPolicy} = require("./attendance-utils");

// Replay the student's shared counter using the policy saved on each capture.
function recalculateTardies(records) {
  let pendingTardies = 0;
  let tardyAbsences = 0;
  let pendingAttendancePeriod = "legacy";
  const updates = [];
  for (const record of [...records].sort((a, b) =>
    `${a.data.fecha}|${a.data.hora || ""}|${a.id}`.localeCompare(`${b.data.fecha}|${b.data.hora || ""}|${b.id}`))) {
    const data = record.data;
    const isTardy = data.arrivalStatus === "RETARDO" || ["RETARDO", "FALTA POR RETARDOS"].includes(data.status);
    if (!isTardy && data.tardyLimitApplied === undefined) continue;
    const policy = applyPeriodTardyPolicy({arrivalStatus: isTardy ? "RETARDO" : "A TIEMPO",
      tardiesPerAbsence: data.tardyLimitApplied, pendingTardies, date: data.fecha,
      attendancePeriod: data.attendancePeriodApplied, attendancePolicyScope: data.attendancePolicyScopeApplied, pendingAttendancePeriod});
    if (pendingAttendancePeriod !== policy.pendingAttendancePeriod) tardyAbsences = 0;
    pendingAttendancePeriod = policy.pendingAttendancePeriod;
    pendingTardies = policy.pendingTardies;
    if (!isTardy) continue;
    if (policy.convertedToAbsence) tardyAbsences++;
    const fields = {
      status: policy.status,
      absenceType: policy.convertedToAbsence ? "tardy_limit" : "",
      tardySequence: policy.pendingTardies || policy.tardyLimit,
      justified: policy.convertedToAbsence && data.justified === true,
    };
    if (Object.entries(fields).some(([key, value]) => data[key] !== value)) updates.push({...record, fields});
  }
  return {updates, pendingTardies, tardyAbsences, pendingAttendancePeriod};
}

module.exports = {recalculateTardies};
