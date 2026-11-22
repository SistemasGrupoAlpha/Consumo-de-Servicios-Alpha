const {g}=require('../lib/graph');const {siteId,listId}=require('../lib/consumo-sharepoint');const {route,send,fail,todayHN,dateOk}=require('../lib/http');
const {columnsFor,mapColumns,resolveLookups,readItems,selectFields}=require('../lib/consumo-columnas');
const Photos=require('../lib/sharepoint-photos');
const { allowedBuildings, requireBuildingAccess } = require('../lib/consumo-accesos');
const {catalogItem,readingUpdates,registrationFields}=require('../lib/consumo-lecturas');
const keys={edificios:'SP_LIST_EDIFICIOS',locales:'SP_LIST_LOCALES',medidores:'SP_LIST_MEDIDORES',lecturas:'SP_LIST_LECTURAS',accesos:'SP_LIST_ACCESOS'};
const buildingCatalogs = new Set(['locales', 'medidores', 'accesos']);
const enc=encodeURIComponent;
async function all(url){let result=[];for(let i=0;url&&i<40;i++){const r=await g(url);result.push(...(r.value||[]));url=r['@odata.nextLink'];}if(url)throw fail(413,'Demasiados registros para una consulta');return result;}
const listPath = (site, list) => `/sites/${enc(site)}/lists/${enc(list)}`;
const itemsPath = (site, list) => `${listPath(site, list)}/items`;

const getItems = (site, list, field) => all(`${itemsPath(site, list)}?$expand=fields($select=${enc(field)})&$top=500`);

const registrationFieldsByList = {
  locales: ['Title', 'Edificio', 'MedidorAgua', 'MedidorEnergia'],
  medidores: ['Title', 'Edificio', 'Local', 'TipoMedidor', 'UnidadMedida', 'NumeroSerie'],
  lecturas: ['Edificio', 'Local', 'Medidor', 'FechaLectura', 'Periodo', 'LecturaInicial', 'LecturaFinal', 'Consumo', 'CuotaAplicada', 'TotalPagar'],
};

async function registrationRows(site, kind, fieldsToSelect) {
  const list = await listId(site, keys[kind]);
  const columnRequest = columnsFor(site, list);
  const base = `${itemsPath(site, list)}?$expand=fields`;
  const itemRequest = fieldsToSelect ? columnRequest.then(columns => {
    const fields = selectFields(kind, columns, fieldsToSelect);
    return all(`${base}($select=${enc(fields.join(','))})&$top=500`);
  }) : all(`${base}&$top=500`);
  const [items, columns] = await Promise.all([itemRequest, columnRequest]);
  return readItems(kind, items, mapColumns(kind, columns, items), new Map());
}

async function readingDirectory(site, compact = false) {
  const { registrationDirectory } = await import('../lib/registro-lecturas.mjs');
  const [locals, meters] = await Promise.all(['locales', 'medidores'].map(kind => registrationRows(site, kind, compact ? registrationFieldsByList[kind] : undefined)));
  return registrationDirectory(locals, meters);
}

async function buildingChoices(site, user) {
  const [list, allowed] = await Promise.all([listId(site, keys.edificios), allowedBuildings(site, user)]);
  if (allowed?.size === 0) return [];
  const rows = await getItems(site, list, 'Title');
  return rows.filter(row => !allowed || allowed.has(String(row.id)))
    .map(row => ({ id: String(row.id), Title: row.fields?.Title || `Edificio #${row.id}` }));
}

async function buildingReadingCounts(site, user) {
  const month = todayHN().slice(0, 7);
  const allowed = await allowedBuildings(site, user);
  if (allowed?.size === 0) return { month, counts: {} };

  const helpers = await import('../lib/registro-lecturas.mjs');
  const rows = await registrationRows(site, 'lecturas', ['Edificio', 'Local', 'Medidor', 'FechaLectura', 'Periodo', 'LecturaFinal']);
  const completed = rows.filter(row => helpers.readingMonth(row) === month && helpers.readingNumber(row.LecturaFinal) !== null);
  const directory = completed.some(row => !helpers.localBuildingId(row)) ? await readingDirectory(site, true) : null;
  const counts = new Map();
  for (const row of completed) {
    let building = helpers.localBuildingId(row);
    if (!building && directory) {
      const meter = directory.meterForReading(row);
      if (meter) building = helpers.localBuildingId(meter);
    }
    if (!building || (allowed && !allowed.has(building))) continue;
    counts.set(building, (counts.get(building) || 0) + 1);
  }
  return { month, counts: Object.fromEntries(counts) };
}

