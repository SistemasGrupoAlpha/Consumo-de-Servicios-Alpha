'use strict';
/* Acceso a las listas y a la biblioteca de SharePoint (solo desde el servidor). */
const { g, need } = require('./graph');
const SEED = require('../data/seed.json');
const Catalog = require('./catalog');
const LST = () => ({ users: process.env.SP_LIST_USERS || 'EcoUsuarios', reports: process.env.SP_LIST_REPORTS || 'EcoReportes', items: process.env.SP_LIST_ITEMS || 'EcoReporteItems', assign: process.env.SP_LIST_ASSIGN || 'EcoAsignaciones', catalog: process.env.SP_LIST_CATALOG || 'EcoCatalogo' });
const todayHN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());
const ROOT = () => process.env.PHOTOS_ROOT || 'Evidencias-EcoII';
const fail = (status, message) => Object.assign(new Error(message), { status });
const ESTADOS = ['Realizada', 'No realizada', 'Pendiente'];
const safe = s => String(s).replace(/[^a-z0-9._-]/gi, '_');
const esc = s => String(s).replace(/'/g, "''");
const LISTAS = require('./listas'), { cargarColumnas, mapaDeColumnas } = require('./columnas');

let siteId = null;
async function site() {
  if (!siteId) siteId = process.env.SP_SITE_ID || (await g(`/sites/${need('SP_HOSTNAME')}:${need('SP_SITE_PATH')}`)).id;   // SP_SITE_ID evita la búsqueda por dirección
  return siteId;
}
async function listItems(list, filter) {
  const sid = await site(); let url = `/sites/${sid}/lists/${encodeURIComponent(list)}/items?$expand=fields&$top=999` + (filter ? `&$filter=${encodeURIComponent(filter)}` : ''); const out = [];
  while (url) { const r = await g(url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }); out.push(...r.value); url = r['@odata.nextLink'] || null; }
  for (const i of out) i.fields = await aCanonico(list, i.fields);
  return out;
}
/* ---------- nombres de columna: la app usa nombres «canónicos» (Fecha, Usuario…); SharePoint puede llamarlos field_1, field_2… ---------- */
const colCache = new Map();
async function colMap(list) {
  const c = colCache.get(list); if (c && Date.now() - c.t < 600000) return c.m;
  const spec = Object.entries(LISTAS).find(([k, sp]) => (process.env[sp.env] || k) === list);
  const m = spec ? mapaDeColumnas(await cargarColumnas(g, await site(), list), Object.keys(spec[1].cols)) : { toInt: {}, toCan: {} };
  colCache.set(list, { t: Date.now(), m }); return m;
}
const aInterno = async (list, f) => { const m = await colMap(list); return Object.fromEntries(Object.entries(f).map(([k, v]) => [m.toInt[k] || k, v])); };
const aCanonico = async (list, f) => { const m = await colMap(list); return Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [m.toCan[k] || k, v])); };
const filtro = async (list, pares) => { const m = await colMap(list); return pares.map(([k, v]) => `fields/${m.toInt[k] || k} eq '${esc(v)}'`).join(' and '); };
const J = { 'Content-Type': 'application/json' };
async function createItem(list, fields) { const sid = await site(); return (await g(`/sites/${sid}/lists/${encodeURIComponent(list)}/items`, { method: 'POST', headers: J, body: JSON.stringify({ fields: await aInterno(list, fields) }) })).id; }
async function patchItem(list, id, fields) { const sid = await site(); await g(`/sites/${sid}/lists/${encodeURIComponent(list)}/items/${id}/fields`, { method: 'PATCH', headers: J, body: JSON.stringify(await aInterno(list, fields)) }); }
async function deleteItem(list, id) { const sid = await site(); await g(`/sites/${sid}/lists/${encodeURIComponent(list)}/items/${id}`, { method: 'DELETE' }); }

