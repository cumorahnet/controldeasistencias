"use strict";

const {applyTardyPolicy} = require("./attendance-utils");

// Replay the student's shared counter using the policy saved on each capture.
function recalculateTardies(records) {
  let pendingTardies = 0;
  let tardyAbsences = 0;
  const updates = [];
  for (const record of [...records].sort((a, b) =>
    `${a.data.fecha}|${a.data.hora || ""}|${a.id}`.localeCompare(`${b.data.fecha}|${b.data.hora || ""}|${b.id}`))) {
    const data = record.data;
    if (data.arrivalStatus !== "RETARDO" && !["RETARDO", "FALTA POR RETARDOS"].includes(data.status)) continue;
    const policy = applyTardyPolicy({arrivalStatus: "RETARDO", tardiesPerAbsence: data.tardyLimitApplied, pendingTardies});
    pendingTardies = policy.pendingTardies;
    if (policy.convertedToAbsence) tardyAbsences++;
    const fields = {
      status: policy.status,
      absenceType: policy.convertedToAbsence ? "tardy_limit" : "",
      tardySequence: policy.pendingTardies || policy.tardyLimit,
      justified: policy.convertedToAbsence && data.justified === true,
    };
    if (Object.entries(fields).some(([key, value]) => data[key] !== value)) updates.push({...record, fields});
  }
  return {updates, pendingTardies, tardyAbsences};
}

module.exports = {recalculateTardies};
