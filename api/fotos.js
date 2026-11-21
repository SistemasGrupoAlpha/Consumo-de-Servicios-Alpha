'use strict';

const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { route, send, fail } = require('../lib/http');
const Photos = require('../lib/sharepoint-photos');

module.exports = route(['GET', 'POST'], async (req, res, user) => {
  const kind = String(req.query?.kind || '');
  const id = String(req.query?.id || '');
  const file = req.query?.file;
  if (!['edificios', 'lecturas'].includes(kind) || !/^\d+$/.test(id)) throw fail(400, 'Registro de fotos inválido.');
  if (req.method === 'POST' && (kind !== 'lecturas' || user.rol !== 'Admin')) throw fail(403, 'Solo los administradores pueden agregar fotos a las lecturas.');
  if (!Photos.configured()) throw fail(503, 'Falta habilitar el acceso a las fotos de SharePoint.');

  const base = `/api/fotos?kind=${kind}&id=${id}`;
  if (req.method === 'POST') {
    const { uploadId, photo } = req.body || {};
    if (typeof uploadId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(uploadId) || typeof photo !== 'string') {
      throw fail(400, 'Fotografía inválida.');
    }
    if (photo.length > 4 * Math.ceil(Photos.maxUploadBytes / 3)) throw fail(413, 'La foto supera el límite de 3 MB.');
    const bytes = Buffer.from(photo, 'base64');
    if (bytes.length > Photos.maxUploadBytes || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      throw fail(400, 'El archivo debe ser una fotografía JPEG válida.');
    }
    const name = await Photos.saveReadingPhoto(id, uploadId, bytes);
    return send(res, 201, { url: `${base}&file=${encodeURIComponent(name)}` });
  }
  if (kind === 'lecturas' && file == null) {
    const files = await Photos.readingPhotos(id);
    return send(res, 200, { photos: files.map(name => ({ url: `${base}&file=${encodeURIComponent(name)}` })) });
  }
  const { response, type } = await Photos.photoContent(kind, id, file);
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  await pipeline(Readable.fromWeb(response.body), res).catch(error => res.destroy(error));
});
