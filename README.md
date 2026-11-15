# Portal IUB — Electroneumática, Electrohidráulica & FluidSIM 3D

Portal académico interactivo para el programa de **Mantenimiento Electromecánico (MEM)** e **Ingeniería Mecatrónica** de la **Institución Universitaria de Barranquilla (Unibarranquilla)**.

Incluye:
- **Vista pública (tipo blog/laboratorio)** en `/` con visor 3D interactivo (`Three.js`), galería de planos y diagramas, descarga directa de FluidSIM 4.2, 39 circuitos interactivos, videoteca YouTube y repositorio organizado por carpetas.
- **Panel de administración** en `/admin` protegido con sesión `HttpOnly`, protección CSRF, hash `scrypt`, limitación de intentos de acceso, validación de archivos por firma binaria y registro de auditoría.

---

## Requisitos

- **Node.js** `>= 18.0.0` (sin dependencias externas de `npm`).

---

## Ejecución local

```bash
npm start
```

Luego abre:
- Vista pública: `http://localhost:3000/`
- Panel admin: `http://localhost:3000/admin`

> Si es la primera vez y deseas personalizar credenciales iniciales mediante variables de entorno, usa `ADMIN_USER` y `ADMIN_PASS` antes de arrancar. En la primera sesión con credenciales por defecto (`admin` / `iub2026`), la consola `/admin` solicita cambiar la contraseña.

---

## Despliegue desde GitHub (Node.js)

Este repositorio está preparado para conectarse directamente desde GitHub a plataformas Node.js como **Render**, **Railway** o cualquier **VPS**:

- **Build command:** ninguno (o vacío; cero dependencias externas).
- **Start command:** `npm start`
- **Health check:** `/healthz`
- **Variables de entorno recomendadas:**
  - `PORT`: asignado automáticamente por el hosting (por defecto `3000`).
  - `ADMIN_USER`: usuario inicial del panel `/admin`.
  - `ADMIN_PASS`: contraseña inicial segura del panel `/admin`.

> Nota sobre planes gratuitos efímeros: si el servicio se reinicia o hace *redeploy* sin disco persistente, los cambios guardados en `data/iub_portal_data.json` o archivos subidos en `public/resources/` vuelven al último estado del repositorio. Usa **Exportar respaldo JSON** en `/admin` cuando edites contenido importante en modo demo.
