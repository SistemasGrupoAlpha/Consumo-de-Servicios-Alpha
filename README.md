# Consumo de Servicios Alpha

## GitHub Pages

Configurado para desplegar React/Vite mediante `.github/workflows/deploy.yml`.
En Settings > Pages, seleccionar **GitHub Actions**.

La versión publicada en GitHub Pages tiene un botón **Entrar en modo demostración**. Los datos son ficticios y no se escriben en SharePoint.

## Desarrollo

```bash
npm install
npm run dev
```

## Producción

El backend `api/` se despliega en Vercel y obtiene sus variables de entorno de la configuración del servidor. Usá `.env.example` como referencia y las credenciales de la aplicación de Microsoft Entra de Eco Reportes. La aplicación necesita acceso al sitio `admingrupoalpha` y permiso de escritura en las listas que se administran desde Consumo.

`SP_HOSTNAME` y `SP_SITE_PATH` identifican el sitio. También podés usar `SP_SITE_URL`. Los nombres de lista de `.env.example` son los valores predeterminados. Para usar IDs directos, configurá `SP_SITE_ID` y los GUID de las listas. Estos valores también permiten conectar cuando la aplicación solo tiene permisos por lista y no puede enumerar el sitio.

La lista de usuarios propuesta es `ConsumoUsuarios`. Usá la columna estándar `Title` para el nombre de usuario y activá la restricción de valores únicos. Agregá las columnas de una línea de texto de Eco Reportes: `Nombre`, `Puesto`, `Equipo`, `Rol`, `Activo`, `PasswordHash`, `Intentos` y `BloqueoHasta`. Configurá `SESSION_SECRET` con un valor aleatorio de al menos 32 caracteres. Para iniciar sesión como primer administrador, configurá `BOOTSTRAP_ADMIN_USER` y `BOOTSTRAP_ADMIN_HASH` con el hash generado por `hashPassword` de `lib/auth.js`.

## Fotografías de SharePoint

Los logos y las fotos se sirven a través de `/api/fotos` usando la sesión de Consumo. Las fotos nuevas se guardan como adjuntos de la lectura en SharePoint. El navegador las convierte a JPEG antes de subirlas, con un límite de 3 MB por archivo. Habilitá los adjuntos en `LecturasMedidores` para poder guardar fotos nuevas.

Para habilitar la API de fotos, registrá el certificado público RSA de la organización en la aplicación de Entra de Eco Reportes. En **API permissions**, agregá el permiso de aplicación **SharePoint → Sites.Selected**, concedé el consentimiento administrativo y asigná a la app el rol `write` en el sitio `admingrupoalpha`. La aplicación sigue usando el secreto existente para Microsoft Graph. Para la API REST de SharePoint usa el certificado.

En Vercel, cargá el certificado público completo en `SP_PHOTOS_CERTIFICATE` y la clave privada PEM correspondiente en `SP_PHOTOS_PRIVATE_KEY`. Guardá la clave como variable sensible del entorno de servidor y redeplegá. La lectura de adjuntos y la captura se activan cuando ambas variables están presentes.
