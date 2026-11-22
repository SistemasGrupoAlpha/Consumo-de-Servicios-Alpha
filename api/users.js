const SP = require('../lib/consumo-usuarios'), Auth = require('../lib/auth'), { route, send, fail } = require('../lib/http');
module.exports = route(['GET', 'POST'], async (req, res, user) => {
  if (req.method === 'GET') {
    if (user.rol !== 'Admin') throw fail(403, 'Solo para administradores.');
    const all = await SP.loadUsers(true);
    return send(res, 200, { users: all.map(u => ({ usuario: u.usuario, email: u.usuario, nombre: u.nombre, puesto: u.puesto, team: u.team, rol: u.rol, activo: u.activo })) });
  }
  const b = req.body || {};
  if (b.action === 'password') {                                   // cualquier usuario cambia su propia contraseña
    if (!Auth.verifyPassword(b.actual, user.hash)) throw fail(403, 'La contraseña actual no es correcta.');
    if (String(b.nueva || '').length < 8) throw fail(400, 'La contraseña nueva debe tener al menos 8 caracteres.');
    await SP.saveUser({ usuario: user.usuario, nombre: user.nombre, puesto: user.puesto, rol: user.rol, activo: true, password: b.nueva }, Auth.hashPassword);
    res.setHeader('Set-Cookie', Auth.clearCookie());               // se pide iniciar sesión otra vez con la nueva
    return send(res, 200, { ok: true });
  }
  if (user.rol !== 'Admin') throw fail(403, 'Solo para administradores.');
  const usuario = String(b.usuario || '').trim().toLowerCase();
  const { normalizeRole } = await import('../lib/roles.mjs');
  if (usuario === user.usuario && (b.activo === false || b.activo === 'No' || normalizeRole(b.rol) !== 'Admin')) throw fail(400, 'No podés desactivarte ni quitarte el rol de administrador a vos mismo.');
  await SP.saveUser(b, Auth.hashPassword);
  send(res, 200, { ok: true });
}, {});
