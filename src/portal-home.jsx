import React, { useState } from 'react';
import { ArrowRight, Building2, CalendarDays, History } from 'lucide-react';
import { AlphaLogo } from './brand';

const monthFormatter = new Intl.DateTimeFormat('es-HN', { year: 'numeric', month: 'long', timeZone: 'America/Tegucigalpa' });
const number = new Intl.NumberFormat('es-HN');

function BuildingMark({ src }) {
  const [unavailable, setUnavailable] = useState(false);
  return <span className="portal-building-mark" aria-hidden="true">
    {src && !unavailable ? <img src={src} alt="" loading="lazy" onError={() => setUnavailable(true)}/> : <Building2 size={17}/>}
  </span>;
}

export function PortalHome({ name, buildings, buildingsError, reloadBuildings, counts, countsError, reloadCounts, logos, onSelect, onHistory }) {
  const month = monthFormatter.format(new Date());
  const monthLabel = month[0].toUpperCase() + month.slice(1);
  const rows = (buildings || []).map(building => ({ ...building, count: counts?.[building.id] ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const most = Math.max(...rows.map(row => row.count), 0);
  const scaleStep = Math.pow(10, Math.max(0, Math.floor(Math.log10(most || 1)))) / 2;
  const scale = Math.max(4, Math.ceil(most / scaleStep) * scaleStep);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const withReadings = rows.filter(row => row.count > 0).length;
  const ready = counts !== null && !countsError;
  const marks = Array.from({ length: 5 }, (_, i) => Math.round(scale * i / 4));

  return <div className="portal-home">
    <section className="portal-welcome" aria-labelledby="welcome-title">
      <div>
        <span className="portal-welcome-period"><CalendarDays size={16} aria-hidden="true"/>{monthLabel}</span>
        <h1 id="welcome-title">Bienvenido, {name}</h1>
        <p>Consultá el avance de lecturas de agua y energía.</p>
      </div>
      <AlphaLogo className="portal-welcome-logo"/>
    </section>
    <section className="portal-chart panel" aria-labelledby="building-chart-title">
      <header className="portal-chart-header">
        <div>
          <h2 id="building-chart-title">Lecturas por edificio</h2>
          <p>Seleccioná un edificio para abrir su registro.</p>
        </div>
        <button className="secondary" type="button" onClick={onHistory}><History size={17}/> Ver historial</button>
      </header>

      {rows.length > 0 && <>
        <div className="portal-chart-stats">
          <div><strong>{ready ? number.format(total) : '—'}</strong><span>Lecturas realizadas</span></div>
          <div><strong>{ready ? `${withReadings} de ${rows.length}` : '—'}</strong><span>Edificios con lecturas</span></div>
        </div>
        {!ready && !countsError && <p className="portal-chart-status" role="status">Cargando conteos del mes…</p>}
        {countsError && <p className="portal-chart-status" role="status">Conteo no disponible. <button type="button" className="secondary" onClick={reloadCounts}>Reintentar</button></p>}
        <div className="portal-chart-axis" aria-hidden="true">
          <span>Edificio</span>
          <div>{ready && marks.map((mark, index) => <span key={index}>{number.format(mark)}</span>)}</div>
          <span>Lecturas</span>
        </div>
        <ul className="portal-chart-rows">
          {rows.map(row => <li key={row.id}>
            <button type="button" className="portal-chart-row" onClick={() => onSelect(String(row.id))}
              aria-label={ready ? `${row.Title}, ${row.count} ${row.count === 1 ? 'lectura realizada' : 'lecturas realizadas'}` : row.Title}>
              <span className="portal-chart-building">
                <BuildingMark key={logos[row.id] || row.id} src={logos[row.id]}/>
                <span>{row.Title}</span>
              </span>
              <span className="portal-chart-track" aria-hidden="true">
                {ready && <span style={{ width: row.count ? `max(2px, ${row.count / scale * 100}%)` : 0 }}/>}
              </span>
              <strong className="portal-chart-count">{ready ? number.format(row.count) : '—'}</strong>
              <ArrowRight size={15} className="portal-chart-arrow" aria-hidden="true"/>
            </button>
          </li>)}
        </ul>
      </>}
      {!rows.length && <p className="portal-chart-status" role="status">
        {buildingsError || (buildings ? 'No hay edificios habilitados para tu cuenta.' : 'Cargando edificios…')}
      </p>}
      {buildingsError && <button type="button" className="secondary" onClick={reloadBuildings}>Reintentar edificios</button>}
    </section>
  </div>;
}
