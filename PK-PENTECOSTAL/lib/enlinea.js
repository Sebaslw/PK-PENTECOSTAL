// PK-PENTECOSTAL · CANCIONES EN LÍNEA IPUC
// Catálogo de letras de generacionpentecostal.com (categoría "Letras", unas 3.000) consultado EN VIVO por
// su API pública de WordPress: las letras no se copian dentro del programa (respeta los derechos de cada
// canción y el crédito de la página); la iglesia la proyecta o la guarda en su cancionero cuando la usa.
'use strict';
const https = require('https');

const EN_LINEA = { host: 'www.generacionpentecostal.com', categoria: 127, nombre: 'CANCIONES EN LÍNEA IPUC' };
const cache = new Map(); // id -> canción (máx. 300)

function pedir(ruta) {
  return new Promise((ok, mal) => {
    const r = https.get({ host: EN_LINEA.host, path: ruta, timeout: 12000, headers: { 'User-Agent': 'PK-PENTECOSTAL', Accept: 'application/json' } }, (s) => {
      if (s.statusCode >= 300 && s.statusCode < 400) { s.resume(); return mal(new Error('La página de canciones cambió de dirección')); }
      const partes = []; let n = 0;
      s.on('data', (c) => { n += c.length; if (n > 4 * 1024 * 1024) r.destroy(new Error('Respuesta demasiado grande')); else partes.push(c); });
      s.on('end', () => {
        let datos; try { datos = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch (_) { return mal(new Error('La página de canciones respondió algo inesperado')); }
        if (s.statusCode === 400 && datos && datos.code === 'rest_post_invalid_page_number') return ok({ datos: [], paginas: 0 });
        if (s.statusCode !== 200) return mal(new Error('La página de canciones respondió ' + s.statusCode));
        ok({ datos, paginas: Number(s.headers['x-wp-totalpages']) || 1, total: Number(s.headers['x-wp-total']) || 0 });
      });
    });
    r.on('timeout', () => r.destroy(new Error('La página de canciones no respondió a tiempo')));
    r.on('error', (e) => mal(/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|ECONNRESET/.test(e.code || '') ? new Error('Sin conexión a internet') : e));
  });
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const textoHTML = (h) => String(h || '').replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]+);/gi, (m, e) => ENTIDADES[e.toLowerCase()] ?? m);

// "Letra Santo es el que vive de Montesanto" / "SUELTO – Letra de la canción de Sarai Rivera" → título y autor
function tituloEnLinea(t) {
  let ti = textoHTML(t).replace(/\s+/g, ' ').trim(), autor = '';
  const m = /^(.*?)\s*[–—-]\s*letra(?:\s+de\s+la\s+canci[oó]n)?(?:\s+de\s+(.+))?$/i.exec(ti);
  if (m && m[1]) { ti = m[1]; autor = m[2] || ''; }
  ti = ti.replace(/^letras?\s+(?:de\s+(?:la\s+canci[oó]n\s+)?)?/i, '').replace(/^[«"“]|[»"”]$/g, '').trim();
  if (ti === ti.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(ti)) ti = ti.charAt(0) + ti.slice(1).toLowerCase(); // "SUELTO" → "Suelto"
  return { ti, autor: autor.trim() };
}

// Solo la letra: cada párrafo es una estrofa. Se omiten el título (encabezado), los avisos de la página
// ("Ver más letras", "Suscríbete…", "EQUIPO GP"), el estilo CSS y los párrafos de reseña después de la letra.
const FIN_LETRA = /^(ver m[aá]s|suscr[ií]bete|te invitamos|equipo gp|s[ií]guenos|lee tambi[eé]n|te puede interesar|ver video|escucha nuestro|descarga)/i;
function letraHTML(h) {
  const html = String(h || '').replace(/\s+/g, ' ') // los saltos del HTML no cuentan: solo <br> y los párrafos
    .replace(/<(script|style|iframe|figure|noscript)[\s\S]*?<\/\1>/gi, '');
  const estrofas = [];
  for (const parte of html.split(/(?=<h[1-6][\s>])|<\/(?:p|div|li|h[1-6])>/i)) {
    const titulo = /^\s*<h[1-6][\s>]/i.test(parte);
    const lineas = textoHTML(parte.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/ /g, ' ')
      .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!lineas.length) continue;
    const txt = lineas.join('\n');
    if (FIN_LETRA.test(txt) || /custom css|\{[^}]*:[^}]*\}/i.test(txt)) { if (estrofas.length) break; continue; }
    if (titulo) { if (estrofas.length) break; continue; }             // título antes; reseña después
    if (lineas.length === 1 && txt.length > 160) { if (estrofas.length) break; continue; } // párrafo de prosa
    if (lineas.length === 1 && /^(#\S|letra\b|autor\b|m[uú]sica\b)/i.test(txt)) continue;    // "#80añosipuc", "Letra Fulano"
    estrofas.push(txt);
  }
  return estrofas.join('\n\n');
}

async function buscar(q, pagina) {
  const qs = new URLSearchParams({ categories: String(EN_LINEA.categoria), per_page: '50', page: String(pagina), _fields: 'id,title,link' });
  if (q) { qs.set('search', q); qs.set('orderby', 'relevance'); } else { qs.set('orderby', 'title'); qs.set('order', 'asc'); }
  const r = await pedir('/wp-json/wp/v2/posts?' + qs);
  return { pagina, paginas: r.paginas, total: r.total || 0, canciones: (Array.isArray(r.datos) ? r.datos : []).map((p) => ({ id: String(p.id), ...tituloEnLinea(p.title && p.title.rendered), url: p.link })) };
}
async function cancion(id) {
  if (cache.has(id)) return cache.get(id);
  const r = await pedir(`/wp-json/wp/v2/posts/${id}?_fields=id,title,link,content`);
  const p = r.datos || {};
  const c = { id: String(p.id), ...tituloEnLinea(p.title && p.title.rendered), url: p.link, le: letraHTML(p.content && p.content.rendered) };
  if (!c.le) throw new Error('Esa página no tiene letra');
  cache.set(id, c);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return c;
}

module.exports = { EN_LINEA, buscar, cancion, tituloEnLinea, letraHTML };
