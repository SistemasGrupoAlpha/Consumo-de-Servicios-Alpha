const {g}=require('../lib/graph');const {siteId,listId}=require('../lib/consumo-sharepoint');const {route,send,fail}=require('../lib/http');
const {columnsFor,mapColumns,resolveLookups,readItems}=require('../lib/consumo-columnas');
const Photos=require('../lib/sharepoint-photos');
const {catalogItem,readingUpdates,registrationFields}=require('../lib/consumo-lecturas');
const keys={edificios:'SP_LIST_EDIFICIOS',locales:'SP_LIST_LOCALES',medidores:'SP_LIST_MEDIDORES',lecturas:'SP_LIST_LECTURAS',accesos:'SP_LIST_ACCESOS'};
const enc=encodeURIComponent;
async function all(url){let result=[];for(let i=0;url&&i<40;i++){const r=await g(url);result.push(...(r.value||[]));url=r['@odata.nextLink'];}if(url)throw fail(413,'Demasiados registros para una consulta');return result;}
const listPath = (site, list) => `/sites/${enc(site)}/lists/${enc(list)}`;
const itemsPath = (site, list) => `${listPath(site, list)}/items`;

const getItems = (site, list, field) => all(`${itemsPath(site, list)}?$expand=fields($select=${enc(field)})&$top=200`);

async function registrationRows(site, kind) {
  const list = await listId(site, keys[kind]);
  const [items, columns] = await Promise.all([all(`${itemsPath(site, list)}?$expand=fields&$top=200`), columnsFor(site, list)]);
  return readItems(kind, items, mapColumns(kind, columns, items), new Map());
}

async function allowedBuildings(site, user) {
  if (user.rol === 'Admin') return null;
  const { isEnabled, localBuildingId } = await import('../lib/registro-lecturas.mjs');
  const identity = value => String(value || '').trim().toLowerCase();
  const accounts = new Set([identity(user.usuario), identity(user.email)].filter(Boolean));
  const rows = await registrationRows(site, 'accesos');
  return new Set(rows.filter(row => isEnabled(row.Activo) && accounts.has(identity(row.Correo)))
    .map(localBuildingId).filter(Boolean));
}

async function registrationCatalog(site, user) {
  const allowed = await allowedBuildings(site, user);
  if (allowed?.size === 0) return { buildings: [], locals: [], meters: [], readings: [], conflicts: [] };
  const { localBuildingId, meterLocalId, readingMeterId, readingMonth } = await import('../lib/registro-lecturas.mjs');
  const [buildings, locals, meters, rows] = await Promise.all(['edificios', 'locales', 'medidores', 'lecturas'].map(kind => registrationRows(site, kind)));
  const visibleBuildings = buildings.filter(row => !allowed || allowed.has(String(row.id)));
  const buildingIds = new Set(visibleBuildings.map(row => String(row.id)));
  const visibleLocals = locals.filter(row => buildingIds.has(localBuildingId(row)));
  const localBuildings = new Map(visibleLocals.map(row => [String(row.id), localBuildingId(row)]));
  const visibleMeters = meters.filter(row => {
    const building = localBuildings.get(meterLocalId(row));
    return building && (!localBuildingId(row) || localBuildingId(row) === building);
  });
  const meterBuildings = new Map(visibleMeters.map(row => [String(row.id), localBuildings.get(meterLocalId(row))]));
  const readings = [];
  const conflicts = [];
  for (const row of rows) {
    const meterId = readingMeterId(row);
    const month = readingMonth(row);
    if (!meterBuildings.has(meterId) || !month) continue;
    if (localBuildingId(row) && localBuildingId(row) !== meterBuildings.get(meterId)) {
      conflicts.push({ meterId, month });
    } else {
      readings.push({ id: String(row.id), meterId, month, date: String(row.FechaLectura ?? '').slice(0, 10), initial: row.LecturaInicial, final: row.LecturaFinal });
    }
  }
  return {
    buildings: visibleBuildings.map(({ id, Title }) => ({ id, Title })),
    locals: visibleLocals.map(row => ({ id: row.id, Title: row.Title, EdificioLookupLookupId: localBuildingId(row), MedidorAgua: row.MedidorAgua, MedidorEnergia: row.MedidorEnergia })),
    meters: visibleMeters.map(row => ({ id: row.id, Title: row.Title, LocalLookupLookupId: meterLocalId(row), TipoMedidor: row.TipoMedidor, UnidadMedida: row.UnidadMedida, NumeroSerie: row.NumeroSerie })),
    readings, conflicts,
  };
}

