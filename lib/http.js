'use strict';
const Auth = require('./auth');
const send = (res, status, obj) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const fail = (status, message) => Object.assign(new Error(message), { status });
/** Envoltorio común: método, protección CSRF, sesión, rol y manejo de errores. */
const route = (methods, fn, { auth = 'user' } = {}) => async (req, res) => {
  try {
    if (!methods.includes(req.method)) return send(res, 405, { error: 'Método no permitido' });
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'eco') return send(res, 403, { error: 'Solicitud no válida' });
    let user = null;
    if (auth) {
      user = await Auth.sessionUser(req);
      if (!user) return send(res, 401, { error: 'Tu sesión venció. Volvé a iniciar sesión.' });
      if (auth === 'admin' && user.rol !== 'Admin') return send(res, 403, { error: 'Solo para administradores.' });
    }
    await fn(req, res, user);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : 'Error interno del servidor' });
  }
};
const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(new Date(d + 'T12:00:00Z'));
const todayHN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());
const readBody = (req, max) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > max) { reject(fail(413, 'La foto es demasiado grande.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
});
module.exports = { send, fail, route, dateOk, todayHN, readBody };