/* ---------- catálogo editable: personas y actividades agregadas o editadas desde la app ---------- */
let ecache = { t: 0, list: null };
async function getEdits(fresh) {
  if (!fresh && ecache.list && Date.now() - ecache.t < 30000) return ecache.list;
  const list = (await listItems(LST().catalog)).map(i => {
    const f = i.fields; let o = {}; try { o = JSON.parse(f.Datos || '{}'); } catch {}
    const tipo = f.Tipo, key = f.Title || '';
    return { rowId: i.id, key, tipo, id: tipo === 'tarea' ? key.slice(2) : undefined, nombre: tipo === 'persona' ? key.slice(2) : undefined,
      custom: !!o.custom, desde: o.desde || '', hasta: o.hasta || '', datos: o.datos || {}, autor: f.Autor || '', actualizado: f.Actualizado || '' };
  }).filter(e => (e.tipo === 'tarea' || e.tipo === 'persona') && /^[TP]:/.test(e.key));
  ecache = { t: Date.now(), list }; return list;
}
const catalogM = async fresh => Catalog.merge(SEED, await getEdits(fresh));
async function saveEdit(user, raw) {
  const edits = await getEdits(true), M = Catalog.merge(SEED, edits);
  const rec = Catalog.validateEdit(raw, M, todayHN());
  const fields = { Title: rec.key, Tipo: rec.tipo, Datos: JSON.stringify({ custom: rec.custom, desde: rec.desde, hasta: rec.hasta, datos: rec.datos }), Autor: user.usuario, Actualizado: new Date().toISOString() };
  const found = edits.find(e => e.key === rec.key);
  if (found) await patchItem(LST().catalog, found.rowId, fields); else await createItem(LST().catalog, fields);
  ecache = { t: 0, list: null }; return rec;
}
/** «Restaurar Excel»: quita los cambios de una actividad o persona que viene del Excel. Lo agregado no se elimina, se desactiva. */
async function deleteEdit(key) {
  const found = (await getEdits(true)).find(e => e.key === key);
  if (!found) throw fail(404, 'Ese cambio no existe.');
  if (found.custom) throw fail(400, 'Lo agregado desde la app no se elimina: desactivalo para conservar el historial.');
  await deleteItem(LST().catalog, found.rowId); ecache = { t: 0, list: null };
}

/* ---------- usuarios ---------- */
let ucache = { t: 0, list: null };
async function loadUsers(fresh) {
  if (!fresh && ucache.list && Date.now() - ucache.t < 45000) return ucache.list;
  const items = await listItems(LST().users);
  const list = items.map(i => { const f = i.fields; return { id: i.id, usuario: String(f.Title || '').trim().toLowerCase(), nombre: f.Nombre || f.Title || '', puesto: f.Puesto || '', team: f.Equipo || '',
    rol: /admin/i.test(f.Rol || '') ? 'Admin' : /supervis/i.test(f.Rol || '') ? 'Supervisor' : 'Operativo', activo: String(f.Activo || 'Si').toLowerCase() !== 'no', hash: f.PasswordHash || '', intentos: +f.Intentos || 0, bloqueo: f.BloqueoHasta || '' }; }).filter(u => u.usuario);
  const bu = (process.env.BOOTSTRAP_ADMIN_USER || '').trim().toLowerCase();
  if (bu && process.env.BOOTSTRAP_ADMIN_HASH && !list.some(u => u.usuario === bu))
    list.push({ id: null, virtual: true, usuario: bu, nombre: 'Administrador', puesto: 'Administrador', team: '', rol: 'Admin', activo: true, hash: process.env.BOOTSTRAP_ADMIN_HASH, intentos: 0, bloqueo: '' });
  ucache = { t: Date.now(), list }; return list;
}
const dropUsersCache = () => { ucache = { t: 0, list: null }; };
async function patchUserFields(u, fields) { await patchItem(LST().users, u.id, fields); dropUsersCache(); }
async function saveUser(p, hashFn) {
  const usuario = String(p.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,60}$/.test(usuario)) throw fail(400, 'El usuario debe tener entre 3 y 60 caracteres (letras, números, punto, guion o @).');
  const rol = p.rol === 'Admin' ? 'Admin' : p.rol === 'Supervisor' ? 'Supervisor' : 'Operativo', nombre = String(p.nombre || '').trim().slice(0, 80);
  if (!nombre) throw fail(400, 'Falta el nombre.');
  let puesto = String(p.puesto || '').trim(), team = String(p.team || '').trim();
  if (rol === 'Operativo') {
    const persona = (await catalogM()).PEOPLE[puesto];
    if (!persona) throw fail(400, 'El puesto debe ser una persona de la pestaña Personal.');
    team = persona.team;
  } else { puesto = rol === 'Supervisor' ? 'Supervisor' : (puesto || 'Administrador'); team = ''; }
  if (p.password !== undefined && p.password !== '' && String(p.password).length < 8) throw fail(400, 'La contraseña debe tener al menos 8 caracteres.');
  const users = await loadUsers(true), ex = users.find(u => u.usuario === usuario && !u.virtual);
  if (!ex && !p.password) throw fail(400, 'Para crear un usuario hay que definir su contraseña.');
  const fields = { Title: usuario, Nombre: nombre, Puesto: puesto, Equipo: team, Rol: rol, Activo: p.activo === false ? 'No' : 'Si' };
  if (p.password) { fields.PasswordHash = hashFn(String(p.password)); fields.Intentos = '0'; fields.BloqueoHasta = ''; }
  else if (!ex) throw fail(400, 'Falta la contraseña.');
  if (ex) await patchItem(LST().users, ex.id, fields);
  else { const virt = users.find(u => u.usuario === usuario && u.virtual); if (virt && !fields.PasswordHash) fields.PasswordHash = virt.hash; await createItem(LST().users, { Intentos: '0', BloqueoHasta: '', ...fields }); }
  dropUsersCache();
}

