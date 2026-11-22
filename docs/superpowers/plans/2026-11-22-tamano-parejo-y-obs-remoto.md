# Tamaño parejo en las canciones y OBS en otro equipo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todas las canciones se proyecten con el mismo tamaño de letra (partiendo estrofas largas y limpiando la letra) y que el panel maneje un OBS instalado en otro computador de la red.

**Architecture:** Un módulo puro nuevo `public/letra.js` limpia y reparte la letra en diapositivas de máximo N renglones (lo usa el panel, que también es la vista del celular). `salida.html` usa en canciones un tamaño fijo calculado para N renglones de referencia. Para OBS remoto, `obs.js` construye las URLs de las fuentes de navegador con la IP de este equipo en la red de OBS, y el servidor ofrece `GET /api/obs/buscar` para encontrar OBS en la red.

**Tech Stack:** Node.js 24 (servidor sin dependencias), navegador/Electron 45, OBS WebSocket v5. Pruebas: scripts Node en `electron/` (estilo de `electron/pruebas.js`, con `ok(cond, texto)`), y Electron sin ventana para la salida y el panel.

**Spec:** `docs/superpowers/specs/2026-11-22-tamano-parejo-y-obs-remoto-design.md`

## Global Constraints

- `lineasMax` en el estilo: por defecto **6**, rango **2–12**, etiqueta «Líneas por diapositiva».
- Referencia de renglón: **42** letras.
- Reparto **parejo**: 8 líneas → 4+4; 13 con N=6 → 5+4+4.
- Limpieza solo al mostrar: **no** se reescriben los archivos de cancioneros.
- La casilla «Mismo tamaño de letra» (`tamUniforme`) sigue controlando la Biblia como hoy.
- Escaneo de OBS: puerto **4455**, solo /24 de las IP propias, **300 ms** por intento, en paralelo; solo para el propio computador (`esEquipo`), como `/api/obs/local`.
- Textos de la interfaz en español; añadir su traducción en `public/i18n-en.js`.
- Sin dependencias nuevas.

## Review Focus

