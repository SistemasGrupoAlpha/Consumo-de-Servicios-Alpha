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
  return JSON.stringify([localBuildingId(meter), meterLocalId(meter), normalize(meter.TipoMedidor), normalize(meter.Title) || String(meter.id), normalize(meter.NumeroSerie)]);
}

export function registrationDirectory(locals, meters) {
  const byLocalId = new Map(locals.map(row => [String(row.id), row]));
  const byMeterId = new Map(meters.map(row => [String(row.id), row]));
  const localCodes = new Map();
  const meterGroups = new Map();
  const scopedMeters = new Map();
  const codeKey = (building, title) => JSON.stringify([building, normalize(title)]);
  function add(index, key, value) {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(value);
  }
  for (const local of locals) {
    if (localBuildingId(local) && normalize(local.Title)) add(localCodes, codeKey(localBuildingId(local), local.Title), local);
  }
  function localInBuilding(local, building) {
    if (!local || !building) return;
    if (localBuildingId(local) === building) return local;
    const matches = localCodes.get(codeKey(building, local.Title));
    if (matches?.length === 1) return matches[0];
  }
  for (const meter of meters) {
    const rawLocal = byLocalId.get(meterLocalId(meter));
    const building = localBuildingId(meter) || (rawLocal && localBuildingId(rawLocal));
    const local = localInBuilding(rawLocal, building);
    if (!local) continue;
    const scoped = { ...meter, EdificioLookupLookupId: building, LocalLookupLookupId: String(local.id) };
    scopedMeters.set(String(meter.id), scoped);
    add(meterGroups, meterGroupKey(scoped), scoped);
  }
  function meterForReading(row) {
    const id = readingMeterId(row);
    const source = byMeterId.get(id);
    if (!source) return;
    const scoped = scopedMeters.get(id);
    const building = localBuildingId(row) || (scoped && localBuildingId(scoped));
    const rawLocal = byLocalId.get(meterLocalId(row)) ?? byLocalId.get(meterLocalId(source));
    const local = localInBuilding(rawLocal, building);
    if (!local) return;
    const localId = String(local.id);
    if (scoped && localBuildingId(scoped) === building && meterLocalId(scoped) === localId) return scoped;
    const matches = meterGroups.get(meterGroupKey({ ...source, EdificioLookupLookupId: building, LocalLookupLookupId: localId }));
    if (matches?.length === 1) return matches[0];
  }
  return { byLocalId, scopedMeters, meterForReading };
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
