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
  // Letras de un renglón de referencia (Estilo → Letras por renglón). Define el tamaño de la letra en la
  // pantalla: menos letras por renglón = letra más grande (una línea más larga pasa a dos renglones).
  const POR_RENGLON = 22;
  const porRenglonValido = (n) => Math.max(14, Math.min(42, Math.round(+n) || POR_RENGLON));
  // Marcadores de himnario en la primera línea ("Coro", "II", "Estrofa 2"): no se proyectan ni cuentan
  const ES_MARCADOR = /^(coro|estribillo|puente|[ivx]+|estrofa\s*\d+|chorus|refrain|bridge|verse\s*\d+)[.:)]?$/i;

  function limpiarLinea(l) {
    return String(l)
      .replace(/\/{2,}/g, ' ')                     // //repetir// → se quitan
      .replace(/(^|\s)\/+|\/+(?=\s|$)/g, '$1')     // "/" suelta; se respeta "y/o"
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Renglones que ocupa una línea en pantalla: se corta por palabras (como lo hace la pantalla), no a la
  // mitad exacta, así una línea de 30 letras puede ocupar 2 renglones y una de 44 letras, 3.
  function renglones(l, porRenglon = POR_RENGLON) {
    const s = String(l).trim();
    if (s.length <= porRenglon) return 1;
    let n = 1, ancho = 0;
    for (const w of s.split(/\s+/)) {
      const largo = w.length;
      if (!ancho) ancho = largo;
      else if (ancho + 1 + largo <= porRenglon) ancho += 1 + largo;
      else { n++; ancho = largo; }
      while (ancho > porRenglon) { n++; ancho -= porRenglon; } // palabra más larga que el renglón
    }
    return n;
  }

  // Mínimo de partes en que cabe la lista de pesos sin pasar de max (una línea más larga que max va sola)
  function partesMinimas(pesos, max) {
    let n = 0, s = 0;
    for (const p of pesos) { if (s && s + p > max) { n++; s = 0; } s += p; }
    return n + (s ? 1 : 0);
  }

  // Reparte las líneas en el mínimo de partes, con renglones lo más parejos posible (las primeras, si
  // sobra, llevan una más: 13 → 5+4+4)
  function repartir(ls, max, porRenglon) {
    const pesos = ls.map((l) => renglones(l, porRenglon));
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

  // Una línea que no cabe en una diapositiva (estrofas enteras escritas en un solo renglón) se parte por
  // palabras en trozos de máximo 2 renglones, cortando de preferencia después de una coma o un punto
  function partirLarga(l, max, porRenglon) {
    if (renglones(l, porRenglon) <= max) return [l];
    const limite = porRenglon * 2;
    const out = [];
    let resto = l;
    while (resto.length > limite) {
      const tramo = resto.slice(0, limite + 1);
      let corte = Math.max(tramo.lastIndexOf(', '), tramo.lastIndexOf('. '), tramo.lastIndexOf('; '));
      corte = corte >= porRenglon ? corte + 1 : tramo.lastIndexOf(' ');
      if (corte <= 0) corte = limite;
      out.push(resto.slice(0, corte).trim());
      resto = resto.slice(corte).trim();
    }
    if (resto) out.push(resto);
    return out;
  }

  // opciones.limpiar = false: texto libre / anuncios (se respetan enlaces y "/"; solo se quitan espacios)
  // opciones.porRenglon: letras por renglón (Estilo → Letras por renglón; 22 por defecto)
  function estrofas(le, lineasMax = 4, opciones = {}) {
    const max = Math.max(2, Math.min(12, +lineasMax || 4));
    const porRenglon = porRenglonValido(opciones.porRenglon);
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
      // (el texto libre no se parte: puede tener enlaces sin espacios)
    const cuerpo = (marcador ? b.slice(1) : b).flatMap((l) => (opciones.limpiar === false ? [l] : partirLarga(l, max, porRenglon)));
      repartir(cuerpo, max, porRenglon).forEach((p, i) => out.push((i === 0 && marcador ? [marcador, ...p] : p).join('\n')));
    }
    return out;
  }

  const api = { limpiarLinea, renglones, estrofas, ES_MARCADOR, POR_RENGLON, porRenglonValido };
  g.PKLetra = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
