'use strict';

const { columnsFor, mapColumns } = require('./consumo-columnas');
const { listId } = require('./consumo-sharepoint');
const { g } = require('./graph');
const { fail } = require('./http');

async function readingUpdates(site, list, input) {
  const columns = await columnsFor(site, list);
  const mapped = mapColumns('lecturas', columns);
  const byName = new Map(columns.map(column => [column.name, column]));
  const updates = {};
  if (Object.hasOwn(input, 'MedidorId')) {
    const meterId = String(input.MedidorId);
    if (!/^\d+$/.test(meterId)) throw fail(400, 'Seleccioná un medidor válido.');
    const meters = await listId(site, 'SP_LIST_MEDIDORES');
    const { fields } = await g(`/sites/${encodeURIComponent(site)}/lists/${encodeURIComponent(meters)}/items/${meterId}?$expand=fields`);
    const meter = byName.get('MedidorLookup') ?? mapped.get('Medidor');
    if (!meter?.lookup || meter.readOnly) throw fail(500, 'No se encontró la relación del medidor en Lecturas.');
    updates[`${meter.name}LookupId`] = meterId;
    const links = [
      [byName.get('Edificio1') ?? mapped.get('Edificio'), fields?.Edificio1LookupId ?? fields?.EdificioLookupLookupId],
      [mapped.get('Local'), fields?.LocalLookupLookupId ?? fields?.LocalLookupId],
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

module.exports = { readingUpdates };