/* ---------- reportes ---------- */
async function getReports(date, usuario) {
  const L = LST(), pares = [['Fecha', date]].concat(usuario ? [['Usuario', usuario]] : []);
  const [reps, its] = await Promise.all([filtro(L.reports, pares).then(f => listItems(L.reports, f)), filtro(L.items, pares).then(f => listItems(L.items, f))]);
  const docs = {};
  for (const r of reps) { const f = r.fields; docs[f.Usuario] = { date, email: f.Usuario, nombre: f.Nombre || '', puesto: f.Puesto || '', team: f.Equipo || '', obs: f.Obs || '', cerrado: f.Cerrado === 'Si', updatedAt: f.Actualizado || null, items: {} }; }
  for (const i of its) { const f = i.fields, d = docs[f.Usuario]; if (!d) continue; let fotos = []; try { fotos = f.Fotos ? JSON.parse(f.Fotos) : []; } catch {} d.items[f.TareaId] = { estado: f.Estado || 'Pendiente', desc: f.Descripcion || '', fotos, updatedAt: f.Actualizado || null }; }
  return Object.values(docs);
}
function cleanItems(items, byId) {
  const out = {};
  for (const [id, it] of Object.entries(items || {})) {
    if (!byId[id]) throw fail(400, 'Actividad desconocida: ' + id);
    if (!ESTADOS.includes(it.estado)) throw fail(400, 'Estado no válido.');
    const fotos = (Array.isArray(it.fotos) ? it.fotos : []).slice(0, 40).map(p => ({ id: String(p.id || '').slice(0, 120), name: String(p.name || '').slice(0, 120), webUrl: String(p.webUrl || '').slice(0, 500) })).filter(p => p.id);
    out[id] = { estado: it.estado, desc: String(it.desc || '').slice(0, 4000), fotos, updatedAt: new Date().toISOString() };
  }
  return out;
}
async function saveReport(user, p) {
  const L = LST(), now = new Date().toISOString(), rkey = `${p.date}|${user.usuario}`, items = cleanItems(p.items, (await catalogM()).byId);
  const pares = [['Fecha', p.date], ['Usuario', user.usuario]];
  const [reps, its] = await Promise.all([filtro(L.reports, pares).then(f => listItems(L.reports, f)), Object.keys(items).length ? filtro(L.items, pares).then(f => listItems(L.items, f)) : Promise.resolve([])]);
  const header = { Title: rkey, Fecha: p.date, Usuario: user.usuario, Nombre: user.nombre, Puesto: user.puesto, Equipo: user.team, Obs: String(p.obs || '').slice(0, 4000), Cerrado: p.cerrado ? 'Si' : 'No', Actualizado: now };
  if (reps[0]) await patchItem(L.reports, reps[0].id, header); else await createItem(L.reports, header);
  const have = new Map(its.map(i => [i.fields.Title, i.id]));
  for (const [id, it] of Object.entries(items)) {
    const key = `${rkey}|${id}`, f = { Title: key, Fecha: p.date, Usuario: user.usuario, TareaId: id, Estado: it.estado, Descripcion: it.desc, Fotos: JSON.stringify(it.fotos), Actualizado: now };
    if (have.has(key)) await patchItem(L.items, have.get(key), f); else await createItem(L.items, f);
  }
  return now;
}

