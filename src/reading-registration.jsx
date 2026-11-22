import React, { useEffect, useState } from 'react';
import { Building2, Droplets, Gauge, Save, Zap } from 'lucide-react';
import { localBuildingId, localHasService, meterHasService, meterLocalId, metersWithHistory, readingServices } from '../lib/registro-lecturas.mjs';
import { preparePhoto, ReadingPhotoPicker } from './reading-photos';

const sortByTitle = (first, second) => String(first.Title).localeCompare(String(second.Title), 'es', { numeric: true });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());
const serviceIcons = { agua: Droplets, energia: Zap };
const localPageSize = 24;

export function ReadingRegistration({ request, onHistory }) {
  const [catalogs, setCatalogs] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [buildingId, setBuildingId] = useState('');
  const [service, setService] = useState('');
  const [localId, setLocalId] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [localLimit, setLocalLimit] = useState(localPageSize);
  const [groupId, setGroupId] = useState('');
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [readingId, setReadingId] = useState('');
  const [draft, setDraft] = useState({});
  const [photo, setPhoto] = useState(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    request('/api/data?kind=registro', { signal: controller.signal })
      .then(setCatalogs)
      .catch(reason => { if (!controller.signal.aborted) setLoadError(reason.message); });
    return () => controller.abort();
  }, [request, attempt]);

  const buildings = [...(catalogs?.buildings || [])].sort(sortByTitle);
  const selectedBuilding = buildings.find(building => String(building.id) === buildingId);
  const buildingLocals = (catalogs?.locals || []).filter(local => localBuildingId(local) === buildingId);
  const available = Object.fromEntries(Object.keys(readingServices).map(kind => [kind, buildingLocals.filter(local => localHasService(local, kind)).sort(sortByTitle)]));
  const serviceLocals = available[service] || [];
  const selectedLocal = serviceLocals.find(local => String(local.id) === localId);
  const filteredLocals = serviceLocals.filter(local => String(local.Title).toLocaleLowerCase('es').includes(localSearch.trim().toLocaleLowerCase('es')));
  const meters = (catalogs?.meters || []).filter(meter => localId && meterLocalId(meter) === localId && meterHasService(meter, service)).sort(sortByTitle);
  const groups = metersWithHistory(meters, catalogs?.readings || []);
  const monthReady = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month);
  const selectedGroup = groups.find(group => group.key === groupId) ?? (groups.length === 1 ? groups[0] : null);
  const selectedMeter = selectedGroup?.meter;
  const monthly = selectedGroup?.readings.filter(row => row.month === month) || [];
  const existing = monthly.find(row => row.id === readingId) ?? monthly[0];
  const historicalIds = new Set(selectedGroup?.readings.map(row => row.meterId));
  const conflict = !existing && (catalogs?.conflicts || []).some(row => row.month === month && historicalIds.has(row.meterId));
  const defaults = {
    FechaLectura: existing ? existing.date : month === today().slice(0, 7) ? today() : month && `${month}-01`,
    LecturaInicial: String(existing?.initial ?? ''),
    LecturaFinal: String(existing?.final ?? ''),
  };
  const reading = { ...defaults, ...draft };

  function changeContext() {
    setError('');
    setSaved('');
    setPhoto(null);
    setDraft({});
    setReadingId('');
  }

  function selectLocal(id) {
    setLocalId(id);
    setGroupId('');
    setLocalSearch('');
    setLocalLimit(localPageSize);
    changeContext();
  }

  function selectBuilding(id) {
    setBuildingId(id);
    setService('');
    selectLocal('');
  }

  async function pickPhoto([file]) {
    setWorking('Preparando foto…');
    setError('');
    setSaved('');
    try { setPhoto(await preparePhoto(file)); }
    catch (reason) { setError(reason.message); }
    finally { setWorking(''); }
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    if (!selectedMeter) { setError('Seleccioná un medidor para registrar la lectura.'); return; }
    if (conflict) return;
    if (!existing && !photo) { setError('Adjuntá una foto del medidor para guardar la lectura.'); return; }
    if (!existing && reading.FechaLectura.slice(0, 7) !== month) { setError('La fecha debe corresponder al mes seleccionado.'); return; }
    setWorking('Guardando lectura…');
    try {
      if (existing) {
        const values = Object.fromEntries(['LecturaInicial', 'LecturaFinal'].filter(key => reading[key] !== defaults[key]).map(key => [key, reading[key]]));
        const result = await request(`/api/data?kind=registro&id=${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: JSON.stringify({
          EdificioId: buildingId, MedidorId: existing.meterId, Periodo: month, fields: values,
        }) });
        setCatalogs(current => ({...current, readings: current.readings.map(row => row.id === existing.id ? {
          ...row, initial: result.fields.LecturaInicial ?? row.initial, final: result.fields.LecturaFinal ?? row.final,
        } : row) }));
        setDraft({});
        setSaved(Object.keys(result.fields).length ? 'Valores actualizados.' : 'La lectura no tiene cambios.');
      } else {
        const meterId = String(selectedMeter.id);
        const result = await request('/api/data?kind=lecturas', { method: 'POST', body: JSON.stringify({
          fields: { EdificioId: buildingId, Servicio: service, LocalId: localId, MedidorId: meterId, ...reading },
          uploadId: photo.uploadId, photo: photo.preview.split(',')[1],
        }) });
        setCatalogs(current => ({...current, readings: [...current.readings, { id: String(result.id), meterId, month,
          date: reading.FechaLectura, initial: reading.LecturaInicial, final: reading.LecturaFinal }]}));
        changeContext();
        setSaved('Lectura y foto guardadas.');
      }
    } catch (reason) {
      setError(reason.message);
      if (reason.status === 409) {
        setDraft({});
        setPhoto(null);
        setAttempt(current => current + 1);
      }
    }
    finally { setWorking(''); }
  }

  return <>
    <div className="heading"><div><h1>Registro de lecturas</h1><p>Seleccioná el edificio, el servicio y el medidor que vas a leer.</p></div>
      <button type="button" className="secondary" onClick={onHistory} disabled={Boolean(working)}>Ver historial</button>
    </div>
    {loadError && <div className="error banner" role="alert"><span>{loadError}</span><button type="button" onClick={() => { setLoadError(''); setAttempt(attempt + 1); }}>Reintentar</button></div>}
    {!catalogs ? !loadError && <div className="panel" role="status">Cargando edificios, locales y medidores…</div> : !buildings.length
      ? <div className="panel" role="status">No hay edificios habilitados para tu cuenta en Accesos a edificios.</div>
      : <form className="panel reading-registration" onSubmit={save}>
      <fieldset disabled={Boolean(working)}>
        <fieldset className="reading-step"><legend>Edificio</legend>
          {selectedBuilding ? <button type="button" className="reading-choice is-current" onClick={() => selectBuilding('')}>
            <Building2 size={21}/><strong>{selectedBuilding.Title}</strong><small>Cambiar edificio</small>
          </button> : <div className="reading-choices reading-buildings">
            {buildings.map(building => <button type="button" className="reading-choice" key={building.id} onClick={() => selectBuilding(String(building.id))}>
              <Building2 size={21}/><strong>{building.Title}</strong>
            </button>)}
          </div>}
        </fieldset>
        {buildingId && <fieldset className="reading-service-options"><legend>Servicio</legend>
          {Object.entries(readingServices).map(([kind, { label }]) => {
            const Icon = serviceIcons[kind];
            const count = available[kind].length;
            return <button type="button" className="reading-service" key={kind} aria-pressed={service === kind} disabled={!count} onClick={() => {
              if (kind !== service) { setService(kind); selectLocal(''); }
            }}><Icon size={22}/><span><strong>{label}</strong><small>{count ? `${count} ${count === 1 ? 'local con medidor' : 'locales con medidor'}` : 'Sin medidores en este edificio'}</small></span></button>;
          })}
        </fieldset>}
        {service && <fieldset className="reading-step"><legend>Local</legend>
          {selectedLocal ? <button type="button" className="reading-choice is-current" onClick={() => selectLocal('')}><strong>{selectedLocal.Title}</strong><small>Cambiar local</small></button> : <>
            {serviceLocals.length > 12 && <input type="search" className="reading-local-search" aria-label="Buscar local" placeholder="Buscar local" value={localSearch} onChange={event => {
              setLocalSearch(event.target.value); setLocalLimit(localPageSize);
            }}/>}
            {filteredLocals.length ? <div className="reading-choices reading-locals">
              {filteredLocals.slice(0, localLimit).map(local => <button type="button" className="reading-choice" key={local.id} onClick={() => selectLocal(String(local.id))}>{local.Title}</button>)}
            </div> : <p role="status">No hay locales que coincidan con la búsqueda.</p>}
            {filteredLocals.length > localLimit && <button type="button" className="secondary reading-more" onClick={() => setLocalLimit(current => current + localPageSize)}>Mostrar más locales</button>}
          </>}
        </fieldset>}
        {localId && groups.length > 0 && <fieldset className="reading-step"><legend>Medidor</legend>
          <div className="reading-choices reading-buildings">{groups.map(({key,meter}) => <button type="button" className="reading-choice" key={key} aria-pressed={selectedGroup?.key === key} onClick={() => {
            if (selectedGroup?.key !== key) { setGroupId(key); changeContext(); }
          }}><Gauge size={19}/><strong>{meter.Title}</strong>{meter.NumeroSerie && <small>{meter.NumeroSerie}</small>}</button>)}</div>
        </fieldset>}
        {localId && !groups.length && <p role="status">Este local no tiene un medidor con historial en el servicio seleccionado.</p>}
        {selectedMeter && <>
          <div className="form-grid reading-registration-fields"><label>Mes de lectura<input type="month" required placeholder="AAAA-MM" pattern="[0-9]{4}-(0[1-9]|1[0-2])" value={month} onChange={event => { setMonth(event.target.value); changeContext(); }}/></label></div>
          {monthly.length > 1 && <fieldset className="reading-step"><legend>Lecturas de este mes</legend><div className="reading-choices reading-buildings">
            {monthly.map(row => <button type="button" className="reading-choice" key={row.id} aria-pressed={existing?.id === row.id} onClick={() => {
              changeContext(); setReadingId(row.id);
            }}><span><strong>{row.date || row.month}</strong>{row.final != null && <span className="reading-choice-value">Lectura final {row.final}</span>}</span><small>#{row.id}</small></button>)}
          </div></fieldset>}
          {conflict && <p className="error" role="status">Hay una lectura de este mes con otro edificio asociado. Revisá el historial antes de registrar otra.</p>}
          {monthReady && !conflict && <>
          {existing && <p className="reading-month-status" role="status">Lectura del mes guardada. Podés corregir sus valores.</p>}
          <div className="form-grid reading-registration-fields">
            <label>Fecha de lectura<input type="date" required={!existing} readOnly={Boolean(existing)} value={reading.FechaLectura} onChange={event => setDraft({ ...draft, FechaLectura: event.target.value })}/></label>
            {['LecturaInicial', 'LecturaFinal'].map((key, index) => <label key={key}>{index ? 'Lectura final' : 'Lectura inicial'}{selectedMeter.UnidadMedida && ` (${selectedMeter.UnidadMedida})`}
              <input required={!existing} inputMode="decimal" pattern="-?[0-9]+([.,][0-9]+)?" value={reading[key]} onChange={event => { setDraft({ ...draft, [key]: event.target.value }); setSaved(''); }}/>
            </label>)}
          </div>
          {!existing && <ReadingPhotoPicker photos={photo ? [photo] : []} enabled single required disabled={Boolean(working)} onPick={pickPhoto} onRemove={() => setPhoto(null)}/>}
          </>}
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p className="reading-saved" role="status">{saved}</p>}
        {selectedMeter && monthReady && !conflict && <button type="submit" className="primary reading-submit"><Save size={16}/>{working || (existing ? 'Guardar cambios' : 'Guardar lectura')}</button>}
      </fieldset>
    </form>}
  </>;
}
