'use strict';
/* SharePoint, al importar una lista desde Excel, puede nombrar las columnas por dentro «field_1», «field_2»…
   (el nombre interno no se puede cambiar). Estas funciones encuentran cada columna por su nombre interno
   o, si no coincide, por su NOMBRE VISIBLE, así la app funciona con las listas tal como quedaron. */
const plano = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

async function cargarColumnas(g, sid, list) {
  const cols = []; let url = `/sites/${sid}/lists/${encodeURIComponent(list)}/columns`;
  while (url) { const r = await g(url); cols.push(...r.value); url = r['@odata.nextLink'] || null; }
  return cols;
}
/** esperadas = nombres «canónicos» que usa la app. Devuelve cómo se llama cada una por dentro en SharePoint. */
function mapaDeColumnas(cols, esperadas) {
  const toInt = {}, toCan = {}, porNombre = {};
  for (const c of cols) porNombre[c.name] = c;
  for (const e of esperadas) {
    const col = porNombre[e] || cols.find(c => plano(c.displayName) === plano(e) && !c.hidden && !c.readOnly);
    if (col) { toInt[e] = col.name; toCan[col.name] = e; }
  }
  return { toInt, toCan, cols };
}
module.exports = { plano, cargarColumnas, mapaDeColumnas };