async function registrationCatalog(site, user, buildingId, service, localsOnly) {
  const allowed = await allowedBuildings(site, user);
  if (buildingId && allowed && !allowed.has(buildingId)) throw fail(403, 'No tenés acceso a este edificio.');
  if (allowed?.size === 0) return { buildings: [], locals: [], meters: [], readings: [] };
  const { localBuildingId, localHasService, meterLocalId, meterHasService, readingMonth, readingSummary } = await import('../lib/registro-lecturas.mjs');
  const localView = row => ({ id: row.id, Title: row.Title, EdificioLookupLookupId: localBuildingId(row),
    MedidorAgua: row.MedidorAgua, MedidorEnergia: row.MedidorEnergia });
  if (localsOnly) {
    const locals = await registrationRows(site, 'locales', registrationFieldsByList.locales);
    return { locals: locals.filter(row => localBuildingId(row) === buildingId && localHasService(row, service)).map(localView) };
  }
  const compact = Boolean(service);
  const [buildings, directory, rows] = await Promise.all([
    buildingId ? catalogItem(site, 'edificios', buildingId).then(building => [building]) : registrationRows(site, 'edificios'),
    readingDirectory(site, compact), registrationRows(site, 'lecturas', compact ? registrationFieldsByList.lecturas : undefined),
  ]);
  const visibleBuildings = buildings.filter(row => (!allowed || allowed.has(String(row.id))) && (!buildingId || String(row.id) === buildingId));
  const buildingIds = new Set(visibleBuildings.map(row => String(row.id)));
  const visibleLocals = [...directory.byLocalId.values()].filter(row => buildingIds.has(localBuildingId(row)) && (!service || localHasService(row, service)));
  const visibleMeters = [...directory.scopedMeters.values()].filter(row => buildingIds.has(localBuildingId(row)) && (!service || meterHasService(row, service)));
  const meterIds = new Set(visibleMeters.map(meter => String(meter.id)));
  const readings = [];
  for (const row of rows) {
    const meter = directory.meterForReading(row);
    const month = readingMonth(row);
    if (!meter || !meterIds.has(String(meter.id)) || !month) continue;
    readings.push(readingSummary(row, meter.id));
  }
  return {
    buildings: visibleBuildings.map(({ id, Title, CuotaAgua, CuotaEnergia, CuotaCondonadaAgua }) => ({ id, Title, CuotaAgua, CuotaEnergia, CuotaCondonadaAgua })),
    locals: visibleLocals.map(localView),
    meters: visibleMeters.map(row => ({ id: row.id, Title: row.Title, EdificioLookupLookupId: localBuildingId(row), LocalLookupLookupId: meterLocalId(row), TipoMedidor: row.TipoMedidor, UnidadMedida: row.UnidadMedida, NumeroSerie: row.NumeroSerie })),
    readings,
  };
}

function readingsForMeter(meter, directory, history, {meterGroupKey,readingSummary}) {
  const readings = [];
  const group = meterGroupKey(meter);
  for (const row of history) {
    const linked = directory.meterForReading(row);
    if (!linked || meterGroupKey(linked) !== group) continue;
    const reading = readingSummary(row, linked.id);
    if (reading.month) readings.push(reading);
  }
  return readings;
}

function billReading(building, meter, readings, month, final, existing, helpers) {
  const initial = helpers.previousReadingValue(readings, month, existing);
  const charges = helpers.readingCharges(building, meter.TipoMedidor, initial, final);
  if (initial === null) throw fail(400, 'No hay una lectura anterior con valor final para este medidor.');
  if (charges.final === null || charges.final < initial) throw fail(400, 'La lectura final debe ser igual o mayor que la lectura inicial.');
  if (charges.total === null) throw fail(400, 'Configurá una cuota válida para este servicio en Edificios.');
  return helpers.billedReadingFields(charges);
}

const tariffFields = ['CuotaAgua', 'CuotaEnergia', 'CuotaCondonadaAgua'];

