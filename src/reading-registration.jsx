import React, { useEffect, useState } from 'react';
import { Droplets, Save, Zap } from 'lucide-react';
import { localBuildingId, localHasService, meterHasService, meterLocalId, readingServices } from '../lib/registro-lecturas.mjs';
import { preparePhoto, ReadingPhotoPicker } from './reading-photos';

const sortByTitle = (first, second) => String(first.Title).localeCompare(String(second.Title), 'es', { numeric: true });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());
const emptyReading = () => ({ FechaLectura: today(), LecturaInicial: '', LecturaFinal: '' });
const serviceIcons = { agua: Droplets, energia: Zap };

export function ReadingRegistration({ request, onHistory }) {
  const [catalogs, setCatalogs] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [buildingId, setBuildingId] = useState('');
  const [service, setService] = useState('');
  const [localId, setLocalId] = useState('');
  const [meterId, setMeterId] = useState('');
  const [reading, setReading] = useState(emptyReading);
  const [photo, setPhoto] = useState(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['edificios', 'locales', 'medidores'].map(kind => request(`/api/data?kind=${kind}`, { signal: controller.signal })))
      .then(([buildings, locals, meters]) => setCatalogs({ buildings: buildings.items, locals: locals.items, meters: meters.items }))
      .catch(reason => { if (!controller.signal.aborted) setLoadError(reason.message); });
    return () => controller.abort();
  }, [request, attempt]);

  const buildings = [...(catalogs?.buildings || [])].sort(sortByTitle);
  const buildingLocals = (catalogs?.locals || []).filter(local => localBuildingId(local) === buildingId);
  const available = Object.fromEntries(Object.keys(readingServices).map(kind => [kind, buildingLocals.filter(local => localHasService(local, kind)).sort(sortByTitle)]));
  const meters = (catalogs?.meters || []).filter(meter => localId && meterLocalId(meter) === localId && meterHasService(meter, service)).sort(sortByTitle);
  const selectedMeter = meters.find(meter => String(meter.id) === meterId) ?? (meters.length === 1 ? meters[0] : null);

  function changeContext() {
    setError('');
    setSaved(false);
    setPhoto(null);
    setReading(current => ({ ...emptyReading(), FechaLectura: current.FechaLectura }));
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
    {!catalogs ? !loadError && <div className="panel" role="status">Cargando edificios, locales y medidores…</div> : <form className="panel reading-registration" onSubmit={save}>
      <fieldset disabled={Boolean(working)}>
        <div className="form-grid">
          <label>Edificio<select required value={buildingId} onChange={event => {
            setBuildingId(event.target.value); setService(''); setLocalId(''); setMeterId(''); changeContext();
          }}><option value="">Seleccioná un edificio</option>{buildings.map(building => <option key={building.id} value={building.id}>{building.Title}</option>)}</select></label>
        </div>
        {buildingId && <fieldset className="reading-service-options"><legend>Servicio</legend>
          {Object.entries(readingServices).map(([kind, { label }]) => {
            const Icon = serviceIcons[kind];
            const count = available[kind].length;
            return <button type="button" className="reading-service" key={kind} aria-pressed={service === kind} disabled={!count} onClick={() => {
              if (kind !== service) { setService(kind); setLocalId(''); setMeterId(''); changeContext(); }
            }}><Icon size={22}/><span><strong>{label}</strong><small>{count ? `${count} ${count === 1 ? 'local con medidor' : 'locales con medidor'}` : 'Sin medidores en este edificio'}</small></span></button>;
          })}
        </fieldset>}
        {service && <div className="form-grid reading-registration-fields">
          <label>Local<select required value={localId} onChange={event => { setLocalId(event.target.value); setMeterId(''); changeContext(); }}>
            <option value="">Seleccioná un local</option>{available[service].map(local => <option key={local.id} value={local.id}>{local.Title}</option>)}
          </select></label>
          {localId && <label>Medidor<select required value={selectedMeter?.id || ''} onChange={event => { setMeterId(event.target.value); changeContext(); }}>
            <option value="">{meters.length ? 'Seleccioná un medidor' : 'Sin medidor vinculado'}</option>
            {meters.map(meter => <option key={meter.id} value={meter.id}>{[meter.Title, meter.NumeroSerie].filter(Boolean).join(' · ')}</option>)}
          </select></label>}
        </div>}
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
