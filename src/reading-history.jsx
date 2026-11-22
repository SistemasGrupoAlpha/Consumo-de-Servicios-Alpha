import React, { useMemo } from 'react';
import { Droplets, Layers, Zap } from 'lucide-react';
import { ReadingLocalCards, sortByTitle } from './reading-cards';
import { readingServices } from '../lib/registro-lecturas.mjs';

const services = [
  ['', 'Todos', Layers],
  ['agua', readingServices.agua.label, Droplets],
  ['energia', readingServices.energia.label, Zap],
];

export const historyLocationId = id => String(id || 'sin-vinculo');

export function ReadingHistoryFilters({ rows, filters, onChange, busy }) {
  const { building, local, month, service } = filters;
  const locals = useMemo(() => {
    const cards = new Map();
    for (const row of rows) {
      const id = historyLocationId(row.LocalHistorialId);
      cards.set(id, { id, Title: row.Local || 'Sin local vinculado' });
    }
    return [...cards.values()].sort(sortByTitle);
  }, [rows]);
  if (!locals.length) return <p role="status">{busy ? 'Cargando lecturas del edificio…' : 'No hay lecturas en este edificio.'}</p>;
  const currentLocal = locals.find(row => row.id === local);
  return <div className="reading-history-filters">
    <ReadingLocalCards key={building} locals={locals} selected={currentLocal} onSelect={id => onChange({ ...filters, local: id })}/>
    {currentLocal && <>
      <div className="form-grid reading-registration-fields">
        <label>Mes de lectura<input type="month" placeholder="AAAA-MM" pattern="[0-9]{4}-(0[1-9]|1[0-2])" value={month} onChange={event => onChange({ ...filters, month: event.target.value })}/></label>
      </div>
      {month && <button type="button" className="secondary reading-more" onClick={() => onChange({ ...filters, month: '' })}>Ver todos los meses</button>}
      <fieldset className="reading-service-options reading-history-services">
        <legend>Servicio</legend>
        {services.map(([id, label, Icon]) => <button type="button" className="reading-service" key={id} aria-pressed={service === id} onClick={() => onChange({ ...filters, service: id })}>
          <Icon size={20}/><strong>{label}</strong>
        </button>)}
      </fieldset>
    </>}
  </div>;
}
