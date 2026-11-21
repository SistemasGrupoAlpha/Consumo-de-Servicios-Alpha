'use strict';

const { plano, cargarColumnas } = require('./columnas');
const { g } = require('./graph');
const { listId } = require('./consumo-sharepoint');

const building = ['Edificio', 'Edificio1', 'EdificioLookup'];
const meterType = ['TipoMedidor', 'Tipo de medidor', 'Tipo', 'Tipo de servicio', 'Servicio'];
const aliases = {
  edificios: {
    Title: [], Abreviatura: ['Abrev', 'Siglas'], CuotaAgua: ['Cuota de agua', 'Tarifa agua', 'Tarifa de agua'],
    CuotaEnergia: ['Cuota de energía', 'Tarifa energía', 'Tarifa de energía'], Activo: ['Estado'], Logo: ['Logotipo'],
    CantidadLocales: [], CuotaCondonadaAgua: [],
  },
  locales: {
    Title: [], Edificio: building, Cliente: ['Nombre cliente', 'Nombre del cliente', 'Arrendatario', 'Propietario'],
    MedidorEnergia: ['Medidor de energía', 'Medidor eléctrico'], MedidorAgua: ['Medidor de agua'],
    Metros2: ['Metros²', 'Metros cuadrados', 'Área', 'Área m2', 'm2'], DotacionAgua: ['Dotación de agua'], Observacion: ['Observaciones'], Activo: ['Estado'],
  },
  medidores: {
    Title: [], Edificio: building, Local: ['LocalLookup', 'Local1'], TipoMedidor: meterType,
    UnidadMedida: ['Unidad de medida', 'Unidad'], NumeroSerie: ['Número de serie', 'Serie', 'No. Serie'], Activo: ['Estado'],
  },
  lecturas: {
    Title: [], Edificio: building, Local: ['LocalLookup', 'Local1'], Medidor: ['MedidorLookup', 'Medidor1'],
    FechaLectura: ['FechaLectura1', 'Fecha de lectura'], Periodo: [], TipoMedidor: meterType,
    LecturaInicial: ['Lectura anterior'], LecturaFinal: ['Lectura actual'], Consumo: ['Consumo del período'],
    CuotaAplicada: ['Tarifa aplicada', 'Cuota'], TotalPagar: ['Total a pagar', 'Total'], Mes: [], Anio: ['Año'], LimiteAgua: [],
  },
  accesos: {
    Title: [], Correo: ['Correo electrónico', 'Email', 'Usuario', 'CorreoUsuario', 'Correo del usuario'], Edificio: building, Activo: ['Estado'],
  },
};

const fallbackLookups = {
  Edificio1: 'SP_LIST_EDIFICIOS', EdificioLookup: 'SP_LIST_EDIFICIOS',
  LocalLookup: 'SP_LIST_LOCALES', MedidorLookup: 'SP_LIST_MEDIDORES',
};
const cachedColumns = new Map();
const ttl = 5 * 60 * 1000;

async function columnsFor(site, list) {
  const key = `${site}/${list}`;
  const cached = cachedColumns.get(key);
  if (cached?.expires > Date.now()) return cached.columns;
  const columns = await cargarColumnas(g, encodeURIComponent(site), list);
  cachedColumns.set(key, { columns, expires: Date.now() + ttl });
  return columns;
}

function mapColumns(kind, columns, items = []) {
  const names = new Map(columns.map(column => [column.name, column]));
  const labels = new Map(columns.filter(column => !column.hidden).map(column => [plano(column.displayName), column]));
  const populated = new Set(items.flatMap(item => Object.entries(item.fields ?? {})
    .filter(([, value]) => value != null && value !== '').map(([name]) => name)));
  const result = new Map();
  for (const [field, alternatives] of Object.entries(aliases[kind])) {
    const candidates = [field, ...alternatives].flatMap(candidate => [names.get(candidate), labels.get(plano(candidate))]).filter(Boolean);
    const column = candidates.find(({ name, lookup }) => (lookup || fallbackLookups[name]) && populated.has(`${name}LookupId`))
      ?? candidates.find(({ name }) => populated.has(name) || populated.has(`${name}LookupId`))
      ?? candidates[0];
    if (column) result.set(field, column);
  }
  return result;
}

async function resolveLookups(site, mapping, items, getItems) {
  const lookups = new Map();
  const requests = new Map();
  await Promise.all([...mapping].map(async ([field, column]) => {
    const idField = `${column.name}LookupId`;
    if (!items.some(item => item.fields?.[idField])) return;
    const fallback = fallbackLookups[column.name];
    const target = column.lookup?.listId ?? (fallback && await listId(site, fallback));
    if (!target) return;
    const list = target.replace(/[{}]/g, '');
    const name = column.lookup?.columnName || 'Title';
    const key = `${list}/${name}`;
    if (!requests.has(key)) {
      requests.set(key, getItems(site, list, name).then(rows => new Map(rows.map(item => [String(item.id), item.fields?.[name]]))));
    }
    lookups.set(field, await requests.get(key));
  }));
  return lookups;
}

function readItems(kind, items, mapping, lookups) {
  return items.map(({ id, fields = {} }) => {
    const row = { ...fields, id };
    for (const [field, column] of mapping) {
      const value = fields[column.name];
      const values = lookups.get(field);
      const lookupId = fields[`${column.name}LookupId`];
      if (values && Array.isArray(lookupId)) {
        row[field] = lookupId.map(id => values.get(String(id))).filter(value => value != null).join(', ') || value;
      } else {
        row[field] = values?.get(String(lookupId)) ?? value;
      }
    }
    if (kind === 'accesos' && !row.Correo) {
      const correo = [row.Usuario, row.Title].find(value => typeof value === 'string' && /^\S+@\S+\.\S+$/.test(value.trim()));
      if (correo) row.Correo = correo;
    }
    if (kind === 'lecturas') {
      row.FechaLectura ??= fields.FechaLectura1;
      row.Edificio ??= fields.Edificio1;
    }
    return row;
  });
}

module.exports = { columnsFor, mapColumns, resolveLookups, readItems };