1. Estrofa con marcador de himnario en la primera línea («Coro», «II»): el marcador no cuenta como renglón y solo la primera parte lo lleva → prueba en Task 1.
2. Línea con `//` pegadas o sueltas («//Aleluya//», «Gloria //», una línea que es solo «//») → limpia, sin líneas vacías sobrantes → prueba en Task 1.
3. Canción de una sola estrofa corta (hoy salía a 96 px): debe salir del mismo tamaño que las demás → prueba en Task 2.
4. Cambiar «Líneas por diapositiva» con una canción abierta: las diapositivas se recalculan sin volver a elegir la canción → paso en Task 3.
5. OBS remoto con la fuente ya creada con `http://pkipuc.localhost/capa`: se corrige la URL, no se duplica → prueba en Task 4.

---

### Task 1: Módulo de letra (`public/letra.js`)

**Files:**
- Create: `PK-PENTECOSTAL/public/letra.js`
- Create: `electron/prueba-letra.js`
- Modify: `package.json` (script `"probar-letra": "node electron/prueba-letra.js"`)

**Interfaces:**
- Produces (en `window.PKLetra` y `module.exports`):
  - `limpiarLinea(l: string) -> string` — quita espacios al inicio/fin, todas las `/` de repetición (`//`, `/` sueltas junto a espacios o extremos; no las que están entre letras como «y/o»), y espacios dobles.
  - `renglones(l: string, porRenglon = 42) -> number` — `max(1, ceil(l.length / porRenglon))`.
  - `estrofas(le: string, lineasMax = 6) -> string[]` — normaliza `\r\n`, separa por líneas en blanco (también las que solo tienen espacios o `//`), limpia cada línea, descarta vacías, y parte cada estrofa cuyo total de renglones pase de `lineasMax` en el mínimo número de partes con renglones lo más parejos posible (sin partir una línea). Un marcador inicial (regex de `sinMarcador` en `control.js:311`) no cuenta y queda solo en la primera parte.
  - `ES_MARCADOR: RegExp` — la misma regex de `sinMarcador`.

- [ ] **Step 1: Write the failing tests** en `electron/prueba-letra.js` (carga `../PK-PENTECOSTAL/public/letra.js` con `require`):
  - `limpiarLinea('  //Una nube de victoria//  ') === 'Una nube de victoria'`
  - `limpiarLinea('Gloria a Dios //') === 'Gloria a Dios'`, `limpiarLinea('y/o') === 'y/o'`, `limpiarLinea('//') === ''`
  - `estrofas('a\n \nb\n//\nc')` → `['a', 'b', 'c']` (línea con espacio o solo `//` separa estrofas o desaparece)
  - 8 líneas cortas, N=6 → 2 partes de 4 y 4
  - 13 líneas cortas, N=6 → partes de 5, 4, 4
  - 6 líneas cortas, N=6 → 1 parte
  - `'Coro\n' + 6 líneas` con N=6 → 1 parte que empieza por «Coro»; `'Coro\n' + 8 líneas` → 2 partes, solo la primera empieza por «Coro»
  - Línea de 100 letras cuenta 3 renglones: 4 de esas con N=6 → 2 partes de 2
  - Recorre todos los cancioneros de `cancioneros/*.js` (`vm`, `jscanciones`) con N=6: ninguna diapositiva pasa de 6 renglones (sin contar marcador), ninguna línea empieza con espacio ni contiene `//`.

- [ ] **Step 2: Run** `node electron/prueba-letra.js` — Expected: FAIL (no existe `letra.js`).
- [ ] **Step 3: Implement** `PK-PENTECOSTAL/public/letra.js` con las funciones del bloque Interfaces (envoltura `(function (g) { … g.PKLetra = api; if (typeof module === 'object') module.exports = api; })(typeof window !== 'undefined' ? window : globalThis)`).
- [ ] **Step 4: Run** `node electron/prueba-letra.js` — Expected: `✔ Todas las pruebas de letra pasaron`.
- [ ] **Step 5: Commit** `git add PK-PENTECOSTAL/public/letra.js electron/prueba-letra.js package.json && git commit -m "Letra: limpieza y reparto parejo de estrofas"`

### Task 2: Tamaño fijo en la salida (`salida.html`)

**Files:**
- Modify: `PK-PENTECOSTAL/public/salida.html:60` (CSS), `:192-221` (`tamUniforme`/`ajustarIgual`), `:246`, `:270`
- Modify: `PK-PENTECOSTAL/server.js:172-181` (`DEFAULT_STYLE.lineasMax: 6`)
- Create: `electron/prueba-tamano.js`
- Modify: `package.json` (script `"probar-tamano": "electron electron/prueba-tamano.js"`)

**Interfaces:**
- Consumes: diapositivas ya repartidas (Task 1) en `vivo.texto` / `vivo.grupo`.
- Produces: `tamCancion(est, txtEl, cont, maxPx, minPx) -> number` en `salida.html`: tamaño que le sirve a una diapositiva de referencia de `est.lineasMax || 6` líneas de 42 letras (frase fija en español, p. ej. `'Cantaré de tu amor por siempre mi Señor'` rellenada a 42) en ese contenedor; cacheado por `[ancho, alto, maxPx, estilo]`.

- [ ] **Step 1: Write the failing test** `electron/prueba-tamano.js` (proceso principal de Electron): arranca `PK-PENTECOSTAL/server.js` con `PK_DATA_ROOT` temporal y `PORT_WEB=0`, abre `BrowserWindow` oculta 1920×1080 en `http://localhost:<puerto>/salida?modo=pantalla&quedarse=1`, y por cada caso hace `POST /api/vivo` con `{ tipo:'cancion', texto, grupo }` (diapositivas sacadas con `PKLetra.estrofas(le, 6)` de: una canción de una sola estrofa corta, una de líneas largas, la estrofa de 41 líneas de `Canciones.js` y 3 canciones al azar de cada cancionero) y lee `getComputedStyle(document.querySelector('.slide.in .txt')).fontSize`. Afirmaciones:
  - todas las diapositivas de todos los casos tienen **el mismo** `fontSize` (tolerancia 0,5 px), salvo las marcadas por la red de seguridad (se cuentan y se imprimen; deben ser 0 en los cancioneros de fábrica);
  - repetir con `modo=obs` (tercio inferior): mismo criterio.
- [ ] **Step 2: Run** `npx electron electron/prueba-tamano.js` — Expected: FAIL (tamaños distintos).
- [ ] **Step 3: Implement**: en canciones (`vivo.tipo === 'cancion'`) `slide._fit` llama `ajustar(txt, box, tamCancion(...), minPx)` (la red de seguridad es el propio `ajustar` con ese máximo); Biblia y texto siguen con `ajustarIgual`. CSS: `.txt.cancion .l { white-space: normal; text-wrap: balance; }`. `DEFAULT_STYLE.lineasMax = 6`.
- [ ] **Step 4: Run** `npx electron electron/prueba-tamano.js` — Expected: `✔ Mismo tamaño en todas las canciones` en pantalla y en OBS.
- [ ] **Step 5: Commit** `git commit -m "Salida: un solo tamaño de letra para todas las canciones"`

### Task 3: Panel usa `letra.js` y el ajuste «Líneas por diapositiva»

**Files:**
- Modify: `PK-PENTECOSTAL/public/control.html:21-25` (cargar `/letra.js` antes de `control.js`), `:199` (nuevo rango)
- Modify: `PK-PENTECOSTAL/public/control.js:292-294` (`estrofas`), `:733-742` (recalcular al cambiar `lineasMax`)
- Modify: `PK-PENTECOSTAL/public/i18n-en.js` (`'Líneas por diapositiva': 'Lines per slide'` y su `title`)

**Interfaces:**
- Consumes: `PKLetra.estrofas(le, lineasMax)` (Task 1); `estado.estilo.lineasMax` (Task 2).

- [ ] **Step 1: Write the failing test**: en `electron/prueba-tamano.js` añadir un caso de panel: abrir `http://localhost:<p>/?quedarse=1`, elegir por `#listaCanciones` la canción de 41 líneas de `Canciones.js` y comprobar `document.querySelectorAll('#items .slide').length` = `PKLetra.estrofas(le, 6).length`; luego `POST /api/estilo {lineasMax: 4}` y comprobar que el número de diapositivas cambia a `PKLetra.estrofas(le, 4).length` sin volver a elegir la canción.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**: `estrofas(le)` de `control.js` pasa a `PKLetra.estrofas(le, (estado && estado.estilo && estado.estilo.lineasMax) || 6)` (también la usa `cargarTexto`). En el bloque `cambioEstilo` de `control.js:733`, si cambió `lineasMax` y `ctx?.tipo === 'cancion' && CAN.actual`, llamar `abrirCancion(CAN.actual)`. En `control.html`, junto a «Mismo tamaño de letra»: `<div class="f"><label title="Una estrofa más larga se reparte en varias diapositivas para que todas las canciones salgan del mismo tamaño">Líneas por diapositiva <output></output></label><input type="range" min="2" max="12" data-k="lineasMax"></div>`.
- [ ] **Step 4: Run** `npx electron electron/prueba-tamano.js` y `node electron/pruebas.js` — Expected: ambos pasan.
- [ ] **Step 5: Commit** `git commit -m "Panel: canciones repartidas en diapositivas parejas (Líneas por diapositiva)"`

### Task 4: OBS en otro equipo

**Files:**
- Modify: `PK-PENTECOSTAL/obs/obsws.js` (helper puro), `PK-PENTECOSTAL/obs/obs.js:409-440` (mensajes y diálogo ⚙), `:484-494` (capa), `PK-PENTECOSTAL/obs/stingers.js:371-386` (stinger)
- Modify: `PK-PENTECOSTAL/server.js` (ruta `GET /api/obs/buscar`, junto a `/api/obs/local`)
- Create: `electron/obs-falso.js` (sacar el OBS simulado de `electron/prueba-obs.js` y ampliarlo: registra cada petición `{requestType, requestData}` en `srv.peticiones`; responde `GetCurrentProgramScene` → `{currentProgramSceneName:'Escena'}`, `GetSceneList` → una escena, `CreateInput` → `{sceneItemId:1}` o error `601` si el nombre ya existe, `GetInputSettings` → los guardados, `SetInputSettings` → guarda)
- Modify: `electron/prueba-obs.js` (usa `obs-falso.js`; casos nuevos)

**Interfaces:**
- Produces:
  - `OBSWS.ipPara(hostOBS: string, ips: string[]) -> string` (estática): la IP de `ips` con los mismos 3 primeros octetos que `hostOBS`; si no hay, la primera; si `hostOBS` es local, `null`.
  - `GET /api/obs/buscar` → `{ encontrados: [{ ip, propio: boolean }] }`; 403 si no es el propio equipo. Variables solo para pruebas: `PK_OBS_REDES` (lista de prefijos `a.b.c` separados por coma, reemplaza las redes propias) y `PK_OBS_PUERTO` (puerto a probar).
  - En `obs.js`: `async function baseURLParaOBS() -> string` — `location.origin` si OBS es local; si no, `http://${OBSWS.ipPara(host, info.ips)}:${info.puerto}` con `info = await api('/api/info')`.

- [ ] **Step 1: Write the failing tests** en `electron/prueba-obs.js`:
  - `OBSWS.ipPara('192.168.0.50', ['192.168.56.1','192.168.0.12']) === '192.168.0.12'`; `OBSWS.ipPara('10.0.0.9', ['192.168.0.12']) === '192.168.0.12'`; `OBSWS.ipPara('localhost', [...]) === null`.
  - Con el servidor de prueba y `PK_OBS_REDES=127.0.0`, `PK_OBS_PUERTO=<puerto del OBS falso>`: `GET /api/obs/buscar` incluye `127.0.0.1`; con `PK_TEST_REMOTO=1` → 403.
  - Panel en Electron (como el E2E de la 2.0.4) con `pp.obs = {host: <IP LAN propia>, puerto: <OBS falso escuchando en 0.0.0.0>, clave}`: clic en `#btnAddCapa` → el OBS falso recibió `CreateInput` con `inputSettings.url === 'http://<IP LAN>:<puerto PK>/capa'`. Segundo clic (ya existe, 601) → recibió `SetInputSettings` con esa URL y no hay un segundo input.
- [ ] **Step 2: Run** `node electron/prueba-obs.js` — Expected: FAIL.
- [ ] **Step 3: Implement**:
  - `OBSWS.ipPara` en `obsws.js`.
  - `/api/obs/buscar` en `server.js`: `net.connect` a cada `prefijo.1..254:4455` con `setTimeout(300)`, todos en paralelo por red; `propio` si la IP es de `localIPs()`.
  - `obs.js`: `#btnAddCapa` usa `await baseURLParaOBS() + '/capa'`; en error 601 → `SetInputSettings({ inputName:'PK-PENTECOSTAL · Capa', inputSettings:{ url } })` y toast «Capa actualizada con la dirección de este equipo». `stingers.js` hace lo mismo con `/stinger` (expone `PP.baseURLParaOBS` desde `obs.js`); si `existe`, también `SetInputSettings` con la URL.
  - Diálogo ⚙: botón `Buscar OBS en la red` que llama `/api/obs/buscar` y muestra cada IP como botón que rellena `#ocH` (puerto 4455); si no hay: «No se encontró OBS en la red. Revise que OBS esté abierto con el servidor WebSocket habilitado».
  - En `conectar()`, si el host no es local y el error es de conexión: `No se pudo conectar con OBS en ${host}:${puerto}. En ese computador: OBS abierto, Herramientas → Ajustes del servidor WebSocket → Habilitar, y permita OBS en el Firewall de Windows.`
  - Textos nuevos en `i18n-en.js`.
- [ ] **Step 4: Run** `node electron/prueba-obs.js` — Expected: `✔ Todas las pruebas de OBS pasaron`.
- [ ] **Step 5: Commit** `git commit -m "OBS en otro equipo: capas con la IP de este equipo y búsqueda en la red"`

### Task 5: Manual y verificación final

**Files:**
- Modify: `docs/manual/manual.html` (sección de estilo: «Líneas por diapositiva»; 12.2: OBS en otro computador con «Buscar OBS en la red» y firewall), `Manual PK-PENTECOSTAL.pdf` (regenerar con `node docs/manual/generar-pdf.js`), `README.md`, `PK-PENTECOSTAL/LEEME.txt`, `docs/2026-11-21-informe-v2.0.0.md` (sección 10 de la 2.0.5 ampliada)

- [ ] **Step 1:** Editar los textos y regenerar el PDF — Expected: `✓ PDF creado … páginas`.
- [ ] **Step 2: Run** todas las pruebas: `node electron/pruebas.js`, `node electron/prueba-obs.js`, `node electron/prueba-letra.js`, `npx electron electron/prueba-tamano.js` — Expected: todas pasan.
- [ ] **Step 3:** Prueba real: panel en Electron con el OBS de este equipo conectado por la IP de la red (`192.168.0.12`) como si fuera remoto; añadir capa; ver en OBS (`GetInputSettings`) la URL con la IP.
- [ ] **Step 4: Commit** `git commit -m "Manual: líneas por diapositiva y OBS en otro equipo"`
