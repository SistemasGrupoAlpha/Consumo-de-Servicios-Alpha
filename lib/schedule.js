'use strict';
/* Motor de fechas para tareas periódicas. Se usa igual en el build, en el servidor y en el navegador. */
const DOW = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const DOWN = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const MONN = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const NTH = { primer: 1, primero: 1, primera: 1, segundo: 2, segunda: 2, tercer: 3, tercero: 3, tercera: 3, ultimo: -1, ultima: -1 };
const WK = { primera: 1, segunda: 2, tercera: 3, cuarta: 4 };

/** Interpreta el texto «Cuándo se hace» del Excel. */
function parseRule(cuando, frecuencia) {
  const t = norm(cuando), rule = {};
  const dows = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
  let m = new RegExp('\\b(primer|primero|primera|segundo|segunda|tercer|tercero|tercera|ultimo|ultima)\\s+' + dows).exec(t);
  if (m) { rule.nth = NTH[m[1]]; rule.dow = DOW[m[2]]; }
  else if ((m = new RegExp('\\b' + dows + '\\b[^.;]*todas las semanas').exec(t))) { rule.dow = DOW[m[1]]; rule.weekly = true; }
  const ws = /semanas?\s+(\d)(?:\s*y\s*(\d))?/.exec(t);
  if (ws) rule.weeks = ws[2] ? [+ws[1], +ws[2]] : [+ws[1]];
  else if ((m = /\b(primera|segunda|tercera|cuarta)\s+semana/.exec(t))) rule.weeks = [WK[m[1]]];
  const mm = [...t.matchAll(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g)].map(x => MONTHS[x[1]]);
  if (mm.length) rule.months = [...new Set(mm)];
  const hm = /(\d{1,2}):(\d{2})\s*(a\.\s?m\.|p\.\s?m\.)?/i.exec(cuando || '');
  if (hm) {
    let h = +hm[1]; const suf = (hm[3] || '').toLowerCase().replace(/[.\s]/g, '');
    const label = suf ? `${hm[1]}:${hm[2]} ${suf === 'am' ? 'a.m.' : 'p.m.'}` : `${hm[1]}:${hm[2]} ${h >= 1 && h <= 6 ? 'p.m.' : 'a.m.'}`;
    rule.hora = label;
  }
  if (/mes programado/.test(t)) rule.pending = 'meses';
  else if (/segun contrato/.test(t)) rule.pending = 'contrato';
  return rule;
}
/** ¿La regla tiene lo necesario para calcular fechas? */
function resolved(rule) {
  if (!rule || rule.pending) return false;
  return !!((rule.nth && rule.dow != null) || (rule.weekly && ((rule.dows && rule.dows.length) || rule.dow != null)) || rule.weeks || rule.months);
}
const ymd = ds => { const [y, m, d] = ds.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), dim: new Date(Date.UTC(y, m, 0)).getUTCDate() }; };
const dowOfDay = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
function firstWeekdayFrom(y, m, from, dim) { for (let d = from; d <= dim; d++) { const w = dowOfDay(y, m, d); if (w >= 1 && w <= 5) return d; } return -1; }

function isDue(rule, ds) {
  if (!resolved(rule)) return false;
  const { y, m, d, dow, dim } = ymd(ds);
  if (rule.months && !rule.months.includes(m)) return false;
  if (rule.nth && rule.dow != null) {
    if (dow !== rule.dow) return false;
    return rule.nth > 0 ? Math.ceil(d / 7) === rule.nth : d + 7 > dim;
  }
  if (rule.weeks) {
    return rule.weeks.some(k => {
      const start = 7 * (k - 1) + 1, end = Math.min(start + 6, dim);
      if (rule.dow != null) return dow === rule.dow && d >= start && d <= end;
      return d === firstWeekdayFrom(y, m, start, dim);
    });
  }
  if (rule.weekly) return (rule.dows && rule.dows.length ? rule.dows : [rule.dow]).includes(dow);
  if (rule.months) return d === firstWeekdayFrom(y, m, 1, dim);
  return false;
}
function addDays(ds, n) { const { y, m, d } = ymd(ds); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`; }
function nextDue(rule, from, max = 400) { for (let i = 0; i <= max; i++) { const ds = addDays(from, i); if (isDue(rule, ds)) return ds; } return null; }
const list = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
function describe(rule) {
  if (!rule) return 'Sin programación';
  if (rule.pending === 'contrato') return 'Según contrato (falta definir fechas)';
  if (rule.pending === 'meses') return 'Mes programado (falta definir los meses)';
  if (!resolved(rule)) return 'Falta definir el día';
  const meses = rule.months ? ' de ' + list(rule.months.map(x => MONN[x])) : ' de cada mes';
  const ord = { 1: 'Primer', 2: 'Segundo', 3: 'Tercer', '-1': 'Último' };
  if (rule.nth && rule.dow != null) return `${ord[rule.nth]} ${DOWN[rule.dow]}${meses}`;
  if (rule.weeks) return rule.dow != null ? `${DOWN[rule.dow][0].toUpperCase() + DOWN[rule.dow].slice(1)} de la${rule.weeks.length > 1 ? 's' : ''} semana${rule.weeks.length > 1 ? 's' : ''} ${list(rule.weeks)}${meses}` : `Primer día hábil de la${rule.weeks.length > 1 ? 's' : ''} semana${rule.weeks.length > 1 ? 's' : ''} ${list(rule.weeks)}${meses}`;
  if (rule.weekly) { const ds = (rule.dows && rule.dows.length ? rule.dows : [rule.dow]).map(d => DOWN[d].endsWith('s') ? DOWN[d] : DOWN[d] + 's'); return `Todos los ${list(ds)}`; }
  return `Primer día hábil${meses}`;
}
module.exports = { parseRule, resolved, isDue, nextDue, addDays, describe, DOWN, MONN, norm };
