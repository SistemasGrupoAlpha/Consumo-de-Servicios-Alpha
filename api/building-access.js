'use strict';

const { route, send, fail } = require('../lib/http');
const { siteId } = require('../lib/consumo-sharepoint');
const { loadUsers } = require('../lib/consumo-usuarios');
const { accessAssignments, saveAccessAssignments } = require('../lib/consumo-accesos');

module.exports = route(['GET', 'POST'], async (req, res) => {
  const usuario = String(req.method === 'GET' ? req.query?.usuario : req.body?.usuario).trim().toLowerCase();
  const account = (await loadUsers(true)).find(user => user.usuario === usuario && user.rol !== 'Admin');
  if (!account) throw fail(404, 'No se encontró el usuario para asignarle edificios.');
  const site = await siteId();
  const assignments = req.method === 'GET'
    ? await accessAssignments(site, account.usuario)
    : await saveAccessAssignments(site, account, req.body?.buildings, req.body?.revision);
  return send(res, 200, assignments);
}, { auth: 'admin' });
