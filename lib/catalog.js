'use strict';
/* Catálogo de actividades y reglas de asignación. Una sola fuente de verdad:
   lo usan el build (auditoría), el servidor y el navegador.
   El catálogo final = Excel (data/) + cambios hechos desde la app (lista EcoCatalogo). */
const Schedule = (typeof require === 'function') ? require('./schedule') : globalThis.Schedule;

const TEAMS = ['Aseo', 'Mantenimiento', 'Jardinería'];
const TEAM_KEY = { 'Aseo': 'A', 'Jardinería': 'J', 'Mantenimiento': 'M' };
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const slug = (s, n = 28) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, n);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameIn = (text, name) => new RegExp('(^|[^A-Za-z0-9])' + escRe(name) + '(?![A-Za-z0-9])', 'i').test(text);
const dowOf = ds => new Date(ds + 'T12:00:00Z').getUTCDay();   // 0 = domingo
function toMin(t) {
  const m = /(\d{1,2}):(\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?|m\.?)?/i.exec(t || '');
  if (!m) return null;
  let h = +m[1]; const mi = +m[2], s = (m[3] || '').toLowerCase().replace(/[.\s]/g, '');
  if (s === 'pm' && h < 12) h += 12;
  if (s === 'am' && h === 12) h = 0;
  return h * 60 + mi;
}
/** "07:00" (campo de hora) ⇄ "7:00 a.m." (formato del Excel) */
const to12h = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); if (!m) return ''; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'p.m.' : 'a.m.'}`; };
const from12h = label => { const t = toMin(label); return t == null ? '' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const timeOk = s => /^\d{1,2}:\d{2} (a\.m\.|p\.m\.)$/.test(s || '') && toMin(s) != null && +/^(\d{1,2})/.exec(s)[1] >= 1 && +/^(\d{1,2})/.exec(s)[1] <= 12;
function shortZone(z) { z = (z || '').split(/\s\(|:/)[0].trim(); return z.length > 60 ? z.slice(0, 57) + '…' : z; }
function photoReq(ev) {
  const e = (ev || '').toLowerCase();
  if (/antes y despu/.test(e)) return true;
  if (/solo si hay incidencia/.test(e)) return false;
  return /foto/.test(e);
}
function cleanEvidence(ev) {
  let e = (ev || '').trim();
  if (/^notificaci/i.test(e)) return 'Cerrar el reporte al salir';
  e = e.replace(/^Grupo de WhatsApp\s*-\s*/i, '');
  if (/solo si hay incidencia/i.test(e)) return 'Foto solo si hay incidencia';
  return e || '—';
}
/** Agrega a cada fila del cronograma diario los campos que usa la app. */
function enrichDaily(books) {
  const out = [], seen = {};
  for (const bk of Object.keys(books)) for (const t of books[bk].diario.tasks) {
    const base = `${TEAM_KEY[t.team]}-${t.code}`; seen[base] = (seen[base] || 0) + 1;
    out.push({ ...t, bookKey: bk, _base: base });
  }
  for (const t of out) {
    t.id = seen[t._base] > 1 ? `${t._base}-${slug(t.zona)}` : t._base; delete t._base;
    t.startMin = toMin(t.inicio); t.endMin = toMin(t.fin);
    t.zonaCorta = shortZone(t.zona);
    t.title = t.zonaCorta ? `${t.bloque} · ${t.zonaCorta}` : t.bloque;
    t.horario = `${t.inicio.trim()} a ${t.fin.trim()}`;
    t.photoReq = photoReq(t.evidencia); t.evidenciaTxt = cleanEvidence(t.evidencia);
    t.periodic = false;
  }
  return out;
}

/* ============================================================
   FUSIÓN: Excel + cambios hechos desde la app
   ============================================================ */
const EV_TXT = { obligatoria: 'Fotografía al finalizar', opcional: 'Solo si hay incidencia' };
const asgTxt = (a, team) => a === 'turno' ? `Todo el turno de ${team}` : Array.isArray(a) ? a.join(', ') : '';
const FREQ = { dias: 'Semanal', nth: 'Mensual', semanas: 'Mensual', meses: 'En meses específicos' };
const periodicTime = (v, rule) => { v.inicio = rule.hora || ''; v.fin = ''; v.horario = rule.hora || 'Durante el día'; v.startMin = rule.hora ? toMin(rule.hora) : 9000; v.endMin = 1439; };

function buildCustom(e) {
  const d = e.datos, periodic = d.modo !== 'dias';
  const t = { id: e.id, custom: true, periodic, modo: d.modo, team: d.team, bookKey: d.team === 'Aseo' ? 'Aseo' : 'MantJard', desde: e.desde || '', hasta: e.hasta || '',
    bloque: d.bloque, apartado: d.apartado || '', zona: d.zona || '', zonaCorta: shortZone(d.zona), actividades: d.actividades, condicion: d.condicion || 'Actividad realizada y registrada con su evidencia',
    evidencia: EV_TXT[d.evidencia], photoReq: d.evidencia === 'obligatoria', evidenciaTxt: cleanEvidence(EV_TXT[d.evidencia]), asignar: d.asignar,
    responsable: asgTxt(d.asignar, d.team), responsableTxt: asgTxt(d.asignar, d.team), propuesto: false, nota: '', editada: false };
  if (periodic) {
    t.code = 'PER'; t.rule = d.rule; t.regla = Schedule.describe(d.rule); t.programada = true; t.frecuencia = FREQ[d.modo]; t.cuando = '(agregada desde la app)';
    t.espacio = t.zona; t.tarea = d.bloque; t.title = `${d.bloque}${t.zona ? ' · ' + t.zona : ''}`; t.bloque = `Tarea periódica · ${t.frecuencia}`; periodicTime(t, d.rule);
  } else {
    t.code = 'AGR'; t.dayType = 'CUSTOM'; t.dias = d.dias; t.inicio = d.inicio; t.fin = d.fin; t.startMin = toMin(d.inicio); t.endMin = toMin(d.fin);
    t.horario = `${d.inicio} a ${d.fin}`; t.title = t.zonaCorta ? `${d.bloque} · ${t.zonaCorta}` : d.bloque;
  }
  return t;
}
/** Devuelve un catálogo completo (sin tocar el estado global). */
function merge(seed, edits) {
  const E = { T: {}, P: {} };
  for (const e of (edits || [])) { if (e.tipo === 'tarea') E.T[e.id] = e; else if (e.tipo === 'persona') E.P[e.nombre] = e; }
  const people = [], seen = new Set();
  for (const bk of Object.keys(seed.books)) for (const p of seed.books[bk].horario.people) {
    const e = E.P[p.nombre], team = bk === 'Aseo' ? 'Aseo' : (p.nombre.startsWith('Jardiner') ? 'Jardinería' : 'Mantenimiento');
    people.push({ nombre: p.nombre, team, dias: (e && e.datos && e.datos.dias) || p.dias, fechas: (e && e.datos && e.datos.fechas) || {}, base: true, desde: '', hasta: e ? (e.hasta || '') : '', editada: !!e }); seen.add(p.nombre);
  }
  for (const e of Object.values(E.P)) if (!seen.has(e.nombre)) people.push({ nombre: e.nombre, team: e.datos.team, dias: e.datos.dias, fechas: e.datos.fechas || {}, base: false, desde: e.desde || '', hasta: e.hasta || '', editada: false });
  const PEOPLE = {}, HORARIO = {}; for (const p of people) { PEOPLE[p.nombre] = p; HORARIO[p.nombre] = p.dias; }

  const baseTask = t => {
    const e = E.T[t.id]; if (!e) return t;
    const d = e.datos || {}, v = { ...t, editada: true, hasta: e.hasta || '' };
    if (Array.isArray(d.dias) && !t.periodic) v.dias = d.dias;
    if (d.inicio) { v.inicio = d.inicio; v.startMin = toMin(d.inicio); }
    if (d.fin) { v.fin = d.fin; v.endMin = toMin(d.fin); }
    if ((d.inicio || d.fin) && !t.periodic) v.horario = `${v.inicio.trim()} a ${v.fin.trim()}`;
    if (d.asignar) { v.asignar = d.asignar; v.responsableTxt = asgTxt(d.asignar, v.team); v.propuesto = false; }
    if (d.actividades) v.actividades = d.actividades;
    if (d.condicion) v.condicion = d.condicion;
    if (d.evidencia) { v.evidencia = EV_TXT[d.evidencia]; v.photoReq = d.evidencia === 'obligatoria'; v.evidenciaTxt = cleanEvidence(v.evidencia); }
    if (d.rule && t.periodic) { v.rule = d.rule; v.regla = Schedule.describe(d.rule); v.programada = Schedule.resolved(d.rule); periodicTime(v, d.rule); v.propuesto = false; }
    return v;
  };
  const customs = Object.values(E.T).filter(e => e.custom).map(buildCustom);
  const TASKS = seed.tasks.map(baseTask).concat(customs.filter(t => !t.periodic));
  const PERIODICAS = (seed.periodicas || []).map(baseTask).concat(customs.filter(t => t.periodic));
  const ALL = TASKS.concat(PERIODICAS), byId = Object.fromEntries(ALL.map(t => [t.id, t]));
  return { TASKS, PERIODICAS, ALL, byId, people, PEOPLE, HORARIO, edits: E };
}

/* ---------- estado del catálogo cargado (navegador) ---------- */
const C = { seed: null, TASKS: [], PERIODICAS: [], ALL: [], byId: {}, HORARIO: {}, PEOPLE: {}, people: [], edits: { T: {}, P: {} } };
function init(seed, edits) { Object.assign(C, merge(seed, edits || []), { seed }); return C; }

const works = (u, dow, date) => {
  const p = C.PEOPLE[u.puesto]; if (!p) return true;
  if (date && ((p.desde && date < p.desde) || (p.hasta && date > p.hasta))) return false;
  if (date && p.fechas && Object.prototype.hasOwnProperty.call(p.fechas, date)) return p.fechas[date] === 'Trabaja';
  return p.dias[(dow + 6) % 7] === 'Trabaja';
};
/** La versión de la tarea que rige en esa fecha (null si todavía no existía o ya se desactivó). */
const eff = (t, date) => (t.desde && date < t.desde) || (t.hasta && date > t.hasta) ? null : t;
const DAYNAMES_RE = /^(Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo)\s*:/i;
const flat = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function laboresDelDia(t, date) {
  const parts = t.actividades.split('•').map(s => s.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
  if (!parts.some(p => DAYNAMES_RE.test(p))) return parts;
  const dn = flat(DAYS[dowOf(date)]);
  return parts.filter(p => { if (/^todos los d/i.test(p)) return true; const m = DAYNAMES_RE.exec(p); return !m || flat(m[1]) === dn; });
}
/** Personas del equipo que trabajan ese día y están en la lista de responsables. */
function assignList(task, date, users) {
  const dow = dowOf(date), duty = users.filter(u => u.rol === 'Operativo' && u.team === task.team && works(u, dow, date));
  return (task.asignar === 'turno' ? duty : duty.filter(u => task.asignar.includes(u.puesto))).map(u => u.email);
}
function assignPeriodic(task, date, users) {
  if (!Schedule.isDue(task.rule, date)) return [];
  const dow = dowOf(date), ops = users.filter(u => u.rol === 'Operativo'), duty = ops.filter(u => u.team === task.team && works(u, dow, date)), a = task.asignar;
  if (a && a.comoTareas) { const set = new Set(); for (const id of a.comoTareas) { const t = C.byId[id]; if (t) autoAssign(t, date, users).forEach(e => set.add(e)); } return [...set]; }
  if (Array.isArray(a)) { const sel = ops.filter(u => a.includes(u.puesto) && works(u, dow, date)); if (sel.length) return sel.map(u => u.email); }
  if (a === 'turno' || !Array.isArray(a)) return duty.map(u => u.email);
  return duty.slice(0, 1).map(u => u.email);   // el puesto propuesto no trabaja ese día: cae al primero del equipo en turno
}
function autoAssign(task, date, users) {
  if (task.periodic) return assignPeriodic(task, date, users);
  const dow = dowOf(date), week = dow >= 1 && dow <= 5;
  if (task.custom) return task.dias[(dow + 6) % 7] ? assignList(task, date, users) : [];
  if (Array.isArray(task.dias) ? !task.dias[(dow + 6) % 7] : (task.dayType === 'LV') !== week) return [];
  if (task.asignar) return assignList(task, date, users);                 // reasignada desde la app
  const duty = users.filter(u => u.rol === 'Operativo' && u.team === task.team && works(u, dow, date)), r = task.responsable;
  if (task.team === 'Aseo') {
    if (/colaboradoras/i.test(r)) return duty.map(u => u.email);
    let seg = r;
    if (!week) { const m = (dow === 6 ? /S[aá]b\w*:\s*([\s\S]*?)(?=Dom\w*:|$)/i : /Dom\w*:\s*([\s\S]*)$/i).exec(r); if (m) seg = m[1]; }
    return duty.filter(u => nameIn(seg, u.puesto)).map(u => u.email);
  }
  if (week) return duty.filter(u => nameIn(r, u.puesto)).map(u => u.email);
  if (/turno/i.test(r)) return duty.map(u => u.email);
  const slots = C.TASKS.filter(t => t.team === task.team && t.dayType === 'SD' && !/turno/i.test(t.responsable)).sort((a, b) => a.code.localeCompare(b.code));
  const idx = slots.findIndex(t => t.id === task.id);
  const d = [...duty].sort((a, b) => a.puesto.localeCompare(b.puesto, 'es', { numeric: true }));
  return (!d.length || idx < 0) ? [] : [d[idx % d.length].email];
}
const assignedEmails = (t, date, users, ov) => (ov && ov[t.id]) ? ov[t.id] : autoAssign(t, date, users);
const sortTasks = (a, b) => (a.startMin - b.startMin) || a.code.localeCompare(b.code) || a.id.localeCompare(b.id);
/** Tareas (diarias y periódicas que tocan ese día) de una persona. */
function tasksForUser(u, date, users, ov) {
  return C.ALL.map(t => eff(t, date)).filter(Boolean).filter(t => assignedEmails(t, date, users, ov).includes(u.email)).sort(sortTasks);
}
/** Igual, pero sumando lo que ya quedó registrado en el reporte aunque la actividad haya cambiado después. */
function tasksWithHistory(u, date, users, ov, doc) {
  const list = tasksForUser(u, date, users, ov), have = new Set(list.map(t => t.id));
  for (const id of Object.keys((doc && doc.items) || {})) if (!have.has(id) && C.byId[id]) list.push(C.byId[id]);
  return list.sort(sortTasks);
}
/** Tareas que existen ese día (para el panel de asignaciones). */
function tasksOfDay(date) {
  const dow = dowOf(date), week = dow >= 1 && dow <= 5;
  return C.ALL.map(t => eff(t, date)).filter(Boolean).filter(t => t.periodic ? Schedule.isDue(t.rule, date) : t.custom ? t.dias[(dow + 6) % 7] : (Array.isArray(t.dias) ? t.dias[(dow + 6) % 7] : (t.dayType === 'LV') === week));
}

/* ============================================================
   VALIDACIÓN DE CAMBIOS (la usan el servidor y la demo)
   ============================================================ */
const bad = m => Object.assign(new Error(m), { status: 400 });
const str = (v, max, label, min = 0) => { v = String(v == null ? '' : v).trim(); if (v.length < min) throw bad(`Falta ${label}.`); if (v.length > max) throw bad(`${label} es demasiado largo (máximo ${max} caracteres).`); return v; };
function vRule(raw, today) {
  const r = {}; raw = raw || {};
  if (raw.hora !== undefined && raw.hora !== '') { if (!timeOk(raw.hora)) throw bad('La hora no es válida.'); r.hora = raw.hora; }
  if (raw.nth !== undefined) { if (![1, 2, 3, 4, -1].includes(raw.nth) || !Number.isInteger(raw.dow) || raw.dow < 0 || raw.dow > 6) throw bad('El día del mes no es válido.'); r.nth = raw.nth; r.dow = raw.dow; }
  if (raw.weekly) { r.weekly = true; const ds = Array.isArray(raw.dows) ? [...new Set(raw.dows)] : []; if (!ds.length || ds.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw bad('Elegí al menos un día de la semana.'); r.dows = ds.sort((a, b) => a - b); }
  if (raw.weeks !== undefined) { const w = Array.isArray(raw.weeks) ? [...new Set(raw.weeks)] : []; if (!w.length || w.some(x => ![1, 2, 3, 4].includes(x))) throw bad('Elegí al menos una semana del mes.'); r.weeks = w.sort(); }
  if (raw.months !== undefined) { const m = Array.isArray(raw.months) ? [...new Set(raw.months)] : []; if (m.some(x => !Number.isInteger(x) || x < 1 || x > 12)) throw bad('Los meses no son válidos.'); if (m.length) r.months = m.sort((a, b) => a - b); }
  if (!Schedule.resolved(r)) throw bad('Falta definir cuándo se hace la actividad.');
  if (!Schedule.nextDue(r, today, 800)) throw bad('Esa programación nunca cae en una fecha. Revisá los meses y los días elegidos.');
  return r;
}
function vAsignar(a, team, M) {
  if (a === 'turno') return 'turno';
  if (!Array.isArray(a) || !a.length || a.length > 40) throw bad('Elegí al menos una persona responsable (o «todo el turno»).');
  const out = [...new Set(a.map(String))];
  for (const n of out) { const p = M.PEOPLE[n]; if (!p || p.team !== team) throw bad(`«${n}» no es una persona del equipo de ${team}.`); }
  return out;
}
function vLineas(l) {
  if (!Array.isArray(l)) throw bad('Escribí las labores, una por línea.');
  const lines = l.map(x => String(x).replace(/[•\r\n]+/g, ' ').trim()).filter(Boolean);
  if (!lines.length) throw bad('Escribí al menos una labor.'); if (lines.length > 30) throw bad('Máximo 30 labores por actividad.');
  if (lines.some(x => x.length > 300)) throw bad('Cada labor puede tener hasta 300 caracteres.');
  return lines.map(x => '• ' + x).join(' ');
}
const vEv = e => { if (e !== 'obligatoria' && e !== 'opcional') throw bad('Elegí cómo se pide la foto.'); return e; };
function vHorario(inicio, fin) {
  if (!timeOk(inicio) || !timeOk(fin)) throw bad('Completá la hora de inicio y la de fin.');
  if (toMin(fin) <= toMin(inicio)) throw bad('La hora de fin debe ser posterior a la de inicio.');
}
function validatePersona(raw, M, today) {
  const nombre = str(raw.nombre, 40, 'el nombre', 2);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'\-]*$/u.test(nombre)) throw bad('El nombre solo puede tener letras, números, espacios, punto, guion o apóstrofo.');
  const dup = Object.keys(M.PEOPLE).find(n => n.toLowerCase() === nombre.toLowerCase());
  if (dup && dup !== nombre) throw bad('Ya existe una persona con ese nombre.');
  const ex = M.PEOPLE[nombre], prev = M.edits.P[nombre] || null, d = raw.datos;
  let dias = prev && prev.datos ? prev.datos.dias : (ex ? ex.dias : undefined);
  if (d && d.dias !== undefined) {
    if (!Array.isArray(d.dias) || d.dias.length !== 7 || d.dias.some(x => x !== 'Trabaja' && x !== 'Descanso')) throw bad('Los días de trabajo no son válidos.');
    if (!d.dias.includes('Trabaja')) throw bad('La persona debe trabajar al menos un día a la semana.');
    dias = d.dias;
  }
  if (!dias) throw bad('Elegí los días de trabajo.');
  let fechas = prev && prev.datos && prev.datos.fechas ? prev.datos.fechas : {};
  if (d && d.fechas !== undefined) {
    if (!d.fechas || typeof d.fechas !== 'object' || Array.isArray(d.fechas) || Object.keys(d.fechas).length > 366) throw bad('Las fechas específicas no son válidas.');
    fechas = {};
    for (const [fecha, estado] of Object.entries(d.fechas)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha || !['Trabaja', 'Descanso'].includes(estado)) throw bad('Revisá las fechas y turnos específicos.');
      fechas[fecha] = estado;
    }
  }
  let team = ex ? ex.team : raw.team;
  if (!TEAMS.includes(team)) throw bad('Elegí el equipo.');
  const hasta = raw.activo === false ? Schedule.addDays(today, -1) : raw.activo === true ? '' : (prev ? prev.hasta || '' : '');
  const out = { key: 'P:' + nombre, tipo: 'persona', nombre, custom: ex ? !ex.base : true, desde: ex ? (ex.base ? '' : (prev && prev.desde) || '') : today, hasta, datos: ex && ex.base ? { dias, fechas } : { team, dias, fechas } };
  return out;
}
function validateTarea(raw, M, today, newId) {
  const ex = raw.id ? M.byId[raw.id] : null;
  if (raw.id && !ex) throw bad('La actividad no existe.');
  const prev = ex ? (M.edits.T[raw.id] || null) : null, custom = ex ? !!ex.custom : true, d = raw.datos;
  const hasta = raw.activo === false ? Schedule.addDays(today, -1) : raw.activo === true ? '' : (prev ? prev.hasta || '' : '');
  let datos;
  if (d === undefined) { if (!prev && !ex) throw bad('Faltan los datos de la actividad.'); datos = prev ? prev.datos : {}; }
  else if (custom) {                                   // actividad agregada: se envía completa
    const team = ex ? ex.team : d.team; if (!TEAMS.includes(team)) throw bad('Elegí el equipo.');
    const modo = ex ? ex.modo : d.modo; if (!['dias', 'nth', 'semanas', 'meses'].includes(modo)) throw bad('Elegí cuándo se hace.');
    datos = { team, modo, bloque: str(d.bloque, 120, 'el nombre de la actividad', 3), apartado: str(d.apartado, 60, 'el nombre del apartado'), zona: str(d.zona, 120, 'la zona'), asignar: vAsignar(d.asignar, team, M),
      actividades: vLineas(d.lineas), condicion: str(d.condicion, 300, 'la condición'), evidencia: vEv(d.evidencia) };
    if (modo === 'dias') {
      if (!Array.isArray(d.dias) || d.dias.length !== 7 || !d.dias.some(Boolean)) throw bad('Elegí al menos un día de la semana.');
      vHorario(d.inicio, d.fin); datos.dias = d.dias.map(Boolean); datos.inicio = d.inicio; datos.fin = d.fin;
    } else {
      const rule = vRule(d.rule, today); if (modo === 'meses' && !rule.months) throw bad('Elegí al menos un mes.');
      datos.rule = rule;
    }
  } else {                                             // actividad del Excel: solo se guardan los campos que cambiaron
    datos = { ...(prev ? prev.datos : {}) };
    const set = (k, v) => { datos[k] = v; };
    if (ex.periodic) {
      if (d.rule !== undefined) set('rule', vRule(d.rule, today));
    } else {
      if (d.dias !== undefined) {
        if (!Array.isArray(d.dias) || d.dias.length !== 7 || d.dias.some(v => typeof v !== 'boolean') || !d.dias.some(Boolean)) throw bad('Elegí al menos un día de la semana.');
        set('dias', d.dias);
      }
      if (d.inicio !== undefined) set('inicio', d.inicio);
      if (d.fin !== undefined) set('fin', d.fin);
      vHorario(datos.inicio || ex.inicio, datos.fin || ex.fin);
    }
    if (d.asignar !== undefined) set('asignar', vAsignar(d.asignar, ex.team, M));
    if (d.lineas !== undefined) set('actividades', vLineas(d.lineas));
    if (d.condicion !== undefined) set('condicion', str(d.condicion, 300, 'la condición', 1));
    if (d.evidencia !== undefined) set('evidencia', vEv(d.evidencia));
  }
  const id = ex ? ex.id : newId();
  return { key: 'T:' + id, tipo: 'tarea', id, custom, desde: custom ? ((prev && prev.desde) || today) : '', hasta, datos };
}
function validateEdit(raw, M, today, newId) {
  if (!raw || typeof raw !== 'object') throw bad('Solicitud no válida.');
  if (raw.tipo === 'persona') return validatePersona(raw, M, today);
  if (raw.tipo === 'tarea') return validateTarea(raw, M, today, newId || (() => 'X-' + slug(raw.datos && raw.datos.bloque || 'actividad', 18) + '-' + Math.random().toString(36).slice(2, 6)));
  throw bad('Tipo de cambio no válido.');
}

module.exports = { TEAMS, TEAM_KEY, DAYS, slug, nameIn, dowOf, toMin, to12h, from12h, timeOk, shortZone, photoReq, cleanEvidence, enrichDaily, merge, validateEdit,
  C, init, works, eff, laboresDelDia, autoAssign, assignedEmails, tasksForUser, tasksWithHistory, tasksOfDay, sortTasks, Schedule };
