import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
import { meterHasService, readingMonth, readingServices } from '../lib/registro-lecturas.mjs';
import { historyLocationId } from './reading-history';
import { downloadReadingReport, reportMonthLabel } from './reading-report.mjs';

export function ReadingReportDialog({ rows, building, local, preferredMonth, request, onClose }) {
  const services = Object.entries(readingServices).filter(([type]) => rows.some(row => meterHasService(row, type)));
  const metersFor = type => new Map(rows.filter(row => meterHasService(row, type)).map(row => [row.MedidorHistorialId, row]));
  const monthsFor = (type, id) => [...new Set(rows.filter(row => row.MedidorHistorialId === id && meterHasService(row, type))
    .map(readingMonth))].sort();
  const defaultMeter = meters => meters.size === 1 ? meters.keys().next().value : '';
  const defaultMonths = available => available.includes(preferredMonth) ? [preferredMonth] : available.length === 1 ? available : [];

  const [service, setService] = useState(() => services.length === 1 ? services[0][0] : '');
  const [meter, setMeter] = useState(() => defaultMeter(metersFor(service)));
  const [months, setMonths] = useState(() => defaultMonths(monthsFor(service, meter)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meters = metersFor(service);
  const available = monthsFor(service, meter);

  function pickMeter(id, type = service) {
    setMeter(id);
    setError('');
    setMonths(defaultMonths(monthsFor(type, id)));
  }

  function pickService(type) {
    setService(type);
    pickMeter(defaultMeter(metersFor(type)), type);
  }

  async function download(event) {
    event.preventDefault();
    if (!service || !meter || !months.length) return;
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ kind: 'lecturas', view: 'reporte', edificio: building, medidor: meter, servicio: service });
      const result = await request(`/api/data?${query}`);
      const selected = result.items.filter(row => row.MedidorHistorialId === meter &&
        historyLocationId(row.LocalHistorialId) === local && meterHasService(row, service) && months.includes(readingMonth(row)))
        .sort((a, b) => readingMonth(a).localeCompare(readingMonth(b)) || String(a.FechaLectura).localeCompare(String(b.FechaLectura)));
      if (!selected.length) throw new Error('Ya no hay lecturas disponibles para este servicio en los meses seleccionados.');
      await downloadReadingReport(selected, request, result.photosEnabled);
      onClose();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="overlay" onClick={() => !busy && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reading-report-title" onClick={event => event.stopPropagation()}>
      <h2 id="reading-report-title">Informe PDF del medidor</h2>
      <form onSubmit={download}>
        <fieldset className="reading-step" disabled={busy}>
          <div className="form-grid">
            <label htmlFor="reading-report-service">Servicio
              <select id="reading-report-service" value={service} onChange={event => pickService(event.target.value)}>
                <option value="">Seleccioná un servicio</option>
                {services.map(([type, { label }]) => <option key={type} value={type}>{label}</option>)}
              </select>
            </label>
            <label htmlFor="reading-report-meter">Medidor
              <select id="reading-report-meter" value={meter} disabled={!service} onChange={event => pickMeter(event.target.value)}>
                <option value="">Seleccioná un medidor</option>
                {[...meters].map(([id, row]) => <option key={id} value={id}>
                  {row.Medidor || row.NumeroSerie || `#${id}`}
                </option>)}
              </select>
            </label>
          </div>
          {available.length > 0 && <fieldset className="reading-step building-access-options">
            <legend>Meses del informe</legend>
            <label className="reading-choice reading-more">
              <input type="checkbox" checked={months.length === available.length} onChange={event => {
                setError('');
                setMonths(event.target.checked ? available : []);
              }}/>
              Todos los meses
            </label>
            <div className="reading-choices reading-buildings reading-more">
              {available.map(month => <label className="reading-choice" key={month}>
                <input type="checkbox" checked={months.includes(month)} onChange={event => {
                  const checked = event.target.checked;
                  setError('');
                  setMonths(current => checked ? [...current, month] : current.filter(value => value !== month));
                }}/>
                {reportMonthLabel(month)}
              </label>)}
            </div>
          </fieldset>}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        {busy && <p role="status">Preparando el informe y sus fotografías…</p>}
        <div className="modal-actions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="primary" disabled={busy || !months.length} type="submit"><FileDown size={16}/> Descargar PDF</button>
        </div>
      </form>
    </section>
  </div>;
}
