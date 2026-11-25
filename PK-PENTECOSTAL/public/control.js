/* PK-PENTECOSTAL - panel de control
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pp.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('pp.' + k, JSON.stringify(v)); } catch (_) { /* sin almacenamiento */ } },
  };

  let toastT;
  function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }

  async function api(url, opts = {}) {
    const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error((data && data.error) || r.statusText);
    return data;
  }

  // ================================================================ Estado global
  let estado = null;
  let ctx = null;           // { tipo, items:[{texto, ref, titulo, label}], ... }
  let liveIdx = -1;
  let selAnchor = -1;
  let selRange = null;      // [a, b] para biblia

  function irAlAire(vivo) {
    api('/api/vivo', { method: 'POST', body: { vivo } }).catch((e) => toast('Error: ' + e.message));
  }
  function limpiar() { liveIdx = -1; selRange = null; marcar(); api('/api/vivo', { method: 'POST', body: { vivo: null } }); }

  // ================================================================ Pestañas
  function abrirTab(name) {
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
    $('.layout').classList.toggle('hidden', name === 'obs');
    $('#obsMod').classList.toggle('hidden', name !== 'obs');
    if (name === 'obs') window.PP?.alAbrir?.();
    store.set('tab', name);
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) abrirTab(b.dataset.tab); });

  // ================================================================ BIBLIA
  const BIB = { nombre: null, data: null, flat: null, ingles: false };
  const mkNorm = (lista) => lista.map(([n, ab]) => ({ n: norm(n).replace(/\s+/g, ''), abs: ab.split(' ').map((a) => norm(a).replace(/\s+/g, '')) }));
  const libroNormES = mkNorm(LIBROS), libroNormEN = mkNorm(window.LIBROS_EN || LIBROS);
  // Los nombres de los libros siguen el idioma de la Biblia elegida (KJV → "John 3:16")
  const nomLibro = (i) => ((BIB.ingles && window.LIBROS_EN) ? window.LIBROS_EN : LIBROS)[i][0];
  const idiomaEn = () => String(window.I18N?.idioma || 'es').startsWith('en');
  let BIBLIAS = [];
  // Al cambiar el idioma del programa, usar la última Biblia de ese idioma
  async function bibliaSegunIdioma() {
    if (!BIBLIAS.length || !BIB.nombre) return;
    const en = idiomaEn();
    if (BIB.ingles === en) return;
    const deIdioma = BIBLIAS.filter((b) => window.esBibliaIngles(b) === en);
    if (!deIdioma.length) return;
    const sigla = (b) => versionCorta(b).toUpperCase();
    const buscar = (s) => deIdioma.find((b) => sigla(b) === s);
    let elegida;
    if (en) {
      // Cada Biblia en español tiene su pareja real en inglés
      const PAREJA = { RV1960: 'KJV', RVR1960: 'KJV', RV: 'KJV', NVI: 'WEB', NTV: 'WEB', DHH: 'BBE', TLA: 'BBE', PDT: 'BBE' };
      elegida = buscar(PAREJA[sigla(BIB.nombre)]);
      store.set('parejaES:' + (elegida || ''), BIB.nombre); // para volver a la misma en español
    } else {
      elegida = deIdioma.find((b) => b === store.get('parejaES:' + BIB.nombre, ''));
    }
    const pref = store.get(en ? 'bibliaEN' : 'bibliaES', '');
    elegida = elegida || (deIdioma.includes(pref) ? pref : (buscar(en ? 'KJV' : 'RV1960') || deIdioma[0]));
    $('#bibVersion').value = elegida;
    await cargarBiblia(elegida);
  }

  function versionCorta(n) { const m = n.split(' - '); return (m[1] || m[0]).trim(); }

  async function cargarBiblia(nombre) {
    $('#cSub').textContent = 'Cargando Biblia…';
    const txt = await (await fetch('/api/biblia/' + encodeURIComponent(nombre))).text();
    const data = {}; const flat = [];
    for (const line of txt.split(/\r?\n/)) {
      const p = line.split('|');
      if (p.length < 4) continue;
      const b = +p[0], c = +p[1], v = +p[2], t = p.slice(3).join('|').trim();
      ((data[b] ||= {})[c] ||= []).push([v, t]);
      flat.push([b, c, v, t, norm(t)]);
    }
    Object.assign(BIB, { nombre, data, flat, ingles: window.esBibliaIngles(nombre) });
    store.set('biblia', nombre);
    store.set(BIB.ingles ? 'bibliaEN' : 'bibliaES', nombre);
    pintarLibros();
    $('#cSub').textContent = '';
    const ult = store.get('ultimoCap', [43, 3]);
    if (!ctx || ctx.tipo === 'biblia') abrirCapitulo(ult[0], ult[1], null, false);
  }

  function pintarLibros() {
    const mk = (i) => `<button data-b="${i + 1}" title="${nomLibro(i)}">${nomLibro(i)}</button>`;
    const activo = ctx?.tipo === 'biblia' ? ctx.libro : 0;
    $('#booksAT').innerHTML = LIBROS.slice(0, 39).map((_, i) => mk(i)).join('');
    $('#booksNT').innerHTML = LIBROS.slice(39).map((_, i) => mk(i + 39)).join('');
    if (activo) $$('#bLibros button').forEach((x) => x.classList.toggle('active', +x.dataset.b === activo));
  }
  $('#bLibros').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-b]'); if (!b) return;
    abrirCapitulo(+b.dataset.b, 1, null, false);
  });

  function abrirCapitulo(libro, cap, versos, alAire) {
    if (!BIB.data || !BIB.data[libro]) return toast('Libro no disponible en esta versión');
    if (!BIB.data[libro][cap]) cap = 1;
    store.set('ultimoCap', [libro, cap]);
    $$('#bLibros button').forEach((x) => x.classList.toggle('active', +x.dataset.b === libro));
    const caps = Object.keys(BIB.data[libro]).map(Number).sort((a, b) => a - b);
    const ch = $('#chapters');
    ch.classList.remove('hidden');
    ch.innerHTML = caps.map((c) => `<button data-c="${c}" class="${c === cap ? 'active' : ''}">${c}</button>`).join('');
    const vs = BIB.data[libro][cap];
    ctx = {
      tipo: 'biblia', libro, cap,
      items: vs.map(([v, t]) => ({ v, t })),
    };
    $('#cTitulo').textContent = `${nomLibro(libro - 1)} ${cap}`;
    $('#cSub').textContent = `${BIB.nombre} · ${vs.length} versículos`;
    $('#cActions').innerHTML = `<button data-act="prevCap">◀ Cap.</button><button data-act="nextCap">Cap. ▶</button>`;
    $('#items').innerHTML = vs.map(([v, t], i) => `<div class="verse" data-i="${i}"><span class="n">${v}</span><span>${esc(t)}</span></div>`).join('');
    $('#items').scrollTop = 0;
    liveIdx = -1; selRange = null; selAnchor = -1;
    if (versos) {
      const a = vs.findIndex(([v]) => v === versos[0]);
      const b = versos[1] ? vs.findIndex(([v]) => v === versos[1]) : a;
      if (a >= 0) {
        selAnchor = a;
        if (alAire) proyectarRango(a, b >= 0 ? b : a); else { selRange = [a, b >= 0 ? b : a]; marcar(); }
        $(`.verse[data-i="${a}"]`)?.scrollIntoView({ block: 'center' });
      }
    } else marcar();
  }
  $('#chapters').addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (b && ctx?.tipo === 'biblia') abrirCapitulo(ctx.libro, +b.dataset.c); });

  function cambiarCap(delta) {
    if (ctx?.tipo !== 'biblia') return false;
    let { libro, cap } = ctx;
    cap += delta;
    if (!BIB.data[libro][cap]) {
      libro += delta;
      if (!BIB.data[libro]) return false;
      const caps = Object.keys(BIB.data[libro]).map(Number);
      cap = delta > 0 ? Math.min(...caps) : Math.max(...caps);
    }
    abrirCapitulo(libro, cap);
    return true;
  }

  function refTexto(a, b) {
    const it = ctx.items;
    const va = it[a].v, vb = it[b].v;
    return `${nomLibro(ctx.libro - 1)} ${ctx.cap}:${va}${vb !== va ? '-' + vb : ''}`;
  }
  function proyectarRango(a, b) {
    if (a > b) [a, b] = [b, a];
    selRange = [a, b]; liveIdx = b;
    const it = ctx.items.slice(a, b + 1);
    const texto = it.length > 1 ? it.map((x) => `[[${x.v}]] ${x.t}`).join(' ') : it[0].t;
    const ref = refTexto(a, b);
    // grupo = versículos del capítulo: la salida usa un tamaño de letra parejo para todo el capítulo
    irAlAire({ tipo: 'biblia', titulo: ref, texto, ref: `${ref}  ·  ${versionCorta(BIB.nombre)}`, grupo: ctx.items.map((x) => x.t) });
    marcar();
  }

  // Referencia rápida: "Juan 3:16-18", "jn 3 16", "1 co 13", "sal 23"
  function buscarLibro(txt) {
    const t = norm(txt).replace(/[\s.]+/g, '');
    if (!t) return -1;
    // Acepta nombres en español y en inglés; primero el idioma de la Biblia actual
    const listas = BIB.ingles ? [libroNormEN, libroNormES] : [libroNormES, libroNormEN];
    for (const paso of [(l) => l.abs.includes(t), (l) => l.n === t, (l) => l.n.startsWith(t)]) {
      for (const lista of listas) { const i = lista.findIndex(paso); if (i >= 0) return i; }
    }
    return -1;
  }
  function parsearRef(q) {
    const m = norm(q).trim().match(/^([123]?\s*[a-zñ][a-zñ.\s]*?)\s*(\d+)?(?:\s*[:.,\s]\s*(\d+)(?:\s*-\s*(\d+))?)?\s*$/);
    if (!m) return null;
    const li = buscarLibro(m[1]);
    if (li < 0) return null;
    return { libro: li + 1, cap: m[2] ? +m[2] : 1, v1: m[3] ? +m[3] : null, v2: m[4] ? +m[4] : null };
  }
  $('#refForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = parsearRef($('#refInput').value);
    if (!r) return toast('No se reconoce la referencia');
    abrirCapitulo(r.libro, r.cap, r.v1 ? [r.v1, r.v2] : null, !!r.v1);
    $('#refInput').select();
  });

  // Búsqueda por palabras
  let buscarT;
  $('#bibBuscar').addEventListener('input', () => { clearTimeout(buscarT); buscarT = setTimeout(buscarPalabras, 250); });
  function buscarPalabras() {
    const q = norm($('#bibBuscar').value.trim());
    const out = $('#bResultados');
    if (q.length < 3 || !BIB.flat) { out.innerHTML = '<div class="empty">Escriba al menos 3 letras</div>'; $('#numRes').textContent = 0; return; }
    const words = q.split(/\s+/).filter(Boolean);
    const res = [];
    for (const r of BIB.flat) { if (words.every((w) => r[4].includes(w))) { res.push(r); if (res.length >= 400) break; } }
    $('#numRes').textContent = res.length >= 400 ? '400+' : res.length;
    subTab('resultados');
    // Resalta sin importar tildes; se escapan los caracteres especiales para que "(" o "?" no rompan la búsqueda
    const hl = (t) => { let h = esc(t); for (const w of words) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[aeiou]/g, (c) => `[${c}${'áéíóú'['aeiou'.indexOf(c)]}]`).replace(/n/g, '[nñ]') + ')', 'gi'), '<mark>$1</mark>'); return h; };
    out.innerHTML = res.length ? res.map(([b, c, v, t]) => `<div class="list-item" data-b="${b}" data-c="${c}" data-v="${v}"><div class="t">${nomLibro(b - 1)} ${c}:${v}</div><div class="s" style="white-space:normal">${hl(t)}</div></div>`).join('') : '<div class="empty">Sin resultados</div>';
  }
  $('#bResultados').addEventListener('click', (e) => {
    const it = e.target.closest('.list-item'); if (!it) return;
    $$('#bResultados .list-item').forEach((x) => x.classList.toggle('active', x === it));
    abrirCapitulo(+it.dataset.b, +it.dataset.c, [+it.dataset.v], true);
  });

  async function pintarHistorial() {
    const h = await api('/api/historial');
    $('#bHistorial').innerHTML = (h.length ? `<div class="row"><button class="grow danger" id="borrarHist">Borrar historial</button></div>` : '') +
      (h.map((x) => `<div class="list-item" data-ref="${esc(x.ref)}"><div class="t">${esc(x.ref.split('  ·  ')[0])}</div><div class="s">${esc(x.texto.replace(/\[\[\d+\]\]/g, ''))}</div></div>`).join('') || '<div class="empty">Aún no se han proyectado versículos</div>');
  }
  $('#bHistorial').addEventListener('click', async (e) => {
    if (e.target.id === 'borrarHist') { await api('/api/historial', { method: 'DELETE' }); return pintarHistorial(); }
    const it = e.target.closest('.list-item'); if (!it) return;
    const r = parsearRef(it.dataset.ref.split('  ·  ')[0]);
    if (r) abrirCapitulo(r.libro, r.cap, r.v1 ? [r.v1, r.v2] : null, true);
  });

  function subTab(n) {
    $$('.subtabs button').forEach((b) => b.classList.toggle('active', b.dataset.bsub === n));
    $('#bLibros').classList.toggle('hidden', n !== 'libros');
    $('#bResultados').classList.toggle('hidden', n !== 'resultados');
    $('#bHistorial').classList.toggle('hidden', n !== 'historial');
    if (n === 'historial') pintarHistorial();
  }
  $('.subtabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) subTab(b.dataset.bsub); });
  $('#bibVersion').addEventListener('change', (e) => cargarBiblia(e.target.value));

  // ================================================================ CANCIONES
  const CAN = { libros: [], canciones: [], actual: null };
  const TODOS = '__todos__';

  // ---------------------------------------------------------------- CANCIONES EN LÍNEA IPUC
  // Letras de generacionpentecostal.com consultadas en vivo (el servidor hace de puente). Se pueden
  // proyectar al momento o guardar en un cancionero para usarlas sin internet.
  const ENL = '__enlinea__', ENL_NOMBRE = 'CANCIONES EN LÍNEA IPUC';
  const ENLC = { q: null, pagina: 0, paginas: 0, total: 0, lista: [], cargando: false, error: '', t: 0, pedido: 0 };
  const enLinea = () => $('#cancionero').value === ENL;
  async function buscarEnLinea(q, mas = false) {
    const pedido = ++ENLC.pedido;
    if (!mas) Object.assign(ENLC, { q, pagina: 0, paginas: 0, total: 0, lista: [] });
    ENLC.cargando = true; ENLC.error = ''; pintarEnLinea();
    try {
      const r = await api(`/api/enlinea/buscar?q=${encodeURIComponent(q)}&pagina=${ENLC.pagina + 1}`);
      if (pedido !== ENLC.pedido) return; // ya se escribió otra búsqueda
      Object.assign(ENLC, { pagina: r.pagina, paginas: r.paginas, total: r.total, lista: ENLC.lista.concat(r.canciones) });
    } catch (e) { if (pedido === ENLC.pedido) ENLC.error = e.message; }
    if (pedido === ENLC.pedido) { ENLC.cargando = false; pintarEnLinea(); }
  }
  function pintarEnLinea() {
    if (!enLinea()) return;
    const L = $('#listaCanciones');
    const cab = `<div class="hint" style="padding:6px 10px">🌐 Letras de <b>generacionpentecostal.com</b> (necesita internet)${ENLC.total ? ' · ' + ENLC.total.toLocaleString('es') + (ENLC.q ? ' resultados' : ' canciones') : ''}</div>`;
    const items = ENLC.lista.map((s) => `<div class="list-item ${CAN.actual && CAN.actual.enlinea && CAN.actual.id === s.id ? 'active' : ''}" data-enl="${esc(s.id)}">
        <div class="t">${esc(s.ti)}</div><div class="s">${s.autor ? esc(s.autor) + ' · ' : ''}${esc(ENL_NOMBRE)}</div></div>`).join('');
    const pie = ENLC.cargando ? '<div class="empty">⏳ Buscando en línea…</div>'
      : ENLC.error ? `<div class="empty">⚠ ${esc(ENLC.error)}<br><button data-enl-reintentar style="margin-top:8px">Reintentar</button></div>`
      : !ENLC.lista.length ? '<div class="empty">No se encontraron canciones en línea</div>'
      : ENLC.pagina < ENLC.paginas ? '<div style="padding:8px;text-align:center"><button data-enl-mas>Cargar más canciones</button></div>' : '';
    L.innerHTML = cab + items + pie;
  }
  async function abrirEnLinea(id) {
    const it = ENLC.lista.find((x) => x.id === id);
    $('#cTitulo').textContent = it ? it.ti : ENL_NOMBRE; $('#cSub').textContent = '⏳ Trayendo la letra…';
    try {
      const c = await api('/api/enlinea/cancion/' + encodeURIComponent(id));
      abrirCancion({ id: c.id, ti: c.ti, le: c.le, tono: '', estilo: '0', libro: ENL_NOMBRE, autor: c.autor, url: c.url, enlinea: true });
    } catch (e) { $('#cSub').textContent = '⚠ ' + e.message; toast('Error: ' + e.message, 6000); }
  }
  // Guarda la canción en línea en un cancionero propio (se abre el editor ya lleno: se elige el cancionero)
  function guardarEnLinea(s) {
    editarCancion(null);
    $('#edTi').value = s.ti + (s.autor ? ' - ' + s.autor : '');
    $('#edLe').value = s.le;
  }
  $('#listaCanciones').addEventListener('click', (e) => {
    if (e.target.closest('[data-enl-mas]')) return buscarEnLinea(ENLC.q, true);
    if (e.target.closest('[data-enl-reintentar]')) return buscarEnLinea(ENLC.q || '', ENLC.lista.length > 0);
    const ir = e.target.closest('[data-ir-enlinea]');
    if (ir) { $('#cancionero').value = ENL; store.set('cancionero', ENL); return buscarEnLinea($('#canBuscar').value.trim()); }
    const it = e.target.closest('[data-enl]');
    if (it) { $$('#listaCanciones .list-item').forEach((x) => x.classList.toggle('active', x === it)); abrirEnLinea(it.dataset.enl); }
  });

  async function cargarCancionero(nombre) {
    store.set('cancionero', nombre);
    if (nombre === ENL) return buscarEnLinea($('#canBuscar').value.trim());
    const nombres = nombre === TODOS ? CAN.libros : [nombre];
    const listas = await Promise.all(nombres.map((n) => api('/api/cancionero/' + encodeURIComponent(n)).then((arr) => arr.map((s) => ({ ...s, libro: n }))).catch(() => [])));
    CAN.canciones = listas.flat().map((s) => ({ ...s, _n: norm(s.ti + ' ' + (s.tien || '')), _l: norm(s.le + ' ' + (s.leen || '')) }));
    CAN.canciones.sort((a, b) => a.ti.localeCompare(b.ti, 'es'));
    filtrarCanciones();
  }
  // En inglés se muestra y proyecta la traducción de la canción (si existe)
  const vistaCan = (s) => (idiomaEn() && s.leen ? { ti: s.tien || s.ti, le: s.leen } : { ti: s.ti, le: s.le });
  function filtrarCanciones() {
    if (enLinea()) { // búsqueda en internet: espera a que se termine de escribir
      clearTimeout(ENLC.t);
      ENLC.t = setTimeout(() => buscarEnLinea($('#canBuscar').value.trim()), 450);
      return;
    }
    const q = norm($('#canBuscar').value.trim());
    let lista = CAN.canciones;
    if (q) {
      const w = q.split(/\s+/);
      const enTitulo = lista.filter((s) => w.every((x) => s._n.includes(x)));
      const enLetra = lista.filter((s) => !enTitulo.includes(s) && w.every((x) => s._l.includes(x)));
      lista = enTitulo.concat(enLetra);
    }
    const todos = $('#cancionero').value === TODOS;
    $('#listaCanciones').innerHTML = lista.slice(0, 500).map((s, i) => {
      const v = vistaCan(s);
      const prim = v.le.split('\n').find((l) => l.trim() && !/^(coro|estribillo|[ivx]+|chorus|refrain|verse\s*\d+)[.:)]?$/i.test(l.trim())) || '';
      return `<div class="list-item ${CAN.actual && CAN.actual.id === s.id && CAN.actual.libro === s.libro ? 'active' : ''}" data-k="${esc(s.libro)}|${esc(s.id)}">
        ${s.tono ? `<span class="tono">${esc(s.tono)}</span>` : ''}<div class="t">${esc(v.ti)}${s.leen ? (s.enauto ? ' <span class="en-tag auto" title="Traducción automática">EN·auto</span>' : ' <span class="en-tag" title="English">EN</span>') : ''}</div>
        <div class="s">${todos ? esc(s.libro) + ' · ' : ''}${esc(prim)}</div></div>`;
    }).join('') || '<div class="empty">No hay canciones</div>';
    // ¿No la tiene? → buscarla en CANCIONES EN LÍNEA IPUC
    if (q) $('#listaCanciones').insertAdjacentHTML('beforeend', `<div style="padding:10px;text-align:center"><button data-ir-enlinea>🌐 Buscar «${esc($('#canBuscar').value.trim())}» en ${esc(ENL_NOMBRE)}</button></div>`);
  }
  $('#canBuscar').addEventListener('input', filtrarCanciones);
  $('#cancionero').addEventListener('change', (e) => cargarCancionero(e.target.value));
  $('#listaCanciones').addEventListener('click', (e) => {
    const it = e.target.closest('.list-item[data-k]'); if (!it) return;
    const [libro, id] = it.dataset.k.split('|');
    const s = CAN.canciones.find((x) => x.libro === libro && x.id === id);
    if (s) abrirCancion(s);
    $$('#listaCanciones .list-item').forEach((x) => x.classList.toggle('active', x === it));
  });
  $('#listaCanciones').addEventListener('dblclick', (e) => { if (e.target.closest('.list-item[data-k]') && ctx?.items.length) proyectarSlide(0); });

  // Letra limpia (sin espacios ni marcas //) y repartida en diapositivas de máximo N renglones (letra.js):
  // así todas las canciones se proyectan con el mismo tamaño de letra
  function estrofas(le, opciones) {
    const est = (estado && estado.estilo) || {};
    return window.PKLetra.estrofas(le, est.lineasMax || 4, { porRenglon: est.letrasRenglon, ...opciones });
  }
  function abrirCancion(s) {
    CAN.actual = s;
    $('#chapters').classList.add('hidden');
    const v = vistaCan(s);
    const slides = estrofas(v.le);
    ctx = { tipo: 'cancion', items: slides.map((t, i) => ({ texto: t, titulo: v.ti, ref: v.ti, label: `${i + 1}` })) };
    $('#cTitulo').textContent = v.ti;
    $('#cSub').textContent = `${s.libro}${s.autor ? ' · ' + s.autor : ''}${s.tono ? ' · Tono ' + s.tono : ''} · ${slides.length} diapositivas`;
    $('#cActions').innerHTML = s.enlinea
      ? `<button data-act="guardarEnLinea" class="primary" title="Guardarla para usarla sin internet">💾 Guardar en mi cancionero</button><button data-act="verEnLinea" title="Fuente: generacionpentecostal.com">🔗 Ver en la página</button>`
      : `<button data-act="editar">✎ Editar</button>`;
    pintarSlides();
  }
  function pintarSlides() {
    $('#items').innerHTML = `<div class="slides">${ctx.items.map((it, i) => `<div class="slide" data-i="${i}"><span class="num"><b>${i + 1}</b>${i < 9 ? ' · ' + (window.I18N ? window.I18N.t('tecla') : 'tecla') + ' ' + (i + 1) : ''}</span>${esc(it.texto)}</div>`).join('')}</div>`;
    $('#items').scrollTop = 0; liveIdx = -1; marcar();
  }
  // Quita marcadores de himnario ("I", "II", "Coro", "Estrofa 2") de la primera línea
  function sinMarcador(texto) {
    const l = texto.split('\n');
    if (l.length > 1 && /^(coro|estribillo|puente|[ivx]+|estrofa\s*\d+|chorus|refrain|bridge|verse\s*\d+)[.:)]?$/i.test(l[0].trim())) return l.slice(1).join('\n');
    return texto;
  }
  function proyectarSlide(i) {
    if (!ctx || !ctx.items[i]) return;
    liveIdx = i;
    const it = ctx.items[i];
    const cancion = ctx.tipo === 'cancion';
    const texto = cancion ? sinMarcador(it.texto) : it.texto;
    // grupo = todas las diapositivas: la salida usa UN solo tamaño de letra para toda la canción
    irAlAire({ tipo: ctx.tipo, titulo: it.titulo || '', texto, ref: it.ref || '',
      grupo: cancion ? ctx.items.map((x) => sinMarcador(x.texto)) : undefined });
    marcar();
  }

  // Editor
  const dlg = $('#dlgCancion');
  function editarCancion(s) {
    $('#dlgTitulo').textContent = s ? 'Editar canción' : 'Nueva canción';
    $('#edTi').value = s?.ti || ''; $('#edTono').value = s?.tono || ''; $('#edLe').value = s?.le || '';
    $('#edTiEn').value = s?.tien || ''; $('#edLeEn').value = s?.leen || '';
    $('#edLeEn').dataset.auto = s?.enauto ? '1' : '';
    $('#edLibro').innerHTML = CAN.libros.map((n) => `<option ${n === (s?.libro || (CAN.libros.includes('Mi Cancionero') ? 'Mi Cancionero' : CAN.libros[0])) ? 'selected' : ''}>${esc(n)}</option>`).join('');
    $('#edLibro').disabled = !!s;
    $('#edBorrar').classList.toggle('hidden', !s);
    dlg._s = s; dlg.showModal(); $('#edTi').focus();
  }
  $('#btnNuevaCancion').addEventListener('click', () => editarCancion(null));
  // Traducción automática dentro del editor (sin internet)
  ['#edTiEn', '#edLeEn'].forEach((s) => $(s).addEventListener('input', () => { $('#edLeEn').dataset.auto = ''; }));
  $('#btnAutoTraducir')?.addEventListener('click', async () => {
    if (!$('#edLe').value.trim()) return toast('Escriba primero la letra en español');
    const b = $('#btnAutoTraducir'); b.disabled = true; const txt = b.textContent; b.textContent = '⏳ Traduciendo…';
    try {
      const r = await api('/api/traducir/texto', { method: 'POST', body: { ti: $('#edTi').value, le: $('#edLe').value } });
      $('#edTiEn').value = r.ti; $('#edLeEn').value = r.le; $('#edLeEn').dataset.auto = '1';
    } catch (e) { toast('Error: ' + e.message); }
    finally { b.disabled = false; b.textContent = txt; }
  });
  dlg.addEventListener('close', async () => {
    const s = dlg._s; const v = dlg.returnValue;
    let guardado = false;
    try {
      if (v === 'ok') {
        const libro = s ? s.libro : $('#edLibro').value;
        const r = await api('/api/cancionero/' + encodeURIComponent(libro), { method: 'POST', body: { id: s?.id, ti: $('#edTi').value, tono: $('#edTono').value, le: $('#edLe').value, estilo: s?.estilo, tien: $('#edTiEn').value, leen: $('#edLeEn').value, enauto: $('#edLeEn').dataset.auto === '1' } });
        guardado = true;
        toast(r.repetida ? 'Esa canción ya estaba en ' + libro + ' (no se duplicó)' : 'Canción guardada');
        await cargarCancionero($('#cancionero').value);
        const n = CAN.canciones.find((x) => x.libro === libro && x.id === r.cancion.id);
        if (n) abrirCancion(n);
      } else if (v === 'borrar' && s && confirm(`¿Eliminar "${s.ti}" de ${s.libro}?`)) {
        await api(`/api/cancionero/${encodeURIComponent(s.libro)}?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' });
        toast('Canción eliminada');
        await cargarCancionero($('#cancionero').value);
      }
    } catch (e) {
      toast('Error: ' + e.message, 9000);
      // No se pierde lo escrito: el editor se vuelve a abrir con el título y la letra tal cual
      if (v === 'ok' && !guardado && !dlg.open) { dlg._s = s; dlg.showModal(); }
    }
  });
  $('#edGuardar').addEventListener('click', (e) => {
    const falta = !$('#edTi').value.trim() ? 'Escriba el título de la canción' : !$('#edLibro').value ? 'Elija un cancionero' : !$('#edLe').value.trim() ? 'Escriba o pegue la letra' : '';
    if (falta) { e.preventDefault(); toast(falta); }
  });

  // ================================================================ TEXTO / ANUNCIOS
  function cargarTexto(titulo, cuerpo) {
    const slides = estrofas(cuerpo, { limpiar: false }); // anuncios: enlaces y "/" tal cual
    if (!slides.length) return toast('Escriba algún texto');
    $('#chapters').classList.add('hidden');
    ctx = { tipo: 'texto', items: slides.map((t) => ({ texto: t, titulo, ref: titulo })) };
    $('#cTitulo').textContent = titulo || 'Texto libre';
    $('#cSub').textContent = `${slides.length} diapositivas`;
    $('#cActions').innerHTML = '';
    pintarSlides();
  }
  $('#btnTxtCargar').addEventListener('click', () => cargarTexto($('#txtTitulo').value.trim(), $('#txtCuerpo').value));
  function pintarGuardados() {
    const g = store.get('textos', []);
    $('#txtGuardados').innerHTML = g.map((x, i) => `<div class="list-item" data-i="${i}"><button data-del="${i}" class="danger" style="float:right;padding:2px 8px">✕</button><div class="t">${esc(x.titulo || 'Sin título')}</div><div class="s">${esc(x.cuerpo.slice(0, 80))}</div></div>`).join('') || '<div class="hint">Nada guardado aún.</div>';
  }
  $('#btnTxtGuardar').addEventListener('click', () => {
    const titulo = $('#txtTitulo').value.trim(), cuerpo = $('#txtCuerpo').value;
    if (!cuerpo.trim()) return toast('Escriba algún texto');
    const g = store.get('textos', []).filter((x) => x.titulo !== titulo || !titulo);
    g.unshift({ titulo, cuerpo }); store.set('textos', g.slice(0, 50)); pintarGuardados(); toast('Guardado');
  });
  $('#txtGuardados').addEventListener('click', (e) => {
    const g = store.get('textos', []);
    if (e.target.dataset.del) { g.splice(+e.target.dataset.del, 1); store.set('textos', g); return pintarGuardados(); }
    const it = e.target.closest('.list-item'); if (!it) return;
    const x = g[+it.dataset.i];
    $('#txtTitulo').value = x.titulo; $('#txtCuerpo').value = x.cuerpo; cargarTexto(x.titulo, x.cuerpo);
  });

  // ================================================================ Centro: clics y marcas
  $('#items').addEventListener('click', (e) => {
    const v = e.target.closest('.verse');
    if (v && ctx?.tipo === 'biblia') {
      const i = +v.dataset.i;
      if (e.shiftKey && selAnchor >= 0) proyectarRango(selAnchor, i);
      else { selAnchor = i; proyectarRango(i, i); }
      return;
    }
    const s = e.target.closest('.slide');
    if (s) proyectarSlide(+s.dataset.i);
  });
  $('#cActions').addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.act;
    if (a === 'prevCap') cambiarCap(-1);
    if (a === 'nextCap') cambiarCap(1);
    if (a === 'editar' && CAN.actual && !CAN.actual.enlinea) editarCancion(CAN.actual);
    if (a === 'guardarEnLinea' && CAN.actual?.enlinea) guardarEnLinea(CAN.actual);
    if (a === 'verEnLinea' && CAN.actual?.url && /^https:\/\/www\.generacionpentecostal\.com\//.test(CAN.actual.url)) window.open(CAN.actual.url, '_blank', 'noopener');
  });

  function marcar() {
    if (!ctx) return;
    const enAire = estado && estado.vivo;
    if (ctx.tipo === 'biblia') {
      $$('#items .verse').forEach((el) => {
        const i = +el.dataset.i;
        const inR = selRange && i >= selRange[0] && i <= selRange[1];
        el.classList.toggle('sel', !!inR && !enAire);
        el.classList.toggle('live', !!inR && !!enAire);
      });
    } else {
      $$('#items .slide').forEach((el) => el.classList.toggle('live', +el.dataset.i === liveIdx && !!enAire));
    }
    const el = $('#items .live');
    if (el) { const r = el.getBoundingClientRect(), c = $('#items').getBoundingClientRect(); if (r.top < c.top || r.bottom > c.bottom) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  window.PK = { mover: (d) => mover(d), limpiar: () => limpiar() }; // usado por la barra del celular (movil.js)
  function mover(delta) {
    if (!ctx) return;
    if (ctx.tipo === 'biblia') {
      let i = (selRange ? (delta > 0 ? selRange[1] : selRange[0]) : -1) + delta;
      if (!selRange && delta < 0) i = 0;
      if (i >= ctx.items.length) { if (cambiarCap(1)) { selAnchor = 0; proyectarRango(0, 0); } return; }
      if (i < 0) return;
      selAnchor = i; proyectarRango(i, i);
    } else {
      const i = Math.min(ctx.items.length - 1, Math.max(0, liveIdx + delta));
      proyectarSlide(liveIdx < 0 ? 0 : i);
    }
  }

  // ================================================================ FONDOS
  // Los fondos que añade el usuario se guardan en BSPK/fondos/Subidos (carpeta de datos: se conservan al
  // cerrar, al actualizar y al reinstalar) y se muestran como «⭐ Mis fondos», siempre primero.
  const MIS = 'Subidos';
  const nomCat = (c) => (c === MIS ? '⭐ Mis fondos' : c);
  let FONDOS = [];
  async function cargarFondos(elegirCat) {
    FONDOS = await api('/api/fondos');
    FONDOS.sort((a, b) => (b.categoria === MIS) - (a.categoria === MIS)); // Mis fondos primero
    const cats = [...new Set(FONDOS.map((f) => f.categoria))];
    if (!cats.includes(MIS)) cats.unshift(MIS); // la categoría aparece aunque todavía esté vacía
    const nMis = FONDOS.filter((f) => f.categoria === MIS).length;
    $('#fondoCat').innerHTML = `<option value="">Todas las categorías</option>` +
      cats.map((c) => `<option value="${esc(c)}">${esc(nomCat(c))}${c === MIS ? ` (${nMis})` : ''}</option>`).join('');
    $('#fondoCat').value = elegirCat ?? store.get('fondoCat', '');
    if ($('#fondoCat').selectedIndex < 0) $('#fondoCat').value = '';
    pintarFondos();
  }
  let fondosKey = '';
  function pintarFondos() {
    const cat = $('#fondoCat').value; store.set('fondoCat', cat);
    const lista = FONDOS.filter((f) => !cat || f.categoria === cat);
    const key = cat + '|' + lista.map((f) => f.url).join('|');
    if (key !== fondosKey) { // solo se reconstruye si cambió la lista (no en cada cambio de estilo)
      fondosKey = key;
      const vacio = cat === MIS
        ? '<div class="empty"><span class="big">🖼️</span>Todavía no tiene fondos propios.<br>Pulse <b>➕ Añadir fondo</b> o arrastre aquí imágenes y videos.</div>'
        : '<div class="empty">No hay fondos</div>';
      $('#fondosGrid').innerHTML = lista.map((f) => `
      <div class="fondo" data-url="${esc(f.url)}" data-tipo="${f.tipo}" title="${esc(f.nombre)}">
        ${f.mini ? `<img decoding="async" src="${esc(f.mini)}" alt="">`
          : f.tipo === 'video' ? `<img class="mini-video" data-video="${esc(f.url)}" data-t="2" data-clave="${esc(f.clave || '')}" alt="">`
          : `<img class="mini-imagen" data-imagen="${esc(f.url)}" data-clave="${esc(f.clave || '')}" alt="">`}${f.tipo === 'video' ? '<span class="tag">▶ video</span>' : ''}
        ${f.categoria === MIS ? `<span class="mio">★ MÍO</span><button class="borrar" data-borrar="${esc(f.url)}" title="Quitar de Mis fondos">✕</button>` : ''}
      </div>`).join('') || vacio;
      window.Miniaturas?.activar($('#fondosGrid'));
    }
    marcarFondoActivo();
  }

  // ---------- Añadir fondo (botón o arrastrar): se guarda solo en Mis fondos ----------
  const FONDO_EXT = /\.(jpe?g|png|webp|gif|mp4|webm)$/i;
  function subirFondo(file, alProgreso) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('PUT', '/api/subir?nombre=' + encodeURIComponent(file.name));
      x.upload.onprogress = (e) => { if (e.lengthComputable) alProgreso(e.loaded / e.total); };
      x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch (_) { /* nada */ }
        if (x.status >= 200 && x.status < 300) resolve(d); else reject(new Error(d.error || x.statusText)); };
      x.onerror = () => reject(new Error('No se pudo conectar con el programa'));
      x.send(file);
    });
  }
  let subiendo = false;
  async function añadirFondos(files) {
    const lista = [...files].filter((f) => FONDO_EXT.test(f.name));
    if (!lista.length) return toast('Use imágenes (.jpg .png .webp .gif) o videos (.mp4 .webm)');
    if (subiendo) return toast('Espere a que termine de guardar los anteriores');
    subiendo = true;
    const prog = $('#fondoProg'), barra = prog.querySelector('i'), txt = prog.querySelector('span');
    prog.classList.remove('hidden'); $('#btnAddFondo').disabled = true;
    let ok = 0;
    try {
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i];
        const pre = lista.length > 1 ? `(${i + 1}/${lista.length}) ` : '';
        try {
          await subirFondo(f, (p) => { barra.style.width = Math.round(p * 100) + '%'; txt.textContent = `${pre}Guardando «${f.name}»… ${Math.round(p * 100)} %`; });
          ok++;
        } catch (err) { toast(`No se pudo guardar «${f.name}»: ${err.message}`); }
      }
    } finally {
      subiendo = false; $('#btnAddFondo').disabled = false;
      prog.classList.add('hidden'); barra.style.width = '0';
    }
    if (ok) {
      fondosKey = '';
      await cargarFondos(MIS); // muestra Mis fondos con los nuevos
      toast(ok === 1 ? '✔ Fondo guardado en ⭐ Mis fondos' : `✔ ${ok} fondos guardados en ⭐ Mis fondos`);
    }
  }
  $('#btnAddFondo').addEventListener('click', () => $('#fondoFile').click());
  $('#fondoFile').addEventListener('change', (e) => { const fs = e.target.files; if (fs.length) añadirFondos(fs); e.target.value = ''; });
  // Arrastrar y soltar archivos sobre la galería
  const gridF = $('#fondosGrid');
  gridF.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); gridF.classList.add('soltar'); } });
  gridF.addEventListener('dragleave', (e) => { if (!gridF.contains(e.relatedTarget)) gridF.classList.remove('soltar'); });
  gridF.addEventListener('drop', (e) => { e.preventDefault(); gridF.classList.remove('soltar'); if (e.dataTransfer?.files?.length) añadirFondos(e.dataTransfer.files); });
  // Quitar uno de Mis fondos (los de fábrica no se pueden borrar)
  gridF.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-borrar]'); if (!b) return;
    e.stopPropagation();
    const f = FONDOS.find((x) => x.url === b.dataset.borrar);
    if (!confirm(`¿Quitar «${f ? f.nombre : 'este fondo'}» de Mis fondos?`)) return;
    try {
      await api('/api/fondo?url=' + encodeURIComponent(b.dataset.borrar), { method: 'DELETE' });
      if (estado?.estilo?.fondo?.valor === b.dataset.borrar) guardarEstilo({ fondo: { tipo: 'color', valor: '#000000' } }, true);
      fondosKey = ''; await cargarFondos(MIS); toast('Fondo quitado');
    } catch (err) { toast('Error: ' + err.message); }
  }, true);
  function marcarFondoActivo() {
    const aj = $('#fondoAjuste'); if (aj && document.activeElement !== aj) aj.value = estado?.estilo?.ajusteFondo || 'completa';
    const actual = estado?.estilo?.fondo?.valor;
    $$('#fondosGrid .fondo').forEach((el) => el.classList.toggle('active', el.dataset.url === actual));
  }
  $('#fondoCat').addEventListener('change', pintarFondos);
  // Cómo se ve la imagen en el proyector: completa (sin recortar) / llenar / estirar
  $('#fondoAjuste').addEventListener('change', (e) => guardarEstilo({ ajusteFondo: e.target.value }, true));
  $('#fondosGrid').addEventListener('click', (e) => {
    const f = e.target.closest('.fondo'); if (!f) return;
    guardarEstilo({ fondo: { tipo: f.dataset.tipo, valor: f.dataset.url } }, true);
  });
  window.Miniaturas?.hover($('#fondosGrid'), '.fondo');
  $('#btnFondoColor').addEventListener('click', () => guardarEstilo({ fondo: { tipo: 'color', valor: $('#fondoColor').value } }, true));

  // ================================================================ ESTILO
  const getK = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
  const setK = (k, v) => k.split('.').reduceRight((acc, x) => ({ [x]: acc }), v);
  let estiloT, pendiente = {};
  function guardarEstilo(parcial, inmediato) {
    const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && k !== 'fondo') a[k] = merge(a[k] || {}, b[k]); else a[k] = b[k]; } return a; };
    pendiente = merge(pendiente, parcial);
    clearTimeout(estiloT);
    estiloT = setTimeout(() => { const body = pendiente; pendiente = {}; api('/api/estilo', { method: 'POST', body }); }, inmediato ? 0 : 120);
  }
  function pintarFormEstilo(est) {
    $$('#formEstilo [data-k]').forEach((el) => {
      if (document.activeElement === el) return;
      const v = getK(est, el.dataset.k);
      if (el.type === 'checkbox') el.checked = !!v; else if (v != null) el.value = v;
      const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.value;
    });
  }
  // Subir / bajar el texto en pantalla completa
  $('#formEstilo').addEventListener('click', (e) => {
    const b = e.target.closest('[data-posv]'); if (!b) return;
    const r = $('#formEstilo [data-k="posicionV"]');
    const d = +b.dataset.posv;
    r.value = d === 0 ? 0 : Math.max(+r.min, Math.min(+r.max, +r.value + d));
    r.parentElement.querySelector('output').textContent = r.value;
    guardarEstilo({ posicionV: +r.value }, true);
  });
  $('#formEstilo').addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.k) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
    const o = el.parentElement.querySelector('output'); if (o) o.textContent = el.value;
    guardarEstilo(setK(el.dataset.k, v));
  });
  $('#btnResetEstilo').addEventListener('click', () => { if (confirm('¿Restaurar todos los estilos por defecto?')) api('/api/estilo', { method: 'POST', body: { reset: true } }).then(() => toast('Estilo restaurado')); });

  // ================================================================ OBS
  // URLs para OBS: si OBS está en OTRO computador, con la IP de este equipo (http://pkipuc.localhost en
  // el equipo de OBS sería él mismo y la fuente quedaría vacía: sin canciones ni Biblia)
  async function pintarOBS() {
    let base = location.origin;
    try { if (window.PP && window.PP.baseURLParaOBS) base = await window.PP.baseURLParaOBS(); } catch (_) { /* sin OBS: dirección del panel */ }
    $$('.url').forEach((i) => (i.value = base + i.dataset.path));
    try {
      const info = await api('/api/info');
      if (info.ips.length) $('#redLocal').innerHTML = `Desde otro equipo o celular en la misma red, abra el panel en: ${info.ips.map((ip) => `<code>http://${ip}:${info.puerto}/</code>`).join(' ')}`;
      const nota = $('#urlNotaRed');
      if (nota) nota.innerHTML = base !== location.origin
        ? `OBS está en otro computador: estas direcciones ya usan la IP de este equipo (<code>${esc(base)}</code>).`
        : info.ips.length ? `¿OBS en <b>otro computador</b>? Use la dirección de red de este equipo: ${info.ips.map((ip) => `<code>http://${ip}:${info.puerto}/capa</code>`).join(' ')} (o conecte OBS en la pestaña Overlay y las direcciones cambian solas).` : '';
    } catch (_) { /* sin red */ }
  }
  (window.PP = window.PP || {}).pintarOBS = pintarOBS;
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('copy')) return;
    const inp = e.target.parentElement.querySelector('input');
    navigator.clipboard?.writeText(inp.value).then(() => toast('URL copiada'), () => { inp.select(); document.execCommand('copy'); toast('URL copiada'); });
  });
  // ---------- Proyectar: abre la salida en la 2ª pantalla (proyector / TV) ----------
  let ventanaProy = null;
  const proyectando = () => !!(ventanaProy && !ventanaProy.closed);
  function pintarBtnProy() {
    const b = $('#btnProyectar');
    if (!b) return;
    const on = proyectando();
    b.classList.toggle('activo', on);
    b.textContent = on ? '⏹ Detener' : '📽 Proyectar';
    b.title = on ? 'Cerrar la ventana del proyector' : 'Abrir la salida en el proyector / segunda pantalla';
  }
  // El proyector tiene su PROPIA dirección, distinta del panel:
  //   panel → http://pkipuc.localhost/    proyector → http://proyector.pkipuc.localhost/
  //   (antiguas: localhost:8888 → proyector.localhost:8889 · celulares: IP:8888 → IP:8889)
  let PUERTO_PROY = (+location.port || 8888) + 1;
  const ES_LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const ES_NOMBRE = /^pkipuc\.localhost$/i.test(location.hostname);
  let ORIGEN_PROY = '';
  const origenProy = () => ORIGEN_PROY || (ES_NOMBRE
    ? `${location.protocol}//proyector.${location.host}`
    : `${location.protocol}//${ES_LOCAL ? 'proyector.localhost' : location.hostname}:${PUERTO_PROY}`);
  // Cada pestaña del panel tiene su propio visor: /proyector (visor 1), /visor/2, /visor/3…
  const VISOR = window.PK_VISOR || 1;
  const rutaVisor = () => (VISOR === 1 ? '/proyector' : '/proyector/' + VISOR);
  function pintarUrlProy() { const i = $('#urlProyector'); if (i) i.value = origenProy() + rutaVisor(); }
  api('/api/info').then((i) => {
    if (i.puertoProyector) PUERTO_PROY = i.puertoProyector;
    if (ES_NOMBRE && i.urlProyector) ORIGEN_PROY = i.urlProyector;
    pintarUrlProy();
  }).catch(() => {});
  pintarUrlProy();
  // Teclas presionadas en la ventana del proyector (flechas, B, H, números) → panel
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.tipo !== 'pk-tecla' || e.origin !== origenProy() || !/^[\w ]{1,12}$/.test(d.key || '')) return;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: d.key, code: d.code, shiftKey: !!d.shiftKey, bubbles: true, cancelable: true }));
  });
  // Windows: Extender (el proyector muestra solo la salida) o Duplicar (muestra lo mismo que el computador)
  async function modoPantallas(modo) {
    try {
      await api('/api/pantallas', { method: 'POST', body: { modo } });
      toast(modo === 'extender' ? 'Pantallas extendidas: el proyector ya no copia el computador. Presione 📽 Proyectar.' : 'Pantallas duplicadas: el proyector muestra lo mismo que el computador.');
    } catch (e) { toast(e.message); }
  }
  let preguntoExtender = false;
  async function proyectar() {
    if (proyectando()) { ventanaProy.close(); ventanaProy = null; pintarBtnProy(); return; }
    const url = origenProy() + rutaVisor();
    let feats = 'popup,width=1280,height=576';
    let segunda = false;
    // Chrome / Edge: detecta la segunda pantalla y abre allí a pantalla completa
    if ('getScreenDetails' in window) {
      try {
        const sd = await window.getScreenDetails();
        const otra = sd.screens.find((s) => s !== sd.currentScreen) || null;
        if (otra) {
          segunda = true;
          feats = `popup,left=${otra.availLeft},top=${otra.availTop},width=${otra.availWidth},height=${otra.availHeight},fullscreen`;
        } else if (!preguntoExtender && ES_LOCAL) {
          // Solo se ve UNA pantalla: casi siempre es porque Windows está en modo "Duplicar"
          preguntoExtender = true;
          if (confirm('Solo se detecta una pantalla.\n\nSi el proyector / LED está conectado, Windows lo tiene en modo DUPLICAR (muestra lo mismo que este computador).\n\n¿Cambiar a modo EXTENDER? Así el proyector muestra solo la salida y lo que haga en el panel no se ve allá.')) {
            await modoPantallas('extender');
            return;
          }
        }
      } catch (_) { /* permiso denegado: ventana normal */ }
    }
    ventanaProy = window.open(url, 'pk-visor-' + VISOR, feats);
    if (!ventanaProy) { toast('El navegador bloqueó la ventana. Permita ventanas emergentes para este sitio.'); return; }
    toast(segunda ? 'Proyectando en la segunda pantalla' : 'Lleve la ventana al proyector y haga doble clic (o F11) para pantalla completa');
    pintarBtnProy();
  }
  $('#btnProyectar').addEventListener('click', proyectar);
  $('#btnAbrirProyector').addEventListener('click', proyectar);
  $('#btnExtender').addEventListener('click', () => modoPantallas('extender'));
  $('#btnDuplicar').addEventListener('click', () => modoPantallas('duplicar'));
  setInterval(pintarBtnProy, 1000);

  // ================================================================ Botones en vivo
  $('#btnLimpiar').addEventListener('click', limpiar);
  $('#btnApagar').addEventListener('click', async () => {
    if (!confirm('¿Cerrar PK-PENTECOSTAL?\n\nSe detiene el servidor: el proyector y OBS dejarán de recibir texto.')) return;
    try {
      await api('/api/apagar', { method: 'POST' });
      document.body.innerHTML = '<div class="pk-pantalla" role="dialog" aria-label="PK-PENTECOSTAL se cerró"><div class="pp-caja"><img class="pp-logo" src="/logo-pk.webp" width="160" height="160" alt=""><p class="pp-hola">Gracias por usar</p><h1 class="pp-titulo">PK-<b>PENTECOSTAL</b></h1><p class="pp-sub">El programa se cerró correctamente</p><hr class="pp-sep"><p class="pp-verso">«Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» <b>Salmos 19:4</b></p><hr class="pp-sep"><p class="pp-credito">Hecho por Sebastian Lopez · IPUC Natania 6° Etapa</p><p class="pp-zona">Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina</p><p class="pp-pie">Ya puede cerrar esta pestaña</p></div></div>';
    } catch (e) { toast(e.message); }
  });
  $('#btnNegro').addEventListener('click', () => api('/api/vivo', { method: 'POST', body: { negro: !estado?.negro } }));
  $('#btnOcultar').addEventListener('click', () => api('/api/vivo', { method: 'POST', body: { ocultarTexto: !estado?.ocultarTexto } }));

  // ================================================================ Teclado
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const tab = store.get('tab', 'biblia');
      const target = tab === 'canciones' ? '#canBuscar' : '#refInput';
      if (tab !== 'canciones') abrirTab('biblia');
      $(target).focus(); $(target).select(); return;
    }
    if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else limpiar(); return; }
    if (typing) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); mover(1); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); mover(-1); }
    else if (k.toLowerCase() === 'b') $('#btnNegro').click();
    else if (k.toLowerCase() === 'h') $('#btnOcultar').click();
    else if (/^[1-9]$/.test(k) && ctx && ctx.tipo !== 'biblia') proyectarSlide(+k - 1);
  });

  // ================================================================ Monitores (escala de iframes)
  const ro = new ResizeObserver((ents) => { for (const en of ents) { const f = en.target.querySelector('iframe'); f.style.transform = `scale(${en.contentRect.width / 1920})`; } });
  $$('.screen').forEach((s) => ro.observe(s));

  // ================================================================ Conexión en tiempo real
  function onEstado(st) {
    const cambioEstilo = !estado || JSON.stringify(estado.estilo) !== JSON.stringify(st.estilo);
    const ea = (estado && estado.estilo) || {}, eb = st.estilo || {};
    const cambioLineas = !!estado && (ea.lineasMax !== eb.lineasMax || ea.letrasRenglon !== eb.letrasRenglon);
    estado = st;
    // «Líneas por diapositiva» o «Letras por renglón» cambió: la canción abierta se vuelve a repartir
    if (cambioLineas && ctx && ctx.tipo === 'cancion' && CAN.actual) abrirCancion(CAN.actual);
    if (st.idioma && window.I18N && st.idioma !== window.I18N.idioma) window.I18N.set(st.idioma);
    $('#btnNegro').classList.toggle('on', !!st.negro);
    $('#btnOcultar').classList.toggle('on', !!st.ocultarTexto);
    $('#nowRef').textContent = st.vivo ? (st.vivo.ref || st.vivo.titulo || '(texto)') : '—';
    $('#nowTxt').textContent = st.vivo ? st.vivo.texto.replace(/\[\[(\d+)\]\]\s*/g, '$1 ') : (window.I18N ? window.I18N.t('Nada en pantalla') : 'Nada en pantalla');
    if (!st.vivo) { liveIdx = -1; }
    marcar();
    if (cambioEstilo) { pintarFormEstilo(st.estilo); if (FONDOS.length) marcarFondoActivo(); }
    window.PP?.alEstado?.(st);
    repartirEstado(st);
  }
  // Reparte el estado a los monitores/vistas previas (iframes) para que no abran su propia conexión
  function repartirEstado(st, destino) {
    const msg = { tipo: 'estado', st };
    if (destino) { try { destino.postMessage(msg, location.origin); } catch (_) { /* iframe cerrado */ } return; }
    $$('iframe').forEach((f) => { try { f.contentWindow?.postMessage(msg, location.origin); } catch (_) { /* aún cargando */ } });
  }
  addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.tipo === 'pedirEstado' && estado) repartirEstado(estado, e.source);
  });

  function conectar() {
    const es = new EventSource('/api/eventos?canal=' + (window.PK_VISOR || 1));
    es.addEventListener('estado', (e) => { $('#conn').textContent = '● Conectado al servidor'; $('#conn').className = 'conn ok'; onEstado(JSON.parse(e.data)); });
    es.onerror = () => { $('#conn').textContent = '● Sin conexión con el servidor — ¿está abierta la ventana de PK-PENTECOSTAL?'; $('#conn').className = 'conn err'; };
  }

  // ================================================================ Inicio
  async function init() {
    pintarLibros();
    abrirTab(store.get('tab', 'biblia'));
    conectar();
    pintarOBS(); pintarGuardados();
    const fuentes = await api('/api/fuentes');
    const opts = [...fuentes, 'Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Impact'].map((f) => `<option value="${esc(f)}" style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('');
    $$('select.fuentes').forEach((s) => (s.innerHTML = opts));
    window.PP?.alFuentes?.();
    if (estado) pintarFormEstilo(estado.estilo);

    const [biblias, cancioneros] = await Promise.all([api('/api/biblias'), api('/api/cancioneros')]);
    BIBLIAS = biblias;
    $('#bibVersion').innerHTML = biblias.map((b) => `<option>${esc(b)}</option>`).join('');
    CAN.libros = cancioneros;
    // "🌐 CANCIONES EN LÍNEA IPUC" va justo después del Corario IPUC castilla (o al final si no está)
    const iCor = cancioneros.findIndex((c) => /corario ipuc/i.test(c));
    const optEnl = `<option value="${ENL}">🌐 ${esc(ENL_NOMBRE)}</option>`;
    $('#cancionero').innerHTML = `<option value="${TODOS}">★ Todos los cancioneros</option>` + cancioneros.map((c, i) => `<option>${esc(c)}</option>` + (i === iCor ? optEnl : '')).join('') + (iCor < 0 ? optEnl : '');
    const cSel = store.get('cancionero', TODOS);
    $('#cancionero').value = [TODOS, ENL, ...cancioneros].includes(cSel) ? cSel : TODOS;
    cargarCancionero($('#cancionero').value);
    cargarFondos();
    if (biblias.length) {
      const b = store.get('biblia', biblias[0]);
      $('#bibVersion').value = biblias.includes(b) ? b : biblias[0];
      await cargarBiblia($('#bibVersion').value);
      await bibliaSegunIdioma();
    } else {
      $('#items').innerHTML = '<div class="empty"><span class="big">📖</span>No se encontraron Biblias en la carpeta <code>biblias</code></div>';
    }
  }
  // ================================================================ IDIOMAS
  function marcarIdioma() {
    const i = window.I18N ? window.I18N.idioma : 'es';
    $$('#idiomas button').forEach((b) => b.classList.toggle('active', b.dataset.idioma === i));
  }
  $('#idiomas')?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-idioma]'); if (!b || !window.I18N) return;
    window.I18N.set(b.dataset.idioma);
    api('/api/idioma', { method: 'POST', body: { idioma: b.dataset.idioma } }).then(() => toast('Idioma cambiado')).catch((er) => toast('Error: ' + er.message));
  });
  // ---------- Traducción automática de todas las canciones
  let tradTimer = null, tradEstabaActivo = false;
  async function pintarTraduccion() {
    let e;
    try { e = await api('/api/traducir/estado'); } catch (_) { return; }
    const card = $('#tradCard'); if (!card) return;
    if (!e.disponible) {
      $('#tradEstado').textContent = 'El traductor automático no está instalado en este computador.';
      $('#btnTraducirTodo').disabled = true; return;
    }
    const pct = e.total ? Math.round((e.hechas / e.total) * 100) : 0;
    $('#tradBarra').classList.toggle('hidden', !e.activo);
    $('#tradRelleno').style.width = pct + '%';
    $('#btnTraducirTodo').classList.toggle('hidden', e.activo);
    $('#btnTraducirCancelar').classList.toggle('hidden', !e.activo);
    if (e.activo) {
      $('#tradEstado').textContent = e.total ? `Traduciendo ${e.hechas} de ${e.total} (${pct}%) · ${e.actual}` : (e.actual || 'Preparando el traductor…');
    } else if (e.error) {
      $('#tradEstado').textContent = 'Error: ' + e.error;
    } else if (e.fin) {
      $('#tradEstado').textContent = `Listo: ${e.hechas} canciones traducidas automáticamente.`;
    } else $('#tradEstado').textContent = '';
    if (tradEstabaActivo && !e.activo) cargarCancionero($('#cancionero').value); // mostrar las nuevas traducciones
    tradEstabaActivo = e.activo;
    clearTimeout(tradTimer);
    if (e.activo) tradTimer = setTimeout(pintarTraduccion, 1500);
  }
  $('#btnTraducirTodo')?.addEventListener('click', async () => {
    try { await api('/api/traducir/todo', { method: 'POST' }); toast('Traducción iniciada'); } catch (e) { toast('Error: ' + e.message); }
    pintarTraduccion();
  });
  $('#btnTraducirCancelar')?.addEventListener('click', () => api('/api/traducir/cancelar', { method: 'POST' }).then(pintarTraduccion));
  $('#tabs').addEventListener('click', (e) => { if (e.target.closest('[data-tab="idiomas"]')) pintarTraduccion(); });
  pintarTraduccion();

  window.I18N?.alCambiar(() => {
    marcarIdioma(); bibliaSegunIdioma().catch(() => {}); if (estado) onEstado(estado);
    filtrarCanciones();
    if (ctx?.tipo === 'cancion' && CAN.actual) abrirCancion(CAN.actual);
    window.PP?.alIdioma?.();
  });
  marcarIdioma();

  window.PP = Object.assign(window.PP || {}, { api, toast, esc, norm, store, $, $$, estado: () => estado, abrirTab, bibliaSegunIdioma });
  init().catch((e) => toast('Error al iniciar: ' + e.message));
})();
