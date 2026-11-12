'use strict';
const crypto = require('crypto');
const SP = require('./sp');
const COOKIE = 'eco_session', MAX_AGE = 12 * 3600;
const b64 = b => Buffer.from(b).toString('base64url');
const secret = () => { const s = process.env.SESSION_SECRET; if (!s || s.length < 32) { const e = new Error('SESSION_SECRET debe tener al menos 32 caracteres'); e.status = 500; throw e; } return s; };
const sign = data => crypto.createHmac('sha256', secret()).update(data).digest('base64url');
const fp = hash => crypto.createHash('sha256').update(hash || '').digest('base64url').slice(0, 10);   // cambiar la contraseña invalida las sesiones viejas

/* ---- contraseñas: scrypt con sal. En SharePoint solo se guarda el hash. ---- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
  const key = crypto.scryptSync(pw, salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}
const DUMMY = hashPassword('dummy-password-for-timing');
function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, salt, key] = String(stored || DUMMY).split('$');
    if (alg !== 'scrypt') return false;
    const k = Buffer.from(key, 'base64');
    const test = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), k.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(k, test);
  } catch { return false; }
}
/* ---- sesión: cookie firmada, HttpOnly ---- */
function makeCookie(user) {
  const payload = b64(JSON.stringify({ u: user.usuario, pv: fp(user.hash), exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${MAX_AGE}`;
}
const clearCookie = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
function readToken(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '=')); if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.'); if (!payload || !sig) return null;
  const good = sign(payload); if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try { const d = JSON.parse(Buffer.from(payload, 'base64url').toString()); return d.exp > Date.now() / 1000 ? d : null; } catch { return null; }
}
const publicUser = u => ({ usuario: u.usuario, email: u.usuario, nombre: u.nombre, puesto: u.puesto, team: u.team, rol: u.rol });
async function sessionUser(req) {
  const t = readToken(req); if (!t) return null;
  const u = (await SP.loadUsers()).find(x => x.usuario === t.u);
  if (!u || !u.activo || fp(u.hash) !== t.pv) return null;
  return { ...publicUser(u), hash: u.hash, virtual: !!u.virtual };
}
async function login(usuario, password) {
  usuario = String(usuario || '').trim().toLowerCase();
  const err = (s, m) => Object.assign(new Error(m), { status: s });
  if (!usuario || !password || String(password).length > 200) throw err(400, 'Escribí tu usuario y tu contraseña.');
  const u = (await SP.loadUsers(true)).find(x => x.usuario === usuario);
  if (u && u.bloqueo && Date.parse(u.bloqueo) > Date.now()) throw err(429, 'Demasiados intentos fallidos. Probá de nuevo en unos minutos.');
  const ok = verifyPassword(password, u && u.hash);          // se verifica siempre, para que el tiempo no delate si el usuario existe
  if (!u || !u.activo || !ok) {
    if (u && !u.virtual) {
      const n = (u.intentos || 0) + 1;
      await SP.patchUserFields(u, { Intentos: String(n), BloqueoHasta: n >= 5 ? new Date(Date.now() + 10 * 60000).toISOString() : '' }).catch(() => {});
    }
    throw err(401, 'Usuario o contraseña incorrectos.');
  }
  if (u.intentos || u.bloqueo) await SP.patchUserFields(u, { Intentos: '0', BloqueoHasta: '' }).catch(() => {});
  return u;
}
module.exports = { hashPassword, verifyPassword, makeCookie, clearCookie, sessionUser, login, publicUser };
