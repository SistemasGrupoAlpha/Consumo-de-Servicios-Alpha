const {g}=require('../lib/graph');const {siteId,listId}=require('../lib/consumo-sharepoint');const {route,send,fail}=require('../lib/http');
const {columnsFor,mapColumns,resolveLookups,readItems}=require('../lib/consumo-columnas');
const Photos=require('../lib/sharepoint-photos');
const {readingUpdates,registrationFields}=require('../lib/consumo-lecturas');
const keys={edificios:'SP_LIST_EDIFICIOS',locales:'SP_LIST_LOCALES',medidores:'SP_LIST_MEDIDORES',lecturas:'SP_LIST_LECTURAS',accesos:'SP_LIST_ACCESOS'};
const enc=encodeURIComponent;
async function all(url){let result=[];for(let i=0;url&&i<40;i++){const r=await g(url);result.push(...(r.value||[]));url=r['@odata.nextLink'];}if(url)throw fail(413,'Demasiados registros para una consulta');return result;}
const listPath = (site, list) => `/sites/${enc(site)}/lists/${enc(list)}`;
const itemsPath = (site, list) => `${listPath(site, list)}/items`;

const getItems = (site, list, field) => all(`${itemsPath(site, list)}?$expand=fields($select=${enc(field)})&$top=200`);

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
const kind=String(req.query?.kind||'');if(!Object.hasOwn(keys,kind))throw fail(400,'Módulo desconocido');
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
if(user.rol!=='Admin')throw fail(403,'Solo los administradores pueden modificar datos');
const id=String(req.query?.id||'');let fields=req.body?.fields;
if(req.method!=='DELETE'&&(!fields||typeof fields!=='object'||Array.isArray(fields)))throw fail(400,'Campos inválidos');
if(fields&& (Object.keys(fields).length>40||JSON.stringify(fields).length>12000||Object.keys(fields).some(k=>! /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)||k==='id')))throw fail(400,'Campos no permitidos');
if (kind === 'lecturas' && req.method === 'POST') {
  const { uploadId, bytes } = Photos.decodeReadingPhoto(req.body);
  await Photos.checkReadingAttachments();
  fields = await registrationFields(site, list, fields);
  const created = await g(base, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
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
if (kind === 'lecturas' && req.method === 'PATCH') fields = await readingUpdates(site, list, fields);
if(req.method==='POST'){const v=await g(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});return send(res,201,{id:v.id,fields:v.fields});}
if(!/^\d+$/.test(id))throw fail(400,'ID inválido');
if(req.method==='PATCH'){if(Object.keys(fields).length)await g(base+'/'+id+'/fields',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});return send(res,200,{ok:true});}
await g(base+'/'+id,{method:'DELETE'});return send(res,200,{ok:true});
});
