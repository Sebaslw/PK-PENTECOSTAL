/* PK-PENTECOSTAL · Módulo OBS → pestaña STINGERS (biblioteca, editor, vista previa y control al aire)
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
(() => {
  'use strict';
  const PP = window.PP;
  const { api, toast, esc, store, $, $$ } = PP;
  const M = window.StingerMotor;
  const FUENTE_OBS = 'PK-PENTECOSTAL · Stinger';
  const NOMBRE_ESTILO = Object.fromEntries(M.ESTILOS);
  const ICONO = { image: '🖼', anim: '🎞', text: '🅣', shape: '▭' };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const esperar = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const copia = (o) => JSON.parse(JSON.stringify(o));

  let L = null;          // biblioteca en edición
  let G = null;          // última versión guardada en el servidor
  let sel = '';          // id del stinger que se edita
  let sucio = false, rev = -1, fijo = false, st = null, fuentes = [];
  const abiertos = new Set(); // elementos desplegados en el editor

  const resolver = StingerMotor.resolver;
  const actual = () => L && L.stingers.find((s) => s.id === sel);
  const activoG = () => G && (G.stingers.find((s) => s.id === G.activo) || G.stingers[0]);
  const logoDe = (s) => s.logo || ((s.elements || []).find((e) => e.role === 'logo' || e.type === 'image') || {}).src || '';

  // ================================================================ Carga / guardado
  async function cargar(forzar) {
    if (sucio && !forzar) return;
    try { G = await api('/api/stingers'); } catch (e) { toast('Stingers: ' + e.message); return; }
    L = copia(G);
    if (!L.stingers.some((s) => s.id === sel)) sel = L.activo;
    sucio = false;
    pintarTodo();
    precargar();
  }
  async function guardar(lib = L) {
    await api('/api/stingers', { method: 'PUT', body: { activo: lib.activo, ajustes: lib.ajustes, stingers: lib.stingers } });
    G = { ...G, ...copia({ activo: lib.activo, ajustes: lib.ajustes, stingers: lib.stingers }) };
    rev = -2; // el próximo estado del servidor trae la revisión nueva: no hace falta recargar
  }
  function marcar() { sucio = true; pintarBarra(); pintarListaLuego(); refrescarFijo(); }

  // Ajustes y "Usar": se guardan al instante sin tocar los cambios en edición
  async function guardarAjustes() {
    try {
      const base = copia(G); base.ajustes = copia(L.ajustes);
      await guardar(base);
    } catch (e) { toast('Error: ' + e.message); }
  }
  async function usar(id) {
    L.activo = id;
    if (!G.stingers.some((s) => s.id === id)) { await guardarTodo(); return; }
    const base = copia(G); base.activo = id;
    try { await guardar(base); toast('Stinger activo: ' + (L.stingers.find((s) => s.id === id) || {}).name); } catch (e) { toast('Error: ' + e.message); }
    pintarLista(); pintarAire();
    precargar();
  }
  async function guardarTodo() {
    try { await guardar(L); sucio = false; pintarTodo(); toast('Stingers guardados'); } catch (e) { toast('Error: ' + e.message); }
  }

  // ================================================================ Lista
  let listaT = 0;
  const pintarListaLuego = () => { clearTimeout(listaT); listaT = setTimeout(pintarLista, 250); };
  function pintarLista() {
    if (!L) return;
    $('#stgLista').innerHTML = L.stingers.map((s) => {
      const p = M.paleta(s), logo = logoDe(s);
      const act = s.id === L.activo;
      return `<div class="stg-item ${s.id === sel ? 'sel' : ''}" data-id="${esc(s.id)}">
        <div class="stg-sw" style="background:${p.fondo}"><i style="background:${p.acento}"></i>${logo ? `<img src="${esc(resolver(logo))}" alt="" loading="lazy">` : ''}</div>
        <div class="stg-info"><b>${esc(s.name)}</b><small>${esc(NOMBRE_ESTILO[s.style] || s.style)} · ${s.inTime}/${s.outTime} ms${s.soundIn && s.soundIn.src ? ' · 🔊' : ''}</small></div>
        <button class="small ${act ? 'on' : ''}" data-usar title="Usar al aire y al cambiar de escena">${act ? '✓ Activo' : 'Usar'}</button>
      </div>`;
    }).join('');
  }
  $('#stgLista').addEventListener('click', (e) => {
    const it = e.target.closest('.stg-item'); if (!it) return;
    if (e.target.closest('[data-usar]')) return usar(it.dataset.id);
    sel = it.dataset.id; abiertos.clear();
    pintarLista(); pintarEditor(); precargar();
    if (fijo) refrescarFijo(true);
  });
  $('#stgNuevo').addEventListener('click', () => {
    const base = actual();
    const s = {
      id: 'stg-' + uid(), name: 'Nuevo stinger', mode: 'hold', style: 'iris', color1: '#061f45', color2: '#f2b705', inTime: 800, outTime: 700,
      logo: base ? base.logo : '/logo-ipuc.webp', soundIn: null, soundOut: null,
      effects: [{ id: 'f' + uid(), type: 'particulas', color: '#ffd666', amount: 40, speed: 30, size: 40, opacity: 35 }],
      elements: [
        { id: 'e' + uid(), type: 'image', src: base ? logoDe(base) || '/logo-ipuc.webp' : '/logo-ipuc.webp', x: 50, y: 44, w: 30, opacity: 100, in: 'zoom', out: 'zoom', role: 'logo' },
        { id: 'e' + uid(), type: 'text', text: 'IPUC NATANIA 6° ETAPA', x: 50, y: 80, opacity: 100, in: 'abajo', out: 'fade', font: 'Source Sans 3', size: 50, color: '#ffffff', bold: true, upper: true, shadow: true, textAnim: 'letras' },
      ],
    };
    L.stingers.unshift(s); sel = s.id; abiertos.clear();
    marcar(); pintarLista(); pintarEditor();
  });

  // ================================================================ Editor
  const opts = (lista, v) => lista.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('');
  function optsArchivos(carpetas, v, ninguno) {
    const R = L.recursos || {};
    let html = ninguno ? `<option value="">${ninguno}</option>` : '';
    let esta = !v;
    const NOM = { logos: 'Logos', imagenes: 'Imágenes', fondos: 'Fondos', animaciones: 'Animaciones (video)', sonidos: 'Sonidos' };
    for (const c of carpetas) {
      const lista = R[c] || [];
      if (!lista.length) continue;
      html += `<optgroup label="${NOM[c]}">` + lista.map((f) => { const val = `lib:${c}/${f}`; if (val === v) esta = true; return `<option value="${esc(val)}" ${val === v ? 'selected' : ''}>${esc(f)}</option>`; }).join('') + '</optgroup>';
    }
    if (carpetas.includes('logos')) {
      html += '<optgroup label="PK-PENTECOSTAL">' + [['/logo-ipuc.webp', 'Logo IPUC'], ['/icono-512.png', 'Logo PK-PENTECOSTAL']].map(([val, t]) => { if (val === v) esta = true; return `<option value="${val}" ${val === v ? 'selected' : ''}>${t}</option>`; }).join('') + '</optgroup>';
    }
    if (!esta) html = `<option value="${esc(v)}" selected>${esc(String(v).replace(/^lib:/, ''))} (no encontrado)</option>` + html;
    return html;
  }
  const campo = (label, input, cls = '') => `<div class="f ${cls}"><label>${label}</label>${input}</div>`;
  const num = (k, v, min, max, step = 1) => `<input type="number" data-k="${k}" data-t="n" value="${esc(v ?? '')}" min="${min}" max="${max}" step="${step}">`;
  const rango = (k, v, min, max, step = 1, suf = '') => `<div class="f"><label>${''}<output>${esc(v ?? 0)}${suf}</output></label><input type="range" data-k="${k}" data-t="n" data-suf="${suf}" value="${esc(v ?? 0)}" min="${min}" max="${max}" step="${step}"></div>`;
  const chk = (k, v, t) => `<label class="chk small"><input type="checkbox" data-k="${k}" ${v ? 'checked' : ''}> ${t}</label>`;

  function editorSonido(k, snd, titulo) {
    const s = snd || {};
    return `<div class="stg-snd"><div class="row"><b class="grow">${titulo}</b>${s.src ? `<button class="small" data-oir="${k}" title="Escuchar">▶</button>` : ''}</div>
      <select class="full" data-k="${k}.src">${optsArchivos(['sonidos'], s.src || '', '— Sin sonido —')}</select>
      ${s.src ? `<div class="f2"><div class="f grow"><label>Volumen <output>${s.volume ?? 80}%</output></label><input type="range" data-k="${k}.volume" data-t="n" data-suf="%" min="0" max="100" value="${s.volume ?? 80}"></div>
      <div class="f" style="width:96px"><label>Retraso ms</label>${num(k + '.offset', s.offset ?? 0, 0, 5000, 10)}</div></div>` : ''}</div>`;
  }

  function editorEfecto(f, i) {
    const k = `effects.${i}`;
    return `<div class="stg-fx-row">
      <div class="row"><select data-k="${k}.type" class="grow">${opts(M.EFECTOS, f.type)}</select><input type="color" data-k="${k}.color" value="${esc(f.color || '#ffffff')}"><button class="small" data-quitar-fx="${i}" title="Quitar efecto">✕</button></div>
      <div class="stg-grid2">
        <div class="f"><label>Cantidad <output>${f.amount ?? 50}</output></label><input type="range" data-k="${k}.amount" data-t="n" min="0" max="100" value="${f.amount ?? 50}"></div>
        <div class="f"><label>Velocidad <output>${f.speed ?? 30}</output></label><input type="range" data-k="${k}.speed" data-t="n" min="0" max="100" value="${f.speed ?? 30}"></div>
        <div class="f"><label>Tamaño <output>${f.size ?? 40}</output></label><input type="range" data-k="${k}.size" data-t="n" min="0" max="100" value="${f.size ?? 40}"></div>
        <div class="f"><label>Opacidad <output>${f.opacity ?? 50}%</output></label><input type="range" data-k="${k}.opacity" data-t="n" data-suf="%" min="0" max="100" value="${f.opacity ?? 50}"></div>
      </div></div>`;
  }

  function etiquetaEl(e) {
    if (e.type === 'text') return e.text || '(texto vacío)';
    if (e.type === 'shape') return 'Figura';
    return String(e.src || '').replace(/^lib:[^/]+\//, '').replace(/^\//, '') || '(sin archivo)';
  }
  function editorElemento(e, i, n) {
    const k = `elements.${i}`;
    let cuerpo = '';
    if (e.type === 'image') cuerpo += campo('Imagen', `<select class="full" data-k="${k}.src">${optsArchivos(['logos', 'imagenes', 'fondos'], e.src || '')}</select>`);
    if (e.type === 'anim') cuerpo += campo('Video (webm con transparencia)', `<select class="full" data-k="${k}.src">${optsArchivos(['animaciones'], e.src || '')}</select>`);
    if (e.type === 'text') {
      cuerpo += campo('Texto', `<input class="full" data-k="${k}.text" value="${esc(e.text || '')}">`);
      cuerpo += `<div class="f2"><div class="f grow"><label>Fuente</label><select class="full" data-k="${k}.font">${opts([...new Set([e.font || 'Source Sans 3', ...fuentes])].map((f) => [f, f]), e.font || 'Source Sans 3')}</select></div>
        <div class="f" style="width:80px"><label>Tamaño</label>${num(k + '.size', e.size ?? 40, 8, 400)}</div><div class="f"><label>Color</label><input type="color" data-k="${k}.color" value="${esc(e.color || '#ffffff')}"></div></div>`;
      cuerpo += `<div class="row">${chk(k + '.bold', e.bold, 'Negrita')}${chk(k + '.upper', e.upper, 'MAYÚSCULAS')}${chk(k + '.shadow', e.shadow, 'Sombra')}</div>`;
      cuerpo += campo('Animación del texto', `<select class="full" data-k="${k}.textAnim">${opts(M.TEXTO_ANIM, e.textAnim || 'ninguna')}</select>`);
    }
    if (e.type === 'shape') {
      cuerpo += `<div class="f2"><div class="f"><label>Color</label><input type="color" data-k="${k}.color" value="${esc(e.color || '#ffffff')}"></div>
        <div class="f grow"><label>Alto %</label>${num(k + '.h', e.h ?? 20, 1, 300, 0.5)}</div><div class="f grow"><label>Redondeo</label>${num(k + '.radius', e.radius ?? 0, 0, 500)}</div><div class="f grow"><label>Inclinación</label>${num(k + '.skew', e.skew ?? 0, -45, 45)}</div></div>`;
    }
    cuerpo += `<div class="stg-grid3">
      <div class="f"><label>X %</label>${num(k + '.x', e.x ?? 50, -50, 150, 0.1)}</div>
      <div class="f"><label>Y %</label>${num(k + '.y', e.y ?? 50, -50, 150, 0.1)}</div>
      ${e.type === 'text' ? '<div></div>' : `<div class="f"><label>Ancho %</label>${num(k + '.w', e.w ?? 30, 1, 300, 0.5)}</div>`}
    </div>
    <div class="f"><label>Opacidad <output>${e.opacity ?? 100}%</output></label><input type="range" data-k="${k}.opacity" data-t="n" data-suf="%" min="0" max="100" value="${e.opacity ?? 100}"></div>
    <div class="f2"><div class="f grow"><label>Entra</label><select class="full" data-k="${k}.in">${opts(M.ENTRADAS, e.in || 'fade')}</select></div>
      <div class="f grow"><label>Sale</label><select class="full" data-k="${k}.out">${opts(M.SALIDAS, e.out || 'fade')}</select></div></div>`;
    return `<details class="stg-el" data-i="${i}" ${abiertos.has(e.id) ? 'open' : ''}>
      <summary><span class="ic">${ICONO[e.type] || '•'}</span><span class="nm">${esc(etiquetaEl(e))}</span>
        <span class="acc"><button class="small" data-mover="${i},-1" ${i === 0 ? 'disabled' : ''} title="Atrás">▲</button><button class="small" data-mover="${i},1" ${i === n - 1 ? 'disabled' : ''} title="Adelante">▼</button><button class="small" data-dup-el="${i}" title="Duplicar">⧉</button><button class="small" data-quitar-el="${i}" title="Quitar">✕</button></span></summary>
      <div class="stg-el-body">${cuerpo}</div></details>`;
  }

  function pintarEditor() {
    const s = actual(), ed = $('#stgEditor');
    if (!s) { ed.innerHTML = '<div class="hint">Elija un stinger de la lista.</div>'; return; }
    const els = s.elements || [];
    ed.innerHTML = `<div class="savebar mini" id="stgBarra"></div>
      <div class="mcard">
        <div class="mcard-h"><b>✏ ${esc(s.name)}</b><span class="row" style="gap:4px"><button class="small" id="stgDup" title="Duplicar stinger">⧉ Duplicar</button><button class="small" id="stgBorrar" title="Eliminar stinger">🗑</button></span></div>
        ${campo('Nombre', `<input class="full" data-k="name" value="${esc(s.name)}">`)}
        ${campo('Cortina (estilo)', `<select class="full" data-k="style">${opts(M.ESTILOS, s.style)}</select>`)}
        <div class="f2"><div class="f"><label>Color 1</label><input type="color" data-k="color1" value="${esc(s.color1 || '#061f45')}"></div>
          <div class="f"><label>Color 2</label><input type="color" data-k="color2" value="${esc(s.color2 || '#f2b705')}"></div>
          <div class="f grow"><label>Entrada ms</label>${num('inTime', s.inTime, 100, 10000, 50)}</div>
          <div class="f grow"><label>Salida ms</label>${num('outTime', s.outTime, 100, 10000, 50)}</div></div>
        <div class="hint" style="margin:6px 0 0">El color más oscuro es el fondo; el más claro, el borde de luz que va delante.</div>
      </div>
      <div class="mcard"><div class="mcard-h"><b>🔊 Sonidos</b></div>
        ${editorSonido('soundIn', s.soundIn, 'Al entrar')}${editorSonido('soundOut', s.soundOut, 'Al salir')}</div>
      <div class="mcard"><div class="mcard-h"><b>✨ Efectos</b><button class="small" id="stgAddFx">＋ Efecto</button></div>
        ${(s.effects || []).map(editorEfecto).join('') || '<div class="mstate">Sin efectos.</div>'}</div>
      <div class="mcard"><div class="mcard-h"><b>🧩 Elementos</b><span class="mstate" style="margin:0">${els.length}</span></div>
        <div class="row stg-add">
          <button class="small" data-add-el="image">＋ 🖼 Imagen</button><button class="small" data-add-el="text">＋ 🅣 Texto</button>
          <button class="small" data-add-el="anim">＋ 🎞 Video</button><button class="small" data-add-el="shape">＋ ▭ Figura</button>
        </div>
        ${els.map((e, i) => editorElemento(e, i, els.length)).join('') || '<div class="mstate">Sin elementos.</div>'}
        <div class="hint">El orden de la lista es el orden de las capas: el último queda encima.</div>
      </div>
      <div class="mcard"><div class="mcard-h"><b>📁 Subir archivos</b></div>
        <div class="mstate">Logos, imágenes (PNG/SVG), sonidos (MP3) o videos con transparencia (WEBM).</div>
        <div class="row"><select id="stgSubirA" class="grow"><option value="logos">Logos</option><option value="imagenes">Imágenes</option><option value="sonidos">Sonidos</option><option value="animaciones">Animaciones (video)</option></select>
        <label class="btn-file">Seleccionar…<input type="file" id="stgSubirF" hidden multiple></label></div>
      </div>`;
    pintarBarra();
  }
  function pintarBarra() {
    const b = $('#stgBarra'); if (!b) return;
    b.innerHTML = `<span class="estado ${sucio ? 'no' : 'ok'}">${sucio ? '● Cambios sin guardar' : '✓ Guardado'}</span>
      <button id="stgDescartar" ${sucio ? '' : 'disabled'} title="Volver a lo último guardado">⟲ Descartar</button>
      <button id="stgGuardar" class="primary" ${sucio ? '' : 'disabled'}>GUARDAR</button>`;
  }

  // Asigna un valor en una ruta "elements.2.x" del stinger
  function asignar(obj, ruta, valor) {
    const partes = ruta.split('.');
    let o = obj;
    for (let i = 0; i < partes.length - 1; i++) {
      const p = partes[i];
      if (o[p] == null || typeof o[p] !== 'object') o[p] = /^\d+$/.test(partes[i + 1]) ? [] : {};
      o = o[p];
    }
    o[partes[partes.length - 1]] = valor;
  }
  const ed = $('#stgEditor');
  ed.addEventListener('input', (e) => {
    const el = e.target, k = el.dataset.k, s = actual();
    if (!k || !s) return;
    let v = el.type === 'checkbox' ? el.checked : el.dataset.t === 'n' ? +el.value : el.value;
    const out = el.closest('.f')?.querySelector('output'); if (out) out.textContent = el.value + (el.dataset.suf || '');
    if (/^sound(In|Out)\.src$/.test(k)) {
      const sk = k.split('.')[0];
      s[sk] = v ? { ...(s[sk] || { volume: 80, offset: 0 }), src: v, name: v.split('/').pop() } : null;
      marcar(); pintarEditor(); return;
    }
    asignar(s, k, v);
    if (k === 'name') { const h = ed.querySelector('.mcard-h b'); if (h) h.textContent = '✏ ' + v; }
    if (/^elements\.\d+\.(text|src)$/.test(k)) { const d = el.closest('details'); if (d) d.querySelector('.nm').textContent = etiquetaEl(s.elements[+k.split('.')[1]]); }
    marcar();
  });
  ed.addEventListener('toggle', (e) => {
    const d = e.target; if (!d.matches || !d.matches('details.stg-el')) return;
    const el = (actual()?.elements || [])[+d.dataset.i]; if (!el) return;
    if (d.open) abiertos.add(el.id); else abiertos.delete(el.id);
  }, true);
  ed.addEventListener('click', async (e) => {
    const s = actual(); if (!s) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('summary')) e.preventDefault();
    if (b.id === 'stgGuardar') return guardarTodo();
    if (b.id === 'stgDescartar') { if (confirm('¿Descartar los cambios sin guardar?')) cargar(true); return; }
    if (b.id === 'stgDup') {
      const n = copia(s); n.id = 'stg-' + uid(); n.name = s.name + ' (copia)';
      L.stingers.splice(L.stingers.indexOf(s) + 1, 0, n); sel = n.id; marcar(); pintarLista(); pintarEditor(); return;
    }
    if (b.id === 'stgBorrar') {
      if (L.stingers.length < 2) return toast('Debe quedar al menos un stinger');
      if (!confirm(`¿Eliminar el stinger "${s.name}"? (no se borra hasta pulsar GUARDAR)`)) return;
      L.stingers = L.stingers.filter((x) => x !== s);
      if (L.activo === s.id) L.activo = L.stingers[0].id;
      sel = L.stingers[0].id; marcar(); pintarLista(); pintarEditor(); return;
    }
    if (b.id === 'stgAddFx') { (s.effects ||= []).push({ id: 'f' + uid(), type: 'particulas', color: '#ffd666', amount: 40, speed: 30, size: 40, opacity: 40 }); marcar(); pintarEditor(); return; }
    if (b.dataset.quitarFx != null) { s.effects.splice(+b.dataset.quitarFx, 1); marcar(); pintarEditor(); return; }
    if (b.dataset.addEl) {
      const t = b.dataset.addEl, R = L.recursos || {};
      const nuevo = { id: 'e' + uid(), type: t, x: 50, y: 50, opacity: 100, in: t === 'text' ? 'abajo' : 'zoom', out: 'fade' };
      if (t === 'image') Object.assign(nuevo, { src: R.logos && R.logos[0] ? 'lib:logos/' + R.logos[0] : '/logo-ipuc.webp', w: 30 });
      if (t === 'anim') { if (!(R.animaciones || []).length) return toast('No hay videos: súbalos en "Subir archivos" (Animaciones)'); Object.assign(nuevo, { src: 'lib:animaciones/' + R.animaciones[0], w: 100, in: 'fade' }); }
      if (t === 'text') Object.assign(nuevo, { text: 'Texto nuevo', font: 'Source Sans 3', size: 48, color: '#ffffff', bold: true, upper: true, shadow: true, textAnim: 'letras', y: 80 });
      if (t === 'shape') Object.assign(nuevo, { w: 60, h: 12, color: '#f2b705', radius: 0, skew: 0, y: 80, in: 'izquierda', out: 'derecha', opacity: 90 });
      (s.elements ||= []).push(nuevo); abiertos.add(nuevo.id); marcar(); pintarEditor(); return;
    }
    if (b.dataset.quitarEl != null) { s.elements.splice(+b.dataset.quitarEl, 1); marcar(); pintarEditor(); return; }
    if (b.dataset.dupEl != null) { const i = +b.dataset.dupEl, n = copia(s.elements[i]); n.id = 'e' + uid(); n.x = (+n.x || 50) + 2; n.y = (+n.y || 50) + 2; s.elements.splice(i + 1, 0, n); abiertos.add(n.id); marcar(); pintarEditor(); return; }
    if (b.dataset.mover) {
      const [i, d] = b.dataset.mover.split(',').map(Number), j = i + d;
      if (j < 0 || j >= s.elements.length) return;
      [s.elements[i], s.elements[j]] = [s.elements[j], s.elements[i]]; marcar(); pintarEditor(); return;
    }
    if (b.dataset.oir) {
      const snd = s[b.dataset.oir]; if (!snd || !snd.src) return;
      const a = new Audio(resolver(snd.src)); a.volume = Math.max(0, Math.min(1, (snd.volume ?? 80) / 100)); a.play().catch(() => toast('No se pudo reproducir el sonido'));
    }
  });
  ed.addEventListener('change', async (e) => {
    if (e.target.id !== 'stgSubirF') return;
    const carpeta = $('#stgSubirA').value;
    for (const f of e.target.files) {
      try {
        toast('Subiendo ' + f.name + '…');
        const r = await fetch(`/api/stingers/subir?carpeta=${carpeta}&nombre=${encodeURIComponent(f.name)}`, { method: 'PUT', body: f });
        const d = await r.json(); if (!r.ok) throw new Error(d.error);
        toast('Subido: ' + d.nombre);
      } catch (err) { toast('Error: ' + err.message); }
    }
    e.target.value = '';
    try { L.recursos = (await api('/api/stingers')).recursos; } catch (_) { /* sin cambios */ }
    pintarEditor();
  });

  // ================================================================ Vista previa (en el panel, sin tocar OBS)
  const frame = $('#stgPrevFrame');
  const alFrame = (msg) => { try { frame.contentWindow.postMessage({ tipo: 'stinger', ...msg }, location.origin); } catch (_) { /* aún cargando */ } };
  function precargar() { const s = actual(); if (s) alFrame({ precargar: true, stinger: copia(s) }); }
  $('#stgProbar').addEventListener('click', () => {
    const s = actual(); if (!s) return;
    fijo = false; $('#stgFijo').classList.remove('on');
    alFrame({ accion: 'completo', stinger: copia(s), sonido: $('#stgSonido').checked, pausa: Math.min(L.ajustes.pausa ?? 900, 4000) });
    $('#stgPrevInfo').textContent = `${s.name} · ${s.inTime} ms + pausa + ${s.outTime} ms`;
  });
  $('#stgFijo').addEventListener('click', () => {
    fijo = !fijo; $('#stgFijo').classList.toggle('on', fijo);
    const s = actual(); if (!s) return;
    alFrame(fijo ? { accion: 'entrar', stinger: copia(s), sonido: false } : { accion: 'salir', stinger: copia(s), sonido: false });
  });
  let fijoT = 0;
  function refrescarFijo(ya) {
    if (!fijo) return;
    clearTimeout(fijoT);
    fijoT = setTimeout(() => { const s = actual(); if (s) { alFrame({ accion: 'cancelar', stinger: s }); alFrame({ accion: 'entrar', stinger: copia(s), sonido: false }); } }, ya ? 0 : 450);
  }
  $('#stgSonido').checked = store.get('stgSonido', true);
  $('#stgSonido').addEventListener('change', (e) => store.set('stgSonido', e.target.checked));

  // ================================================================ Al aire (fuente /stinger de OBS)
  async function orden(accion, extra = {}) {
    if (sucio && G && L.activo === sel) toast('Ojo: al aire sale la versión GUARDADA de este stinger');
    try { return await api('/api/stinger', { method: 'POST', body: { accion, id: G ? G.activo : undefined, ...extra } }); } catch (e) { toast('Error: ' + e.message); return null; }
  }
  $('#stgEntrar').addEventListener('click', () => orden('entrar'));
  $('#stgSalir').addEventListener('click', () => orden('salir'));
  $('#stgCompleto').addEventListener('click', () => orden('completo'));
  function pintarAire() {
    const a = activoG();
    $('#stgActivoTxt').textContent = a ? 'Activo: ' + a.name : '';
    const on = !!(st && st.stinger && st.stinger.alAire);
    $('#stgEntrar').classList.toggle('on', on);
    $('#stgAireTxt').innerHTML = on ? '<b style="color:var(--cyan)">● La pantalla de OBS está cubierta por el stinger.</b>' : 'Necesita la fuente <b>/stinger</b> en OBS (botón de abajo o pestaña URLs).';
  }

  // Ajustes (se guardan solos)
  function pintarAjustes() {
    const a = L.ajustes;
    $('#stgCambiar').checked = !!a.cambiarEscena;
    $('#stgEspera').value = a.espera ?? 300; $('#stgEsperaO').textContent = (a.espera ?? 300) + ' ms';
    $('#stgPausa').value = a.pausa ?? 900; $('#stgPausaO').textContent = ((a.pausa ?? 900) / 1000).toFixed(1) + ' s';
  }
  let ajT = 0;
  const ajustar = (k, v) => { L.ajustes[k] = v; pintarAjustes(); clearTimeout(ajT); ajT = setTimeout(guardarAjustes, 400); };
  $('#stgCambiar').addEventListener('change', (e) => {
    ajustar('cambiarEscena', e.target.checked);
    if (e.target.checked && $('#swStinger')?.checked) { $('#swStinger').checked = false; store.set('swStinger', false); }
    toast(e.target.checked ? 'Las escenas cambiarán con el stinger de PK-PENTECOSTAL' : 'Cambio de escena normal');
  });
  $('#stgEspera').addEventListener('input', (e) => ajustar('espera', +e.target.value));
  $('#stgPausa').addEventListener('input', (e) => ajustar('pausa', +e.target.value));

  // ================================================================ OBS: añadir la fuente y cambiar escena con stinger
  $('#stgAddObs').addEventListener('click', async () => {
    const obs = PP.obs; if (!obs || !obs.conectado) return toast('Conecte OBS primero (pestaña Overlay)');
    try {
      const { scenes } = await obs.call('GetSceneList');
      const vid = await obs.call('GetVideoSettings').catch(() => ({ baseWidth: 1920, baseHeight: 1080 }));
      let existe = await obs.call('GetInputSettings', { inputName: FUENTE_OBS }).then(() => true, () => false);
      let n = 0;
      for (const sc of scenes) {
        const sceneName = sc.sceneName;
        const items = (await obs.call('GetSceneItemList', { sceneName })).sceneItems || [];
        let it = items.find((i) => i.sourceName === FUENTE_OBS), id = it && it.sceneItemId;
        if (!it) {
          const r = existe ? await obs.call('CreateSceneItem', { sceneName, sourceName: FUENTE_OBS })
            : await obs.call('CreateInput', { sceneName, inputName: FUENTE_OBS, inputKind: 'browser_source',
              inputSettings: { url: location.origin + '/stinger', width: 1920, height: 1080, reroute_audio: true, shutdown: false, restart_when_active: false } });
          existe = true; id = r.sceneItemId; n++;
          await obs.call('SetSceneItemTransform', { sceneName, sceneItemId: id, sceneItemTransform: { positionX: 0, positionY: 0, boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: vid.baseWidth || 1920, boundsHeight: vid.baseHeight || 1080 } }).catch(() => {});
        }
        const total = ((await obs.call('GetSceneItemList', { sceneName })).sceneItems || []).length;
        await obs.call('SetSceneItemIndex', { sceneName, sceneItemId: id, sceneItemIndex: total - 1 }).catch(() => {}); // siempre encima
      }
      toast(n ? `Stinger añadido a ${n} escena(s) (arriba de todo)` : 'El stinger ya estaba en todas las escenas (se subió arriba de todo)');
    } catch (e) { toast('OBS: ' + e.message); }
  });

  PP.stingerEscena = async (nombre) => {
    if (!G || !G.ajustes.cambiarEscena) return false;
    const obs = PP.obs; if (!obs || !obs.conectado) return false;
    const s = activoG(); if (!s) return false;
    const r = await api('/api/stinger', { method: 'POST', body: { accion: 'entrar', id: s.id } }).catch(() => null);
    if (!r) return false;
    await esperar(s.inTime + (G.ajustes.espera ?? 300));
    let antes = null, corte = null;
    try {
      antes = (await obs.call('GetCurrentSceneTransition')).transitionName;
      corte = ((await obs.call('GetSceneTransitionList')).transitions || []).find((t) => t.transitionKind === 'cut_transition');
      if (corte && corte.transitionName !== antes) await obs.call('SetCurrentSceneTransition', { transitionName: corte.transitionName });
    } catch (_) { /* se cambia con la transición actual */ }
    try { await obs.call('SetCurrentProgramScene', { sceneName: nombre }); }
    finally {
      if (corte && antes && corte.transitionName !== antes) await obs.call('SetCurrentSceneTransition', { transitionName: antes }).catch(() => {});
      await esperar(150);
      await api('/api/stinger', { method: 'POST', body: { accion: 'salir', id: s.id } }).catch(() => {});
    }
    return true;
  };

  // ================================================================ Importar desde ProyectoRP
  $('#stgImportar').addEventListener('click', async () => {
    if (sucio && !confirm('Hay cambios sin guardar en los stingers que se perderán. ¿Continuar?')) return;
    const b = $('#stgImportar'); b.disabled = true; b.textContent = 'Importando…';
    try {
      const r = await api('/api/stingers/importar', { method: 'POST' });
      $('#stgImportTxt').innerHTML = `✓ Listo: <b>${r.stingers}</b> stingers, <b>${r.archivos}</b> archivos nuevos, <b>${r.fuentes}</b> fuentes` +
        (r.overlay ? `, overlay “Imagen completa” y <b>${r.rotulos}</b> nombres nuevos en Rótulos.` : '.') +
        (r.overlay ? '<br><small>El overlay quedó en vista previa: pulse GUARDAR en la pestaña Overlay para conservarlo.</small>' : '');
      toast('Importado desde ProyectoRP');
      if (r.fuentes) await recargarFuentes();
      if (r.obs && r.obs.clave) {
        const c = store.get('obs', {});
        if (!c.clave && confirm(`ProyectoRP tiene guardada la conexión con OBS (puerto ${r.obs.puerto}). ¿Usarla también en PK-PENTECOSTAL?`)) {
          store.set('obs', { host: r.obs.host || (/localhost$/.test(location.hostname) ? 'localhost' : location.hostname) || 'localhost', puerto: r.obs.puerto, clave: r.obs.clave, auto: true });
          PP.conectarOBS?.(true);
        }
      }
      await cargar(true);
    } catch (e) { toast('Error: ' + e.message); }
    b.disabled = false; b.textContent = 'Importar desde ProyectoRP';
  });

  // Fuentes nuevas (p. ej. Source Sans 3 de ProyectoRP): se cargan sin reiniciar el panel
  async function recargarFuentes() {
    try {
      fuentes = await api('/api/fuentes');
      const link = document.querySelector('link[href^="/fuentes.css"]'); if (link) link.href = '/fuentes.css?v=' + Date.now();
      const op = [...fuentes, 'Segoe UI', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Impact'].map((f) => `<option value="${esc(f)}" style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('');
      $('select.fuentes').forEach((x) => { const v = x.value; x.innerHTML = op; x.value = v; });
      PP.alFuentes?.();
      $('#obsMod iframe').forEach((f) => { try { f.contentWindow.location.reload(); } catch (_) { /* otra página */ } });
    } catch (_) { /* sin cambios */ }
  }

  // ================================================================ Estado
  function pintarTodo() {
    if (!L) return;
    pintarLista(); pintarEditor(); pintarAjustes(); pintarAire();
    if (!L.proyectoRP) { $('#stgImportar').disabled = true; $('#stgImportTxt').textContent = 'ProyectoRP no está instalado en este computador.'; }
  }
  const prev = PP.alEstado;
  function alEstado(s) {
    st = s;
    if (rev === -2) rev = s.stingerRev;            // revisión que acabamos de guardar nosotros
    else if (s.stingerRev !== rev) { rev = s.stingerRev; cargar(false); }
    pintarAire();
  }
  PP.alEstado = (s) => { prev && prev(s); alEstado(s); };
  if (PP.estado && PP.estado()) { st = PP.estado(); rev = st.stingerRev; }
  api('/api/fuentes').then((f) => { fuentes = f; if (L) pintarEditor(); }).catch(() => {});
  frame.addEventListener('load', precargar);
  cargar(true);
})();