async function checkNewReadingMonth(site, fields) {
  const { localBuildingId, meterGroupKey, readingMeterId, readingMonth } = await import('../lib/registro-lecturas.mjs');
  const [meters, history] = await Promise.all(['medidores', 'lecturas'].map(kind => registrationRows(site, kind)));
  const meter = meters.find(row => String(row.id) === fields.MedidorId);
  if (!meter) throw fail(400, 'No se encontró ese medidor.');
  const group = new Set(meters.filter(row => meterGroupKey(row) === meterGroupKey(meter) && (!localBuildingId(row) || localBuildingId(row) === fields.EdificioId)).map(row => String(row.id)));
  const linkedReadings = history.filter(row => group.has(readingMeterId(row)));
  if (!linkedReadings.some(row => readingMeterId(row) === fields.MedidorId && readingMonth(row) && (!localBuildingId(row) || localBuildingId(row) === fields.EdificioId))) {
    throw fail(400, 'Seleccioná un medidor con historial en este edificio.');
  }
  if (linkedReadings.some(row => readingMonth(row) === fields.FechaLectura.slice(0, 7))) {
    throw fail(409, 'Ya hay una lectura asociada a este medidor para el mes. Revisá el registro existente.');
  }
}

async function patchReadingValues(site, list, req, res, user, fromRegistration) {
  const id = String(req.query?.id || '');
  const { fields, EdificioId, MedidorId, Periodo } = req.body || {};
  const editable = ['LecturaInicial', 'LecturaFinal'];
  if (!/^\d+$/.test(id) || !fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).some(key => !editable.includes(key))) {
    throw fail(400, 'Solo se pueden editar los valores de la lectura seleccionada.');
  }
  if (fromRegistration) {
    if (![EdificioId, MedidorId].every(value => typeof value === 'string' && /^\d+$/.test(value))) throw fail(400, 'Seleccioná un edificio y un medidor válidos.');
    const allowed = await allowedBuildings(site, user);
    if (allowed && !allowed.has(EdificioId)) throw fail(403, 'No tenés acceso para editar lecturas en este edificio.');
  }
  const { localBuildingId, meterLocalId, readingMeterId, readingMonth } = await import('../lib/registro-lecturas.mjs');
  const current = await catalogItem(site, 'lecturas', id);
  if (fromRegistration) {
    if (readingMeterId(current) !== MedidorId || !readingMonth(current) || readingMonth(current) !== Periodo) {
      throw fail(409, 'La lectura seleccionada ya no corresponde al medidor y mes elegidos.');
    }
    const meter = await catalogItem(site, 'medidores', MedidorId);
    const localId = meterLocalId(meter);
    if (!localId) throw fail(409, 'El medidor ya no está vinculado a un local.');
    const local = await catalogItem(site, 'locales', localId);
    if ([current, meter, local].some(row => localBuildingId(row) && localBuildingId(row) !== EdificioId) || localBuildingId(local) !== EdificioId) {
      throw fail(409, 'La lectura tiene un edificio distinto al local seleccionado.');
    }
  }
  const changed = {};
  for (const [key, value] of Object.entries(fields)) {
    const text = String(value ?? '').trim();
    const number = Number(text.replace(',', '.'));
    if (!text || !Number.isFinite(number)) throw fail(400, 'Ingresá un valor numérico para la lectura.');
    if (current[key] == null || Number(current[key]) !== number) changed[key] = number;
  }
  if (Object.keys(changed).length) {
    const updates = await readingUpdates(site, list, changed);
    if (Object.keys(updates).length !== Object.keys(changed).length) throw fail(500, 'No se encontraron las columnas de valores de lectura.');
    try {
      await g(`${itemsPath(site,list)}/${id}/fields`, { method:'PATCH', headers:{'Content-Type':'application/json', ...(current.etag && {'If-Match':current.etag})}, body:JSON.stringify(updates) });
    } catch (error) {
      if (error.message.startsWith('Graph 412 ')) throw fail(409, 'La lectura cambió mientras la editabas. Volvé a abrirla antes de guardar.');
      throw error;
    }
  }
  return send(res, 200, {id, fields:changed});
}

function buildingLogoUrl(row, listUrl) {
  if (!row.Logo || !/^\d+$/.test(String(row.id))) return;
  let image = row.Logo;
  if (typeof image === 'string') {
    try { image = JSON.parse(image); }
    catch { return; }
  }
  const list = new URL(listUrl);
  if (list.protocol !== 'https:') return;
  if (typeof image?.serverRelativeUrl === 'string' && image.serverRelativeUrl.startsWith('/')) {
    const url = new URL(image.serverRelativeUrl, list);
    if (url.origin === list.origin) return url.href;
  }
  const file = image?.fileName;
  if (typeof file !== 'string' || !/^[^/\\]+\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(file)) return;
  list.pathname = `${list.pathname.replace(/\/$/, '')}/Attachments/${row.id}/${enc(file)}`;
  list.search = '';
  list.hash = '';
  return list.href;
}

