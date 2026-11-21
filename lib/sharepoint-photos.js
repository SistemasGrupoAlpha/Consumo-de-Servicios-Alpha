'use strict';

const { constants, createHash, randomUUID, sign, X509Certificate } = require('node:crypto');
const { g, need } = require('./graph');
const { listId, siteId } = require('./consumo-sharepoint');
const { fail } = require('./http');

const photoLists = { edificios: 'SP_LIST_EDIFICIOS', lecturas: 'SP_LIST_LECTURAS' };
const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp' };
const enc = encodeURIComponent;
const configured = () => Boolean(process.env.SP_PHOTOS_CERTIFICATE && process.env.SP_PHOTOS_PRIVATE_KEY);
const maxUploadBytes = 3 * 1024 * 1024;
let tokenCache;

function imageType(name) {
  if (typeof name !== 'string' || !/^[^/\\\u0000-\u001f]+\.[a-z0-9]+$/i.test(name)) return;
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return Object.hasOwn(types, extension) ? types[extension] : undefined;
}

async function sharePointToken(origin) {
  if (tokenCache?.origin === origin && tokenCache.expires > Date.now()) return tokenCache.value;
  if (!configured()) throw fail(503, 'Falta habilitar el acceso a las fotos de SharePoint.');
  const endpoint = `https://login.microsoftonline.com/${enc(need('AZURE_TENANT_ID'))}/oauth2/v2.0/token`;
  const clientId = need('AZURE_CLIENT_ID');
  const certificate = new X509Certificate(need('SP_PHOTOS_CERTIFICATE').replace(/\\n/g, '\n'));
  const key = need('SP_PHOTOS_PRIVATE_KEY').replace(/\\n/g, '\n');
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const thumbprint = createHash('sha256').update(certificate.raw).digest('base64url');
  const header = encode({ typ: 'JWT', alg: 'PS256', 'x5t#S256': thumbprint });
  const claims = encode({ aud: endpoint, iss: clientId, sub: clientId, jti: randomUUID(), iat: now, nbf: now - 10, exp: now + 300 });
  const assertion = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(assertion), {
    key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString('base64url');
  const response = await fetch(endpoint, { method: 'POST', body: new URLSearchParams({
    client_id: clientId, scope: `${origin}/.default`, grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: `${assertion}.${signature}`,
  }) });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw fail(503, 'Microsoft Entra no autorizó el certificado de fotos.');
  tokenCache = { origin, value: token.access_token, expires: Date.now() + (Number(token.expires_in) - 60) * 1000 };
  return tokenCache.value;
}

async function listItem(kind, id) {
  const site = await siteId();
  const list = await listId(site, photoLists[kind]);
  const root = process.env.SP_SITE_URL || (process.env.SP_HOSTNAME && process.env.SP_SITE_PATH
    ? `https://${process.env.SP_HOSTNAME}${process.env.SP_SITE_PATH}`
    : (await g(`/sites/${enc(site)}?$select=webUrl`)).webUrl);
  const url = new URL(root);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.sharepoint.com')) throw Error('URL de SharePoint inválida');
  const sitePath = url.pathname.replace(/\/$/, '');
  const rest = (path, options = {}) => sharePointRequest(url.origin, `${sitePath}/_api/web/${path}`, options);
  return {
    rest, url, sitePath,
    attachments: `lists(guid'${list}')/items(${id})/AttachmentFiles`,
    graph: `/sites/${enc(site)}/lists/${enc(list)}/items/${id}`,
  };
}

async function sharePointRequest(origin, path, { method = 'GET', body, type, accept = 'application/json;odata=nometadata' } = {}) {
  const headers = { Authorization: `Bearer ${await sharePointToken(origin)}`, Accept: accept };
  if (type) headers['Content-Type'] = type;
  return fetch(new URL(path, origin), { method, body, headers, redirect: 'error' });
}

function assertOk(response) {
  if (response.ok) return;
  if (response.status === 404) throw fail(404, 'El archivo o la lectura ya no está en SharePoint.');
  if ([401, 403].includes(response.status)) throw fail(503, 'La aplicación necesita permiso de SharePoint para acceder a los adjuntos.');
  throw fail(502, `SharePoint no pudo completar la operación de fotos (${response.status}).`);
}

const quoted = value => `'${enc(value.replaceAll("'", "''")).replaceAll("'", '%27')}'`;

async function readingPhotos(id) {
  const { rest, attachments } = await listItem('lecturas', id);
  const response = await rest(`${attachments}?$select=FileName`);
  assertOk(response);
  const data = await response.json();
  return (data.value ?? []).map(item => item.FileName).filter(imageType);
}

async function photoContent(kind, id, name) {
  const item = await listItem(kind, id);
  let serverPath;
  if (kind === 'edificios') {
    const { fields } = await g(`${item.graph}?$expand=fields($select=Logo)`);
    let image = fields?.Logo;
    if (typeof image === 'string') {
      try { image = JSON.parse(image); }
      catch { throw fail(404, 'El edificio no tiene un logo disponible.'); }
    }
    name = image?.fileName;
    if (typeof image?.serverRelativeUrl === 'string' && image.serverRelativeUrl.startsWith('/')) {
      const resolved = new URL(image.serverRelativeUrl, item.url);
      if (resolved.origin === item.url.origin && resolved.pathname.startsWith(`${item.sitePath}/`)) {
        serverPath = decodeURIComponent(resolved.pathname);
        name ||= serverPath.split('/').at(-1);
      }
    }
  }
  const type = imageType(name);
  if (!type) throw fail(404, 'La fotografía no está disponible.');
  const path = serverPath ? `GetFileByServerRelativePath(decodedUrl=@path)/$value?@path=${quoted(serverPath)}`
    : `${item.attachments}(${quoted(name)})/$value`;
  const response = await item.rest(path, { accept: 'application/octet-stream' });
  assertOk(response);
  return { response, type };
}

async function saveReadingPhoto(id, uploadId, bytes) {
  const name = `consumo-${uploadId}.jpg`;
  const { rest, attachments } = await listItem('lecturas', id);
  const response = await rest(`${attachments}/add(FileName=${quoted(name)})`, { method: 'POST', body: bytes, type: 'application/octet-stream' });
  // A retry after a lost response can encounter the attachment from the first attempt.
  if ([400, 409].includes(response.status)) {
    const existing = await rest(`${attachments}(${quoted(name)})?$select=FileName`);
    if (existing.ok) return name;
  }
  assertOk(response);
  return name;
}

module.exports = { configured, maxUploadBytes, readingPhotos, photoContent, saveReadingPhoto };
