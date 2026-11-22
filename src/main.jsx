import React,{useEffect,useMemo,useState} from 'react';import{createRoot}from'react-dom/client';import{Building2,Store,Gauge,Users,ShieldCheck,History,LayoutDashboard,Settings,FileDown,Plus,ArrowLeft,LogOut,Search,Save,Menu,Trash2,Pencil,Eye,Activity,RefreshCw,ClipboardPenLine}from'lucide-react';import * as XLSX from 'xlsx';import{jsPDF}from'jspdf';import autoTable from'jspdf-autotable';import './style.css';
import { ReadingPhotoGallery } from './reading-photos';
import { ReadingRegistration } from './reading-registration';
import { readingMeterId, readingMonth } from '../lib/registro-lecturas.mjs';
const modules={edificios:{title:'Edificios',icon:Building2,fields:['Title','Abreviatura','CuotaAgua','CuotaEnergia','Activo','Logo']},locales:{title:'Locales',icon:Store,fields:['Edificio','Title','Cliente','MedidorEnergia','MedidorAgua','Metros2','DotacionAgua','Observacion']},medidores:{title:'Medidores',icon:Gauge,fields:['Title','Edificio','Local','TipoMedidor','UnidadMedida','NumeroSerie','Activo']},lecturas:{title:'Lecturas',icon:History,fields:['Title','Medidor','FechaLectura','Periodo','TipoMedidor','LecturaInicial','LecturaFinal','Consumo','CuotaAplicada','TotalPagar','Mes','Anio']},accesos:{title:'Accesos a edificios',icon:ShieldCheck,fields:['Title','Correo','Edificio','Activo']}};
function displayValue(field, value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (field === 'Logo' && typeof value === 'string' && value.startsWith('{')) {
    try { return JSON.parse(value).originalImageName || 'Logo disponible'; }
    catch { return 'Logo disponible'; }
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function BuildingLogo({ row, fullSize = false }) {
  const [unavailable, setUnavailable] = useState(false);
  if (!row.LogoUrl) return displayValue('Logo', row.Logo);
  const name = row.Title ? `Logo de ${row.Title}` : 'Logo del edificio';
  return <a className="building-logo" href={unavailable ? row.LogoItemUrl || row.LogoUrl : row.LogoUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${name.toLowerCase()} en SharePoint`}>
    {unavailable ? 'Abrir en SharePoint' : <img className={fullSize ? 'building-logo-detail' : undefined} src={row.LogoUrl} alt={name} loading={fullSize ? 'eager' : 'lazy'} onError={()=>setUnavailable(true)}/>}
  </a>;
}
const editableReadingFields = ['LecturaInicial', 'LecturaFinal'];
const readingTableFields = ['Title', 'Edificio', 'Medidor', 'FechaLectura', 'Periodo', 'TipoMedidor', 'LecturaInicial'];
const names={Title:'Nombre / Código',Abreviatura:'Abreviatura',CuotaAgua:'Cuota de agua',CuotaEnergia:'Cuota de energía',Edificio:'Edificio',Cliente:'Cliente',MedidorEnergia:'Medidor de energía',MedidorAgua:'Medidor de agua',Metros2:'Metros²',DotacionAgua:'Dotación de agua',Observacion:'Observación',TipoMedidor:'Tipo de medidor',UnidadMedida:'Unidad de medida',NumeroSerie:'Número de serie',FechaLectura:'Fecha de lectura',LecturaInicial:'Lectura inicial',LecturaFinal:'Lectura final',CuotaAplicada:'Cuota aplicada',TotalPagar:'Total a pagar',Anio:'Año',Correo:'Correo',Activo:'Activo'};
const isPages = import.meta.env.VITE_DEMO_MODE === 'true' || window.location.hostname.endsWith('.github.io');
const demoUser={usuario:'demo',nombre:'Administrador Demo',rol:'Admin'};
const demoData = {
  edificios: [{id:'1',Title:'Edificio de ejemplo',Abreviatura:'DEMO',CuotaAgua:45,CuotaEnergia:5,Activo:'Sí'}, {id:'2',Title:'Edificio de ejemplo 2'}],
  locales: [{id:'1',Title:'Local 101',Edificio:'Edificio de ejemplo',EdificioLookupLookupId:'1',Cliente:'Cliente de prueba',MedidorAgua:'Sí',MedidorEnergia:'No'}, {id:'2',Title:'Local 201',Edificio:'Edificio de ejemplo 2',EdificioLookupLookupId:'2',MedidorAgua:'No',MedidorEnergia:'Sí'}],
  medidores: [{id:'1',Title:'AG-101',Edificio:'Edificio de ejemplo',Local:'Local 101',LocalLookupLookupId:'1',TipoMedidor:'Agua',UnidadMedida:'m³'}, {id:'2',Title:'EN-201',Edificio:'Edificio de ejemplo 2',Local:'Local 201',LocalLookupLookupId:'2',TipoMedidor:'Energía',UnidadMedida:'kWh'}],
  lecturas: [{id:'1',Title:'AG-101 - Octubre',Edificio:'Edificio de ejemplo',Medidor:'AG-101',MedidorLookupLookupId:'1',FechaLectura:'2026-10-31',TipoMedidor:'Agua',LecturaInicial:100,LecturaFinal:107,Consumo:7,CuotaAplicada:45,TotalPagar:315,Mes:'Octubre',Anio:'2026'}, {id:'2',Title:'EN-201 - Noviembre',Edificio:'Edificio de ejemplo 2',Medidor:'EN-201',MedidorLookupLookupId:'2',FechaLectura:'2026-11-10',TipoMedidor:'Energía',LecturaInicial:80,LecturaFinal:95}],
  accesos: [],
};
const demoPhotos = new Map();
const demoRequest = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  if (url === '/api/me') return { user: sessionStorage.getItem('alpha_demo') ? demoUser : null };
  if (url === '/api/login') throw Error('En GitHub Pages no hay autenticación real. Usá el botón Entrar en modo demostración.');
  if (url === '/api/logout') { sessionStorage.removeItem('alpha_demo'); return { ok: true }; }
  if (url === '/api/users') return { users: [demoUser] };
  const query = new URLSearchParams(url.split('?')[1]);
  const id = query.get('id');
  if (url.startsWith('/api/fotos?')) {
    if (method === 'GET') return { photos: demoPhotos.get(id) || [] };
    const { photo } = JSON.parse(opts.body);
    demoPhotos.set(id, [...(demoPhotos.get(id) || []), { url: `data:image/jpeg;base64,${photo}` }]);
    return { ok: true };
  }
  if (url.startsWith('/api/data?')) {
    const kind = query.get('kind');
    if (kind === 'registro' && method === 'GET') return {
      buildings: demoData.edificios, locals: demoData.locales, meters: demoData.medidores,
      readings: demoData.lecturas.map(row => ({ id: row.id, meterId: readingMeterId(row), month: readingMonth(row), date: row.FechaLectura, initial: row.LecturaInicial, final: row.LecturaFinal })), conflicts: [],
    };
    if (kind === 'registro' && method === 'PATCH') {
      const { fields } = JSON.parse(opts.body);
      const row = demoData.lecturas.find(reading => reading.id === id);
      if (!row) throw Error('No se encontró la lectura.');
      Object.assign(row, fields);
      return { id, fields };
    }
    const items = demoData[kind];
    if (!items) throw Error('Módulo desconocido');
    if (method === 'GET') return { items, photosEnabled: kind === 'lecturas' };
    if (method === 'POST') {
      const { fields, photo } = JSON.parse(opts.body);
      const id = String(Date.now());
      if (kind === 'lecturas') {
        if (!photo) throw Error('Adjuntá una foto del medidor para guardar la lectura.');
        const meter = demoData.medidores.find(row => row.id === fields.MedidorId);
        if (items.some(row => readingMeterId(row) === fields.MedidorId && readingMonth(row) === fields.FechaLectura.slice(0, 7))) {
          throw Object.assign(Error('Ya existe una lectura para el mes.'), { status: 409 });
        }
        items.push({ id, Title: `${meter.Title} - ${fields.FechaLectura}`, Edificio: meter.Edificio, Medidor: meter.Title,
          Local: meter.Local, MedidorLookupLookupId: meter.id, TipoMedidor: meter.TipoMedidor, FechaLectura: fields.FechaLectura,
          LecturaInicial: fields.LecturaInicial, LecturaFinal: fields.LecturaFinal });
        demoPhotos.set(id, [{ url: `data:image/jpeg;base64,${photo}` }]);
      } else items.push({ id, ...fields });
      return { id };
    }
    if (method === 'PATCH') {
      const item = items.find(row => row.id === id);
      if (item) Object.assign(item, JSON.parse(opts.body).fields);
      return { ok: true };
    }
    if (method === 'DELETE') {
      demoData[kind] = items.filter(row => row.id !== id);
      if (kind === 'lecturas') demoPhotos.delete(id);
      return { ok: true };
    }
  }
  throw Error('Función no disponible en demostración');
};
const request=async(url,opts={})=>{if(isPages)return demoRequest(url,opts);const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'eco'},...opts});const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(data.error||`Error ${r.status}`), {status:r.status});return data};
function App(){const[user,setUser]=useState(undefined),[login,setLogin]=useState({usuario:'',password:''}),[page,setPage]=useState('inicio'),[records,setRecords]=useState({}),[listColumns,setListColumns]=useState({}),[users,setUsers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[edit,setEdit]=useState(null),[photosEnabled,setPhotosEnabled]=useState(false),[filters,setFilters]=useState({edificio:'',tipo:'',mes:'',anio:''}),[selected,setSelected]=useState(null),[mobile,setMobile]=useState(false);
const admin=user?.rol==='Admin';const fetchKind=async k=>{setBusy(true);setError('');try{const r=await request('/api/data?kind='+k);setRecords(s=>({...s,[k]:r.items||[]}));setListColumns(s=>({...s,[k]:r.columns||[]}));if(k==='lecturas')setPhotosEnabled(Boolean(r.photosEnabled))}catch(e){setError(e.message)}finally{setBusy(false)}};
useEffect(()=>{request('/api/me').then(r=>setUser(r.user||null)).catch(()=>setUser(null))},[]);
useEffect(()=>{if(user&&modules[page])fetchKind(page);if(user&&page==='usuarios')request('/api/users').then(r=>setUsers(r.users||[])).catch(e=>setError(e.message))},[page,user]);
const go=p=>{setPage(p);setEdit(null);setSelected(null);setSearch('');setError('');setMobile(false)};
const rows=records[page]||[];
const tableFields = page === 'lecturas' ? readingTableFields : page === 'usuarios' ? ['nombre', 'usuario', 'rol', 'activo'] : modules[page]?.fields.slice(0, 6);
const detailColumns = (listColumns[page] || []).filter(column =>
  modules[page]?.fields.includes(column.key) || column.key === 'Edificio' || column.key === 'Local' || /^field_\d+$/.test(column.key) || ['Activo', 'CantidadLocales', 'CuotaCondonadaAgua', 'LimiteAgua'].includes(column.key));
const mappedLabels = new Set(detailColumns.filter(column => !/^field_\d+$/.test(column.key)).map(column => names[column.key] || column.label));
const visibleDetails = detailColumns.filter(column => !/^field_\d+$/.test(column.key) || !mappedLabels.has(column.label));
const buildingNames = page === 'lecturas' ? [...new Set(rows.map(row => row.Edificio).filter(name => typeof name === 'string' && name))].sort((first, second) => first.localeCompare(second, 'es')) : [];
const visible=rows.filter(x=>Object.values(x).some(v=>String(v??'').toLowerCase().includes(search.toLowerCase()))).filter(x=>page!=='lecturas'||(!filters.edificio||String(x.Edificio||'')===filters.edificio)&&(!filters.tipo||String(x.TipoMedidor||'')===filters.tipo)&&(!filters.mes||String(x.Mes||'')===filters.mes)&&(!filters.anio||String(x.Anio||x.Año||'')===filters.anio));
function openEditor(row) {
  setError('');
  setEdit(row);
}
function closeEditor() { if (!busy) openEditor(null); }
async function save() {
  setBusy(true);
  setError('');
  try {
    if (page === 'usuarios') {
      await request('/api/users', { method: 'POST', body: JSON.stringify(edit) });
      const result = await request('/api/users');
      setUsers(result.users || []);
    } else {
      const original = rows.find(row => row.id === edit.id);
      const fields = Object.fromEntries(Object.entries(edit).filter(([key, value]) =>
        !['id', 'LogoUrl', 'LogoItemUrl'].includes(key) && value !== undefined &&
        (page !== 'lecturas' || (editableReadingFields.includes(key) && value !== original?.[key])),
      ));
      await request(`/api/data?kind=${page}${edit.id ? '&id=' + edit.id : ''}`, {
        method: edit.id ? 'PATCH' : 'POST', body: JSON.stringify({ fields }),
      });
      await fetchKind(page);
    }
    setEdit(null);
  } catch (error) {
    setError(error.message);
  } finally {
    setBusy(false);
  }
}
async function remove(x){if(!window.confirm('¿Eliminar este registro?'))return;try{await request('/api/data?kind='+page+'&id='+x.id,{method:'DELETE'});await fetchKind(page)}catch(e){setError(e.message)}}
const exportRows=page==='usuarios'?users:visible;function exportFile(type){const data=exportRows.map(x=>{const v={...x};delete v.PasswordHash;delete v.hash;delete v.LogoUrl;delete v.LogoItemUrl;return v});if(!data.length)return setError('No hay registros para exportar');if(type==='xlsx'){const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Reporte');XLSX.writeFile(wb,`Alpha_${page}_${new Date().toISOString().slice(0,10)}.xlsx`)}else{const doc=new jsPDF({orientation:'landscape'});doc.setFontSize(16);doc.text('Grupo Alpha | '+(modules[page]?.title||page),14,18);const cols=page==='lecturas'?[...readingTableFields,'LecturaFinal','Consumo']:tableFields;autoTable(doc,{head:[cols.map(c=>names[c]||c)],body:data.map(r=>cols.map(c=>displayValue(c,r[c]))),startY:25,styles:{fontSize:7}});doc.save(`Alpha_${page}.pdf`)}};
if(user===undefined)return <div className="loading">Cargando plataforma…</div>;
if(!user)return <main className="login"><div className="login-card"><div className="brand-icon">A</div><h1>Consumo de Servicios</h1><p>Grupo Alpha · Administración de consumos</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{const r=await request('/api/login',{method:'POST',body:JSON.stringify(login)});setUser(r.user)}catch(e){setError(e.message)}finally{setBusy(false)}}}><label>Usuario o correo<input required value={login.usuario} onChange={e=>setLogin({...login,usuario:e.target.value})}/></label><label>Contraseña<input required type="password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/></label>{error&&<p className="error">{error}</p>}<button disabled={busy} className="primary">Ingresar</button>{isPages&&<button type="button" className="secondary" onClick={()=>{sessionStorage.setItem('alpha_demo','1');setUser(demoUser);setError('')}}>Entrar en modo demostración</button>}{isPages&&<small>GitHub Pages: datos de ejemplo. No conecta con SharePoint ni guarda cambios reales.</small>}</form></div></main>;
const menu=[['inicio','Inicio',LayoutDashboard],['registro','Registro de lecturas',ClipboardPenLine],['lecturas','Historial de lecturas',History],['reportes','Reportes',FileDown],['config','Configuraciones',Settings]];
return <div className="shell"><aside className={'sidebar '+(mobile?'show':'')}><div className="logo"><span className="brand-icon">A</span><div><b>GRUPO ALPHA</b><small>Consumo de Servicios</small></div></div><nav>{menu.map(([k,t,I])=><button key={k} className={page===k?'active':''} onClick={()=>go(k)}><I size={19}/>{t}</button>)}</nav><div className="sidebar-foot"><span>{user.nombre||user.usuario}<small>{user.rol}</small></span><button title="Cerrar sesión" onClick={async()=>{await request('/api/logout',{method:'POST'});setUser(null)}}><LogOut size={18}/></button></div></aside><div className="workspace"><header className="topbar"><button className="iconbtn hamburger" aria-label="Menú de navegación" aria-expanded={mobile} onClick={()=>setMobile(!mobile)}><Menu/></button><div className="breadcrumb">Grupo Alpha <span>/</span> {modules[page]?.title||({inicio:'Inicio',registro:'Registro de lecturas',reportes:'Reportes',config:'Configuraciones',usuarios:'Usuarios'}[page]||page)}</div><div className="avatar">{(user.nombre||user.usuario).slice(0,2).toUpperCase()}</div></header><main className="content">{error&&<div className="error banner">{error}<button onClick={()=>setError('')}>×</button></div>}
{page==='inicio'&&<><div className="heading"><div><span className="eyebrow">PANEL GENERAL</span><h1>Consumo de Servicios</h1><p>Gestión centralizada de edificios, medidores y lecturas.</p></div><button className="primary" onClick={()=>go('lecturas')}><History size={17}/> Ver lecturas</button></div><div className="stats">{[['Edificios',Building2,'edificios'],['Locales',Store,'locales'],['Medidores',Gauge,'medidores'],['Lecturas',Activity,'lecturas']].map(([t,I,k])=><button className="stat" key={k} onClick={()=>go(k)}><I size={23}/><span>{t}</span><strong>{records[k]?.length??'—'}</strong><small>Ver registros →</small></button>)}</div><div className="panel"><h2>Accesos rápidos</h2><div className="quick">{[['Historial de lecturas','lecturas',History],['Configuraciones','config',Settings],['Exportar reportes','reportes',FileDown]].map(([t,k,I])=><button onClick={()=>go(k)} key={k}><I size={22}/><b>{t}</b><span>→</span></button>)}</div></div></>}
{page==='registro'&&<ReadingRegistration request={request} onHistory={()=>go('lecturas')}/>}
{page==='config'&&<><div className="heading"><div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Configuraciones</h1><p>Catálogos, usuarios y permisos de acceso.</p></div></div><div className="config-grid">{[...Object.entries(modules).filter(([k])=>k!=='lecturas'),['usuarios',{title:'Administradores y usuarios',icon:Users}]].map(([k,m])=><button key={k} className="config-card" onClick={()=>go(k)}><m.icon size={25}/><strong>{m.title}</strong><span>Administrar →</span></button>)}</div></>}
{page==='reportes'&&<><div className="heading"><div><span className="eyebrow">EXPORTACIÓN</span><h1>Reportes</h1><p>Selecciona el origen y descarga los registros.</p></div></div><div className="panel"><div className="toolbar"><select value={selected||'lecturas'} onChange={e=>setSelected(e.target.value)}>{Object.entries(modules).map(([k,m])=><option value={k} key={k}>{m.title}</option>)}</select><button className="secondary" onClick={()=>go(selected||'lecturas')}>Abrir y filtrar</button></div><p>Las exportaciones Excel y PDF se generan desde cada módulo. La plantilla exacta del reporte se integrará al incorporar el modelo original.</p></div></>}
{(modules[page]||page==='usuarios')&&<><div className="heading"><div><button className="back" onClick={()=>go(page==='lecturas'?'inicio':'config')}><ArrowLeft size={16}/> Volver</button><h1>{page==='lecturas'?'Historial de lecturas':`Administrar ${modules[page]?.title.toLowerCase()||'usuarios'}`}</h1><p>Consulta y administración de registros de SharePoint.</p></div>{page==='lecturas'&&<button className="primary" onClick={()=>go('registro')}><Plus size={17}/> Nueva lectura</button>}{admin&&page!=='lecturas'&&<button className="primary" onClick={()=>openEditor(page==='usuarios'?{usuario:'',nombre:'',rol:'Usuario',activo:true,password:''}:Object.fromEntries(modules[page].fields.map(f=>[f,''])))}><Plus size={17}/> Nuevo registro</button>}</div><div className="panel"><div className="toolbar"><div className="search"><Search size={18}/><input placeholder="Buscar registros…" value={search} onChange={e=>setSearch(e.target.value)}/></div>{page==='lecturas'&&<><select className="filter" aria-label="Filtrar por edificio" value={filters.edificio} onChange={e=>setFilters({...filters,edificio:e.target.value})}><option value="">Todos los edificios</option>{buildingNames.map(name=><option key={name} value={name}>{name}</option>)}</select>{[['tipo','Servicio'],['mes','Mes'],['anio','Año']].map(([k,t])=><input key={k} className="filter" placeholder={t} value={filters[k]} onChange={e=>setFilters({...filters,[k]:e.target.value})}/>)}</>}<button className="secondary" onClick={()=>page==='usuarios'?request('/api/users').then(r=>setUsers(r.users||[])):fetchKind(page)}><RefreshCw size={16}/></button><button className="secondary" onClick={()=>exportFile('xlsx')}><FileDown size={16}/> Excel</button><button className="secondary" onClick={()=>exportFile('pdf')}><FileDown size={16}/> PDF</button></div><div className="table-wrap"><table><thead><tr>{tableFields.map(f=><th key={f}>{names[f]||f}</th>)}<th>Acciones</th></tr></thead><tbody>{(page==='usuarios'?users:visible).map((x,i)=><tr key={x.id||x.usuario||i}>{tableFields.map(f=><td key={f}>{f==='Logo'?<BuildingLogo key={x.LogoUrl} row={x}/>:displayValue(f,x[f])}</td>)}<td><div className="actions"><button title="Ver" onClick={()=>setSelected(x)}><Eye size={17}/></button>{admin&&<button title="Editar" onClick={()=>openEditor({...x})}><Pencil size={17}/></button>}{admin&&page!=='usuarios'&&<button title="Eliminar" onClick={()=>remove(x)}><Trash2 size={17}/></button>}</div></td></tr>)}{!(page==='usuarios'?users:visible).length&&<tr><td colSpan={tableFields.length + 1} className="empty">{busy?'Cargando…':'No hay registros para mostrar. Comprueba la conexión y las listas configuradas.'}</td></tr>}</tbody></table></div><div className="table-footer">{(page==='usuarios'?users:visible).length} registros</div></div></>}
</main></div>{selected&&typeof selected==='object'&&<div className="overlay" onClick={()=>setSelected(null)}><section className="modal" onClick={e=>e.stopPropagation()}><h2>Detalle del registro</h2><div className="details">{(visibleDetails.length ? visibleDetails : Object.keys(selected).map(key=>({key,label:names[key]||key}))).map(({key,label})=><div key={key}><b>{names[key]||label}</b>{key==='Logo'?<BuildingLogo key={selected.LogoUrl} row={selected} fullSize/>:<span>{displayValue(key,selected[key])}</span>}</div>)}</div>{page==='lecturas'&&<ReadingPhotoGallery key={selected.id} id={selected.id} enabled={photosEnabled} request={request}/>}<button className="secondary" onClick={()=>setSelected(null)}>Cerrar</button></section></div>}{edit&&<div className="overlay" onClick={closeEditor}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>{edit.id?'Editar':'Crear'} {modules[page]?.title||'usuario'}</h2><button onClick={closeEditor} disabled={busy}>×</button></div>{error&&<p className="error" role="alert">{error}</p>}<div className="form-grid">{(page==='usuarios'?['usuario','nombre','rol','activo',...(!edit.id?['password']:[])]:page==='lecturas'?editableReadingFields:modules[page].fields).map(f=><label key={f}>{names[f]||f}{f==='rol'?<select value={edit[f]||'Usuario'} onChange={e=>setEdit({...edit,[f]:e.target.value})}><option>Usuario</option><option>Admin</option></select>:f==='activo'||f==='Activo'?<select value={String(edit[f]??'Sí')} onChange={e=>setEdit({...edit,[f]:e.target.value})}><option>Sí</option><option>No</option></select>:<input type={f==='password'?'password':f==='FechaLectura'?'date':'text'} value={f==='FechaLectura'?String(edit[f]??'').slice(0,10):String(edit[f]??'')} onChange={e=>setEdit({...edit,[f]:e.target.value})}/>}</label>)}</div><div className="modal-actions"><button className="secondary" onClick={closeEditor} disabled={busy}>Cancelar</button><button className="primary" disabled={busy} onClick={save}><Save size={16}/> Guardar</button></div></section></div>}</div>}
createRoot(document.getElementById('root')).render(<App/>);