/* ---------- asignaciones ---------- */
async function getAssignments(date) {
  const out = {}; for (const i of await listItems(LST().assign, await filtro(LST().assign, [['Fecha', date]]))) out[i.fields.TareaId] = (i.fields.Usuarios || '').split(',').map(s => s.trim()).filter(Boolean);
  return out;
}
async function setAssignment(date, taskId, usuarios) {
  if (!(await catalogM()).byId[taskId]) throw fail(400, 'Actividad desconocida.');
  const key = `${date}|${taskId}`, found = (await listItems(LST().assign, await filtro(LST().assign, [['Fecha', date], ['TareaId', taskId]])))[0];
  if (usuarios) { const f = { Title: key, Fecha: date, TareaId: taskId, Usuarios: usuarios.join(',') }; if (found) await patchItem(LST().assign, found.id, f); else await createItem(LST().assign, f); }
  else if (found) await deleteItem(LST().assign, found.id);
}

/* ---------- fotos ---------- */
async function uploadPhoto(usuario, date, taskId, buf) {
  if (!(await catalogM()).byId[taskId]) throw fail(400, 'Actividad desconocida.');
  const sid = await site(), name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const folder = [ROOT(), date, safe(usuario), taskId].map(encodeURIComponent).join('/');
  const r = await g(`/sites/${sid}/drive/root:/${folder}/${name}:/content`, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: buf });
  return { id: r.id, name: r.name, webUrl: r.webUrl };
}
/** Devuelve el elemento solo si el usuario puede verlo: administrador, o foto de su propia carpeta. */
async function ownedPhoto(user, id, escritura) {
  const sid = await site(); let it;
  try { it = await g(`/sites/${sid}/drive/items/${encodeURIComponent(id)}`); } catch { throw fail(404, 'Foto no encontrada.'); }
  const path = decodeURIComponent((it.parentReference && it.parentReference.path) || '');
  const base = `:/${ROOT()}/`; if (!path.includes(base)) throw fail(404, 'Foto no encontrada.');
  const privilegiado = user.rol === 'Admin' || (!escritura && user.rol === 'Supervisor');   // el supervisor solo puede VER fotos
  if (!privilegiado && !new RegExp(`:/${ROOT().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\d{4}-\\d{2}-\\d{2}/${safe(user.usuario).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`).test(path)) throw fail(403, 'No tenés acceso a esa foto.');
  return { sid, it };
}
async function photoBytes(user, id) { const { sid } = await ownedPhoto(user, id); const r = await g(`/sites/${sid}/drive/items/${encodeURIComponent(id)}/content`); return Buffer.from(await r.arrayBuffer()); }
async function deletePhoto(user, id) { const { sid } = await ownedPhoto(user, id, true); await g(`/sites/${sid}/drive/items/${encodeURIComponent(id)}`, { method: 'DELETE' }); }

module.exports = { getEdits, saveEdit, deleteEdit, loadUsers, dropUsersCache, patchUserFields, saveUser, getReports, saveReport, getAssignments, setAssignment, uploadPhoto, photoBytes, deletePhoto };
