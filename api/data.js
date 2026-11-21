const {g}=require('../lib/graph');const {siteId,listId}=require('../lib/consumo-sharepoint');const {route,send,fail}=require('../lib/http');
const keys={edificios:'SP_LIST_EDIFICIOS',locales:'SP_LIST_LOCALES',medidores:'SP_LIST_MEDIDORES',lecturas:'SP_LIST_LECTURAS',accesos:'SP_LIST_ACCESOS'};
const enc=encodeURIComponent;
async function all(url){let result=[];for(let i=0;url&&i<40;i++){const r=await g(url);result.push(...(r.value||[]));url=r['@odata.nextLink'];}if(url)throw fail(413,'Demasiados registros para una consulta');return result;}
const itemsPath = (site, list) => `/sites/${enc(site)}/lists/${enc(list)}/items`;

async function buildingsById(site) {
  const list = await listId(site, keys.edificios);
  const items = await all(`${itemsPath(site, list)}?$expand=fields($select=Title)&$top=200`);
  return new Map(items.map(item => [String(item.id), item.fields?.Title]));
}

function readingFields(fields, buildings) {
  return {
    Edificio: buildings.get(String(fields.Edificio1LookupId)) ?? fields.Edificio ?? fields.Edificio1 ?? '',
    FechaLectura: fields.FechaLectura ?? fields.FechaLectura1,
  };
}

module.exports=route(['GET','POST','PATCH','DELETE'],async(req,res,user)=>{
const kind=String(req.query?.kind||'');if(!Object.hasOwn(keys,kind))throw fail(400,'Módulo desconocido');
const site=await siteId();const list=await listId(site,keys[kind]);const base=itemsPath(site,list);
if (req.method === 'GET') {
  const results = all(`${base}?$expand=fields&$top=200`);
  if (kind === 'lecturas') {
    const [items, buildings] = await Promise.all([results, buildingsById(site)]);
    return send(res, 200, { items: items.map(({ id, fields = {} }) => ({
      id, ...fields, ...readingFields(fields, buildings),
    })) });
  }
  const items = await results;
  const visible = kind === 'accesos' && user.rol !== 'Admin'
    ? items.filter(item => String(item.fields?.Correo || item.fields?.Usuario || '').toLowerCase() === user.usuario)
    : items;
  return send(res, 200, { items: visible.map(({ id, fields }) => ({ id, ...fields })) });
}
if(user.rol!=='Admin')throw fail(403,'Solo los administradores pueden modificar datos');
const id=String(req.query?.id||'');const fields=req.body?.fields;
if(req.method!=='DELETE'&&(!fields||typeof fields!=='object'||Array.isArray(fields)))throw fail(400,'Campos inválidos');
if(fields&& (Object.keys(fields).length>40||JSON.stringify(fields).length>12000||Object.keys(fields).some(k=>! /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)||k==='id')))throw fail(400,'Campos no permitidos');
if(req.method==='POST'){const v=await g(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});return send(res,201,{id:v.id,fields:v.fields});}
if(!/^\d+$/.test(id))throw fail(400,'ID inválido');
if(req.method==='PATCH'){await g(base+'/'+id+'/fields',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});return send(res,200,{ok:true});}
await g(base+'/'+id,{method:'DELETE'});return send(res,200,{ok:true});
});
