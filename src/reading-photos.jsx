import React, { useEffect, useState } from 'react';

const limit = 3 * 1024 * 1024;
const size = 1800;
const imageUrl = id => `/api/fotos?kind=lecturas&id=${encodeURIComponent(id)}`;

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la fotografía.'));
    reader.readAsDataURL(blob);
  });
}

export async function preparePhoto(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!jpeg || jpeg.size > limit) throw new Error('La foto supera 3 MB. Probá con una imagen más pequeña.');
    return { uploadId: crypto.randomUUID(), name: file.name, preview: await dataUrl(jpeg) };
  } catch (error) {
    if (error instanceof DOMException) throw new Error('No se pudo abrir la imagen. Probá con JPEG o PNG.');
    throw error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function uploadReadingPhoto(request, id, photo) {
  return request(imageUrl(id), { method: 'POST', body: JSON.stringify({
    uploadId: photo.uploadId, photo: photo.preview.split(',')[1],
  }) });
}

export function ReadingPhotoGallery({ id, enabled, request }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    request(imageUrl(id), { signal: controller.signal }).then(
      ({ photos }) => setResult({ photos }),
      error => { if (!controller.signal.aborted) setResult({ error: error.message }); },
    );
    return () => controller.abort();
  }, [id, enabled, request]);
  return <section className="reading-photos">
    <h3>Fotografías</h3>
    {!enabled ? <p>La conexión a las fotos de SharePoint está pendiente.</p> : !result ? <p>Cargando fotos…</p> : result.error ? <p className="error" role="alert">{result.error}</p> : result.photos.length ?
      <div className="photo-grid">{result.photos.map(({ url }, index) => <a key={url} href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={`Foto ${index + 1} de la lectura`} loading="lazy"/>
      </a>)}</div> : <p>Esta lectura no tiene fotos.</p>}
  </section>;
}

export function ReadingPhotoPicker({ photos, enabled, disabled, onPick, onRemove, single = false, required = false }) {
  const pick = event => {
    const files = Array.from(event.currentTarget.files);
    event.currentTarget.value = '';
    if (files.length) onPick(files);
  };
  return <section className="reading-photos">
    <h3>{required ? 'Foto del medidor (obligatoria)' : 'Fotografías de la lectura'}</h3>
    {enabled ? <div className="photo-controls">
      <label className="photo-input">Tomar foto<input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={pick}/></label>
      <label className="photo-input">{single ? 'Subir foto' : 'Agregar fotos'}<input type="file" accept="image/*" multiple={!single} disabled={disabled} onChange={pick}/></label>
    </div> : <p>La conexión a las fotos de SharePoint está pendiente.</p>}
    {photos.length > 0 && <div className="photo-grid">{photos.map(photo => <div key={photo.uploadId}>
      <img src={photo.preview} alt={photo.name || 'Foto por guardar'}/>
      <button className="secondary" type="button" disabled={disabled} onClick={() => onRemove(photo.uploadId)}>Quitar foto</button>
    </div>)}</div>}
  </section>;
}