async function buildingUpdates(site, list, fields) {
  const {readingNumber} = await import('../lib/registro-lecturas.mjs');
  const columns = await columnsFor(site, list);
  const mapping = mapColumns('edificios', columns);
  const updates = {};
  for (const [key, value] of Object.entries(fields)) {
    const column = mapping.get(key) ?? columns.find(column => column.name === key);
    if (!column || column.readOnly || column.calculated) continue;
    if (tariffFields.includes(key) || tariffFields.some(field => mapping.get(field)?.name === column.name)) {
      const number = value === '' || value == null ? null : readingNumber(value);
      if (number < 0 || (number === null && value !== '' && value != null)) throw fail(400, 'Ingresá una cuota o condonación igual o mayor que cero.');
      updates[column.name] = number;
    } else updates[column.name] = value;
  }
  return updates;
}

async function scopedCatalogUpdates(site, list, kind, fields, buildingId, creating) {
  const columns = await columnsFor(site, list);
  const mapping = mapColumns(kind, columns);
  const links = mapColumns(kind, columns.filter(column => column.lookup ||
    /^(Edificio1|EdificioLookup|LocalLookup)$/.test(column.name)));
  const building = links.get('Edificio');
  if (!building) throw fail(400, 'La lista no tiene una columna de vínculo con Edificios.');
  const updates = {};
  if (creating) {
    await catalogItem(site, 'edificios', buildingId);
    updates[`${building.name}LookupId`] = buildingId;
  }
  for (const [field, value] of Object.entries(fields)) {
    if (field === 'Edificio') continue;
    if (field === 'Local' && kind === 'medidores' && links.has(field)) {
      if (value) {
        if (typeof value !== 'string' || !/^\d+$/.test(value)) throw fail(400, 'Seleccioná un local válido.');
        const { localBuildingId } = await import('../lib/registro-lecturas.mjs');
        const local = await catalogItem(site, 'locales', value);
        if (localBuildingId(local) !== buildingId) throw fail(400, 'El local debe pertenecer al edificio seleccionado.');
      }
      updates[`${links.get(field).name}LookupId`] = value || null;
      continue;
    }
    const column = mapping.get(field);
    if (!column || column.readOnly || column.calculated || column.lookup) continue;
    if (column.boolean) updates[column.name] = /^(sí|si|1|true)$/i.test(value);
    else if (column.number && typeof value === 'string') {
      const { readingNumber } = await import('../lib/registro-lecturas.mjs');
      const number = readingNumber(value);
      if (number === null && value !== '') throw fail(400, `Ingresá un valor numérico en ${column.displayName}.`);
      updates[column.name] = number;
    } else updates[column.name] = value;
  }
  return updates;
}

