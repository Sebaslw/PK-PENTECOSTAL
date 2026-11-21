# Idiomas (Español latino · English UK · English US) — Diseño y plan

Fecha: 2026-11-20 · Aprobado por Sebastián: "sí, hazlo así".

## Qué
Sección 🌐 Idiomas. Al elegir un idioma cambia TODO el programa al instante (panel, celular, OBS, QR, avisos, bienvenida/cierre, mensajes del servidor y ventana de consola).
- Biblias: se agregan versiones reales en inglés de uso libre (KJV, WEB British Edition). No se traducen las Biblias en español (sería traducción automática y tienen derechos).
- Citas: el nombre del libro sigue el idioma de la Biblia elegida (KJV → "John 3:16").
- Al cambiar de idioma, se cambia también a la última Biblia usada en ese idioma (por defecto KJV en inglés, RV1960 en español).
- Canciones: cancionero nuevo "English Hymns" con himnos clásicos de dominio público (sin letras trinitarias, por la doctrina de la IPUC). Las canciones en español no se traducen.
- Textos/anuncios/rótulos del usuario: no se traducen.

## Cómo
- `public/i18n.js` + `public/i18n-en.js`: diccionario español→inglés (EE. UU.) y reglas de ortografía británica (colour, centre…). Traduce nodos de texto y atributos (title, placeholder, aria-label, alt) al cargar y con un MutationObserver (cubre textos generados por JS). Guarda el original para volver a español. Patrones para textos con números. Envuelve alert/confirm/prompt.
- Zonas excluidas: contenido (versículos, letras, listas de canciones, en vivo, campos de texto).
- Servidor: `config.idioma` ('es' | 'en-GB' | 'en-US'), `POST /api/idioma`, va en el estado (todas las pantallas y teléfonos cambian a la vez). Mensajes de error y consola en el idioma elegido.
- `libros.js`: `LIBROS_EN` con abreviaturas; la búsqueda de citas acepta ambos idiomas siempre.

## Verificación
- Cambiar a English (US/UK) en el navegador sin ventana: ningún texto del diccionario español visible fuera de zonas de contenido; capturas del panel, celular, QR y OBS.
- KJV carga 31.102 versículos; "jn 3:16" y "juan 3:16" funcionan; la referencia sale "John 3:16 · KJV".
- Volver a Español restaura todo. Pruebas anteriores (vinculación, celular, Wi-Fi propio) siguen pasando.
