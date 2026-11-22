'use strict';

const { g } = require('./graph');
const { listId } = require('./consumo-sharepoint');
const { columnsFor, mapColumns, readItems } = require('./consumo-columnas');
const { fail } = require('./http');
const { catalogItem } = require('./consumo-lecturas');

const identity = value => String(value ?? '').trim().toLowerCase();
const validId = value => typeof value === 'string' && /^\d+$/.test(value);
const json = { 'Content-Type': 'application/json' };

async function accessList(site) {
  const list = await listId(site, 'SP_LIST_ACCESOS');
  const base = `/sites/${encodeURIComponent(site)}/lists/${encodeURIComponent(list)}/items`;
  const items = [];
  async function loadItems() {
    let next = `${base}?$expand=fields&$top=500`;
    while (next) {
      const page = await g(next);
      items.push(...page.value);
      next = page['@odata.nextLink'];
    }
  }
  const [columns] = await Promise.all([columnsFor(site, list), loadItems()]);
  const mapping = mapColumns('accesos', columns, items);
  const buildingKey = mapping.get('Edificio')?.name;
  const { isEnabled } = await import('./registro-lecturas.mjs');
  const rows = readItems('accesos', items, mapping, new Map()).map((row, index) => ({
    id: String(row.id),
    account: identity(row.Correo || row.Title),
    building: String(buildingKey ? row[`${buildingKey}LookupId`] ?? '' : ''),
    active: isEnabled(row.Activo),
    etag: items[index].eTag || row['@odata.etag'],
  }));
  return { base, mapping, rows };
}

async function allowedBuildings(site, user) {
  if (user.rol === 'Admin') return null;
  const accounts = new Set([identity(user.usuario), identity(user.email)].filter(Boolean));
  const { rows } = await accessList(site);
  return new Set(rows.filter(row => row.active && accounts.has(row.account)).map(row => row.building).filter(validId));
}

async function requireBuildingAccess(site, user, building) {
  const allowed = await allowedBuildings(site, user);
  if (allowed && !allowed.has(building)) throw fail(403, 'No tenés acceso a este edificio.');
}

async function requirePhotoAccess(site, user, kind, id) {
  if (user.rol === 'Admin') return;
  const allowed = await allowedBuildings(site, user);
  if (kind === 'edificios') {
    if (!allowed.has(id)) throw fail(403, 'No tenés acceso a este edificio.');
    return;
  }
  if (!allowed.size) throw fail(403, 'No tenés acceso a este edificio.');
  const { localBuildingId, meterLocalId, readingMeterId } = await import('./registro-lecturas.mjs');
  const reading = await catalogItem(site, 'lecturas', id);
  let building = localBuildingId(reading);
  const meterId = readingMeterId(reading);
  if (!building && validId(meterId)) {
    const meter = await catalogItem(site, 'medidores', meterId);
    building = localBuildingId(meter);
    const localId = meterLocalId(meter);
    if (!building && validId(localId)) building = localBuildingId(await catalogItem(site, 'locales', localId));
  }
  if (!allowed.has(building)) throw fail(403, 'No tenés acceso a este edificio.');
}

function assignments(rows, account) {
  return [...new Set(rows.filter(row => row.account === account && row.active).map(row => row.building).filter(validId))].sort();
}

const snapshot = buildings => ({ buildings, revision: buildings.join(',') });

async function accessAssignments(site, usuario) {
  const { rows } = await accessList(site);
  return snapshot(assignments(rows, usuario));
}

function statusValue(column, active) {
  if (column.boolean) return active;
  const choices = column.choice?.choices;
  if (!choices?.length) return active ? 'Si' : 'No';
  const value = choices.find(choice => (active ? /^(s[ií]|true|1)$/i : /^(no|false|0)$/i).test(choice.trim()));
  if (value === undefined) throw fail(500, 'Verificá las opciones de la columna Activo en Accesos a edificios.');
  return value;
}

async function saveAccessAssignments(site, user, buildingIds, revision) {
  if (!Array.isArray(buildingIds) || buildingIds.length > 500 || buildingIds.some(id => !validId(id)) || typeof revision !== 'string') {
    throw fail(400, 'La selección de edificios no es válida.');
  }
  const { base, mapping, rows } = await accessList(site);
  const current = snapshot(assignments(rows, user.usuario));
  const desired = snapshot([...new Set(buildingIds)].sort());
  if (desired.revision === current.revision) return current;
  if (revision !== current.revision) throw fail(409, 'Los accesos cambiaron. Volvé a abrir el usuario para revisar la selección actual.');

  const building = mapping.get('Edificio');
  const status = mapping.get('Activo');
  if (!building || !status || status.readOnly) throw fail(500, 'Verificá las columnas Edificio y Activo en Accesos a edificios.');
  const enabled = statusValue(status, true);
  const disabled = statusValue(status, false);
  const existing = rows.filter(row => row.account === user.usuario);
  const requested = new Set(desired.buildings);
  const additions = desired.buildings.filter(id => !current.buildings.includes(id));

  await Promise.all(additions.map(id => catalogItem(site, 'edificios', id)));

  const patch = (row, active) => g(`${base}/${encodeURIComponent(row.id)}/fields`, {
    method: 'PATCH',
    headers: row.etag ? { ...json, 'If-Match': row.etag } : json,
    body: JSON.stringify({ [status.name]: active }),
  });

  let changes = 0;
  try {
    for (const row of existing) {
      if (!row.active || !validId(row.building) || requested.has(row.building)) continue;
      await patch(row, disabled);
      changes++;
    }
    for (const id of additions) {
      const previous = existing.find(row => row.building === id);
      if (previous) {
        await patch(previous, enabled);
      } else {
        const fields = { Title: user.usuario, [`${building.name}LookupId`]: id, [status.name]: enabled };
        const email = mapping.get('Correo');
        if (email?.text && !email.readOnly && !email.hidden) fields[email.name] = user.usuario;
        const name = mapping.get('UsuarioNombre');
        if (name?.text && !name.readOnly && !name.hidden) fields[name.name] = user.nombre;
        await g(base, { method: 'POST', headers: json, body: JSON.stringify({ fields }) });
      }
      changes++;
    }
  } catch (error) {
    console.error('No se pudieron guardar los accesos del usuario', error);
    if (changes) throw fail(502, 'Se guardó una parte de los cambios. Volvé a abrir el usuario para revisar los accesos guardados.');
    if (/^Graph 412\b/.test(error.message)) throw fail(409, 'Los accesos cambiaron. Volvé a abrir el usuario para revisar la selección actual.');
    throw fail(502, 'SharePoint no pudo guardar los accesos. Probá nuevamente.');
  }
  return desired;
}

module.exports = { allowedBuildings, requireBuildingAccess, requirePhotoAccess, accessAssignments, saveAccessAssignments };
