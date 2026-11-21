/* PK-PENTECOSTAL · Paso de ajustes a la dirección nueva (http://pkipuc.localhost)
   El navegador guarda los ajustes por dirección. La primera vez que se abre la dirección nueva, la página
   de salto de http://localhost:8888 le entrega al servidor lo que había guardado (conexión OBS, textos,
   Biblia elegida, idioma…) y aquí se copia ANTES de que el panel lo lea. Nunca pisa un ajuste existente. */
(function () {
  try {
    const q = new URLSearchParams(location.search);
    if (!q.has('migrar')) return;
    const x = new XMLHttpRequest();
    x.open('GET', '/api/migrar-almacen', false); // síncrono a propósito: el panel lee sus ajustes justo después
    x.send();
    const datos = (JSON.parse(x.responseText || '{}').datos) || {};
    for (const k of Object.keys(datos)) if (localStorage.getItem(k) === null) localStorage.setItem(k, datos[k]);
    q.delete('migrar');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  } catch (_) { /* sin almacenamiento: el panel arranca con sus valores normales */ }
})();
