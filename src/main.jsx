import React,{useEffect,useState} from 'react';import{createRoot}from'react-dom/client';import{Building2,Store,Gauge,Users,ShieldCheck,History,LayoutDashboard,Settings,FileDown,Plus,ArrowLeft,LogOut,Search,Save,Menu,Trash2,Pencil,Eye,RefreshCw,ClipboardPenLine}from'lucide-react';import './style.css';
import { ReadingPhotoGallery } from './reading-photos';
import { ReadingRegistration } from './reading-registration';
import { ReadingHistoryFilters, historyLocationId } from './reading-history';
import { ReadingBuildingCards, sortByTitle } from './reading-cards';
import './portal.css';
import { AlphaLogo } from './brand';
import { PortalLogin } from './portal-login';
import { PortalHome } from './portal-home';
import { BuildingAccess } from './building-access';
import { ReadingReportDialog } from './reading-report-dialog';
import { canReport, roleOptions, CONDO_ADMIN, SUPER_ADMIN } from '../lib/roles.mjs';
import { billedReadingFields, historyLocations, localBuildingId, localHasService, meterHasService, meterLocalId, previousReadingValue, readingCharges, readingMeterId, readingMonth, readingNumber, readingSummary, registrationDirectory } from '../lib/registro-lecturas.mjs';
const modules={edificios:{title:'Edificios',icon:Building2,fields:['Title','Abreviatura','CuotaAgua','CuotaEnergia','CuotaCondonadaAgua','Activo','Logo']},locales:{title:'Locales',icon:Store,fields:['Edificio','Title','Cliente','MedidorEnergia','MedidorAgua','Metros2','DotacionAgua','Observacion']},medidores:{title:'Medidores',icon:Gauge,fields:['Title','Edificio','Local','TipoMedidor','UnidadMedida','NumeroSerie','Activo']},lecturas:{title:'Lecturas',icon:History,fields:['Title','Medidor','FechaLectura','Periodo','TipoMedidor','LecturaInicial','LecturaFinal','Consumo','CuotaAplicada','TotalPagar','Mes','Anio']},accesos:{title:'Accesos a edificios',icon:ShieldCheck,fields:['Title','Correo','Edificio','Activo']}};
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
const groupedCatalogs = new Set(['locales', 'medidores']);
const editableReadingFields = ['LecturaFinal'];
const readingTableFields = ['FechaLectura', 'Medidor', 'TipoMedidor', 'LecturaInicial', 'LecturaFinal', 'Consumo', 'TotalPagar'];
const names={Title:'Nombre / Código',Abreviatura:'Abreviatura',CuotaAgua:'Cuota de agua',CuotaEnergia:'Cuota de energía',CuotaCondonadaAgua:'Consumo de agua condonado',Edificio:'Edificio',Cliente:'Cliente',MedidorEnergia:'Medidor de energía',MedidorAgua:'Medidor de agua',Metros2:'Metros²',DotacionAgua:'Dotación de agua',Observacion:'Observación',TipoMedidor:'Tipo de medidor',UnidadMedida:'Unidad de medida',NumeroSerie:'Número de serie',FechaLectura:'Fecha de lectura',LecturaInicial:'Lectura inicial',LecturaFinal:'Lectura final',CuotaAplicada:'Cuota aplicada',TotalPagar:'Total a pagar',Anio:'Año',Correo:'Correo',Activo:'Activo'};
const isPages = import.meta.env.VITE_DEMO_MODE === 'true' || window.location.hostname.endsWith('.github.io');
const demoUser={usuario:'demo',nombre:'Administrador Demo',rol:'Admin'};
const demoData = {
  edificios: [{id:'1',Title:'Edificio de ejemplo',Abreviatura:'DEMO',CuotaAgua:45,CuotaEnergia:5,CuotaCondonadaAgua:8,Activo:'Sí'}, {id:'2',Title:'Edificio de ejemplo 2',CuotaEnergia:6.47}],
  locales: [{id:'1',Title:'Local 101',Edificio:'Edificio de ejemplo',EdificioLookupLookupId:'1',Cliente:'Cliente de prueba',MedidorAgua:'Sí',MedidorEnergia:'No'}, {id:'2',Title:'Local 201',Edificio:'Edificio de ejemplo 2',EdificioLookupLookupId:'2',MedidorAgua:'No',MedidorEnergia:'Sí'}],
  medidores: [{id:'1',Title:'AG-101',Edificio:'Edificio de ejemplo',Local:'Local 101',LocalLookupLookupId:'1',TipoMedidor:'Agua',UnidadMedida:'m³'}, {id:'2',Title:'EN-201',Edificio:'Edificio de ejemplo 2',Local:'Local 201',LocalLookupLookupId:'2',TipoMedidor:'Energía',UnidadMedida:'kWh'}],
  lecturas: [{id:'1',Title:'AG-101 - Octubre',Edificio:'Edificio de ejemplo',Medidor:'AG-101',MedidorLookupLookupId:'1',FechaLectura:'2026-10-31',TipoMedidor:'Agua',LecturaInicial:100,LecturaFinal:107,Consumo:7,CuotaAplicada:45,TotalPagar:315,Mes:'Octubre',Anio:'2026'}, {id:'2',Title:'EN-201 - Noviembre',Edificio:'Edificio de ejemplo 2',Medidor:'EN-201',MedidorLookupLookupId:'2',FechaLectura:'2026-11-10',TipoMedidor:'Energía',LecturaInicial:80,LecturaFinal:95}],
  accesos: [],
};
const demoPhotos = new Map();
const demoAccounts = [demoUser, { usuario:'condominio.demo',nombre:'Condominio Demo',rol:CONDO_ADMIN,activo:true }, { usuario:'operador.demo',nombre:'Operador Demo',rol:'Usuario',activo:true }];
const demoAccess = new Map([['operador.demo',['1']],['condominio.demo',['1']]]);
function demoBill(meter, building, month, final, existing) {
  const readings = demoData.lecturas.filter(row => readingMeterId(row) === meter.id).map(row => readingSummary(row, meter.id));
  const saved = existing && readingSummary(existing, meter.id);
  const initial = previousReadingValue(readings, month, saved);
  const bill = readingCharges(building, meter.TipoMedidor, initial, final);
  if (bill.total === null) throw Error('Revisá la lectura anterior, la lectura final y la cuota.');
  return billedReadingFields(bill);
}
const demoRequest = async (url, opts = {}) => {
  const method = opts.method || 'GET';
  if (url === '/api/me') return { user: sessionStorage.getItem('alpha_demo') ? demoUser : null };
  if (url === '/api/login') throw Error('En GitHub Pages no hay autenticación real. Usá el botón Entrar en modo demostración.');
  if (url === '/api/logout') { sessionStorage.removeItem('alpha_demo'); return { ok: true }; }
  if (url === '/api/users') return { users: demoAccounts };
  if (url.startsWith('/api/building-access')) {
    const usuario = new URLSearchParams(url.split('?')[1]).get('usuario');
    if (method === 'POST') {
      const { usuario: account, buildings } = JSON.parse(opts.body);
      demoAccess.set(account, [...buildings].sort());
      return { buildings: demoAccess.get(account), revision: demoAccess.get(account).join(',') };
    }
    const buildings = demoAccess.get(usuario) || [];
    return { buildings, revision: buildings.join(',') };
  }
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
    const building = query.get('edificio');
    const inBuilding = row => !building || localBuildingId(row) === building;
    if (kind === 'edificios' && method === 'GET' && query.get('view') === 'selector') {
      return { items: demoData.edificios.map(({ id, Title }) => ({ id, Title })) };
    }
    if (kind === 'edificios' && method === 'GET' && query.get('view') === 'logos') return { logos: {} };
    if (kind === 'edificios' && method === 'GET' && query.get('view') === 'lecturas-del-mes') {
      const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date()).slice(0, 7);
      const directory = registrationDirectory(demoData.locales, demoData.medidores);
      const counts = {};
      for (const row of demoData.lecturas) {
        if (readingMonth(row) !== month || readingNumber(row.LecturaFinal) === null) continue;
        const meter = directory.meterForReading(row);
        if (!meter) continue;
        const building = localBuildingId(meter);
        counts[building] = (counts[building] || 0) + 1;
      }
      return { month, counts };
    }
    if (kind === 'registro' && method === 'GET') {
      const service = query.get('servicio');
      const locals = demoData.locales.filter(row => inBuilding(row) && (!service || localHasService(row, service)));
      if (query.get('view') === 'locales') return { locals };
      const meters = [...registrationDirectory(demoData.locales, demoData.medidores).scopedMeters.values()]
        .filter(row => inBuilding(row) && (!service || meterHasService(row, service)));
      const ids = new Set(meters.map(meter => meter.id));
      return {
        buildings: demoData.edificios.filter(row => !building || row.id === building),
        locals,
        meters,
        readings: demoData.lecturas.filter(row => ids.has(readingMeterId(row))).map(row => readingSummary(row, readingMeterId(row))),
      };
    }
    if (kind === 'registro' && method === 'PATCH') {
      const { fields, EdificioId } = JSON.parse(opts.body);
      const row = demoData.lecturas.find(reading => reading.id === id);
      if (!row) throw Error('No se encontró la lectura.');
      if (!Object.hasOwn(fields,'LecturaFinal')) return {id,fields:{}};
      const billed = demoBill(demoData.medidores.find(meter=>meter.id===readingMeterId(row)),demoData.edificios.find(building=>building.id===EdificioId),readingMonth(row),fields.LecturaFinal,row);
      Object.assign(row, billed);
      return { id, fields:billed };
    }
    const items = demoData[kind];
    if (!items) throw Error('Módulo desconocido');
    if (method === 'GET') {
      if (kind === 'lecturas') return {
        items: historyLocations(items, demoData.edificios, registrationDirectory(demoData.locales, demoData.medidores))
          .filter(row => (!building || row.EdificioHistorialId === building) &&
            (query.get('view') !== 'reporte' || (row.MedidorHistorialId === query.get('medidor') && meterHasService(row, query.get('servicio'))))),
        photosEnabled: true,
      };
      if (kind === 'medidores') {
        const mapped = [...registrationDirectory(demoData.locales, items).scopedMeters.values()];
        return { items: mapped.filter(inBuilding) };
      }
      return { items: groupedCatalogs.has(kind) ? items.filter(inBuilding) : items };
    }
    if (method === 'POST') {
      const { fields, photo } = JSON.parse(opts.body);
      const id = String(Date.now());
      if (kind === 'lecturas') {
        if (!photo) throw Error('Adjuntá una foto del medidor para guardar la lectura.');
        const meter = demoData.medidores.find(row => row.id === fields.MedidorId);
        if (items.some(row => readingMeterId(row) === fields.MedidorId && readingMonth(row) === fields.FechaLectura.slice(0, 7))) {
          throw Object.assign(Error('Ya existe una lectura para el mes.'), { status: 409 });
        }
        const billed = demoBill(meter,demoData.edificios.find(building=>building.id===fields.EdificioId),fields.FechaLectura.slice(0,7),fields.LecturaFinal);
        items.push({ id, Title: `${meter.Title} - ${fields.FechaLectura}`, Edificio: meter.Edificio, Medidor: meter.Title,
          Local: meter.Local, MedidorLookupLookupId: meter.id, TipoMedidor: meter.TipoMedidor, FechaLectura: fields.FechaLectura,
          ...billed });
        demoPhotos.set(id, [{ url: `data:image/jpeg;base64,${photo}` }]);
        return {id,fields:billed};
      } else {
        const row = { id, ...fields };
        if (building && groupedCatalogs.has(kind)) {
          row.EdificioLookupLookupId = building;
          row.Edificio = demoData.edificios.find(item => item.id === building)?.Title;
          if (Object.hasOwn(fields, 'Local')) {
            row.LocalLookupLookupId = fields.Local;
            row.Local = demoData.locales.find(item => item.id === fields.Local)?.Title;
          }
        }
        items.push(row);
      }
      return { id };
    }
    if (method === 'PATCH') {
      const item = items.find(row => row.id === id);
      const {fields}=JSON.parse(opts.body);
      if (item && kind==='lecturas' && Object.hasOwn(fields,'LecturaFinal')) {
        const meter=demoData.medidores.find(row=>row.id===readingMeterId(item));
        const building=demoData.edificios.find(row=>row.Title===item.Edificio);
        Object.assign(item,demoBill(meter,building,readingMonth(item),fields.LecturaFinal,item));
      } else if (item) {
        Object.assign(item,fields);
        if (kind === 'medidores' && Object.hasOwn(fields, 'Local')) {
          item.LocalLookupLookupId = fields.Local;
          item.Local = demoData.locales.find(local => local.id === fields.Local)?.Title;
        }
      }
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
function App(){const[user,setUser]=useState(undefined),[login,setLogin]=useState({usuario:'',password:''}),[page,setPage]=useState('inicio'),[records,setRecords]=useState({}),[listColumns,setListColumns]=useState({}),[users,setUsers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[edit,setEdit]=useState(null),[photosEnabled,setPhotosEnabled]=useState(false),[historyFilters,setHistoryFilters]=useState({building:'',local:'',month:'',service:''}),[selected,setSelected]=useState(null),[mobile,setMobile]=useState(false);
const [catalogBuilding, setCatalogBuilding] = useState('');
const [buildings, setBuildings] = useState(null);
const [buildingsError, setBuildingsError] = useState('');
const [readingCounts, setReadingCounts] = useState(null);
const [buildingLogos, setBuildingLogos] = useState(null);
const [countsError, setCountsError] = useState(false);
const [countsAttempt, setCountsAttempt] = useState(0);
const [startBuilding, setStartBuilding] = useState('');
const reloadCounts = () => {
  setCountsError(false);
  setCountsAttempt(attempt => attempt + 1);
};
const [buildingAttempt, setBuildingAttempt] = useState(0);
const [editorLocals, setEditorLocals] = useState(null);
const [reportOpen, setReportOpen] = useState(false);
const admin = user?.rol === SUPER_ADMIN;
const reportingAllowed = canReport(user?.rol);
const history = page === 'lecturas';
const grouped = groupedCatalogs.has(page);
const buildingId = history ? historyFilters.building : grouped ? catalogBuilding : '';
const buildingScoped = history || grouped;
const selectedBuilding = buildings?.find(item => item.id === buildingId);
const dataKey = buildingScoped ? `${page}:${buildingId}` : page;
const reloadBuildings = () => {
  setBuildingsError('');
  setBuildingAttempt(attempt => attempt + 1);
};
const catalogUrl = (kind, building = '', id = '') => {
  const query = new URLSearchParams({ kind });
  if (building) query.set('edificio', building);
  if (id) query.set('id', id);
  return `/api/data?${query}`;
};
const fetchKind = async (kind, building = buildingId, signal) => {
  const key = building ? `${kind}:${building}` : kind;
  setBusy(true);
  setError('');
  try {
    const result = await request(catalogUrl(kind, building), { signal });
    if (signal?.aborted) return;
    setRecords(current => ({ ...current, [key]: result.items || [] }));
    setListColumns(current => ({ ...current, [key]: result.columns || [] }));
    if (kind === 'lecturas') setPhotosEnabled(Boolean(result.photosEnabled));
  } catch (error) {
    if (!signal?.aborted) setError(error.message);
  } finally {
    if (!signal?.aborted) setBusy(false);
  }
};
useEffect(() => {
  request('/api/me').then(result => setUser(result.user || null)).catch(() => setUser(null));
}, []);
useEffect(() => {
  if (!user) return;
  const controller = new AbortController();
  request('/api/data?kind=edificios&view=selector', { signal: controller.signal }).then(result => {
    if (!controller.signal.aborted) setBuildings([...result.items].sort(sortByTitle));
  }, error => {
    if (!controller.signal.aborted) setBuildingsError(error.message);
  });
  return () => controller.abort();
}, [user, buildingAttempt]);
useEffect(() => {
  if (!user) return;
  const controller = new AbortController();
  request('/api/data?kind=edificios&view=lecturas-del-mes', { signal: controller.signal }).then(result => {
    if (!controller.signal.aborted) setReadingCounts(result.counts);
  }, () => {
    if (!controller.signal.aborted) setCountsError(true);
  });
  return () => controller.abort();
}, [user, countsAttempt]);
useEffect(() => {
  if (!user || page !== 'inicio' || buildingLogos) return;
  const controller = new AbortController();
  request('/api/data?kind=edificios&view=logos', { signal: controller.signal }).then(result => {
    if (!controller.signal.aborted) setBuildingLogos(result.logos || {});
  }, () => {
    if (!controller.signal.aborted) setBuildingLogos({});
  });
  return () => controller.abort();
}, [user, page, buildingLogos]);
useEffect(() => {
  if (!user) return;
  const controller = new AbortController();
  if (modules[page] && page !== 'accesos' && (!buildingScoped || selectedBuilding)) fetchKind(page, buildingId, controller.signal);
  if (page === 'usuarios') request('/api/users', { signal: controller.signal })
    .then(result => { if (!controller.signal.aborted) setUsers(result.users || []); })
    .catch(error => { if (!controller.signal.aborted) setError(error.message); });
  return () => controller.abort();
}, [page, user, buildingId, Boolean(selectedBuilding)]);
const editingMeter = page === 'medidores' && Boolean(edit) && Boolean(buildingId);
useEffect(() => {
  if (!editingMeter) return;
  const controller = new AbortController();
  setEditorLocals(null);
  request(catalogUrl('locales', buildingId), { signal: controller.signal }).then(result => {
    if (!controller.signal.aborted) setEditorLocals([...result.items].sort(sortByTitle));
  }, error => {
    if (!controller.signal.aborted) setError(error.message);
  });
  return () => controller.abort();
}, [editingMeter, buildingId]);
const go = (next, entryBuilding = '') => {
  if (next === 'registro') setStartBuilding(entryBuilding);
  if (next === 'inicio' && page !== 'inicio') reloadCounts();
  setReportOpen(false);
  setPage(next);
  if (next !== page) {
    setBusy(false);
    setCatalogBuilding('');
  }
  setEdit(null);
  setSelected(null);
  setSearch('');
  setError('');
  setMobile(false);
};
function selectBuilding(id) {
  setSearch('');
  setBusy(Boolean(id));
  setError('');
  if (history) setHistoryFilters(current => ({ ...current, building: id, local: '' }));
  else setCatalogBuilding(id);
}
const rows = records[dataKey] || [];
const tableFields = page === 'lecturas' ? readingTableFields : page === 'usuarios' ? ['nombre', 'usuario', 'rol', 'activo'] : page === 'edificios' ? modules.edificios.fields : modules[page]?.fields.slice(0, 6);
const detailColumns = (listColumns[dataKey] || []).filter(column =>
  modules[page]?.fields.includes(column.key) || column.key === 'Edificio' || column.key === 'Local' || /^field_\d+$/.test(column.key) || ['Activo', 'CantidadLocales', 'CuotaCondonadaAgua', 'LimiteAgua'].includes(column.key));
const mappedLabels = new Set(detailColumns.filter(column => !/^field_\d+$/.test(column.key)).map(column => names[column.key] || column.label));
const visibleDetails = detailColumns.filter(column => !/^field_\d+$/.test(column.key) || !mappedLabels.has(column.label));
const historySelected = historyFilters.building && historyFilters.local && rows.some(row =>
  historyLocationId(row.EdificioHistorialId) === historyFilters.building && historyLocationId(row.LocalHistorialId) === historyFilters.local);
const reportRows = history && historySelected ? rows.filter(row => row.EdificioHistorialId === buildingId &&
  historyLocationId(row.LocalHistorialId) === historyFilters.local &&
  (!historyFilters.service || meterHasService(row, historyFilters.service)) && row.MedidorHistorialId && readingMonth(row) &&
  (meterHasService(row, 'agua') || meterHasService(row, 'energia'))) : [];
const visible = history
  ? rows.filter(row => historySelected && historyLocationId(row.EdificioHistorialId) === historyFilters.building &&
    historyLocationId(row.LocalHistorialId) === historyFilters.local &&
    (!historyFilters.month || readingMonth(row) === historyFilters.month) &&
    (!historyFilters.service || meterHasService(row, historyFilters.service)))
    .sort((first, second) => String(second.FechaLectura || '').localeCompare(String(first.FechaLectura || '')))
  : rows.filter(row => Object.values(row).some(value => String(value ?? '').toLowerCase().includes(search.toLowerCase())));
function openEditor(row) {
  setError('');
  setEdit(row);
  if (page === 'medidores' && row) {
    setEditorLocals(null);
    setEdit({ ...row, Local: meterLocalId(row) });
  }
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
        (page !== 'lecturas' || (editableReadingFields.includes(key) && value !== original?.[key])) &&
        (!grouped || (key !== 'Edificio' && modules[page].fields.includes(key) &&
          (original ? value !== (key === 'Local' ? meterLocalId(original) : original[key]) : value !== ''))) &&
        (page !== 'edificios' || (modules.edificios.fields.includes(key) && (original ? value !== original[key] : value !== ''))),
      ));
      await request(catalogUrl(page, grouped ? buildingId : '', edit.id), {
        method: edit.id ? 'PATCH' : 'POST', body: JSON.stringify({ fields }),
      });
      if (page === 'edificios') reloadBuildings();
      if (page === 'lecturas') reloadCounts();
      await fetchKind(page);
    }
    setEdit(null);
  } catch (error) {
    setError(error.message);
  } finally {
    setBusy(false);
  }
}
async function remove(x){if(!window.confirm('¿Eliminar este registro?'))return;try{await request('/api/data?kind='+page+'&id='+x.id,{method:'DELETE'});if(page==='edificios') reloadBuildings();if(page==='lecturas') reloadCounts();await fetchKind(page)}catch(e){setError(e.message)}}
const exportRows = page === 'usuarios' ? users : visible;
async function exportFile(type) {
  if (!reportingAllowed) return;
  const data = exportRows.map(({ PasswordHash, hash, LogoUrl, LogoItemUrl, EdificioHistorialId, LocalHistorialId, MedidorHistorialId, ...row }) => row);
  if (!data.length) return setError('No hay registros para exportar');
  try {
    if (type === 'xlsx') {
      const { utils, writeFile } = await import('xlsx');
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, utils.json_to_sheet(data), 'Reporte');
      writeFile(workbook, `Alpha_${page}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text('Grupo Alpha | ' + (modules[page]?.title || page), 14, 18);
      const columns = history ? ['Edificio', 'Local', ...readingTableFields] : tableFields;
      autoTable(doc, {
        head: [columns.map(column => names[column] || column)],
        body: data.map(row => columns.map(column => displayValue(column, row[column]))),
        startY: 25,
        styles: { fontSize: 7 },
      });
      doc.save(`Alpha_${page}.pdf`);
    }
  } catch (error) {
    setError(error.message || 'No se pudo exportar el archivo.');
  }
}
if (user === undefined) return <div className="loading">Cargando plataforma…</div>;
if (!user) return <PortalLogin login={login} setLogin={setLogin} busy={busy} error={error}
  onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/login', { method: 'POST', body: JSON.stringify(login) });
      setUser(result.user);
      setLogin({ usuario: '', password: '' });
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }}
  onDemo={isPages ? () => { sessionStorage.setItem('alpha_demo', '1'); setUser(demoUser); setError(''); } : undefined}/>;
const menu=[['inicio','Inicio',LayoutDashboard],['registro','Registro de lecturas',ClipboardPenLine],['lecturas','Historial de lecturas',History],['config','Configuraciones',Settings]];
return <div className="shell"><aside className={'sidebar '+(mobile?'show':'')}><div className="logo workspace-logo"><AlphaLogo/><small>Consumo de Servicios</small></div><nav>{menu.filter(([k])=>(k!=='config'||admin)).map(([k,t,I])=><button key={k} className={page===k?'active':''} onClick={()=>go(k)}><I size={19}/>{t}</button>)}</nav><div className="sidebar-foot"><span>{user.nombre||user.usuario}<small>{roleOptions.find(([value])=>value===user.rol)?.[1]}</small></span><button title="Cerrar sesión" onClick={async()=>{await request('/api/logout',{method:'POST'});setUser(null);setRecords({});setBuildings(null);setBuildingsError('');setReadingCounts(null);setBuildingLogos(null);setCountsError(false);setHistoryFilters({building:'',local:'',month:'',service:''});go('inicio')}}><LogOut size={18}/></button></div></aside><div className="workspace"><header className="topbar"><button className="iconbtn hamburger" aria-label="Menú de navegación" aria-expanded={mobile} onClick={()=>setMobile(!mobile)}><Menu/></button><div className="breadcrumb">Grupo Alpha <span>/</span> {modules[page]?.title||({inicio:'Inicio',registro:'Registro de lecturas',config:'Configuraciones',usuarios:'Usuarios'}[page]||page)}</div><div className="avatar">{(user.nombre||user.usuario).slice(0,2).toUpperCase()}</div></header><main className="content">{error&&<div className="error banner">{error}<button onClick={()=>setError('')}>×</button></div>}
{page==='inicio'&&<PortalHome name={user.nombre || user.usuario} buildings={buildings} buildingsError={buildingsError}
  reloadBuildings={reloadBuildings} counts={readingCounts} countsError={countsError} reloadCounts={reloadCounts} logos={buildingLogos || {}}
  onSelect={id=>go('registro',id)} onHistory={()=>go('lecturas')}/>}
{page==='registro'&&<ReadingRegistration key={startBuilding} initialBuilding={startBuilding} role={user.rol} request={request}
  buildings={buildings} buildingsError={buildingsError} reloadBuildings={reloadBuildings} readingCounts={readingCounts} countsError={countsError}
  onReadingChange={reloadCounts} onHistory={()=>go('lecturas')}/>}
{page==='config'&&admin&&<><div className="heading"><div><span className="eyebrow">ADMINISTRACIÓN</span><h1>Configuraciones</h1><p>Catálogos, usuarios y permisos de acceso.</p></div></div><div className="config-grid">{[...Object.entries(modules).filter(([k])=>k!=='lecturas'&&(k!=='accesos'||admin)),['usuarios',{title:'Administradores y usuarios',icon:Users}]].map(([k,m])=><button key={k} className="config-card" onClick={()=>go(k)}><m.icon size={25}/><strong>{m.title}</strong><span>Administrar →</span></button>)}</div></>}
{page==='accesos'&&admin&&<>
  <div className="heading"><div>
    <button className="back" onClick={()=>go('config')}><ArrowLeft size={16}/> Volver</button>
    <h1>Accesos a edificios</h1>
    <p>Elegí un usuario y marcá los edificios a los que puede acceder.</p>
  </div></div>
  <BuildingAccess request={request} buildings={buildings} buildingsError={buildingsError} reloadBuildings={reloadBuildings}/>
</>}
{((modules[page]&&page!=='accesos')||page==='usuarios')&&<><div className="heading"><div><button className="back" onClick={()=>go(page==='lecturas'?'inicio':'config')}><ArrowLeft size={16}/> Volver</button><h1>{page==='lecturas'?'Historial de lecturas':`Administrar ${modules[page]?.title.toLowerCase()||'usuarios'}`}</h1><p>Consulta y administración de registros de SharePoint.</p></div>{page==='lecturas'&&<button className="primary" onClick={()=>go('registro')}><Plus size={17}/> Nueva lectura</button>}{admin&&!history&&(!grouped||selectedBuilding)&&<button className="primary" onClick={()=>openEditor(page==='usuarios'?{usuario:'',nombre:'',rol:'Usuario',activo:true,password:''}:Object.fromEntries(modules[page].fields.map(f=>[f,''])))}><Plus size={17}/> Nuevo registro</button>}</div><div className="panel">
{buildingScoped && <div className="catalog-building-picker">
  {buildingsError && <p role="alert" className="error">{buildingsError} <button type="button" className="secondary" onClick={reloadBuildings}>Reintentar</button></p>}
  {buildings?.length ? <ReadingBuildingCards buildings={buildings} selected={selectedBuilding} onSelect={selectBuilding}/>
    : !buildingsError && <p role="status">{buildings ? 'No hay edificios habilitados para tu cuenta.' : 'Cargando edificios…'}</p>}
</div>}
{history && selectedBuilding && <ReadingHistoryFilters rows={rows} filters={historyFilters} onChange={setHistoryFilters} busy={busy || !Object.hasOwn(records, dataKey) && !error}/>}
{history && selectedBuilding && !historySelected && <button type="button" className="secondary reading-more" disabled={busy} onClick={()=>fetchKind('lecturas')}><RefreshCw size={16}/> Actualizar historial</button>}
{(!buildingScoped || (history ? historySelected : selectedBuilding)) && <><div className="toolbar">{!history && <div className="search"><Search size={18}/><input placeholder="Buscar registros…" value={search} onChange={e=>setSearch(e.target.value)}/></div>}<button aria-label="Actualizar registros" className="secondary" onClick={()=>page==='usuarios'?request('/api/users').then(r=>setUsers(r.users||[])):fetchKind(page)}><RefreshCw size={16}/></button>{reportingAllowed&&<><button className="secondary" disabled={buildingScoped && !visible.length} onClick={()=>exportFile('xlsx')}><FileDown size={16}/> Excel</button>
{history ? <button className="secondary" disabled={!reportRows.length} onClick={()=>setReportOpen(true)}><FileDown size={16}/> Crear PDF del medidor</button>
: <button className="secondary" disabled={buildingScoped && !visible.length} onClick={()=>exportFile('pdf')}><FileDown size={16}/> PDF</button>}</>}</div><div className={history ? "table-wrap reading-history-results" : "table-wrap"}><table><thead><tr>{tableFields.map(f=><th key={f}>{names[f]||f}</th>)}<th>Acciones</th></tr></thead><tbody>{(page==='usuarios'?users:visible).map((x,i)=><tr key={x.id||x.usuario||i}>{tableFields.map(f=><td key={f} data-label={history ? names[f] || f : undefined}>{f==='Logo'?<BuildingLogo key={x.LogoUrl} row={x}/>:displayValue(f,f==='rol' ? roleOptions.find(([value])=>value===x[f])?.[1] : x[f])}</td>)}<td><div className="actions"><button title="Ver" onClick={()=>setSelected(x)}><Eye size={17}/></button>{admin&&<button title="Editar" onClick={()=>openEditor({...x})}><Pencil size={17}/></button>}{admin&&page!=='usuarios'&&<button title="Eliminar" onClick={()=>remove(x)}><Trash2 size={17}/></button>}</div></td></tr>)}{!(page==='usuarios'?users:visible).length&&<tr><td colSpan={tableFields.length + 1} className="empty">{busy?'Cargando…':history?'No hay lecturas para el mes y servicio seleccionados.':grouped?'No hay registros para mostrar en este edificio.':'No hay registros para mostrar. Comprueba la conexión y las listas configuradas.'}</td></tr>}</tbody></table></div><div className="table-footer">{exportRows.length} {exportRows.length === 1 ? 'registro' : 'registros'}</div></>}</div></>}
</main></div>{reportOpen&&reportingAllowed&&history&&<ReadingReportDialog rows={reportRows} building={buildingId}
  preferredMonth={historyFilters.month} local={historyFilters.local} request={request} onClose={()=>setReportOpen(false)}/>}
{selected&&typeof selected==='object'&&<div className="overlay" onClick={()=>setSelected(null)}><section className="modal" onClick={e=>e.stopPropagation()}><h2>Detalle del registro</h2><div className="details">{(visibleDetails.length ? visibleDetails : Object.keys(selected).map(key=>({key,label:names[key]||key}))).map(({key,label})=><div key={key}><b>{names[key]||label}</b>{key==='Logo'?<BuildingLogo key={selected.LogoUrl} row={selected} fullSize/>:<span>{displayValue(key,selected[key])}</span>}</div>)}</div>{page==='lecturas'&&<ReadingPhotoGallery key={selected.id} id={selected.id} enabled={photosEnabled} request={request}/>}<button className="secondary" onClick={()=>setSelected(null)}>Cerrar</button></section></div>}{edit&&<div className="overlay" onClick={closeEditor}><section className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>{edit.id?'Editar':'Crear'} {modules[page]?.title||'usuario'}</h2><button onClick={closeEditor} disabled={busy}>×</button></div>{error&&<p className="error" role="alert">{error}</p>}<div className="form-grid">{(page==='usuarios'?['usuario','nombre','rol','activo',...(!edit.id?['password']:[])]:page==='lecturas'?editableReadingFields:modules[page].fields).map(f=><label key={f}>{names[f]||f}{grouped&&f==='Edificio'?<input readOnly value={selectedBuilding?.Title || ''}/>:page==='medidores'&&f==='Local'?<select value={edit.Local || ''} disabled={!editorLocals} onChange={e=>setEdit({...edit,Local:e.target.value})}>
<option value="">{editorLocals ? 'Sin local vinculado' : 'Cargando locales…'}</option>
{edit.Local&&editorLocals&&!editorLocals.some(local=>String(local.id)===edit.Local)&&<option value={edit.Local}>Local vinculado (#{edit.Local})</option>}
{editorLocals?.map(local=><option key={local.id} value={local.id}>{local.Title}</option>)}
</select>:f==='rol'?<select value={edit[f]||'Usuario'} onChange={e=>setEdit({...edit,[f]:e.target.value})}>{roleOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:f==='activo'||f==='Activo'?<select value={String(edit[f]??'Sí')} onChange={e=>setEdit({...edit,[f]:e.target.value})}><option>Sí</option><option>No</option></select>:<input type={f==='password'?'password':f==='FechaLectura'?'date':'text'} inputMode={['CuotaAgua','CuotaEnergia','CuotaCondonadaAgua','LecturaFinal'].includes(f)?'decimal':undefined} value={f==='FechaLectura'?String(edit[f]??'').slice(0,10):String(edit[f]??'')} onChange={e=>setEdit({...edit,[f]:e.target.value})}/>}</label>)}</div><div className="modal-actions"><button className="secondary" onClick={closeEditor} disabled={busy}>Cancelar</button><button className="primary" disabled={busy} onClick={save}><Save size={16}/> Guardar</button></div></section></div>}</div>}
createRoot(document.getElementById('root')).render(<App/>);
