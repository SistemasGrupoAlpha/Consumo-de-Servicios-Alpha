import React, { useEffect, useState } from 'react';
import { Building2, Droplets, Gauge, Save, Zap } from 'lucide-react';
import { localBuildingId, localHasService, meterHasService, meterLocalId, readingServices } from '../lib/registro-lecturas.mjs';
import { preparePhoto, ReadingPhotoPicker } from './reading-photos';

const sortByTitle = (first, second) => String(first.Title).localeCompare(String(second.Title), 'es', { numeric: true });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());
const emptyReading = () => ({ FechaLectura: today(), LecturaInicial: '', LecturaFinal: '' });
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
  const [meterId, setMeterId] = useState('');
  const [reading, setReading] = useState(emptyReading);
  const [photo, setPhoto] = useState(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

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
  const selectedMeter = meters.find(meter => String(meter.id) === meterId) ?? (meters.length === 1 ? meters[0] : null);

  function changeContext() {
    setError('');
    setSaved(false);
    setPhoto(null);
    setReading(current => ({ ...emptyReading(), FechaLectura: current.FechaLectura }));
  }

  function selectLocal(id) {
    setLocalId(id);
    setMeterId('');
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
    setSaved(false);
    try { setPhoto(await preparePhoto(file)); }
    catch (reason) { setError(reason.message); }
    finally { setWorking(''); }
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    if (!selectedMeter) { setError('Seleccioná un medidor para registrar la lectura.'); return; }
    if (!photo) { setError('Adjuntá una foto del medidor para guardar la lectura.'); return; }
    setWorking('Guardando lectura…');
    try {
      await request('/api/data?kind=lecturas', { method: 'POST', body: JSON.stringify({
        fields: { EdificioId: buildingId, Servicio: service, LocalId: localId, MedidorId: String(selectedMeter.id), ...reading },
        uploadId: photo.uploadId, photo: photo.preview.split(',')[1],
      }) });
      changeContext();
      setSaved(true);
    } catch (reason) { setError(reason.message); }
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
        {localId && meters.length > 0 && <fieldset className="reading-step"><legend>Medidor</legend>
          <div className="reading-choices reading-buildings">{meters.map(meter => <button type="button" className="reading-choice" key={meter.id} aria-pressed={selectedMeter?.id === meter.id} onClick={() => {
            if (selectedMeter?.id !== meter.id) { setMeterId(String(meter.id)); changeContext(); }
          }}><Gauge size={19}/><strong>{meter.Title}</strong>{meter.NumeroSerie && <small>{meter.NumeroSerie}</small>}</button>)}</div>
        </fieldset>}
        {localId && !meters.length && <p role="status">El local está marcado para este servicio, pero no tiene un medidor vinculado en el catálogo.</p>}
        {selectedMeter && <>
          <div className="form-grid reading-registration-fields">
            <label>Fecha de lectura<input type="date" required value={reading.FechaLectura} onChange={event => setReading({ ...reading, FechaLectura: event.target.value })}/></label>
            {['LecturaInicial', 'LecturaFinal'].map((key, index) => <label key={key}>{index ? 'Lectura final' : 'Lectura inicial'}{selectedMeter.UnidadMedida && ` (${selectedMeter.UnidadMedida})`}
              <input required inputMode="decimal" pattern="-?[0-9]+([.,][0-9]+)?" value={reading[key]} onChange={event => setReading({ ...reading, [key]: event.target.value })}/>
            </label>)}
          </div>
          <ReadingPhotoPicker photos={photo ? [photo] : []} enabled single required disabled={Boolean(working)} onPick={pickPhoto} onRemove={() => setPhoto(null)}/>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p className="reading-saved" role="status">Lectura y foto guardadas.</p>}
        {selectedMeter && <button type="submit" className="primary"><Save size={16}/>{working || 'Guardar lectura'}</button>}
      </fieldset>
    </form>}
  </>;
}
