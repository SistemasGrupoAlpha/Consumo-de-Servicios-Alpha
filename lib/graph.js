'use strict';
/* Microsoft Graph con credenciales de aplicación (el navegador nunca recibe estos datos). */
const need = n => { const v = process.env[n]; if (!v) { const e = new Error('Falta la variable de entorno ' + n); e.status = 500; throw e; } return v; };
let tok = { v: null, exp: 0 };
async function token() {
  if (tok.v && Date.now() < tok.exp - 60000) return tok.v;
  const body = new URLSearchParams({ client_id: need('AZURE_CLIENT_ID'), client_secret: need('AZURE_CLIENT_SECRET'), scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
  const r = await fetch(`https://login.microsoftonline.com/${need('AZURE_TENANT_ID')}/oauth2/v2.0/token`, { method: 'POST', body });
  const j = await r.json();
  if (!r.ok) throw new Error('No se pudo autenticar con Microsoft: ' + (j.error_description || j.error));
  tok = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return tok.v;
}
async function g(path, opt = {}, retry = true) {
  const url = path.startsWith('http') ? path : 'https://graph.microsoft.com/v1.0' + path;
  const res = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + await token(), ...(opt.headers || {}) } });
  if ((res.status === 429 || res.status === 503) && retry) {
    await new Promise(r => setTimeout(r, Math.min(3000, (+res.headers.get('retry-after') || 1) * 1000)));
    return g(path, opt, false);
  }
  if (!res.ok) throw new Error(`Graph ${res.status} ${opt.method || 'GET'} ${path.slice(0, 90)}: ${(await res.text()).slice(0, 240)}`);
  if (res.status === 204) return null;
  return (res.headers.get('content-type') || '').includes('json') ? res.json() : res;
}
module.exports = { g, need, token };
