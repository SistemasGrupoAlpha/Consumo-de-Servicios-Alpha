# Consumo de Servicios — Grupo Alpha

Plataforma React responsive con backend serverless Node.js y Microsoft Graph. Se reutilizaron los módulos de autenticación, Graph y usuarios de Eco Reportes sin incluir secretos.

## Arranque

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar variables con **valores reales** de Entra y las listas.
3. `npm run dev` para el frontend. Para ejecutar las funciones `/api` localmente usar `npx vercel dev` (en lugar de Vite por separado).
4. Desplegar en Vercel configurando las mismas variables como Environment Variables.

## Importante

- `SP_LIST_USERS` permite reutilizar el modelo de usuarios de Eco Reportes; si se prefiere independencia total, crear una lista nueva con el mismo esquema.
- Los nombres de columnas en `src/main.jsx` son un **mapeo inicial** basado en las capturas. Confirmar nombres internos reales de SharePoint antes de guardar registros.
- Las listas pueden pertenecer a otro sitio distinto al de Eco Reportes: configurar `SP_SITE_ID` correspondiente y conceder permisos a la aplicación Entra.
- Los permisos Graph deben restringirse al mínimo necesario en producción; el registro Eco Reportes actual tiene Sites.ReadWrite.All.
- Exportación XLSX y PDF genérica lista; falta reproducir el diseño exacto de los reportes de referencia y sus reglas de cálculo.
- La API `api/data.js` limita la escritura a administradores; se requiere revisar autorizaciones por edificio y normalizar los campos relacionales antes de habilitar producción.
- El rol `Admin` del backend Eco Reportes es distinto a los roles `SuperAdmin`/`Administrador` mostrados en las capturas originales; falta acordar correspondencia.
- `api/users.js` usa el esquema original EcoUsuarios. No se guardan contraseñas en texto plano en SharePoint.
- **No usar en producción hasta validar los nombres internos de listas/columnas, las reglas de negocio y la autorización por edificio.**