async function patchReadingValues(site, list, req, res, user, fromRegistration) {
  const { canReport } = await import('../lib/roles.mjs');
  if (!canReport(user.rol)) throw fail(403, 'Tu rol permite registrar lecturas nuevas y consultar las ya guardadas.');
  const id = String(req.query?.id || '');
  const { fields, EdificioId, MedidorId, Periodo } = req.body || {};
  const editable = ['LecturaFinal'];
  if (!/^\d+$/.test(id) || !fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).some(key => !editable.includes(key))) {
    throw fail(400, 'Solo se puede editar la lectura final.');
  }
  if (fromRegistration) {
    if (![EdificioId, MedidorId].every(value => typeof value === 'string' && /^\d+$/.test(value))) throw fail(400, 'Seleccioná un edificio y un medidor válidos.');
    await requireBuildingAccess(site, user, EdificioId);
  }
  const helpers = await import('../lib/registro-lecturas.mjs');
  const {localBuildingId, meterLocalId, readingMonth, readingNumber, readingSummary} = helpers;
  if (!Object.hasOwn(fields, 'LecturaFinal') && !fromRegistration) return send(res,200,{id,fields:{}});
  const [current, directory] = await Promise.all([catalogItem(site, 'lecturas', id), readingDirectory(site)]);
  const meter = directory.meterForReading(current);
  const month = readingMonth(current);
  if (fromRegistration) {
    if (!meter || String(meter.id) !== MedidorId || !month || month !== Periodo ||
        localBuildingId(meter) !== EdificioId || (req.body.LocalId && meterLocalId(meter) !== req.body.LocalId)) {
      throw fail(409, 'La lectura seleccionada ya no corresponde al medidor y mes elegidos.');
    }
  }
  if (!Object.hasOwn(fields, 'LecturaFinal')) return send(res,200,{id,fields:{}});
  const final = readingNumber(fields.LecturaFinal);
  if (final === null) throw fail(400, 'Ingresá un valor numérico para la lectura final.');
  if (final === readingNumber(current.LecturaFinal)) return send(res,200,{id,fields:{}});
  if (!meter || !month) throw fail(409, 'La lectura no tiene un medidor y mes válidos para calcular el consumo.');
  const [building, history] = await Promise.all([catalogItem(site,'edificios',localBuildingId(meter)),registrationRows(site,'lecturas')]);
  const readings = readingsForMeter(meter,directory,history,helpers);
  const billed = billReading(building,meter,readings,month,final,readingSummary(current,meter.id),helpers);
  const changed = Object.fromEntries(Object.entries(billed).filter(([key,value]) => readingNumber(current[key]) !== value));
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
const buildingId = String(req.query?.edificio || '');
if (buildingId && !/^\d+$/.test(buildingId)) throw fail(400, 'Edificio inválido.');
if (kind === 'edificios' && req.method === 'GET' && req.query?.view === 'selector') {
  return send(res, 200, { items: await buildingChoices(await siteId(), user) });
}
if (kind === 'edificios' && req.method === 'GET' && req.query?.view === 'lecturas-del-mes') {
  return send(res, 200, await buildingReadingCounts(await siteId(), user));
}
if (kind === 'registro' && req.method === 'GET') {
  const service = String(req.query?.servicio || '');
  const localsOnly = req.query?.view === 'locales';
  const { readingServices } = await import('../lib/registro-lecturas.mjs');
  if ((service || localsOnly) && (!buildingId || !Object.hasOwn(readingServices, service))) throw fail(400, 'Seleccioná un edificio y un servicio.');
  return send(res, 200, await registrationCatalog(await siteId(), user, buildingId, service, localsOnly));
}
if (kind === 'registro' && req.method === 'PATCH') {
  const site = await siteId();
  return patchReadingValues(site, await listId(site, keys.lecturas), req, res, user, true);
}
if(!Object.hasOwn(keys,kind))throw fail(400,'Módulo desconocido');
const site=await siteId();const list=await listId(site,keys[kind]);const base=itemsPath(site,list);
if (req.method === 'GET') {
  const reporting = kind === 'lecturas' && req.query?.view === 'reporte';
  const reportMeter = String(req.query?.medidor || '');
  const reportService = String(req.query?.servicio || '');
  if (reporting) {
    const { canReport } = await import('../lib/roles.mjs');
    if (!canReport(user.rol)) throw fail(403, 'Tu rol no permite generar reportes.');
    const { readingServices } = await import('../lib/registro-lecturas.mjs');
    if (!buildingId || !/^\d+$/.test(reportMeter) || !Object.hasOwn(readingServices, reportService)) {
      throw fail(400, 'Seleccioná un edificio, un medidor y un servicio.');
    }
  }
  const scoped = Boolean(buildingId);
  if (kind === 'accesos' && user.rol !== 'Admin') throw fail(403, 'Solo los administradores pueden administrar accesos.');
  const allowed = await allowedBuildings(site, user);
  if (scoped && allowed && !allowed.has(buildingId)) throw fail(403, 'No tenés acceso a este edificio.');
  if (allowed?.size === 0) return send(res, 200, { items: [], columns: [], photosEnabled: false });
  const listDetails = kind === 'edificios' ? g(`${listPath(site, list)}?$select=webUrl`) : null;
  const history = kind === 'lecturas'
    ? Promise.all([registrationRows(site, 'edificios'), readingDirectory(site), import('../lib/registro-lecturas.mjs')])
    : null;
  const [items, columns, details, locations] = await Promise.all([all(`${base}?$expand=fields&$top=500`), columnsFor(site, list), listDetails, history]);
  const mapping = mapColumns(kind, columns, items);
  const lookupKey = mapping.get('Edificio')?.name;
  const filteredItems = scoped || allowed ? items.filter(item => {
    const linked = kind === 'edificios' ? String(item.id) : String(item.fields?.[`${lookupKey}LookupId`] ?? '');
    if (!linked && kind === 'lecturas') return true; // The meter resolves older readings without an explicit building.
    return (!scoped || linked === buildingId) && (!allowed || allowed.has(linked));
  }) : items;
  const lookupMapping = kind === 'lecturas' && scoped
    ? new Map([...mapping].filter(([field]) => field !== 'Edificio' && field !== 'Local'))
    : mapping;
  const lookups = await resolveLookups(site, lookupMapping, filteredItems, getItems);
  const rows = readItems(kind, filteredItems, mapping, lookups);
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
  let visible = rows;
  if (locations) {
    const [buildings, directory, { historyLocations, meterHasService }] = locations;
    visible = historyLocations(rows, buildings, directory, allowed);
    if (scoped) visible = visible.filter(row => row.EdificioHistorialId === buildingId);
    if (reporting) visible = visible.filter(row => row.MedidorHistorialId === reportMeter && meterHasService(row, reportService));
  }
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
  await requireBuildingAccess(site, user, fields.EdificioId);
  if (!dateOk(fields.FechaLectura)) throw fail(400, 'Seleccioná una fecha de lectura válida.');
  const { OPERATOR } = await import('../lib/roles.mjs');
  if (user.rol === OPERATOR && fields.FechaLectura.slice(0, 7) !== todayHN().slice(0, 7)) {
    throw fail(403, 'Tu rol permite registrar lecturas del mes actual.');
  }
  const { uploadId, bytes } = Photos.decodeReadingPhoto(req.body);
  if (Object.keys(fields).some(key=>!['EdificioId','LocalId','MedidorId','Servicio','FechaLectura','LecturaFinal'].includes(key))) throw fail(400,'La cuota, la lectura inicial y los totales se calculan automáticamente.');
  if (typeof fields.EdificioId !== 'string' || !/^\d+$/.test(fields.EdificioId) || typeof fields.FechaLectura !== 'string') throw fail(400,'Seleccioná un edificio y una fecha válidos.');
  const [directory, history, helpers] = await Promise.all([readingDirectory(site), registrationRows(site, 'lecturas'), import('../lib/registro-lecturas.mjs')]);
  const meter = directory.scopedMeters.get(fields.MedidorId);
  const local = directory.byLocalId.get(fields.LocalId);
  if (!meter || helpers.localBuildingId(meter) !== fields.EdificioId) throw fail(400,'El medidor no corresponde al edificio seleccionado.');
  const readings = readingsForMeter(meter,directory,history,helpers);
  const month = fields.FechaLectura.slice(0,7);
  if (readings.some(row=>row.month===month)) throw fail(409,'Ya hay una lectura asociada a este medidor para el mes. Revisá el registro existente.');
  const building = await catalogItem(site,'edificios',fields.EdificioId);
  const billed = billReading(building,meter,readings,month,fields.LecturaFinal,null,helpers);
  const updates = await registrationFields(site,list,fields,{local,meter},billed);
  const billingColumns = mapColumns('lecturas',await columnsFor(site,list));
  if (Object.keys(billed).some(key=>!Object.hasOwn(updates,billingColumns.get(key)?.name))) throw fail(500,'No se encontraron todas las columnas de facturación para guardar la lectura.');
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
  return send(res, 201, {id:created.id, fields:billed});
}
if (kind === 'lecturas' && req.method === 'PATCH') return patchReadingValues(site, list, req, res, user, false);
if (kind === 'edificios' && req.method !== 'DELETE') fields = await buildingUpdates(site,list,fields);
if (buildingId && buildingCatalogs.has(kind) && req.method !== 'DELETE') {
  fields = await scopedCatalogUpdates(site, list, kind, fields, buildingId, req.method === 'POST');
}
if(req.method==='POST'){const v=await g(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});return send(res,201,{id:v.id,fields:v.fields});}
if(!/^\d+$/.test(id))throw fail(400,'ID inválido');
if(req.method==='PATCH'){if(Object.keys(fields).length)await g(base+'/'+id+'/fields',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});return send(res,200,{ok:true});}
await g(base+'/'+id,{method:'DELETE'});return send(res,200,{ok:true});
});
