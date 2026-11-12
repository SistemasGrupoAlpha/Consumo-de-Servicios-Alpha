'use strict';
/* Estructura esperada de las listas de SharePoint (t = una línea de texto, m = varias líneas en texto sin formato). */
module.exports = {
  EcoUsuarios: { env: 'SP_LIST_USERS', cols: { Title: 't', Nombre: 't', Puesto: 't', Equipo: 't', Rol: 't', Activo: 't', PasswordHash: 't', Intentos: 't', BloqueoHasta: 't' }, indexed: [] },
  EcoReportes: { env: 'SP_LIST_REPORTS', cols: { Title: 't', Fecha: 't', Usuario: 't', Nombre: 't', Puesto: 't', Equipo: 't', Obs: 'm', Cerrado: 't', Actualizado: 't' }, indexed: ['Fecha', 'Usuario'] },
  EcoReporteItems: { env: 'SP_LIST_ITEMS', cols: { Title: 't', Fecha: 't', Usuario: 't', TareaId: 't', Estado: 't', Descripcion: 'm', Fotos: 'm', Actualizado: 't' }, indexed: ['Fecha', 'Usuario'] },
  EcoAsignaciones: { env: 'SP_LIST_ASSIGN', cols: { Title: 't', Fecha: 't', TareaId: 't', Usuarios: 't' }, indexed: [] },
  EcoCatalogo: { env: 'SP_LIST_CATALOG', cols: { Title: 't', Tipo: 't', Datos: 'm', Autor: 't', Actualizado: 't' }, indexed: [] }
};
