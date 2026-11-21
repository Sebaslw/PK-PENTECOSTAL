# Control desde el celular con QR — Diseño

Fecha: 2026-11-20 · Proyecto: PK-PENTECOSTAL

## Qué y por qué

Sebastián quiere manejar PK-PENTECOSTAL desde su teléfono (Android o iPhone), igual que el control remoto de Holyrics: con el teléfono en el mismo Wi-Fi que el computador, buscar una canción o un pasaje bíblico y proyectarlo con un toque. Para conectar el teléfono, se escanea un código QR que muestra el panel del computador.

Eligió adaptar **el panel completo** (opción B) para tener todo el programa en el celular, no solo un control simplificado.

## Objetivos

- Un apartado “Conectar celular” en el panel del computador. Muestra un QR y, debajo, la dirección escrita.
- Al escanear el QR, el panel completo se abre en el navegador del teléfono. No hay que instalar nada.
- En la pantalla del celular, el panel se puede usar con el dedo. Lo principal es fácil de manejar: buscar y proyectar canciones y Biblia, pasar a la diapositiva anterior o siguiente, poner la pantalla en negro y ocultar el texto.
- Las demás pestañas (Estilo, Fondos, Rótulos, OBS) también funcionan en el celular, aunque se vean más sencillas.
- Solo los teléfonos vinculados con el QR pueden cambiar lo que sale en el proyector.

## Lo que no se busca

- No es una app de tienda (Play Store o App Store); es una página web.
- No funciona por internet fuera de la red local.
- No es un rediseño del panel del computador.

## Sería un fracaso si…

- El panel del computador cambia de aspecto o deja de funcionar como hoy.
- Se rompe el proyector o OBS abiertos en otro equipo de la red, porque esos equipos solo leen y no deben pedir clave.
- Se necesita internet. En la iglesia puede no haber, así que todo funciona sin conexión externa.
- En el celular hay que hacer zoom o los botones son demasiado pequeños para tocarlos.

## Cómo funciona hoy (lo que encontré)

- `server.js` ya escucha en `0.0.0.0:8888` y `/api/info` devuelve las IPs locales. El panel ya muestra el texto “Desde otro equipo o celular en la misma red…” (`control.js:471`).
- El panel ya pasa a una sola columna por debajo de 980 px (`control.css:151`), pero no está pensado para un teléfono: tiene tres paneles apilados largos, botones pequeños y atajos de teclado que en el celular no existen.
- No hay ninguna clave: cualquier equipo de la red puede enviar `POST /api/vivo`. `/api/apagar` ya solo se permite desde el propio computador (`esLocal`).

## Enfoques considerados

- **A. Pantalla aparte solo para celular (`/movil`).** Sería más simple y rápida en el teléfono, pero solo tendría lo esencial. Sebastián no la eligió.
- **B. Adaptar el panel completo al celular. ✅ Elegido.** Tiene todo el programa en el teléfono. El riesgo es dañar el diseño del computador, y se controla porque todos los cambios van dentro de `@media (max-width: 700px)` y en código que solo se activa en pantallas pequeñas.

## Diseño

### 1. Vinculación con QR (seguridad)

- Al arrancar, el servidor crea una **clave de vinculación** aleatoria y la guarda en `config.json` (`movil.clave`), de modo que los teléfonos siguen vinculados después de reiniciar.
- El QR lleva a `http://<IP>:8888/?vincular=<clave>`.
- Al abrir esa dirección, el panel guarda la clave en el teléfono (`localStorage`) y la quita de la barra de direcciones.
- Todas las peticiones que **cambian algo** (POST, PUT, DELETE) desde otro equipo deben llevar la cabecera `X-PK-Clave` con la clave correcta. Si no la llevan, el servidor responde 403.
- Las peticiones de **solo lectura** (GET, eventos en vivo, fondos, biblias, cancioneros) siguen abiertas, para que el proyector y OBS en otros equipos sigan funcionando sin clave.
- Las peticiones desde el mismo computador (localhost) nunca piden clave.
- Si un teléfono sin clave abre el panel, ve un aviso: “Escanee el código QR desde el panel del computador para vincular este teléfono”.
- El botón **“Desvincular todos”** genera una clave nueva, y los teléfonos tienen que volver a escanear.

### 2. Apartado “Conectar celular” en el panel del computador

- Es un botón en la barra superior con un ícono 📱 que abre una ventana con:
  - el QR grande;
  - la dirección escrita;
  - un selector si el computador tiene varias IPs (por ejemplo, Wi-Fi y cable);
  - el botón “Desvincular todos”;
  - una nota: “El teléfono debe estar en el mismo Wi-Fi”.
- El QR se genera dentro del programa con una librería de QR guardada en `public/`, sin depender de internet.
- La ventana solo se muestra en el computador. En el celular el botón se oculta.

### 3. Panel en el celular (≤ 700 px de ancho)

```
┌──────────────────────────────┐
│ PK  ● En vivo: Juan 3:16   ☰ │  barra superior compacta
│ [Biblia][Canciones][Estilo]… │  pestañas deslizables (ya existe)
├──────────────────────────────┤
│ [Buscar] [Diapositivas] [Monitor] │  sub-vista dentro de la pestaña
│                              │
│  contenido a pantalla completa│
│  filas altas (≥ 48 px)       │
│                              │
├──────────────────────────────┤
│ ◀ Ant │ Negro │ Ocultar │ Sig ▶ │  barra fija abajo
└──────────────────────────────┘
```

- En Biblia y Canciones, los tres paneles (biblioteca, contenido y monitores) se convierten en **tres sub-vistas** que se eligen con botones, en lugar de apilarse en una página larga. Al tocar una canción o un capítulo, el panel salta solo a “Diapositivas”.
- Una **barra fija abajo** tiene Anterior, Negro, Ocultar texto y Siguiente, y reemplaza los atajos de teclado.
- Los botones, versículos y diapositivas miden al menos 48 px de alto, y los textos al menos 16 px para que el iPhone no haga zoom al escribir.
- Las demás pestañas se muestran en una columna con desplazamiento normal.
- Las miniaturas de video y los monitores en vivo se ven más pequeños en el celular, para que el teléfono no se ponga lento.
- Se respetan los bordes del iPhone (`env(safe-area-inset-*)`).

### 4. Conexión inestable

- Si el Wi-Fi se cae, aparece un aviso rojo “Sin conexión — reintentando”, y los eventos en vivo se reconectan solos (ya usan `retry`).

## Lo que queda a criterio de quien lo construya

- Qué librería de QR usar, siempre que sea pequeña, con licencia libre y guardada localmente.
- Los detalles visuales dentro de la paleta actual.
- Cómo se reparten los elementos de las pestañas secundarias en una columna.

## Decisiones que tomé yo (revisar)

- Las peticiones de lectura siguen abiertas sin clave, para no romper el proyector ni OBS en otros equipos.
- La clave se guarda en `config.json` para que los teléfonos sigan vinculados después de reiniciar.
- La vista de celular se activa por debajo de 700 px.
- “Apagar programa” sigue funcionando solo desde el computador.
- Antes de cambiar algo, se hace un respaldo en `respaldos/antes-control-movil/`.
