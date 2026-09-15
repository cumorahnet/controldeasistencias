/* Shared timetable engine. Keep functions/school-timetable.js identical (verified by tests). */
(function (root) {
  "use strict";
  const minutes = (value) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
  const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  function generateModules(config) {
    const start = minutes(config.entryTime), end = minutes(config.endTime);
    const count = config.modulesPerDay, gap = config.breakMinutes;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("La salida debe ser posterior a la entrada, dentro del mismo día.");
    if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isInteger(gap) || gap < 0 || gap > 120) throw new Error("Indique de 1 a 20 módulos y descansos de 0 a 120 minutos.");
    const slots = [];
    let module = 0;
    const add = (type, a, b) => slots.push({type, entryTime: clock(a), endTime: clock(b), ...(type === "module" ? {module: ++module} : {})});
    const segment = (a, b, n) => {
      const available = b - a - gap * (n - 1);
      const duration = Math.floor(available / n), remainder = available % n;
      if (duration < 1 || duration + (remainder > 0 ? 1 : 0) > 240) throw new Error("La jornada debe permitir módulos de 1 a 240 minutos después de descontar descansos y receso.");
      for (let i = 0; i < n; i++) {
        const next = a + duration + (i < remainder ? 1 : 0);
        add("module", a, next); a = next;
        if (i < n - 1 && gap) {add("break", a, a + gap); a += gap;}
      }
    };
    if (config.recessStart || config.recessEnd) {
      const rs = minutes(config.recessStart), re = minutes(config.recessEnd);
      if (!Number.isFinite(rs) || !Number.isFinite(re) || rs <= start || re <= rs || re >= end || count < 2) throw new Error("El receso requiere inicio y fin dentro de la jornada y al menos dos módulos.");
      // Choose the feasible split with the most similar module lengths on either side.
      const candidates = [];
      for (let n = 1; n < count; n++) {
        const a = (rs - start - gap * (n - 1)) / n;
        const b = (end - re - gap * (count - n - 1)) / (count - n);
        if (a >= 1 && b >= 1 && a <= 240 && b <= 240) candidates.push({n, difference: Math.abs(a - b)});
      }
      candidates.sort((a, b) => a.difference - b.difference);
      if (!candidates.length) throw new Error("No caben los módulos y descansos alrededor del receso. Ajuste la jornada.");
      segment(start, rs, candidates[0].n); add("recess", rs, re); segment(re, end, count - candidates[0].n);
    } else segment(start, end, count);
    return slots;
  }
  const journeyFields = ["entryTime", "endTime", "modulesPerDay", "breakMinutes", "recessStart", "recessEnd"];
  function normalizeJourney(input) {
    if (!input || typeof input !== "object") throw new Error("Configure la jornada institucional.");
    const journey = Object.fromEntries(journeyFields.map((key) => [key, key.startsWith("recess") ? input[key] || "" : input[key]]));
    generateModules(journey);
    return journey;
  }
  function journeyForLevel(input, level) {
    return input.levelJourneys?.[level] || input.journey;
  }
  function applyJourney(input, rows, source, levels) {
    const journey = normalizeJourney(source);
    if (levels !== undefined && (!Array.isArray(levels) || !levels.length || new Set(levels).size !== levels.length || levels.some((level) => !["PRE", "PRI", "SEC", "BAC"].includes(level)))) throw new Error("Seleccione los niveles a los que se aplica la jornada.");
    const affected = (level) => levels === undefined || levels.includes(level);
    const modules = generateModules(journey).filter((slot) => slot.type === "module");
    const groups = input.groups.map((group) => affected(group.level) ? {level: group.level, group: group.group, ...journey} : {...group});
    const schedules = rows.map((row) => {
      if (!affected(row.level)) return {...row};
      const previous = input.groups.find((group) => group.level === row.level && group.group === row.group);
      if (!previous) return {...row}; // Legacy tables remain until explicitly converted.
      const oldModules = generateModules(previous).filter((slot) => slot.type === "module");
      const index = oldModules.findIndex((slot) => slot.entryTime === row.entryTime && slot.endTime === row.endTime);
      if (index < 0 || !modules[index]) throw new Error("No se puede reducir la jornada: hay materias en módulos que desaparecerían. Reubíquelas primero.");
      return {...row, entryTime: modules[index].entryTime, endTime: modules[index].endTime};
    });
    const settings = levels === undefined ? {journey, levelJourneys: {}} : {levelJourneys: {...input.levelJourneys, ...Object.fromEntries(levels.map((level) => [level, journey]))}};
    return {timetable: validateTimetable({...input, ...settings, groups}, schedules), schedules};
  }
  function validateTimetable(input, rows) {
    if (!input || !Array.isArray(input.workDays) || !input.workDays.length || input.workDays.length > 7 || new Set(input.workDays).size !== input.workDays.length || input.workDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Seleccione los días laborables de la escuela.");
    if (!Array.isArray(input.groups) || input.groups.length > 100) throw new Error("Configure hasta 100 grupos.");
    const journey = input.journey === undefined ? undefined : normalizeJourney(input.journey);
    let levelJourneys;
    if (input.levelJourneys !== undefined) {
      if (!input.levelJourneys || typeof input.levelJourneys !== "object" || Array.isArray(input.levelJourneys) || Object.keys(input.levelJourneys).some((level) => !["PRE", "PRI", "SEC", "BAC"].includes(level))) throw new Error("Los niveles de las jornadas no son válidos.");
      levelJourneys = Object.fromEntries(Object.entries(input.levelJourneys).map(([level, value]) => [level, normalizeJourney(value)]));
    }
    const keys = new Set();
    const groups = input.groups.map((item) => {
      if (!item || !["PRE", "PRI", "SEC", "BAC"].includes(item.level) || typeof item.group !== "string" || !item.group.trim() || item.group.length > 40) throw new Error("Seleccione nivel y nombre de grupo.");
      const inherited = levelJourneys?.[item.level] || journey;
      if (inherited && journeyFields.some((key) => item[key] !== undefined && (item[key] || (key.startsWith("recess") ? "" : item[key])) !== inherited[key])) throw new Error("Los grupos deben usar la jornada configurada para su nivel.");
      const source = inherited || item;
      const group = {level: item.level, group: item.group.trim().toUpperCase(), entryTime: source.entryTime, endTime: source.endTime, modulesPerDay: source.modulesPerDay, breakMinutes: source.breakMinutes, recessStart: source.recessStart || "", recessEnd: source.recessEnd || ""};
      const key = `${group.level}/${group.group}`;
      if (keys.has(key)) throw new Error("Hay grupos duplicados en la configuración.");
      keys.add(key);
      const modules = generateModules(group).filter((slot) => slot.type === "module");
      for (const row of rows.filter((r) => r.level === group.level && r.group === group.group)) {
        if (!input.workDays.includes(row.day) || !modules.some((m) => m.entryTime === row.entryTime && m.endTime === row.endTime)) throw new Error(`Revise las materias de ${key}: deben coincidir con los módulos y días laborables configurados.`);
      }
      return group;
    });
    // Unconfigured legacy groups remain editable until the administrator converts them.
    if (rows.some((row) => !input.workDays.includes(row.day))) throw new Error("Hay clases en días no laborables. Reubíquelas antes de guardar.");
    let subjects;
    if (input.subjects !== undefined) {
      if (!Array.isArray(input.subjects) || input.subjects.length > 200) throw new Error("El catálogo admite hasta 200 materias.");
      const keys = new Set();
      subjects = input.subjects.map((subject) => {
        if (!subject || typeof subject.name !== "string") throw new Error("Capture el nombre de cada materia.");
        if (subject.level !== undefined && !["PRE", "PRI", "SEC", "BAC"].includes(subject.level)) throw new Error("Seleccione un nivel válido para la materia.");
        const name = subject.name.trim().replace(/\s+/g, " ").toUpperCase();
        const key = (subject.level || "*") + "/" + name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!name || name.length > 80) throw new Error("Indique una materia de hasta 80 caracteres.");
        if (keys.has(key)) throw new Error("La materia ya está en el catálogo.");
        keys.add(key);
        return {name, ...(subject.level ? {level: subject.level} : {})};
      });
    }
    return {workDays: [...input.workDays], groups, ...(journey ? {journey} : {}), ...(levelJourneys ? {levelJourneys} : {}), ...(subjects ? {subjects} : {})};
  }
  const api = {generateModules, validateTimetable, applyJourney, journeyForLevel};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SchoolTimetable = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
