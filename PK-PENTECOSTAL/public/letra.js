/* PK-PENTECOSTAL
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
/* Letra de las canciones: limpieza (espacios y marcas // de repetición) y reparto de cada estrofa en
 * diapositivas parejas de máximo N renglones. Así todas las canciones se proyectan con el mismo tamaño
 * de letra: una estrofa larga pasa a varias diapositivas en vez de achicarse. Solo se aplica al mostrar;
 * los cancioneros no se modifican. Lo usan el panel y el celular (y las pruebas, con require). */
(function (g) {
  const POR_RENGLON = 42; // letras de un renglón normal (referencia del tamaño de letra)
  // Marcadores de himnario en la primera línea ("Coro", "II", "Estrofa 2"): no se proyectan ni cuentan
  const ES_MARCADOR = /^(coro|estribillo|puente|[ivx]+|estrofa\s*\d+|chorus|refrain|bridge|verse\s*\d+)[.:)]?$/i;

  function limpiarLinea(l) {
    return String(l)
      .replace(/\/{2,}/g, ' ')                     // //repetir// → se quitan
      .replace(/(^|\s)\/+|\/+(?=\s|$)/g, '$1')     // "/" suelta; se respeta "y/o"
      .replace(/\s+/g, ' ')
      .trim();
  }

  const renglones = (l, porRenglon = POR_RENGLON) => Math.max(1, Math.ceil(String(l).length / porRenglon));

  // Mínimo de partes en que cabe la lista de pesos sin pasar de max (una línea más larga que max va sola)
  function partesMinimas(pesos, max) {
    let n = 0, s = 0;
    for (const p of pesos) { if (s && s + p > max) { n++; s = 0; } s += p; }
    return n + (s ? 1 : 0);
  }

  // Reparte las líneas en el mínimo de partes, con renglones lo más parejos posible (las primeras, si
  // sobra, llevan una más: 13 → 5+4+4)
  function repartir(ls, max) {
    const pesos = ls.map((l) => renglones(l));
    let k = partesMinimas(pesos, max);
    if (k <= 1) return [ls];
    const partes = [];
    let i = 0;
    while (i < ls.length) {
      if (k === 1) { partes.push(ls.slice(i)); break; }
      const resto = pesos.slice(i).reduce((a, b) => a + b, 0);
      const meta = Math.min(max, Math.ceil(resto / k));
      let j = i, s = 0;
      while (j < ls.length && (j === i || s + pesos[j] <= meta)) s += pesos[j++];
      // si lo que queda no cabe en las partes restantes, esta parte toma más líneas (sin pasar de max)
      while (j < ls.length && partesMinimas(pesos.slice(j), max) > k - 1 && s + pesos[j] <= max) s += pesos[j++];
      partes.push(ls.slice(i, j));
      i = j; k--;
    }
    return partes;
  }

  // opciones.limpiar = false: texto libre / anuncios (se respetan enlaces y "/"; solo se quitan espacios)
  function estrofas(le, lineasMax = 6, opciones = {}) {
    const max = Math.max(2, Math.min(12, +lineasMax || 6));
    const limpiar = opciones.limpiar === false ? (l) => String(l).trim() : limpiarLinea;
    const bloques = [];
    let actual = [];
    for (const l of String(le || '').replace(/\r\n?/g, '\n').split('\n').map(limpiar)) {
      if (l) actual.push(l); else if (actual.length) { bloques.push(actual); actual = []; }
    }
    if (actual.length) bloques.push(actual);
    const out = [];
    for (const b of bloques) {
      const marcador = b.length > 1 && ES_MARCADOR.test(b[0]) ? b[0] : null;
      const cuerpo = marcador ? b.slice(1) : b;
      repartir(cuerpo, max).forEach((p, i) => out.push((i === 0 && marcador ? [marcador, ...p] : p).join('\n')));
    }
    return out;
  }

  const api = { limpiarLinea, renglones, estrofas, ES_MARCADOR, POR_RENGLON };
  g.PKLetra = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
