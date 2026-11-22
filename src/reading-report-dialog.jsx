import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
import { readingMonth } from '../lib/registro-lecturas.mjs';
import { downloadReadingReport, reportMonthLabel } from './reading-report.mjs';

export function ReadingReportDialog({ rows, building, preferredMonth, request, onClose }) {
  const meters = new Map();
  for (const row of rows) {
    if (row.MedidorHistorialId && readingMonth(row)) meters.set(row.MedidorHistorialId, row);
  }
  const availableMonths = id => [...new Set(rows.filter(row => row.MedidorHistorialId === id).map(readingMonth).filter(Boolean))].sort();
  const initialMeter = meters.size === 1 ? meters.keys().next().value : '';
  const [meter, setMeter] = useState(initialMeter);
  const [months, setMonths] = useState(() => {
    const available = availableMonths(initialMeter);
    if (available.includes(preferredMonth)) return [preferredMonth];
    return available.length === 1 ? available : [];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = availableMonths(meter);

  function pickMeter(id) {
    setMeter(id);
    setError('');
    const months = availableMonths(id);
    setMonths(months.includes(preferredMonth) ? [preferredMonth] : months.length === 1 ? months : []);
  }

  async function download(event) {
    event.preventDefault();
    if (!meter || !months.length) return;
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ kind: 'lecturas', view: 'reporte', edificio: building, medidor: meter });
      const result = await request(`/api/data?${query}`);
      const selected = result.items.filter(row => months.includes(readingMonth(row)))
        .sort((a, b) => readingMonth(a).localeCompare(readingMonth(b)) || String(a.FechaLectura).localeCompare(String(b.FechaLectura)));
      if (!selected.length) throw new Error('Ya no hay lecturas disponibles para los meses seleccionados.');
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
          <div className="form-grid"><label>Medidor
            <select value={meter} onChange={event => pickMeter(event.target.value)}>
              <option value="">Seleccioná un medidor</option>
              {[...meters].map(([id, row]) => <option key={id} value={id}>
                {row.Medidor || row.NumeroSerie || `#${id}`}{row.TipoMedidor ? ` · ${row.TipoMedidor}` : ''}
              </option>)}
            </select>
          </label></div>
          {available.length > 0 && <fieldset className="reading-step building-access-options">
            <legend>Meses del informe</legend>
            <div className="reading-choices reading-buildings">
              {available.map(month => <label className="reading-choice" key={month}>
                <input type="checkbox" checked={months.includes(month)} onChange={event => {
                  setError('');
                  setMonths(event.target.checked ? [...months, month] : months.filter(value => value !== month));
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
