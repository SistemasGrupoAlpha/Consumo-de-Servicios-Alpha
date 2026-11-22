import React, { useMemo } from 'react';
import { Droplets, Layers, Zap } from 'lucide-react';
import { ReadingBuildingCards, ReadingLocalCards, sortByTitle } from './reading-cards';
import { readingServices } from '../lib/registro-lecturas.mjs';

const services = [
  ['', 'Todos', Layers],
  ['agua', readingServices.agua.label, Droplets],
  ['energia', readingServices.energia.label, Zap],
];

export const historyLocationId = id => String(id || 'sin-vinculo');

export function ReadingHistoryFilters({ rows, filters, onChange, busy }) {
  const { building, local, month, service } = filters;
  const { buildings, locals } = useMemo(() => {
    const buildingCards = new Map();
    const localCards = new Map();
    for (const row of rows) {
      const buildingId = historyLocationId(row.EdificioHistorialId);
      const localId = historyLocationId(row.LocalHistorialId);
      buildingCards.set(buildingId, { id: buildingId, Title: row.Edificio || 'Sin edificio vinculado' });
      if (buildingId === building) localCards.set(localId, { id: localId, Title: row.Local || 'Sin local vinculado' });
    }
    return { buildings: [...buildingCards.values()].sort(sortByTitle), locals: [...localCards.values()].sort(sortByTitle) };
  }, [rows, building]);
  if (!buildings.length) return <p role="status">{busy ? 'Cargando historial…' : 'No hay lecturas para mostrar.'}</p>;
  const currentBuilding = buildings.find(row => row.id === building);
  const currentLocal = locals.find(row => row.id === local);
  return <div className="reading-history-filters">
    <ReadingBuildingCards buildings={buildings} selected={currentBuilding} onSelect={id => onChange({ ...filters, building: id, local: '' })}/>
    {currentBuilding && <ReadingLocalCards key={building} locals={locals} selected={currentLocal} onSelect={id => onChange({ ...filters, local: id })}/>}
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
