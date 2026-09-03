const normalizeStudentId = (value) => String(value || "").trim().toUpperCase().slice(0, 40);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export function createAttendanceExportData({
  report,
  schoolName = "Control de asistencia",
  schoolKey = "",
  attendanceLabel = () => "ASISTENCIA",
} = {}) {
  if (!report || !Array.isArray(report.students) || !Array.isArray(report.dates) || !Array.isArray(report.rows)) {
    throw new TypeError("El reporte de asistencia no es válido.");
  }

  const dates = report.dates.filter(validDate);
  const attendanceByStudentAndDate = new Map();
  for (const attendance of report.rows) {
    const studentId = normalizeStudentId(attendance?.studentId);
    const date = String(attendance?.date || "");
    if (!studentId || !validDate(date)) continue;
    const key = `${studentId}|${date}`;
    if (!attendanceByStudentAndDate.has(key)) attendanceByStudentAndDate.set(key, attendance);
  }

  const rows = [
    ["Reporte de asistencia"],
    ["Plantel", schoolName || "Control de asistencia"],
    ["CCT", schoolKey],
    ["Periodo", `${report.from} a ${report.to}`],
    ["Grupos", (report.groups || []).map((group) => group.label).filter(Boolean).join(" · ")],
    [],
    ["Nombre del alumno", ...dates.map((date) => new Date(`${date}T12:00:00Z`)), "Total asistencias"],
  ];

  for (const student of report.students) {
    const studentId = normalizeStudentId(student?.id);
    let total = 0;
    const attendanceCells = dates.map((date) => {
      const attendance = attendanceByStudentAndDate.get(`${studentId}|${date}`);
      if (!attendance) return "FALTA NORMAL";
      const label = attendanceLabel(attendance) || "ASISTENCIA";
      if (!/^FALTA\b/i.test(label)) total += 1;
      return label;
    });
    rows.push([String(student?.name || studentId), ...attendanceCells, total]);
  }

  return {
    rows,
    headerRowIndex: 6,
    studentRowStart: 7,
    dateColumnStart: 1,
    dateColumnCount: dates.length,
    totalColumnIndex: dates.length + 1,
    lastRowIndex: rows.length - 1,
  };
}

export function attendanceExportFilename({schoolKey = "plantel", from = "inicio", to = "fin"} = {}) {
  const clean = (value, fallback) => String(value || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return `reporte_asistencia_${clean(schoolKey, "plantel")}_${clean(from, "inicio")}_${clean(to, "fin")}.xls`;
}
