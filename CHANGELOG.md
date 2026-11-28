# Historial de cambios · PK-PENTECOSTAL

Todas las versiones publicadas, de la más nueva a la más antigua. Cada una tiene su página de descarga en
[Releases](https://github.com/Sebaslw/PK-PENTECOSTAL/releases) con los instaladores y sus huellas SHA-256.

## Sin publicar

(Nada por ahora.)

## 2.0.10 · 2026-11-28 · Logo actual en todo y Linux .deb que se actualiza solo

- 🐧 **Linux .deb se actualiza solo**, igual que el .AppImage (Linux pide la contraseña para instalar la versión nueva).
- 🎨 **Logo actual en todas las imágenes**: capturas del manual, README y página, pantallas de bienvenida y cierre, fondos de pantalla (1920×1080 y 4K) y banner del README (ya no aparece el logo viejo).
- 📘 Portada del manual con el número de versión; `LEEME.txt` con los instaladores de Windows, Mac y Linux.
- 🛠 GitHub Actions compila y prueba también el instalador de **Windows** junto a Mac y Linux.
- 🛠 `npm run poner-version` pone el número de versión en todos los archivos con un solo comando.
- 🛠 `server.js` más ordenado: Biblias, canciones en línea, respaldo `.zip` y red en `PK-PENTECOSTAL/lib/`.
- 📄 Archivo `LICENSE` (todos los derechos reservados) y este historial.
- ⬆ Sus canciones, fondos y ajustes se conservan; la 2.0.9 instalada se actualiza sola a esta versión.

## 2.0.9 · 2026-11-27 · Biblias completas y app para Mac y Linux

- 📖 Las 9 Biblias completas: los 31.102 versículos en todas las versiones (RV1960, NVI, NTV, DHH, TLA, PDT, KJV, WEB, BBE).
- 📖 Versículos unidos (TLA, DHH, NTV) se ven como «23-24» y se encuentran con cualquiera de los dos números.
- 📖 Versículos que algunas traducciones dejan solo en nota (Mateo 17:21, Hechos 8:37…) aparecen según la Reina-Valera 1960, con su nota.
- 📖 NVI corregida: Salmo 112 completo, Isaías 66 y la numeración de 1 Samuel, Job, Marcos y Hechos.
- 🍎 Nueva app para Mac (Intel y Apple M1/M2/M3/M4) y 🐧 Linux (.deb y .AppImage).
- 📘 Manual actualizado.

## 2.0.8 · 2026-11-25 · Ajustes nuevos

- ✅ Aviso «¡Tenemos ajustes nuevos!» con el botón «Reiniciar PK-PENTECOSTAL».
- 🎵 Añadir canciones ya no da error `EPERM`: se guardan aunque la carpeta esté oculta o sea de solo lectura, sin duplicados, y el editor no pierde lo escrito si algo falla.
- 🌐 Nueva sección **CANCIONES EN LÍNEA IPUC**: más de 3.000 letras de generacionpentecostal.com para buscar, proyectar o guardar.
- 🔎 Si una canción no está en sus cancioneros, un botón la busca en CANCIONES EN LÍNEA IPUC.

## 2.0.7 · 2026-11-24 · Fondos nuevos

- 📖 Carpeta de fondos «BIBLIA» con 6 imágenes de la Biblia abierta.
- ☁️ 7 videos animados de nubes. Ahora son 44 fondos incluidos.

## 2.0.6 · 2026-11-22 · Manual de OBS en otro computador

- 📘 Guía completa de OBS en otro computador: buscar OBS en la red, IP que cambia, fuentes a mano.
- Corrige en el manual las direcciones que aparecían como `$1pkipuc.localhost`.

## 2.0.5 · 2026-11-22 · Canciones del mismo tamaño y OBS en otro equipo

- 🎵 Todas las canciones con el mismo tamaño de letra; las estrofas largas se reparten en diapositivas parejas. Ajuste nuevo: *Líneas por diapositiva*.
- ✨ Letra limpia al proyectar (sin espacios sobrantes ni marcas `//`).
- 🎥 OBS en otro computador: «Buscar OBS en la red»; la capa y el stinger se crean con la IP de este equipo.

## 2.0.4 · 2026-11-22 · OBS conecta solo

- 🎥 Si el puerto o la contraseña de OBS no coinciden, el programa usa los de OBS de este computador y los guarda.
- Si el servidor WebSocket de OBS está apagado, el aviso dice qué activar.
- 🔒 La contraseña de OBS nunca sale del computador.

## 2.0.3 · 2026-11-22 · Mis fondos y actualización automática

- 🖼️ «➕ Añadir fondo»: imágenes y videos propios en ⭐ Mis fondos.
- 🔄 Se actualiza solo: la versión nueva se descarga y se instala encima, sin desinstalar.

## 2.0.2 · 2026-11-22 · Fondos al instante, letra pareja y Node.js incluido

- 🖼️ Miniaturas listas: la galería de fondos se ve completa al abrir.
- 🔠 Toda la canción (y los versículos de un capítulo) con el mismo tamaño de letra.
- 📦 El `.zip` trae los instaladores oficiales de Node.js LTS.

## 2.0.1 · 2026-11-21 · Nuevo logo y marca protegida

- 🎨 Nuevo logo en el programa, el icono, el instalador, la web y el manual.
- 🔒 Marca protegida: los archivos del programa van en un paquete verificado.

## 2.0.0 · 2026-11-21 · Programa para Windows sin Node.js

- Programa de escritorio con instalador y portable; no necesita Node.js.
- Si el puerto 8888 está ocupado elige otro; si ya estaba abierto solo muestra la ventana.
- Corregido `Cannot access 'guardadoBloqueado' before initialization`.
- Datos aparte en `%APPDATA%\PK-PENTECOSTAL`; importar datos de la versión de carpeta 1.x.

## 1.0.2 · 2026-11-21

- Módulo OBS (diseños de overlay, ventana interactiva, stingers, cuenta regresiva, banners laterales), respaldo completo en `.zip`, aviso de versión nueva, interfaz y Biblias en inglés, carpeta privada `BSPK` y dirección http://pkipuc.localhost.

## 1.0.0 · 2026-11-21

- Primera versión: Biblias, cancioneros, fondos, traductor automático español → inglés y manual en PDF (necesita Node.js).
