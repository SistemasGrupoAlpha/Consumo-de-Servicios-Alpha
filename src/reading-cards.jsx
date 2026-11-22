import React, { useState } from 'react';
import { Building2, Check } from 'lucide-react';

const localPageSize = 24;
export const sortByTitle = (first, second) => String(first.Title).localeCompare(String(second.Title), 'es', { numeric: true });

export function ReadingBuildingCards({ buildings, selected, onSelect, readingCounts, countsError }) {
  function title(building) {
    const count = readingCounts?.[building.id] ?? 0;
    return <span><strong>{building.Title}</strong>
      {readingCounts !== undefined && <span className="reading-choice-value">
        {countsError ? 'Conteo no disponible' : readingCounts === null ? 'Cargando lecturas…' : `${count} ${count === 1 ? 'lectura realizada' : 'lecturas realizadas'}`}
      </span>}
    </span>;
  }
  return <fieldset className="reading-step"><legend>Edificio</legend>
    {selected ? <button type="button" className="reading-choice is-current" onClick={() => onSelect('')}>
      <Building2 size={21}/>{title(selected)}<small>Cambiar edificio</small>
    </button> : <div className="reading-choices reading-buildings">
      {buildings.map(building => <button type="button" className="reading-choice" key={building.id} onClick={() => onSelect(String(building.id))}>
        <Building2 size={21}/>{title(building)}
      </button>)}
    </div>}
  </fieldset>;
}

export function ReadingCompletion() {
  return <span className="reading-completion"><Check size={15} aria-hidden="true"/>Realizada</span>;
}

export function ReadingLocalCards({ locals, selected, onSelect, completed }) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(localPageSize);
  const filtered = locals.filter(local => local.Title.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')));
  function select(id) {
    setSearch('');
    setLimit(localPageSize);
    onSelect(id);
  }
  const selectedComplete = selected && completed?.has(String(selected.id));
  return <fieldset className="reading-step"><legend>Local</legend>
    {selected ? <button type="button" className={`reading-choice is-current${selectedComplete ? ' is-complete' : ''}`} onClick={() => select('')}>
      <span><strong>{selected.Title}</strong>{selectedComplete && <ReadingCompletion/>}</span><small>Cambiar local</small>
    </button> : <>
      {locals.length > 12 && <input type="search" className="reading-local-search" aria-label="Buscar local" placeholder="Buscar local" value={search} onChange={event => {
        setSearch(event.target.value);
        setLimit(localPageSize);
      }}/>}
      {filtered.length ? <div className="reading-choices reading-locals">
        {filtered.slice(0, limit).map(local => {
          const done = completed?.has(String(local.id));
          return <button type="button" className={`reading-choice${done ? ' is-complete' : ''}`} key={local.id} onClick={() => select(String(local.id))}>
            <span>{local.Title}{done && <ReadingCompletion/>}</span>
          </button>;
        })}
      </div> : <p role="status">No hay locales que coincidan con la búsqueda.</p>}
      {filtered.length > limit && <button type="button" className="secondary reading-more" onClick={() => setLimit(current => current + localPageSize)}>Mostrar más locales</button>}
    </>}
  </fieldset>;
}
