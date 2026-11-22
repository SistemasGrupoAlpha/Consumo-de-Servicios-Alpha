import React, { useEffect, useMemo, useState } from 'react';
import { Droplets, Gauge, Save, Zap } from 'lucide-react';
import { hasMonthlyReading, localBuildingId, localHasService, meterHasService, meterLocalId, metersWithHistory, previousReadingValue, readingCharges, readingServices } from '../lib/registro-lecturas.mjs';
import { preparePhoto, ReadingPhotoPicker } from './reading-photos';

import { ReadingBuildingCards, ReadingCompletion, ReadingLocalCards, sortByTitle } from './reading-cards';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date());
const serviceIcons = { agua: Droplets, energia: Zap };
const amount = new Intl.NumberFormat('es-HN', { minimumFractionDigits:2, maximumFractionDigits:2 });
const quantity = new Intl.NumberFormat('es-HN', { maximumFractionDigits:9 });

export function ReadingRegistration({ request, onHistory }) {
  const [catalogs, setCatalogs] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [buildingId, setBuildingId] = useState('');
  const [service, setService] = useState('');
  const [localId, setLocalId] = useState('');
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
  const groupsByLocal = useMemo(() => {
    const meters = (catalogs?.meters || []).filter(meter => localBuildingId(meter) === buildingId && meterHasService(meter, service));
    const byLocal = new Map();
    for (const group of metersWithHistory(meters, catalogs?.readings || [])) {
      const id = meterLocalId(group.meter);
      if (!byLocal.has(id)) byLocal.set(id, []);
      byLocal.get(id).push(group);
    }
    return byLocal;
  }, [catalogs, buildingId, service]);
  const groups = groupsByLocal.get(localId) || [];
  const monthReady = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month);
  const completedLocals = new Set([...groupsByLocal].filter(([, localGroups]) =>
    localGroups.every(group => hasMonthlyReading(group, month))).map(([id]) => id));
  const selectedGroup = groups.find(group => group.key === groupId) ?? (groups.length === 1 ? groups[0] : null);
  const selectedMeter = selectedGroup?.meter;
  const monthly = selectedGroup?.readings.filter(row => row.month === month) || [];
  const existing = monthly.find(row => row.id === readingId) ?? monthly[0];
  const defaults = {
    FechaLectura: existing ? existing.date : month === today().slice(0, 7) ? today() : month && `${month}-01`,
    LecturaFinal: String(existing?.final ?? ''),
  };
  const reading = { ...defaults, ...draft };
  const initial = previousReadingValue(selectedGroup?.readings || [], month, existing);
  const charges = readingCharges(selectedBuilding, selectedMeter?.TipoMedidor, initial, reading.LecturaFinal);
  const billingError = initial === null ? 'No hay una lectura anterior con valor final para usar como inicial.'
    : charges.rate === null || charges.rate < 0 ? 'La cuota de este servicio se configura en Edificios.'
    : charges.final !== null && charges.final < initial ? 'La lectura final debe ser igual o mayor que la inicial.' : '';

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
    if (billingError) { setError(billingError); return; }
    if (!existing && !photo) { setError('Adjuntá una foto del medidor para guardar la lectura.'); return; }
    if (!existing && reading.FechaLectura.slice(0, 7) !== month) { setError('La fecha debe corresponder al mes seleccionado.'); return; }
    setWorking('Guardando lectura…');
    try {
      if (existing) {
        const values = reading.LecturaFinal === defaults.LecturaFinal ? {} : {LecturaFinal:reading.LecturaFinal};
        const result = await request(`/api/data?kind=registro&id=${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: JSON.stringify({
          EdificioId: buildingId, LocalId: localId, MedidorId: existing.meterId, Periodo: month, fields: values,
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
          date: reading.FechaLectura, initial: result.fields.LecturaInicial, final: result.fields.LecturaFinal }]}));
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
        <ReadingBuildingCards buildings={buildings} selected={selectedBuilding} onSelect={selectBuilding}/>
        {buildingId && <fieldset className="reading-service-options"><legend>Servicio</legend>
          {Object.entries(readingServices).map(([kind, { label }]) => {
            const Icon = serviceIcons[kind];
            const count = available[kind].length;
            return <button type="button" className="reading-service" key={kind} aria-pressed={service === kind} disabled={!count} onClick={() => {
              if (kind !== service) { setService(kind); selectLocal(''); }
            }}><Icon size={22}/><span><strong>{label}</strong><small>{count ? `${count} ${count === 1 ? 'local con medidor' : 'locales con medidor'}` : 'Sin medidores en este edificio'}</small></span></button>;
          })}
        </fieldset>}
        {service && <>
          <div className="form-grid reading-registration-fields"><label>Mes de lectura<input type="month" required placeholder="AAAA-MM" pattern="[0-9]{4}-(0[1-9]|1[0-2])" value={month} onChange={event => { setMonth(event.target.value); changeContext(); }}/></label></div>
          <ReadingLocalCards key={JSON.stringify([buildingId, service])} locals={serviceLocals} selected={selectedLocal} onSelect={selectLocal} completed={completedLocals}/>
        </>}
        {localId && groups.length > 0 && <fieldset className="reading-step"><legend>Medidor</legend>
          <div className="reading-choices reading-buildings">{groups.map(group => {
            const { key, meter } = group;
            const done = hasMonthlyReading(group, month);
            return <button type="button" className={`reading-choice${done ? ' is-complete' : ''}`} key={key} aria-pressed={selectedGroup?.key === key} onClick={() => {
              if (selectedGroup?.key !== key) { setGroupId(key); changeContext(); }
            }}><Gauge size={19}/><span><strong>{meter.Title}</strong>{done && <ReadingCompletion/>}</span>{meter.NumeroSerie && <small>{meter.NumeroSerie}</small>}</button>;
          })}</div>
        </fieldset>}
        {localId && !groups.length && <p role="status">Este local no tiene un medidor con historial en el servicio seleccionado.</p>}
        {selectedMeter && <>
          {monthly.length > 1 && <fieldset className="reading-step"><legend>Lecturas de este mes</legend><div className="reading-choices reading-buildings">
            {monthly.map(row => <button type="button" className="reading-choice" key={row.id} aria-pressed={existing?.id === row.id} onClick={() => {
              changeContext(); setReadingId(row.id);
            }}><span><strong>{row.date || row.month}</strong>{row.final != null && <span className="reading-choice-value">Lectura final {row.final}</span>}</span><small>#{row.id}</small></button>)}
          </div></fieldset>}
          {monthReady && <>
          {existing && <p className="reading-month-status" role="status">Lectura del mes guardada. Podés corregir la lectura final.</p>}
          <div className="form-grid reading-registration-fields">
            <label>Fecha de lectura<input type="date" required={!existing} readOnly={Boolean(existing)} value={reading.FechaLectura} onChange={event => setDraft({ ...draft, FechaLectura: event.target.value })}/></label>
            <label>Lectura inicial{selectedMeter.UnidadMedida && ` (${selectedMeter.UnidadMedida})`}<input readOnly value={initial ?? ''}/></label>
            <label>Lectura final{selectedMeter.UnidadMedida && ` (${selectedMeter.UnidadMedida})`}
              <input required inputMode="decimal" pattern="-?[0-9]+([.,][0-9]+)?" value={reading.LecturaFinal} onChange={event => { setDraft({ ...draft, LecturaFinal: event.target.value }); setSaved(''); }}/>
            </label>
          </div>
          <dl className="reading-charge-summary" aria-live="polite">
            {charges.allowance > 0 && <><div><dt>Consumo medido</dt><dd>{charges.gross === null ? '—' : quantity.format(charges.gross)}</dd></div><div><dt>Agua condonada</dt><dd>{quantity.format(charges.allowance)}</dd></div></>}
            <div><dt>Consumo cobrable</dt><dd>{charges.consumption === null ? '—' : quantity.format(charges.consumption)}</dd></div>
            <div><dt>Cuota aplicada</dt><dd>{charges.rate === null ? '—' : quantity.format(charges.rate)}</dd></div>
            <div><dt>Total del mes</dt><dd>{charges.total === null ? '—' : amount.format(charges.total)}</dd></div>
          </dl>
          {billingError && <p className="error" role="status">{billingError}</p>}
          {!existing && <ReadingPhotoPicker photos={photo ? [photo] : []} enabled single required disabled={Boolean(working)} onPick={pickPhoto} onRemove={() => setPhoto(null)}/>}
          </>}
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        {saved && <p className="reading-saved" role="status">{saved}</p>}
        {selectedMeter && monthReady && <button type="submit" className="primary reading-submit" disabled={Boolean(billingError)}><Save size={16}/>{working || (existing ? 'Guardar cambios' : 'Guardar lectura')}</button>}
      </fieldset>
    </form>}
  </>;
}
