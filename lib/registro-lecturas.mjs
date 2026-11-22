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
