const {g,need}=require('../lib/graph');const {route,send,fail}=require('../lib/http');
const keys={edificios:'SP_LIST_EDIFICIOS',locales:'SP_LIST_LOCALES',medidores:'SP_LIST_MEDIDORES',lecturas:'SP_LIST_LECTURAS',accesos:'SP_LIST_ACCESOS'};
const enc=encodeURIComponent;
function ref(kind){if(!Object.hasOwn(keys,kind))throw fail(400,'Módulo desconocido');return need(keys[kind]);}
async function site(){return need('SP_SITE_ID')}
async function all(url){let result=[];for(let i=0;url&&i<40;i++){const r=await g(url);result.push(...(r.value||[]));url=r['@odata.nextLink'];}if(url)throw fail(413,'Demasiados registros para una consulta');return result;}
module.exports=route(['GET','POST','PATCH','DELETE'],async(req,res,user)=>{
const kind=String(req.query?.kind||'');const list=ref(kind);const base=`/sites/${enc(await site())}/lists/${enc(list)}/items`;
if(req.method==='GET'){const items=await all(base+'?$expand=fields&$top=200');if(kind==='accesos'&&user.rol!=='Admin'){return send(res,200,{items:items.filter(x=>String(x.fields?.Correo||x.fields?.Usuario||'').toLowerCase()===user.usuario).map(x=>({id:x.id,...x.fields}))});}return send(res,200,{items:items.map(x=>({id:x.id,...x.fields}))});}
if(user.rol!=='Admin')throw fail(403,'Solo los administradores pueden modificar datos');
const id=String(req.query?.id||'');const fields=req.body?.fields;
if(req.method!=='DELETE'&&(!fields||typeof fields!=='object'||Array.isArray(fields)))throw fail(400,'Campos inválidos');
if(fields&& (Object.keys(fields).length>40||JSON.stringify(fields).length>12000||Object.keys(fields).some(k=>! /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)||k==='id')))throw fail(400,'Campos no permitidos');
if(req.method==='POST'){const v=await g(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});return send(res,201,{id:v.id,fields:v.fields});}
if(!/^\d+$/.test(id))throw fail(400,'ID inválido');
if(req.method==='PATCH'){await g(base+'/'+id+'/fields',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});return send(res,200,{ok:true});}
await g(base+'/'+id,{method:'DELETE'});return send(res,200,{ok:true});
});