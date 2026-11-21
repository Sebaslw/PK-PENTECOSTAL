/* PK-PENTECOSTAL · Módulo OBS → OVERLAY: diseños con imagen de fondo y textos que se adaptan solos
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 *
 * Seleccionar diseño → cargar su imagen (sin tocarla) → ubicar y ajustar los textos → vista previa y OBS al instante.
 * Si un diseño todavía no tiene zonas de texto (ProyectoRP o una imagen subida), se analiza la imagen:
 * se busca la franja opaca, se descartan las partes con mucho detalle (logos, adornos) y se reparten
 * el nombre, el cargo y el texto adicional en el espacio liso que queda.
 */
(() => {
  'use strict';
  const PP = window.PP;
  const { api, toast, esc, $, $$ } = PP;
  let DIS = [], st = null, rev = -1, sel = '';
  const NOMBRES = { nombre: 'Nombre (predicador)', sub: 'Cargo / grupo', extra: 'Texto adicional' };

  // ================================================================ Detección automática de zonas
  function cargarImagen(url) {
    return new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo abrir la imagen')); i.src = url; });
  }
  async function detectarZonas(url) {
    const img = await cargarImagen(url);
    const W = 480, H = 270, E = 1920 / W;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, W, H);
    const d = cx.getImageData(0, 0, W, H).data;
    const A = (x, y) => d[(y * W + x) * 4 + 3];
    const L = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
    // 1) Filas: ¿cuánto de cada fila está pintado?
    const cob = [];
    for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (A(x, y) > 160) n++; cob.push(n / W); }
    // 2) Franjas: filas seguidas con buena cobertura (se toleran huecos de 2 filas)
    const franjas = []; let ini = -1, hueco = 0;
    for (let y = 0; y <= H; y++) {
      const si = y < H && cob[y] > 0.3;
      if (si) { if (ini < 0) ini = y; hueco = 0; }
      else if (ini >= 0 && ++hueco > 2) { franjas.push([ini, y - hueco]); ini = -1; hueco = 0; }
    }
    if (ini >= 0) franjas.push([ini, H - 1]);
    const puntaje = ([a, b]) => { let s = 0; for (let y = a; y <= b; y++) s += cob[y]; return s * (1 + a / H); };
    const fr = franjas.filter(([a, b]) => b - a >= 4).sort((p, q) => puntaje(q) - puntaje(p))[0];
    if (!fr) return null;
    let [y0, y1] = fr;
    // 3) Columnas: opacas y "lisas" (sin logos ni adornos)
    const op = [], det = [];
    for (let x = 0; x < W; x++) {
      let o = 0, b = 0, n = 0;
      for (let y = y0; y <= y1; y++) {
        if (A(x, y) <= 160) continue;
        o++;
        if (x + 1 < W && y + 1 < H) { b += Math.abs(L(x, y) - L(x + 1, y)) + Math.abs(L(x, y) - L(x, y + 1)); n++; }
      }
      op.push(o / (y1 - y0 + 1)); det.push(n ? b / n : 0);
    }
    const suave = det.map((_, x) => { let s = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = det[x + k]; if (v !== undefined) { s += v; n++; } } return s / n; });
    const opacas = suave.filter((_, x) => op[x] > 0.8).sort((a, b) => a - b);
    const mediana = opacas.length ? opacas[Math.floor(opacas.length / 2)] : 0;
    const umbral = Math.max(6, mediana * 1.7);
    const libre = suave.map((v, x) => op[x] > 0.8 && v < umbral);
    for (let x = 1; x < W; x++) if (!libre[x]) { let j = x; while (j < W && !libre[j]) j++; if (j - x <= 4 && libre[x - 1] && j < W) for (let k = x; k < j; k++) libre[k] = true; x = j; }
    let mejor = [0, -1];
    for (let x = 0; x < W; x++) if (libre[x]) { let j = x; while (j + 1 < W && libre[j + 1]) j++; if (j - x > mejor[1] - mejor[0]) mejor = [x, j]; x = j; }
    let [x0, x1] = mejor;
    if (x1 - x0 < W * 0.15) { x0 = op.findIndex((v) => v > 0.8); x1 = W - 1 - [...op].reverse().findIndex((v) => v > 0.8); }
    // 4) Alto útil: solo filas bien pintadas dentro de ese tramo
    const llena = (y) => { let n = 0; for (let x = x0; x <= x1; x++) if (A(x, y) > 200) n++; return n / (x1 - x0 + 1) > 0.85; };
    while (y0 < y1 && !llena(y0)) y0++;
    while (y1 > y0 && !llena(y1)) y1--;
    // 5) Color del texto según el fondo
    let lum = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 2) { lum += L(x, y); n++; }
    lum /= n || 1;
    const color = lum < 150 ? '#ffffff' : '#0a2142', suaveColor = lum < 150 ? '#e6ecf5' : '#1b3f6e';
    // 6) Reparto de los textos según la forma del espacio libre
    const X = Math.round(x0 * E), Y = Math.round(y0 * E), Wz = Math.round((x1 - x0 + 1) * E), Hz = Math.round((y1 - y0 + 1) * E);
    const px = Math.round(Math.min(28, Wz * 0.03)), py = Math.round(Hz * 0.12);
    const zona = (x, y, w, h, alinear, c, negrita) => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), alinear, color: c, negrita });
    const ix = X + px, iw = Wz - px * 2, iy = Y + py, ih = Hz - py * 2;
    if (Hz >= 200) return { nombre: zona(ix, iy, iw, ih * 0.46, 'left', color, true), sub: zona(ix, iy + ih * 0.5, iw, ih * 0.27, 'left', suaveColor, false), extra: zona(ix, iy + ih * 0.8, iw, ih * 0.2, 'left', '#f8b800', true) };
    if (Hz >= 120) return { nombre: zona(ix, iy, iw, ih * 0.6, 'left', color, true), sub: zona(ix, iy + ih * 0.64, iw, ih * 0.36, 'left', suaveColor, false) };
    return { nombre: zona(ix, iy, iw * 0.57, ih, 'left', color, true), sub: zona(ix + iw * 0.6, iy + ih * 0.12, iw * 0.4, ih * 0.76, 'right', suaveColor, false) };
  }

  // ================================================================ Galería
  async function cargar() {
    try { DIS = await api('/api/overlays'); } catch (_) { return; }
    pintar();
  }
  // ================================================================ Vista previa de cada diseño (miniatura y lupa)
  // Se dibuja el diseño real: su imagen + los textos actuales en sus zonas, igual que en OBS, pero en pequeño.
  function textosActuales() {
    let it = st && st.overlay && st.overlay.item;
    if (!it && st) { const g = (st.rotulos || []).find((x) => x.items && x.items.length); if (g) it = { texto: g.items[0].texto, sub: g.items[0].sub || g.subtitulo || '' }; }
    if (!it) it = { texto: 'Pastor Juan Pérez', sub: 'Predicador invitado' };
    return { nombre: it.texto || '', sub: it.sub || '', extra: (st && st.modulo.overlay.extra) || 'Texto adicional' };
  }
  function encajarTexto(caja) {
    const t = caja.firstChild; if (!t) return;
    const w = caja.clientWidth, h = caja.clientHeight;
    let lo = 8, hi = Math.max(8, h * 0.9), best = lo;
    for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; t.style.fontSize = m + 'px'; if (t.scrollWidth <= w && t.offsetHeight <= h) { best = m; lo = m; } else hi = m; }
    t.style.fontSize = best + 'px';
  }
  // Escenario 1920×1080 con el diseño; "recorte" = parte de la pantalla a mostrar (para que la miniatura no sea casi vacía)
  function escenario(cont, d, recorte) {
    const tx = textosActuales();
    const fam = `'${String(d.fuente || 'Montserrat').replace(/'/g, '')}', 'Montserrat', 'Source Sans 3', 'Segoe UI', sans-serif`;
    const esc1 = document.createElement('div');
    esc1.className = 'ovl-esc';
    let html = `<img src="${esc(d.url)}" alt="" draggable="false">`;
    for (const k of ['nombre', 'sub', 'extra']) {
      const z = d.zonas && d.zonas[k]; if (!z || !tx[k]) continue;
      const just = { left: 'flex-start', center: 'center', right: 'flex-end' }[z.alinear] || 'flex-start';
      html += `<div class="ovl-z-txt" style="left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;justify-content:${just}"><span style="font-family:${esc(fam)};color:${esc(z.color || '#fff')};font-weight:${z.negrita ? 800 : 500};text-transform:${z.mayus ? 'uppercase' : 'none'}">${esc(tx[k])}</span></div>`;
    }
    esc1.innerHTML = html;
    cont.innerHTML = '';
    cont.appendChild(esc1);
    const k = cont.clientWidth / (recorte ? recorte.w : 1920);
    esc1.style.transform = `scale(${k})` + (recorte ? ` translate(${-recorte.x}px, ${-recorte.y}px)` : '');
    esc1.querySelectorAll('.ovl-z-txt').forEach(encajarTexto);
    document.fonts?.load(`40px '${d.fuente || 'Montserrat'}'`).then(() => esc1.querySelectorAll('.ovl-z-txt').forEach(encajarTexto)).catch(() => {});
  }
  // Parte de la pantalla que ocupa el diseño (según sus textos), con margen, en proporción 16:4.2
  function recorteDe(d) {
    const zs = Object.values(d.zonas || {});
    const cy = zs.length ? zs.reduce((a, z) => a + z.y + z.h / 2, 0) / zs.length : 930;
    const h = 1920 * 4.2 / 16;
    return { x: 0, y: Math.max(0, Math.min(1080 - h, cy - h / 2)), w: 1920 };
  }
  function pintarMiniaturas() { $$('#ovlGaleria .ovl-item').forEach((b) => { const d = DIS.find((x) => x.id === b.dataset.id); if (d) escenario(b.querySelector('.ovl-mini'), d, recorteDe(d)); }); }
  const lupa = document.createElement('div');
  lupa.className = 'ovl-lupa hidden';
  lupa.innerHTML = '<div class="ovl-lupa-h"></div><div class="ovl-lupa-pant checker"></div><div class="ovl-lupa-pie">Vista previa · clic para usar este diseño</div>';
  document.body.appendChild(lupa);
  function mostrarLupa(b) {
    const d = DIS.find((x) => x.id === b.dataset.id); if (!d) return;
    lupa.querySelector('.ovl-lupa-h').textContent = d.nombre + (d.zonas ? '' : ' · (los textos se ubicarán al elegirlo)');
    lupa.classList.remove('hidden');
    const r = b.closest('#ovlCard').getBoundingClientRect();
    const ancho = Math.min(560, innerWidth - r.right - 24);
    lupa.style.width = Math.max(320, ancho) + 'px';
    lupa.style.left = (ancho >= 320 ? r.right + 10 : 12) + 'px';
    lupa.style.top = Math.max(60, Math.min(innerHeight - lupa.offsetHeight - 12, b.getBoundingClientRect().top - 40)) + 'px';
    escenario(lupa.querySelector('.ovl-lupa-pant'), d, null);
  }
  $('#ovlGaleria').addEventListener('mouseover', (e) => { const b = e.target.closest('.ovl-item'); if (b && !b.contains(e.relatedTarget)) mostrarLupa(b); });
  $('#ovlGaleria').addEventListener('mouseleave', () => lupa.classList.add('hidden'));
  $('#ovlGaleria').addEventListener('click', () => lupa.classList.add('hidden'));

  let anchoGal = 0;
  new ResizeObserver(() => { const w = $('#ovlGaleria').clientWidth; if (w && w !== anchoGal) { anchoGal = w; pintarMiniaturas(); } }).observe($('#ovlGaleria'));

  function pintar() {
    const o = st ? st.modulo.overlay : {};
    sel = o.plantilla === 'Imagen-Completa' ? o.diseno || '' : '';
    $('#ovlGaleria').innerHTML = DIS.map((d) => `<button class="ovl-item ${d.id === sel ? 'sel' : ''}" data-id="${esc(d.id)}" title="${esc(d.nombre)}">
        <span class="ovl-mini checker"></span>
        <span class="ovl-nom">${d.id === sel ? '✓ ' : ''}${esc(d.nombre)}</span><span class="ovl-org ${d.origen}">${d.origen}</span>
      </button>`).join('') || '<div class="hint">No hay diseños. Use “＋ Agregar”.</div>';
    requestAnimationFrame(pintarMiniaturas);
    pintarZonas();
  }
  async function elegir(id) {
    const d = DIS.find((x) => x.id === id); if (!d) return;
    try {
      if (!d.zonas || !d.zonas.nombre) {
        $('#ovlEstado').textContent = 'Analizando la imagen para ubicar los textos…';
        const zonas = await detectarZonas(d.url);
        if (!zonas) throw new Error('No se encontró una franja para los textos: ajústelos a mano en “Ajustar los textos”.');
        d.zonas = zonas;
        await api('/api/overlays', { method: 'PUT', body: { id, zonas, detectado: true } });
      }
      PP.setModulo({ overlay: { plantilla: 'Imagen-Completa', diseno: id, fondo: { url: d.url, nombre: d.nombre } } }, true);
      $('#ovlEstado').textContent = `Diseño “${d.nombre}” aplicado. Los textos se toman del rótulo al aire.`;
      sel = id; pintar();
    } catch (e) { $('#ovlEstado').textContent = e.message; toast(e.message); }
  }
  $('#ovlGaleria').addEventListener('click', (e) => { const b = e.target.closest('.ovl-item'); if (b) elegir(b.dataset.id); });
  $('#ovlSubir').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      toast('Subiendo diseño…');
      const r = await fetch('/api/overlays/subir?nombre=' + encodeURIComponent(f.name), { method: 'PUT', body: f });
      const d = await r.json(); if (!r.ok) throw new Error(d.error);
      await cargar();
      await elegir(d.id);
    } catch (err) { toast('Error: ' + err.message); }
  });

  // ================================================================ Ajuste fino de las zonas del diseño elegido
  let guardarT = 0;
  function pintarZonas() {
    const d = DIS.find((x) => x.id === sel), box = $('#ovlZonas');
    pintarCajas();
    $('#ovlAjustes').classList.toggle('hidden', !d);
    if (!d || !d.zonas) { box.innerHTML = ''; return; }
    if (box.contains(document.activeElement)) return; // no interrumpir mientras escribe
    const fila = (k) => {
      const z = d.zonas[k];
      if (!z) return `<div class="ovl-z"><b>${NOMBRES[k]}</b> <button class="small" data-zadd="${k}">＋ Agregar</button></div>`;
      return `<div class="ovl-z" data-z="${k}"><div class="row"><b class="grow">${NOMBRES[k]}</b>${k !== 'nombre' ? `<button class="small" data-zdel="${k}" title="Quitar">✕</button>` : ''}</div>
        <div class="ovl-z4">${['x', 'y', 'w', 'h'].map((p) => `<label>${{ x: 'X', y: 'Y', w: 'Ancho', h: 'Alto' }[p]}<input type="number" data-zk="${p}" value="${z[p]}"></label>`).join('')}</div>
        <div class="row"><select data-zk="alinear">${[['left', 'Izquierda'], ['center', 'Centro'], ['right', 'Derecha']].map(([v, t]) => `<option value="${v}" ${z.alinear === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <input type="color" data-zk="color" value="${esc(z.color || '#ffffff')}"><label class="chk small"><input type="checkbox" data-zk="negrita" ${z.negrita ? 'checked' : ''}> Negrita</label><label class="chk small"><input type="checkbox" data-zk="mayus" ${z.mayus ? 'checked' : ''}> MAYÚS</label></div></div>`;
    };
    box.innerHTML = `<div class="hint" style="margin:0 0 6px">Posición y tamaño en píxeles (pantalla 1920×1080). La letra se ajusta sola al espacio.</div>
      <div class="f"><label>Fuente</label><select class="full fuentes" data-zf>${(PP.fuentesLista || []).map((f) => `<option ${f === d.fuente ? 'selected' : ''}>${esc(f)}</option>`).join('') || `<option>${esc(d.fuente)}</option>`}</select></div>
      ${['nombre', 'sub', 'extra'].map(fila).join('')}
      <div class="row mt8"><button class="grow" id="ovlDetectar">🔍 Detectar de nuevo</button>${d.pk ? '<button class="grow" id="ovlOriginal">⟲ Distribución original</button>' : ''}</div>`;
  }
  async function guardarZonas(d) {
    avisarPreview(d);
    pintarCajas();
    pintarMiniaturas();
    clearTimeout(guardarT);
    guardarT = setTimeout(() => api('/api/overlays', { method: 'PUT', body: { id: d.id, zonas: d.zonas, fuente: d.fuente } }).catch((e) => toast('Error: ' + e.message)), 250);
  }
  $('#ovlZonas').addEventListener('input', (e) => {
    const d = DIS.find((x) => x.id === sel); if (!d) return;
    const el = e.target;
    if (el.dataset.zf !== undefined) { d.fuente = el.value; return guardarZonas(d); }
    const k = el.closest('[data-z]')?.dataset.z, p = el.dataset.zk; if (!k || !p) return;
    d.zonas[k][p] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? +el.value : el.value;
    guardarZonas(d);
  });
  $('#ovlZonas').addEventListener('click', async (e) => {
    const d = DIS.find((x) => x.id === sel); if (!d) return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.zdel) { delete d.zonas[b.dataset.zdel]; guardarZonas(d); return pintarZonas(); }
    if (b.dataset.zadd) {
      const n = d.zonas.nombre;
      d.zonas[b.dataset.zadd] = { x: n.x, y: Math.max(0, n.y - 50), w: Math.round(n.w * 0.7), h: 40, alinear: n.alinear, color: '#f8b800', negrita: true };
      guardarZonas(d); return pintarZonas();
    }
    if (b.id === 'ovlDetectar') {
      try { const z = await detectarZonas(d.url); if (!z) throw new Error('No se encontró una franja para los textos'); d.zonas = z; await api('/api/overlays', { method: 'PUT', body: { id: d.id, zonas: z, detectado: true } }); toast('Textos ubicados de nuevo'); pintarZonas(); }
      catch (err) { toast(err.message); }
    }
    if (b.id === 'ovlOriginal') { await api('/api/overlays', { method: 'PUT', body: { id: d.id, restaurar: true } }); toast('Distribución original del diseño'); }
  });

  // ================================================================ Mover los textos sobre la vista previa (como ProyectoRP)
  // Cada texto del diseño aparece como un recuadro sobre "Vista previa · Overlay":
  //   arrastrar = mover · esquina dorada = cambiar tamaño · flechas = 1 px (Shift = 10 px) · ▲◀▶▼ del panel = 10 px.
  // Se ve en vivo en la vista previa y al soltar se guarda (OBS se actualiza solo).
  const capaZ = document.createElement('div');
  capaZ.className = 'zonas-capa';
  $('#ovPrev').appendChild(capaZ);
  let zSel = 'nombre', arr = null;
  const disActual = () => DIS.find((x) => x.id === sel);
  PP.zonasActivas = () => { const d = disActual(); return !!(d && d.zonas); };
  function avisarPreview(d) {
    try { $('#ovPrevFrame').contentWindow.postMessage({ tipo: 'ovlZonas', id: d.id, zonas: d.zonas, fuente: d.fuente }, location.origin); } catch (_) { /* cargando */ }
  }
  const estiloCaja = (z) => `left:${z.x / 19.2}%;top:${z.y / 10.8}%;width:${z.w / 19.2}%;height:${z.h / 10.8}%`;
  function pintarCajas() {
    const d = disActual();
    $('#zonasAyuda').classList.toggle('hidden', !(d && d.zonas));
    if (!d || !d.zonas) { capaZ.innerHTML = ''; return; }
    if (arr) return; // no rehacer mientras se arrastra
    if (!d.zonas[zSel]) zSel = 'nombre';
    // Si ya están los mismos recuadros, solo se actualiza su posición (así no pierden el foco del teclado)
    const claves = ['nombre', 'sub', 'extra'].filter((k) => d.zonas[k]);
    const actuales = [...capaZ.querySelectorAll('.zona-caja')];
    if (actuales.length === claves.length && actuales.every((c, i) => c.dataset.zc === claves[i])) {
      actuales.forEach((c) => { c.style.cssText = estiloCaja(d.zonas[c.dataset.zc]); c.classList.toggle('sel', c.dataset.zc === zSel); });
      return;
    }
    capaZ.innerHTML = ['nombre', 'sub', 'extra'].filter((k) => d.zonas[k]).map((k) =>
      `<div class="zona-caja ${k === zSel ? 'sel' : ''}" data-zc="${k}" tabindex="0" title="${NOMBRES[k]}: arrastre para mover · esquina para cambiar el tamaño · flechas para ajustar" style="${estiloCaja(d.zonas[k])}"><span class="zt">${NOMBRES[k]}</span><i class="zr"></i></div>`).join('');
  }
  function posTxt(d, k) { const z = d.zonas[k]; $('#posTxt').textContent = `${NOMBRES[k]}: X ${z.x} · Y ${z.y} · ${z.w}×${z.h} px`; }
  function aplicar(d, k) {
    const c = capaZ.querySelector(`[data-zc="${k}"]`); if (c) c.style.cssText = estiloCaja(d.zonas[k]);
    avisarPreview(d); posTxt(d, k);
    const fila = $(`#ovlZonas [data-z="${k}"]`);
    if (fila) for (const p of ['x', 'y', 'w', 'h']) { const i = fila.querySelector(`[data-zk="${p}"]`); if (i && document.activeElement !== i) i.value = d.zonas[k][p]; }
  }
  function elegirCaja(k) { zSel = k; capaZ.querySelectorAll('.zona-caja').forEach((x) => x.classList.toggle('sel', x.dataset.zc === k)); }
  capaZ.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.zona-caja'); const d = disActual(); if (!c || !d) return;
    const k = c.dataset.zc; elegirCaja(k);
    arr = { d, k, modo: e.target.classList.contains('zr') ? 'tam' : 'mover', x: e.clientX, y: e.clientY, z0: { ...d.zonas[k] }, kx: 1920 / capaZ.clientWidth };
    try { c.setPointerCapture(e.pointerId); } catch (_) { /* puntero sin captura */ }
    c.focus({ preventScroll: true }); e.preventDefault(); posTxt(d, k);
  });
  capaZ.addEventListener('pointermove', (e) => {
    if (!arr) return;
    const dx = Math.round((e.clientX - arr.x) * arr.kx), dy = Math.round((e.clientY - arr.y) * arr.kx);
    const z = arr.d.zonas[arr.k];
    if (arr.modo === 'mover') {
      z.x = arr.z0.x + dx; z.y = arr.z0.y + dy;
      // Imán: alinea con el borde izquierdo / centro de los otros textos (a menos de 8 px)
      for (const [k2, o] of Object.entries(arr.d.zonas)) {
        if (k2 === arr.k) continue;
        if (Math.abs(o.x - z.x) < 8) z.x = o.x;
        if (Math.abs((o.x + o.w / 2) - (z.x + z.w / 2)) < 8) z.x = Math.round(o.x + o.w / 2 - z.w / 2);
      }
    } else { z.w = Math.max(40, arr.z0.w + dx); z.h = Math.max(16, arr.z0.h + dy); }
    aplicar(arr.d, arr.k);
  });
  const soltar = () => { if (!arr) return; const d = arr.d; arr = null; guardarZonas(d); };
  capaZ.addEventListener('pointerup', soltar);
  capaZ.addEventListener('pointercancel', soltar);
  function moverZonaPor(dx, dy, k = zSel) {
    const d = disActual(); if (!d || !d.zonas || !d.zonas[k]) return false;
    d.zonas[k].x += dx; d.zonas[k].y += dy;
    aplicar(d, k); guardarZonas(d);
    return true;
  }
  capaZ.addEventListener('keydown', (e) => {
    const c = e.target.closest('.zona-caja'); if (!c) return;
    const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (e.key === 'Tab') return;
    if (!m) return;
    e.preventDefault(); e.stopPropagation(); // que las flechas no cambien el versículo
    const paso = e.shiftKey ? 10 : 1;
    moverZonaPor(m[0] * paso, m[1] * paso, c.dataset.zc);
  });
  // Botones ▲◀▶▼ / ⟲ debajo de la vista previa
  PP.moverZona = (mv) => {
    if (!PP.zonasActivas()) return false;
    const d = disActual();
    if (mv === 'reset') {
      if (d.pk) api('/api/overlays', { method: 'PUT', body: { id: d.id, restaurar: true } }).then(() => toast('Distribución original del diseño'));
      else toast('Use “🔍 Detectar de nuevo” para reubicar los textos automáticamente');
      return true;
    }
    const [dx, dy] = mv.split(',').map(Number);
    return moverZonaPor(dx, dy);
  };

  // ================================================================ Ventana interactiva (pantalla grande para acomodar los módulos)
  let ventana = null;
  $('#btnInteractiva').addEventListener('click', () => {
    if (ventana && !ventana.closed) return ventana.focus();
    const w = Math.min(1500, screen.availWidth - 40), h = Math.min(930, screen.availHeight - 40);
    ventana = window.open('/obs/editor.html', 'pkVentanaInteractiva', `popup,width=${w},height=${h},left=${Math.max(0, (screen.availWidth - w) / 2)},top=${Math.max(0, (screen.availHeight - h) / 2)}`);
    if (!ventana) toast('El navegador bloqueó la ventana: permita las ventanas emergentes para PK-PENTECOSTAL');
  });

  // ================================================================ Estado
  const prev = PP.alEstado;
  let textosKey = '';
  function alEstado(s) {
    const cambioSel = !st || st.modulo.overlay.diseno !== s.modulo.overlay.diseno || st.modulo.overlay.plantilla !== s.modulo.overlay.plantilla;
    st = s;
    const kt = JSON.stringify(textosActuales());
    if (s.overlayRev !== rev) { rev = s.overlayRev; cargar(); }
    else if (cambioSel) pintar();
    else if (kt !== textosKey) pintarMiniaturas();
    textosKey = kt;
  }
  PP.alEstado = (s) => { prev && prev(s); alEstado(s); };
  // El primer estado puede llegar antes de que este archivo cargue: se toma el que ya tiene el panel
  if (PP.estado && PP.estado()) alEstado(PP.estado()); else cargar();
  api('/api/fuentes').then((f) => { PP.fuentesLista = f; pintarZonas(); }).catch(() => {});
  PP.detectarZonasOverlay = detectarZonas; // para pruebas
})();
