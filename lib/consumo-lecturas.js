'use strict';

const { columnsFor, mapColumns } = require('./consumo-columnas');
const { listId } = require('./consumo-sharepoint');
const { g } = require('./graph');
const { dateOk, fail } = require('./http');

async function catalogItem(site, kind, id) {
  const list = await listId(site, `SP_LIST_${kind.toUpperCase()}`);
  const path = `/sites/${encodeURIComponent(site)}/lists/${encodeURIComponent(list)}/items/${id}?$expand=fields`;
  const [item, columns] = await Promise.all([g(path), columnsFor(site, list)]);
  const row = { ...item.fields, id: item.id, etag: item.eTag ?? item.fields?.['@odata.etag'] };
  for (const [name, column] of mapColumns(kind, columns, [item])) row[name] = item.fields?.[column.name];
  return row;
}

async function registrationFields(site, list, input, {local, meter}) {
  const { EdificioId, LocalId, MedidorId, Servicio, FechaLectura, LecturaInicial, LecturaFinal } = input;
  if (![EdificioId, LocalId, MedidorId].every(id => typeof id === 'string' && /^\d+$/.test(id))) {
    throw fail(400, 'Seleccioná un edificio, un local y un medidor.');
  }
  if (!dateOk(FechaLectura) || new Date(`${FechaLectura}T12:00:00Z`).toISOString().slice(0, 10) !== FechaLectura) {
    throw fail(400, 'Ingresá una fecha válida para la lectura.');
  }
  const readings = [LecturaInicial, LecturaFinal].map(value => {
    const text = String(value ?? '').trim();
    return text ? Number(text.replace(',', '.')) : NaN;
  });
  if (!readings.every(Number.isFinite)) throw fail(400, 'Ingresá la lectura inicial y final del medidor.');
  const { localBuildingId, localHasService, meterHasService, meterLocalId } = await import('./registro-lecturas.mjs');
  if (!local || localBuildingId(local) !== EdificioId || !localHasService(local, Servicio)) {
    throw fail(400, 'El local no tiene habilitado ese servicio en el edificio seleccionado.');
  }
  if (!meter || meterLocalId(meter) !== LocalId || !meterHasService(meter, Servicio) || localBuildingId(meter) !== EdificioId) {
    throw fail(400, 'El medidor no corresponde al local y servicio seleccionados.');
  }
  return readingUpdates(site, list, {
    Title: `${meter.Title || local.Title || 'Medidor'} - ${FechaLectura}`.slice(0, 255),
    MedidorId, FechaLectura, TipoMedidor: meter.TipoMedidor,
    Periodo: FechaLectura.slice(0, 7),
    LecturaInicial: readings[0], LecturaFinal: readings[1],
  }, meter, { building: EdificioId, local: LocalId });
}

async function readingUpdates(site, list, input, meterFields, selectedLinks) {
  const columns = await columnsFor(site, list);
  const mapped = mapColumns('lecturas', columns);
  const byName = new Map(columns.map(column => [column.name, column]));
  const updates = {};
  if (Object.hasOwn(input, 'MedidorId')) {
    const meterId = String(input.MedidorId);
    if (!/^\d+$/.test(meterId)) throw fail(400, 'Seleccioná un medidor válido.');
    const fields = meterFields ?? await catalogItem(site, 'medidores', meterId);
    const meter = byName.get('MedidorLookup') ?? mapped.get('Medidor');
    if (!meter?.lookup || meter.readOnly) throw fail(500, 'No se encontró la relación del medidor en Lecturas.');
    updates[`${meter.name}LookupId`] = meterId;
    const links = [
      [byName.get('Edificio1') ?? mapped.get('Edificio'), selectedLinks?.building ?? fields.Edificio1LookupId ?? fields.EdificioLookupLookupId],
      [mapped.get('Local'), selectedLinks?.local ?? fields.LocalLookupLookupId ?? fields.LocalLookupId],
    ];
    for (const [column, value] of links) {
      if (column?.lookup && !column.readOnly && value != null) updates[`${column.name}LookupId`] = String(value);
    }
  }
  for (const [field, value] of Object.entries(input)) {
    const column = field === 'FechaLectura' ? byName.get('FechaLectura1') ?? mapped.get(field) : mapped.get(field) ?? byName.get(field);
    if (!column || column.readOnly || column.lookup || column.calculated) continue;
    if (column.number || column.currency) {
      const number = value === '' || value == null ? null : Number(String(value).trim().replace(',', '.'));
      if (number != null && !Number.isFinite(number)) throw fail(400, `${column.displayName} debe ser un número.`);
      updates[column.name] = number;
    } else if (column.dateTime && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      updates[column.name] = `${value}T12:00:00Z`;
    } else {
      updates[column.name] = value === '' && column.dateTime ? null : value;
    }
  }
  return updates;
}

module.exports = { catalogItem, readingUpdates, registrationFields };
