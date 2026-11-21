# Control desde el celular con QR — Plan de implementación

> Ejecución: nativa, en esta sesión (el usuario pidió "hazlo").

**Objetivo:** vincular teléfonos por QR y usar el panel completo en el celular.
**Arquitectura:** el servidor exige `X-PK-Clave` para peticiones que modifican (POST/PUT/DELETE) desde otros equipos; un script `clave.js` añade la cabecera a todo `fetch`. `movil.js` + `movil.css` añaden la ventana QR (computador) y la vista de celular (≤700 px) sin tocar el diseño de escritorio.
**Tecnología:** Node.js sin dependencias, JS/CSS plano, `qrcode-generator` (MIT) copiado en `public/`.
**Spec:** `docs/2026-11-20-control-movil-qr-design.md`

## Restricciones globales
- Nada nuevo depende de internet en tiempo de ejecución.
- El escritorio (>700 px) se ve igual que antes.
- GET / eventos / archivos siguen abiertos para el proyector y OBS en otros equipos.
- Las peticiones locales (loopback o IPs propias del equipo) nunca piden clave.
- Respaldo previo en `PK-PENTECOSTAL/respaldos/antes-control-movil/`.

## Puntos de revisión
1. Teléfono con clave vieja tras "Desvincular todos" → aviso de vincular, sin errores silenciosos.
2. El computador abre el panel por su IP de red (no localhost) → sigue sin pedir clave.
3. La subida de fondos (`PUT /api/subir`, cuerpo binario) desde el teléfono lleva la cabecera.
4. Wi-Fi caído → aviso visible y reconexión.
5. iPhone: inputs ≥16 px (sin zoom), safe-area.

### Tarea 1: Servidor — clave y autorización
Archivos: `server.js`
- `config.movil = { clave }` (24 hex, `crypto.randomBytes`), se crea si falta y se persiste.
- `esEquipo(req)`: loopback o IP en `localIPs()`; `PK_TEST_REMOTO=1` lo fuerza a false (solo pruebas).
- En `handle`: si `p` empieza por `/api/` y el método ≠ GET/HEAD y `!esEquipo(req)` y la cabecera ≠ clave → 403 `{error:'Teléfono no vinculado', vincular:true}`.
- `GET /api/movil/estado` → `{equipo:bool, vinculado:bool}` (clave por cabecera).
- `GET /api/movil` (solo equipo) → `{clave, ips, puerto}`; `POST /api/movil/renovar` (solo equipo) → clave nueva.
- Prueba: `docs/pruebas/prueba-movil.js` arranca el servidor en 7788 con `PK_TEST_REMOTO=1` y verifica 403 sin clave, 200 con clave, GET abierto, renovar invalida la vieja.

### Tarea 2: Cliente — clave.js
Archivos: `public/clave.js` (primer script del `<head>`)
- Lee `?vincular=` → `localStorage['pk-clave']`, limpia la URL con `history.replaceState`.
- Envuelve `window.fetch`: añade `X-PK-Clave` a peticiones del mismo origen.
- Tras cargar, consulta `/api/movil/estado`; si `!equipo && !vinculado` muestra la pantalla "Escanee el QR…".

### Tarea 3: Ventana "Conectar celular" (computador)
Archivos: `public/qrcode.js` (vendor), `public/movil.js`, `public/movil.css`, `control.html`
- Botón `#btnMovil` 📱 en `.live-ctrl`, oculto en celular.
- `<dialog id="dlgMovil">`: QR (SVG), dirección, selector de IP, "Desvincular todos", nota de Wi-Fi.

### Tarea 4: Vista de celular (≤700 px)
Archivos: `public/movil.css`, `public/movil.js`, `public/control.js` (expone `window.PK = { mover, limpiar }`)
- Sub-vistas Buscar / Diapositivas / Monitor (`body[data-mv]`), salto automático a Diapositivas al elegir en la biblioteca.
- Barra fija inferior: ◀ Ant · Negro · Ocultar · Limpiar · Sig ▶ (refleja estado `on`).
- Objetivos táctiles ≥48 px, inputs 16 px, safe-area, aviso de sin conexión.
- Verificación: capturas en Chrome headless a 390×844 y 1536×864 (escritorio sin cambios).

### Tarea 5: Firewall y cierre
- Regla de Windows Firewall entrante TCP 8888 (perfil privado/dominio), si hay permisos.
- Restaurar `config.json` de pruebas; actualizar el Manual/LEEME con "Conectar celular".
