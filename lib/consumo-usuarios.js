'use strict';

const { g } = require('./graph');
const { siteId, listId } = require('./consumo-sharepoint');
const { cargarColumnas, mapaDeColumnas } = require('./columnas');
const { EcoUsuarios } = require('./listas');

let schema;
let cachedUsers;
const json = { 'Content-Type': 'application/json' };
const fail = (status, message) => Object.assign(new Error(message), { status });

async function userList() {
  if (schema) return schema;
  const site = await siteId();
  const list = await listId(site, 'SP_LIST_USERS');
  const columns = await cargarColumnas(g, encodeURIComponent(site), list);
  const fields = Object.keys(EcoUsuarios.cols);
  const { toInt } = mapaDeColumnas(columns, fields);
  const missing = fields.filter(field => !toInt[field]);
  if (missing.length) throw fail(500, `Faltan columnas en la lista de usuarios: ${missing.join(', ')}.`);
  schema = { endpoint: `/sites/${encodeURIComponent(site)}/lists/${encodeURIComponent(list)}/items`, toInt };
  return schema;
}

async function loadUsers(fresh = false) {
  if (!fresh && cachedUsers?.expires > Date.now()) return cachedUsers.users;
  const { endpoint, toInt } = await userList();
  const { normalizeRole } = await import('./roles.mjs');
  const users = [];
  let next = `${endpoint}?$expand=fields&$top=200`;
  while (next) {
    const page = await g(next);
    for (const item of page.value) {
      const field = name => item.fields?.[toInt[name]];
      const usuario = String(field('Title') || '').trim().toLowerCase();
      if (!usuario) continue;
      users.push({
        id: item.id, usuario, nombre: field('Nombre') || usuario,
        puesto: field('Puesto') || '', team: field('Equipo') || '',
        rol: normalizeRole(field('Rol')),
        activo: /^(s[ií]|true|1)$/i.test(String(field('Activo') ?? '').trim()),
        hash: field('PasswordHash') || '', intentos: Number(field('Intentos')) || 0,
        bloqueo: field('BloqueoHasta') || '',
      });
    }
    next = page['@odata.nextLink'];
  }
  const usuario = process.env.BOOTSTRAP_ADMIN_USER?.trim().toLowerCase();
  const hash = process.env.BOOTSTRAP_ADMIN_HASH;
  if (usuario && hash && !users.some(user => user.usuario === usuario)) {
    users.push({ usuario, hash, virtual: true, nombre: 'Administrador', rol: 'Admin', activo: true });
  }
  cachedUsers = { users, expires: Date.now() + 45000 };
  return users;
}

async function patchUserFields(user, fields) {
  await writeFields(fields, user.id);
}

async function writeFields(fields, id) {
  const { endpoint, toInt } = await userList();
  const mapped = Object.fromEntries(Object.entries(fields).map(([name, value]) => [toInt[name], value]));
  await g(id ? `${endpoint}/${encodeURIComponent(id)}/fields` : endpoint, {
    method: id ? 'PATCH' : 'POST', headers: json,
    body: JSON.stringify(id ? mapped : { fields: mapped }),
  });
  cachedUsers = undefined;
}

async function saveUser(input, hashPassword) {
  const usuario = String(input.usuario || '').trim().toLowerCase();
  const nombre = String(input.nombre || '').trim().slice(0, 80);
  if (!/^[a-z0-9._@-]{3,60}$/.test(usuario)) throw fail(400, 'El usuario debe tener entre 3 y 60 caracteres válidos.');
  if (!nombre) throw fail(400, 'Falta el nombre.');
  const current = (await loadUsers(true)).find(user => user.usuario === usuario && !user.virtual);
  const password = String(input.password ?? '');
  if ((!current || password) && (password.length < 8 || password.length > 200)) {
    throw fail(400, 'La contraseña debe tener entre 8 y 200 caracteres.');
  }
  const { normalizeRole } = await import('./roles.mjs');
  const fields = {
    Title: usuario, Nombre: nombre, Rol: normalizeRole(input.rol),
    Puesto: input.puesto ?? current?.puesto ?? '', Equipo: current?.team ?? '',
    Activo: input.activo === false || input.activo === 'No' ? 'No' : 'Si',
  };
  if (password) Object.assign(fields, { PasswordHash: hashPassword(password), Intentos: '0', BloqueoHasta: '' });
  await writeFields(fields, current?.id);
}

module.exports = { loadUsers, patchUserFields, saveUser };