module.exports=route(['GET','POST','PATCH','DELETE'],async(req,res,user)=>{
const kind=String(req.query?.kind||'');
if (kind === 'registro' && req.method === 'GET') return send(res, 200, await registrationCatalog(await siteId(), user));
if (kind === 'registro' && req.method === 'PATCH') {
  const site = await siteId();
  return patchReadingValues(site, await listId(site, keys.lecturas), req, res, user, true);
}
if(!Object.hasOwn(keys,kind))throw fail(400,'Módulo desconocido');
const site=await siteId();const list=await listId(site,keys[kind]);const base=itemsPath(site,list);
if (req.method === 'GET') {
  const listDetails = kind === 'edificios' ? g(`${listPath(site, list)}?$select=webUrl`) : null;
  const [items, columns, details] = await Promise.all([all(`${base}?$expand=fields&$top=200`), columnsFor(site, list), listDetails]);
  const mapping = mapColumns(kind, columns, items);
  const lookups = await resolveLookups(site, mapping, items, getItems);
  const rows = readItems(kind, items, mapping, lookups);
  if (details?.webUrl) {
    const listUrl = new URL(details.webUrl);
    for (const row of rows) {
      row.LogoUrl = buildingLogoUrl(row, listUrl);
      if (row.LogoUrl) {
        const itemUrl = new URL(listUrl);
        itemUrl.pathname = `${listUrl.pathname.replace(/\/$/, '')}/DispForm.aspx`;
        itemUrl.search = new URLSearchParams({ ID: row.id }).toString();
        row.LogoItemUrl = itemUrl.href;
        if (Photos.configured()) row.LogoUrl = `/api/fotos?kind=edificios&id=${row.id}`;
      }
    }
  }
  const visible = kind === 'accesos' && user.rol !== 'Admin'
    ? rows.filter(item => String(item.Correo || '').trim().toLowerCase() === user.usuario)
    : rows;
  const fieldsByName = new Map([...mapping].map(([field, column]) => [column.name, field]));
  const visibleKeys = new Set(visible.flatMap(Object.keys));
  const detailColumns = columns.filter(column => !column.hidden && visibleKeys.has(fieldsByName.get(column.name) || column.name))
    .map(column => ({ key: fieldsByName.get(column.name) || column.name, label: column.displayName }));
  return send(res, 200, { items: visible, columns: detailColumns, photosEnabled: kind === 'lecturas' && Photos.configured() });
}
const registering = kind === 'lecturas' && req.method === 'POST';
if(user.rol!=='Admin'&&!registering)throw fail(403,'Solo los administradores pueden modificar datos');
const id=String(req.query?.id||'');let fields=req.body?.fields;
if(req.method!=='DELETE'&&(!fields||typeof fields!=='object'||Array.isArray(fields)))throw fail(400,'Campos inválidos');
if(fields&& (Object.keys(fields).length>40||JSON.stringify(fields).length>12000||Object.keys(fields).some(k=>! /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)||k==='id')))throw fail(400,'Campos no permitidos');
if (registering) {
  const allowed = await allowedBuildings(site, user);
  if (allowed && !allowed.has(fields.EdificioId)) throw fail(403, 'No tenés acceso para registrar lecturas en este edificio.');
  const { uploadId, bytes } = Photos.decodeReadingPhoto(req.body);
  const updates = await registrationFields(site, list, fields);
  await checkNewReadingMonth(site, fields);
  await Photos.checkReadingAttachments();
  const created = await g(base, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:updates})});
  try {
    await Photos.saveReadingPhoto(created.id, uploadId, bytes);
  } catch (error) {
    try { await g(`${base}/${enc(created.id)}`, {method:'DELETE'}); }
    catch (rollbackError) {
      console.error('No se pudo revertir la lectura', created.id, rollbackError);
      throw fail(502, `La lectura ${created.id} quedó pendiente de asociar a una foto. Revisá el historial antes de intentar otra vez.`);
    }
    throw error;
  }
  return send(res, 201, {id:created.id});
}
if (kind === 'lecturas' && req.method === 'PATCH') return patchReadingValues(site, list, req, res, user, false);
if(req.method==='POST'){const v=await g(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});return send(res,201,{id:v.id,fields:v.fields});}
if(!/^\d+$/.test(id))throw fail(400,'ID inválido');
if(req.method==='PATCH'){if(Object.keys(fields).length)await g(base+'/'+id+'/fields',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});return send(res,200,{ok:true});}
await g(base+'/'+id,{method:'DELETE'});return send(res,200,{ok:true});
});
