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

export function readingNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text)) return null;
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function readingSummary(row, meterId) {
  return { id: String(row.id), meterId: String(meterId), month: readingMonth(row),
    date: String(row.FechaLectura ?? row.FechaLectura1 ?? '').slice(0, 10), initial: row.LecturaInicial, final: row.LecturaFinal,
    consumption: row.Consumo, rate: row.CuotaAplicada, total: row.TotalPagar };
}

export function previousReadingValue(readings, month, existing) {
  const previous = readings.filter(row => row.month && row.month < month && readingNumber(row.final) !== null)
    .sort((a, b) => b.month.localeCompare(a.month) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id, 'es', { numeric: true }))[0];
  return readingNumber(previous?.final ?? existing?.initial);
}

export function readingCharges(building, type, initial, final) {
  const water = normalize(type) === 'agua';
  const rate = readingNumber(water ? building?.CuotaAgua : building?.CuotaEnergia);
  const allowance = water ? Math.max(0, readingNumber(building?.CuotaCondonadaAgua) ?? 0) : 0;
  const last = readingNumber(final);
  const gross = initial === null || last === null || last < initial ? null : Number((last - initial).toFixed(9));
  const consumption = gross === null ? null : Number(Math.max(0, gross - allowance).toFixed(9));
  const amount = consumption === null || rate === null || rate < 0 ? null : consumption * rate;
  const total = amount === null || !Number.isFinite(amount) ? null : Math.round((amount + Number.EPSILON * amount) * 100) / 100;
  return { initial, final: last, rate, allowance, gross, consumption, total };
}

export function billedReadingFields(charges) {
  return { LecturaInicial: charges.initial, LecturaFinal: charges.final, Consumo: charges.consumption,
    CuotaAplicada: charges.rate, TotalPagar: charges.total, LimiteAgua: charges.allowance };
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

export function historyLocations(rows, buildings, directory, allowed) {
  const byBuildingId = new Map(buildings.map(row => [String(row.id), row]));
  return rows.flatMap(row => {
    const meter = directory.meterForReading(row);
    const buildingId = meter ? localBuildingId(meter) : localBuildingId(row);
    if (allowed && !allowed.has(buildingId)) return [];
    const building = byBuildingId.get(buildingId);
    const linkedLocal = directory.byLocalId.get(meterLocalId(meter ?? row));
    const local = linkedLocal && localBuildingId(linkedLocal) === buildingId ? linkedLocal : null;
    return [{
      ...row,
      EdificioHistorialId: buildingId,
      LocalHistorialId: local ? String(local.id) : '',
      MedidorHistorialId: String(meter?.id ?? readingMeterId(row)),
      UnidadMedida: row.UnidadMedida || meter?.UnidadMedida,
      NumeroSerie: row.NumeroSerie || meter?.NumeroSerie,
      Edificio: building?.Title || row.Edificio,
      Local: local?.Title,
      TipoMedidor: row.TipoMedidor || meter?.TipoMedidor,
    }];
  });
}

export function hasMonthlyReading(group, month) {
  return Boolean(month) && group.readings.some(row => row.month === month && readingNumber(row.final) !== null);
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
