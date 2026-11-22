export const readingServices = {
  agua: { label: 'Agua', field: 'MedidorAgua' },
  energia: { label: 'Energía', field: 'MedidorEnergia' },
};

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isEnabled(value) {
  return ['si', 'true', '1'].includes(normalize(value));
}

export function localHasService(local, service) {
  if (!local || !Object.hasOwn(readingServices, service)) return false;
  return isEnabled(local[readingServices[service].field]);
}

export function localBuildingId(local) {
  return String(local.EdificioLookupLookupId ?? local.Edificio1LookupId ?? local.EdificioLookupId ?? '');
}

export function meterLocalId(meter) {
  return String(meter.LocalLookupLookupId ?? meter.LocalLookupId ?? '');
}

export function meterHasService(meter, service) {
  return Object.hasOwn(readingServices, service) && normalize(meter.TipoMedidor) === service;
}

export function readingMeterId(row) {
  return String(row.MedidorLookupLookupId ?? row.MedidorLookupId ?? '');
}

export function readingMonth(row) {
  const month = String(row.FechaLectura ?? row.FechaLectura1 ?? '').slice(0, 7);
  const valid = /^\d{4}-(?:0[1-9]|1[0-2])$/;
  return valid.test(month) ? month : valid.test(row.Periodo) ? row.Periodo : '';
}

export function meterGroupKey(meter) {
  return JSON.stringify([meterLocalId(meter), normalize(meter.TipoMedidor), normalize(meter.Title) || String(meter.id), normalize(meter.NumeroSerie)]);
}

export function metersWithHistory(meters, readings) {
  const metersById = new Map(meters.map(meter => [String(meter.id), meter]));
  const groups = new Map();
  const sorted = [...readings].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, 'es', { numeric: true }));
  for (const reading of sorted) {
    const meter = metersById.get(reading.meterId);
    if (!meter) continue;
    const key = meterGroupKey(meter);
    if (!groups.has(key)) groups.set(key, { key, meter, readings: [] });
    groups.get(key).readings.push(reading);
  }
  return [...groups.values()];
}
