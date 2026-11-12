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

El backend `api/` requiere despliegue en Vercel y variables de entorno del archivo `.env.example`. No subir secretos al repositorio. El archivo `lib/sp.js` procede de Eco Reportes y depende de `data/seed.json`, que no fue proporcionado; se deberá adaptar el módulo de usuarios antes de activar autenticación real.
