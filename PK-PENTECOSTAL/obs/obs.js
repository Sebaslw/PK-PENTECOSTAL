/* PK-PENTECOSTAL - Módulo OBS: overlay (rótulos), banner y control de OBS Studio por WebSocket
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
(() => {
  'use strict';
  const PP = window.PP;
  const { api, toast, esc, store, $, $$ } = PP;
  const mod = $('#obsMod');
  let st = null;                    // último estado del servidor
  let prevItem = null;              // rótulo en vista previa (aún no al aire)

  // ================================================================ Utilidades
  const getK = (o, k) => k.split('.').reduce((a, x) => (a == null ? a : a[x]), o);
  const setK = (k, v) => k.split('.').reduceRight((acc, x) => ({ [x]: acc }), v);
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) a[k] = merge(a[k] || {}, b[k]); else a[k] = b[k]; } return a; };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const COLORES = ['#00bcd4', '#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#3f51b5', '#009688', '#795548', '#607d8b'];

  let modT, modPend = {};
  function setModulo(parcial, inmediato) {
    modPend = merge(modPend, parcial);
    if (st) st.modulo = merge(st.modulo, JSON.parse(JSON.stringify(parcial))); // respuesta visual inmediata
    clearTimeout(modT);
    modT = setTimeout(() => { const b = modPend; modPend = {}; api('/api/modulo', { method: 'POST', body: b }).catch((e) => toast('Error: ' + e.message)); }, inmediato ? 0 : 90);
  }
  PP.setModulo = setModulo;
  const capa = (body) => api('/api/capa', { method: 'POST', body }).catch((e) => toast('Error: ' + e.message));

  // Diálogo genérico: devuelve el valor del botón pulsado
  function dialogo(titulo, html, botones = [['cancel', 'Cancelar'], ['ok', 'Aceptar', 'primary']], alAbrir) {
    const d = $('#dlgGen');
    $('#dgTitulo').textContent = titulo;
    $('#dgCuerpo').innerHTML = html;
    $('#dgBotones').innerHTML = botones.map(([v, t, c]) => `<button value="${v}" class="${c || ''} ${v === 'cancel' ? '' : 'grow'}">${t}</button>`).join('');
    alAbrir?.($('#dgCuerpo'));
    d.returnValue = '';
    d.showModal();
    return new Promise((res) => d.addEventListener('close', () => res(d.returnValue), { once: true }));
  }

  // ================================================================ Navegación del módulo
  $('.mod-nav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-view]'); if (!b) return;
    $$('.mod-nav button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.mod-view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== b.dataset.view));
    store.set('modView', b.dataset.view);
    escalarPantallas();
  });
  PP.alAbrir = () => { escalarPantallas(); if (st) pintarTodo(); };

  // Escalado de iframes 1920x1080 dentro de sus contenedores
  const ro = new ResizeObserver((ents) => { for (const en of ents) { const f = en.target.querySelector('iframe'); if (f) f.style.transform = `scale(${en.contentRect.width / 1920})`; } });
  $$('#obsMod .screen').forEach((s) => ro.observe(s));
  function escalarPantallas() { $$('#obsMod .screen').forEach((s) => { const f = s.querySelector('iframe'); if (f && s.clientWidth) f.style.transform = `scale(${s.clientWidth / 1920})`; }); }

  // ================================================================ Controles enlazados a st.modulo (data-m / data-tog)
  mod.addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.m) return;
    const v = el.type === 'checkbox' ? el.checked : el.type === 'range' || el.type === 'number' ? +el.value : el.value;
    const o = el.closest('.f')?.querySelector('output'); if (o) o.textContent = fmtOut(el);
    setModulo(setK(el.dataset.m, v), el.type !== 'range');
    if (el.dataset.m === 'banner.tamPreview') tamPreview(v);
  });
  mod.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tog]'); if (!t || !st) return;
    setModulo(setK(t.dataset.tog, !getK(st.modulo, t.dataset.tog)), true);
    t.classList.toggle('on', !!getK(st.modulo, t.dataset.tog));
  });
  function fmtOut(el) {
    const k = el.dataset.m || '';
    if (/opacidad|intensidad|oscurecer|escala|tamPreview|interlineado|opacidadFondo/i.test(k) && !/efecto\.(velocidad)/.test(k)) return el.value + '%';
    if (/segundos|duracion|transicion/.test(k)) return el.value + ' s';
    if (/alto|margen|subir|ancho|radio|desenfoque|espaciado|tam$/.test(k)) return el.value + ' px';
    return el.value;
  }
  function pintarControles() {
    $$('#obsMod [data-m]').forEach((el) => {
      if (document.activeElement === el && el.type === 'range') return;
      const v = getK(st.modulo, el.dataset.m);
      if (el.type === 'checkbox') el.checked = !!v; else if (v != null) el.value = v;
      const o = el.closest('.f')?.querySelector('output'); if (o) o.textContent = fmtOut(el);
    });
    $$('#obsMod [data-tog]').forEach((t) => t.classList.toggle('on', !!getK(st.modulo, t.dataset.tog)));
    const ov = st.modulo.overlay;
    $('[data-estado="luces"]').textContent = ov.luces.on ? `Encendidas · barrido al ${ov.luces.intensidad}%` : 'Apagadas';
    $('#ovFondoNombre').textContent = ov.fondo.url ? 'Archivo: ' + ov.fondo.nombre : 'Sin fondo (color de plantilla)';
    $('#posTxt').textContent = `Posición X ${ov.x} · Y ${ov.y} px`;
    $('#ovCompletaCard').classList.toggle('hidden', ov.plantilla !== 'Imagen-Completa' || !!ov.diseno);
    const b = st.modulo.banner;
    $('#bActivo').textContent = b.fondo.url ? `Fondo: ${b.fondo.nombre}` : 'Fondo: ninguno';
    const nombres = { progresivo: 'progresivamente', deslizamiento: 'con deslizamiento', instantaneo: 'de forma instantánea' };
    $('#interactInfo').innerHTML = `Overlay aparece: <b>${nombres[ov.aparicion]}</b> · Banner aparece: <b>${nombres[b.aparicion]}</b>` +
      (st.modulo.exclusivos && b.posicion === 'abajo' ? '<br><small>Overlay y banner no se muestran a la vez.</small>' : '');
    // Solo se redibuja si cambia el estado (si no, un clic en GUARDAR podría perderse)
    $$('[data-savebar]').forEach((s) => {
      if (s.dataset.g === String(st.moduloGuardado)) return;
      s.dataset.g = String(st.moduloGuardado);
      s.innerHTML =`<span class="estado ${st.moduloGuardado ? 'ok' : 'no'}">${st.moduloGuardado ? '✓ Guardado' : '● Cambios sin guardar'}</span>
        <button data-sv="restaurar" title="Volver a lo último guardado">⟲ Restaurar</button>
        <button data-sv="defecto" title="Valores de fábrica">Por defecto</button>
        <button data-sv="guardar" class="primary">GUARDAR</button>`;
    });
  }
  mod.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sv]'); if (!b) return;
    if (b.dataset.sv === 'guardar') { await api('/api/modulo/guardar', { method: 'POST' }); toast('Ajustes guardados'); }
    if (b.dataset.sv === 'restaurar') { await api('/api/modulo/restaurar', { method: 'POST', body: {} }); toast('Se restauró lo último guardado'); }
    if (b.dataset.sv === 'defecto' && confirm('¿Volver a los valores de fábrica? (no se guarda hasta pulsar GUARDAR)')) await api('/api/modulo/restaurar', { method: 'POST', body: { defecto: true } });
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !mod.classList.contains('hidden')) { e.preventDefault(); api('/api/modulo/guardar', { method: 'POST' }).then(() => toast('Ajustes guardados')); }
  });

  // ================================================================ Botones OVERLAY / BANNER
  mod.addEventListener('click', (e) => {
    const b = e.target.closest('[data-capa]'); if (!b || !st) return;
    if (b.dataset.capa === 'overlay') {
      if (!st.overlay.item) return toast('Primero ponga un nombre al aire desde RÓTULOS');
      capa({ overlay: { visible: !st.overlay.visible } });
    } else {
      if (!st.vivo && !st.banner.visible) toast('El banner aparecerá cuando proyecte un versículo o canción');
      capa({ banner: { visible: !st.banner.visible } });
    }
  });
  function pintarCapas() {
    $$('[data-capa="overlay"]').forEach((b) => { b.classList.toggle('on', st.overlay.visible); b.querySelector('.st').textContent = st.overlay.visible ? '● AL AIRE' : st.overlay.item ? 'OCULTO' : 'APAGADO'; });
    $$('[data-capa="banner"]').forEach((b) => { b.classList.toggle('on', st.banner.visible); b.querySelector('.st').textContent = st.banner.visible ? (st.vivo ? '● AL AIRE' : '● ESPERANDO TEXTO') : 'OCULTO'; });
  }
  $('#btnInteractCfg').addEventListener('click', () => $('#interactCfg').classList.toggle('hidden'));

  $('#quickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('#quickTxt').value.trim(); if (!t) return;
    alAire({ texto: t, sub: '', color: '#06b6d4', grupo: '', itemId: 'rapido' });
    $('#quickTxt').select();
  });

  // ================================================================ RÓTULOS (CRUD)
  let grupos = [];
  const guardarRotulos = () => api('/api/rotulos', { method: 'PUT', body: grupos }).catch((e) => toast('Error al guardar: ' + e.message));

  function pintarGrupos() {
    const live = st.overlay.item, vis = st.overlay.visible;
    $('#grupos').innerHTML = grupos.map((g, gi) => `
      <div class="grupo" data-g="${g.id}">
        <div class="grupo-h">
          <span class="grupo-n">${gi + 1}</span>
          <div class="grupo-t"><b>${esc(g.nombre)}</b><div>${esc(g.subtitulo || 'Sin texto por defecto')}</div></div>
          <div class="grupo-tools">
            <button data-ga="reloj" class="${g.reloj ? 'on' : ''}" title="Quitar automáticamente con el temporizador">⏱ Reloj ${g.reloj ? 'ON' : 'OFF'}</button>
            <button data-ga="lista" title="Editar lista de nombres">☰ Lista</button>
            <button data-ga="ajustes" title="Ajustes del grupo">⚙</button>
            <button data-ga="quitar" class="danger" title="Quitar del aire">⏏ Quitar</button>
          </div>
        </div>
        <div class="chips">${g.items.length ? g.items.map((it) => {
          const esLive = live && live.itemId === it.id;
          const cls = esLive ? (vis ? 'live' : 'hid') : prevItem && prevItem.itemId === it.id ? 'prev' : '';
          return `<button class="chip ${cls}" data-i="${it.id}" style="--c:${it.color}" title="${esc(it.sub || g.subtitulo || '')}">${esc(it.texto)}<span class="ed" data-ed="1" title="Editar">✎</span></button>`;
        }).join('') : '<div class="vacio">La lista está vacía. Pulsa el botón de lista para añadir nombres.</div>'}</div>
      </div>`).join('') || '<div class="vacio">No hay rótulos. Pulse ＋ RÓTULO.</div>';
  }

  function itemAire(g, it) { return { texto: it.texto, sub: it.sub || g.subtitulo || '', color: it.color, grupo: g.id, itemId: it.id }; }
  function alAire(item) { prevItem = null; enviarPreview(); capa({ overlay: { item, visible: true } }); }

  $('#grupos').addEventListener('click', async (e) => {
    const gEl = e.target.closest('.grupo'); if (!gEl) return;
    const g = grupos.find((x) => x.id === gEl.dataset.g);
    const chip = e.target.closest('.chip');
    if (chip) {
      const it = g.items.find((x) => x.id === chip.dataset.i);
      if (e.target.dataset.ed) return editarItem(g, it);
      const esLive = st.overlay.item && st.overlay.item.itemId === it.id && st.overlay.visible;
      if (esLive) return capa({ overlay: { visible: false } });
      if ($('#prevPrimero').checked) { prevItem = itemAire(g, it); enviarPreview(); pintarGrupos(); $('#prevAlAire').disabled = false; return; }
      return alAire(itemAire(g, it));
    }
    const a = e.target.closest('[data-ga]')?.dataset.ga;
    if (a === 'reloj') { g.reloj = !g.reloj; guardarRotulos(); }
    if (a === 'quitar') { if (st.overlay.item && (st.overlay.item.grupo === g.id || !st.overlay.item.grupo)) capa({ overlay: { visible: false } }); }
    if (a === 'lista') editarLista(g);
    if (a === 'ajustes') ajustesGrupo(g);
  });
  $('#grupos').addEventListener('contextmenu', (e) => {
    const chip = e.target.closest('.chip'); if (!chip) return;
    e.preventDefault();
    const g = grupos.find((x) => x.id === chip.closest('.grupo').dataset.g);
    editarItem(g, g.items.find((x) => x.id === chip.dataset.i));
  });

  async function editarItem(g, it) {
    const r = await dialogo('Editar nombre', `
      <div class="f"><label>Texto</label><input id="eiT" class="full" value="${esc(it.texto)}"></div>
      <div class="f"><label>Cargo / subtítulo (vacío = texto por defecto del grupo: "${esc(g.subtitulo || '')}")</label><input id="eiS" class="full" value="${esc(it.sub || '')}"></div>
      <div class="f"><label>Color</label><input type="color" id="eiC" value="${it.color}"></div>`,
      [['cancel', 'Cancelar'], ['del', 'Eliminar', 'danger'], ['ok', 'Guardar', 'primary']]);
    if (r === 'ok') { it.texto = $('#eiT').value.trim() || it.texto; it.sub = $('#eiS').value.trim(); it.color = $('#eiC').value; guardarRotulos(); }
    if (r === 'del' && confirm(`¿Eliminar "${it.texto}"?`)) { g.items = g.items.filter((x) => x !== it); guardarRotulos(); }
  }

  async function editarLista(g) {
    let items = g.items.map((x) => ({ ...x }));
    const pintar = (c) => {
      c.querySelector('.lst').innerHTML = items.map((it, i) => `
        <div class="lst-row" data-i="${i}">
          <input data-f="texto" value="${esc(it.texto)}" placeholder="Nombre">
          <input data-f="sub" value="${esc(it.sub || '')}" placeholder="Cargo (opcional)">
          <input type="color" data-f="color" value="${it.color}">
          <div class="acts"><button type="button" data-a="up">▲</button><button type="button" data-a="down">▼</button><button type="button" data-a="del" class="danger">✕</button></div>
        </div>`).join('') || '<div class="vacio">La lista está vacía. Agregue nombres abajo.</div>';
    };
    const r = await dialogo(`Lista · ${g.nombre}`, `
      <div class="lst"></div>
      <div class="row"><button type="button" id="lAdd" class="grow">＋ Añadir uno</button><button type="button" id="lSort">Ordenar A-Z</button></div>
      <details><summary class="hint" style="cursor:pointer">Pegar varios nombres (uno por línea)</summary>
        <textarea id="lBulk" rows="5" placeholder="Nombre 1&#10;Nombre 2 | Cargo"></textarea>
        <button type="button" id="lBulkAdd" class="full">Agregar a la lista</button></details>`,
      [['cancel', 'Cancelar'], ['ok', 'Guardar lista', 'primary']], (c) => {
        pintar(c);
        c.addEventListener('input', (e) => { const row = e.target.closest('.lst-row'); if (row) items[+row.dataset.i][e.target.dataset.f] = e.target.value; });
        c.addEventListener('click', (e) => {
          const a = e.target.dataset.a, row = e.target.closest('.lst-row');
          if (row && a) {
            const i = +row.dataset.i;
            if (a === 'del') items.splice(i, 1);
            if (a === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
            if (a === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
            pintar(c);
          }
          if (e.target.id === 'lAdd') { items.push({ id: uid(), texto: '', sub: '', color: COLORES[items.length % COLORES.length] }); pintar(c); c.querySelector('.lst-row:last-child input')?.focus(); }
          if (e.target.id === 'lSort') { items.sort((x, y) => x.texto.localeCompare(y.texto, 'es')); pintar(c); }
          if (e.target.id === 'lBulkAdd') {
            for (const l of c.querySelector('#lBulk').value.split('\n')) {
              const [t, s] = l.split('|').map((x) => (x || '').trim());
              if (t) items.push({ id: uid(), texto: t, sub: s || '', color: COLORES[items.length % COLORES.length] });
            }
            c.querySelector('#lBulk').value = ''; pintar(c);
          }
        });
      });
    if (r === 'ok') { g.items = items.filter((x) => x.texto.trim()); guardarRotulos(); }
  }

  async function ajustesGrupo(g, nuevo) {
    const r = await dialogo(nuevo ? 'Nuevo grupo de rótulos' : 'Ajustes del grupo', `
      <div class="f"><label>Nombre del grupo</label><input id="agN" class="full" value="${esc(g.nombre)}"></div>
      <div class="f"><label>Texto por defecto (organización o evento, aparece debajo del nombre)</label><input id="agS" class="full" value="${esc(g.subtitulo || '')}"></div>
      <label class="chk"><input type="checkbox" id="agR" ${g.reloj ? 'checked' : ''}> Reloj ON: quitar automáticamente con el temporizador</label>`,
      nuevo ? [['cancel', 'Cancelar'], ['ok', 'Crear', 'primary']] : [['cancel', 'Cancelar'], ['del', 'Eliminar grupo', 'danger'], ['ok', 'Guardar', 'primary']]);
    if (r === 'ok') {
      g.nombre = $('#agN').value.trim() || 'Rótulos'; g.subtitulo = $('#agS').value.trim(); g.reloj = $('#agR').checked;
      if (nuevo) grupos.push(g);
      guardarRotulos();
      if (nuevo) editarLista(g);
    }
    if (r === 'del' && confirm(`¿Eliminar el grupo "${g.nombre}" y sus ${g.items.length} nombres?`)) { grupos = grupos.filter((x) => x !== g); guardarRotulos(); }
  }
  $('#btnNuevoGrupo').addEventListener('click', () => ajustesGrupo({ id: uid(), nombre: '', subtitulo: '', reloj: false, items: [] }, true));

  // ================================================================ Vista previa del overlay (arrastrar / mover)
  function enviarPreview() {
    $('#ovPrevFrame').contentWindow?.postMessage({ tipo: 'preview', item: prevItem || undefined }, location.origin);
    $('#prevAlAire').disabled = !prevItem;
  }
  $('#ovPrevFrame').addEventListener('load', enviarPreview);
  $('#prevAlAire').addEventListener('click', () => { if (prevItem) alAire(prevItem); });
  $('#prevPrimero').checked = store.get('prevPrimero', false);
  $('#prevPrimero').addEventListener('change', (e) => { store.set('prevPrimero', e.target.checked); if (!e.target.checked) { prevItem = null; enviarPreview(); pintarGrupos(); } });

  (() => {
    const layer = $('#ovDrag'); let ini = null;
    layer.addEventListener('pointerdown', (e) => { if (!st || PP.zonasActivas?.()) return; ini = { x: e.clientX, y: e.clientY, ox: st.modulo.overlay.x, oy: st.modulo.overlay.y, k: 1920 / layer.clientWidth }; layer.setPointerCapture(e.pointerId); });
    layer.addEventListener('pointermove', (e) => {
      if (!ini) return;
      const x = Math.round(ini.ox + (e.clientX - ini.x) * ini.k), y = Math.round(ini.oy + (e.clientY - ini.y) * ini.k);
      setModulo({ overlay: { x, y } }); $('#posTxt').textContent = `Posición X ${x} · Y ${y} px`;
    });
    layer.addEventListener('pointerup', () => { ini = null; });
  })();
  $('.pad').addEventListener('click', (e) => {
    const mv = e.target.dataset.mv; if (!mv || !st) return;
    if (PP.moverZona?.(mv)) return;
    if (mv === 'reset') return setModulo({ overlay: { x: 0, y: 0, escala: 100 } }, true);
    const [dx, dy] = mv.split(',').map(Number);
    setModulo({ overlay: { x: st.modulo.overlay.x + dx, y: st.modulo.overlay.y + dy } }, true);
  });
  $$('[data-ptab]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-ptab]').forEach((x) => x.classList.toggle('active', x === b));
    $$('[data-ppane]').forEach((p) => p.classList.toggle('hidden', p.dataset.ppane !== b.dataset.ptab));
  }));

  // ================================================================ Fondo del overlay
  async function subirArchivo(file) {
    const r = await fetch('/api/subir?nombre=' + encodeURIComponent(file.name), { method: 'PUT', body: file });
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    return d;
  }
  $('#ovFondoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { toast('Subiendo…'); const d = await subirArchivo(f); setModulo({ overlay: { fondo: { url: d.url, nombre: d.nombre } } }, true); toast('Fondo aplicado'); cargarBiblioteca(); } catch (err) { toast('Error: ' + err.message); }
    e.target.value = '';
  });
  $('#ovFondoQuitar').addEventListener('click', () => setModulo({ overlay: { fondo: { url: '', nombre: '' } } }, true));
  $('#ovFondoCambiar').addEventListener('click', async () => {
    const imgs = BIBLIO.filter((f) => f.tipo === 'imagen');
    let elegido = null;
    const r = await dialogo('Elegir fondo del rótulo', `<div class="picker">${imgs.map((f, i) => `<img src="${esc(f.url)}" data-i="${i}" title="${esc(f.nombre)}" loading="lazy">`).join('') || '<div class="vacio">No hay imágenes. Use “Seleccionar archivo”.</div>'}</div>`,
      [['cancel', 'Cancelar']], (c) => c.addEventListener('click', (e) => { if (e.target.dataset.i) { elegido = imgs[+e.target.dataset.i]; $('#dlgGen').close('ok'); } }));
    if (r === 'ok' && elegido) setModulo({ overlay: { fondo: { url: elegido.url, nombre: elegido.nombre } } }, true);
  });

  // ================================================================ BANNER: biblioteca de fondos
  let BIBLIO = [], bTipo = 'imagen', bPagina = 0;
  const POR_PAG = 12;
  async function cargarBiblioteca() { BIBLIO = await api('/api/fondos'); pintarBiblioteca(); }
  function pintarBiblioteca() {
    bibKey = BIBLIO.length + '|' + (st?.modulo.banner.fondo.url || '');
    const lista = BIBLIO.filter((f) => f.tipo === bTipo);
    const pags = Math.max(1, Math.ceil(lista.length / POR_PAG));
    bPagina = Math.min(bPagina, pags - 1);
    const uso = st?.modulo.banner.fondo.url;
    $('#bCount').textContent = `${lista.length} ${bTipo === 'video' ? 'videos' : 'imágenes'}`;
    $('#bPag').textContent = `${bPagina + 1} / ${pags}`;
    $('#bGal').innerHTML = lista.slice(bPagina * POR_PAG, (bPagina + 1) * POR_PAG).map((f) => `
      <div class="bth ${uso === f.url ? 'uso' : ''}" data-url="${esc(f.url)}" title="${esc(f.nombre)}">
        <div class="im">${f.tipo === 'video' ? `<img class="mini-video" data-video="${esc(f.url)}" data-t="1" alt="">` : `<img src="${esc(f.url)}" loading="lazy" decoding="async" alt="">`}</div>
        ${f.tipo === 'video' ? '<span class="play">▶</span>' : ''}<div class="nm">${esc(f.nombre)}</div>
      </div>`).join('') || `<div class="vacio" style="grid-column:1/-1">No hay ${bTipo === 'video' ? 'videos' : 'imágenes'}. Use “Subir archivos…”.</div>`;
    window.Miniaturas?.activar($('#bGal'));
  }
  $('#bTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-btipo]'); if (!b) return; bTipo = b.dataset.btipo; bPagina = 0; $$('#bTabs [data-btipo]').forEach((x) => x.classList.toggle('active', x === b)); pintarBiblioteca(); });
  $('#bPrev').addEventListener('click', () => { if (bPagina > 0) { bPagina--; pintarBiblioteca(); } });
  $('#bNext').addEventListener('click', () => { bPagina++; pintarBiblioteca(); });
  $('#bGal').addEventListener('click', (e) => {
    const t = e.target.closest('.bth'); if (!t) return;
    const f = BIBLIO.find((x) => x.url === t.dataset.url);
    setModulo({ banner: { fondo: { tipo: f.tipo, url: f.url, nombre: f.nombre } } }, true);
  });
  window.Miniaturas?.hover($('#bGal'), '.bth');
  $('#bNinguno').addEventListener('click', () => setModulo({ banner: { fondo: { tipo: '', url: '', nombre: '' } } }, true));
  $('#bBorrar').addEventListener('click', async () => {
    const f = st.modulo.banner.fondo;
    if (!f.url) return toast('No hay un fondo activo');
    if (!confirm(`¿Eliminar del disco el archivo "${f.nombre}"? No se puede deshacer.`)) return;
    try {
      await api('/api/fondo?url=' + encodeURIComponent(f.url), { method: 'DELETE' });
      setModulo({ banner: { fondo: { tipo: '', url: '', nombre: '' } } }, true);
      toast('Archivo eliminado'); cargarBiblioteca();
    } catch (err) { toast('Error: ' + err.message); }
  });
  $('#bFile').addEventListener('change', async (e) => {
    const files = [...e.target.files]; let ult = null;
    for (const [i, f] of files.entries()) {
      try { toast(`Subiendo ${i + 1}/${files.length}: ${f.name}`); ult = await subirArchivo(f); } catch (err) { toast(`Error con ${f.name}: ${err.message}`); }
    }
    e.target.value = '';
    await cargarBiblioteca();
    if (ult) { bTipo = ult.tipo; $$('#bTabs [data-btipo]').forEach((x) => x.classList.toggle('active', x.dataset.btipo === bTipo)); setModulo({ banner: { fondo: { tipo: ult.tipo, url: ult.url, nombre: ult.nombre } } }, true); pintarBiblioteca(); toast('Archivo(s) subido(s)'); }
  });
  $('#efectoSel').innerHTML = Efectos.lista().map((x) => `<option value="${x.id}">${x.etiqueta}</option>`).join('');
  function tamPreview(v) { $('#bPrevScreen').style.width = Math.round(650 * v / 100) + 'px'; escalarPantallas(); }

  // ================================================================ Estado del servidor
  let rotKey = '', bibKey = '', gruposKey = '';
  PP.alEstado = (s) => {
    st = s;
    const rk = JSON.stringify(s.rotulos);
    if (rk !== rotKey) { rotKey = rk; grupos = JSON.parse(rk); }
    pintarTodo();
  };
  PP.alFuentes = () => { if (st) pintarControles(); };
  function pintarTodo() {
    if (!st) return;
    pintarControles(); pintarCapas();
    const gk = JSON.stringify([grupos, st.overlay, prevItem]);
    if (gk !== gruposKey) { gruposKey = gk; pintarGrupos(); }
    const bk = BIBLIO.length + '|' + st.modulo.banner.fondo.url;
    if (BIBLIO.length && bk !== bibKey) { bibKey = bk; pintarBiblioteca(); }
    tamPreview(st.modulo.banner.tamPreview);
  }

  // ================================================================ OBS WebSocket
  const obs = new OBSWS();
  PP.obs = obs;
  const cfg = () => Object.assign({ host: location.hostname || 'localhost', puerto: 4455, clave: '', auto: true }, store.get('obs', {}));
  let reintento = null, escenaActual = '', escenas = [], transiciones = [], plataforma = 'windows', streamPoll = null, miniT = null, timerT = null;

  function estadoOBS(modo, txt, sub) {
    $('#obsDot').className = 'dot ' + (modo === 'ok' ? 'ok' : modo === 'wait' ? 'wait' : '');
    $('#obsTxt').textContent = txt; $('#obsSub').textContent = sub || '';
    $('#obsMini').innerHTML = `<span class="dot ${modo === 'ok' ? 'ok' : modo === 'wait' ? 'wait' : ''}"></span> ${esc(txt)}`;
    $('#obsConectar').textContent = modo === 'ok' ? 'Desconectar' : 'Conectar';
    const on = modo === 'ok';
    $('#btnStream').disabled = !on; $('#btnAddCapa').disabled = !on;
    const ao = $('#stgAddObs'); if (ao) ao.disabled = !on;
    if (!on) {
      $('#streamTxt').textContent = 'Transmisión: —'; $('#streamTxt').className = 'stream-txt';
      $('#btnStream').className = 'stream-btn'; $('#btnStream').textContent = '● TRANSMITIR';
      const sin = '<div class="hint">Sin conexión con OBS.</div>';
      $('#escenas').innerHTML = sin; $('#camaras').innerHTML = sin; $('#audioMain').innerHTML = '';
      $('#mezclador').innerHTML = '<div class="hint">Conecte OBS para ver las fuentes de audio.</div>';
      $('#audioSel').innerHTML = '<option>Sin conexión con OBS</option>';
    }
  }

  async function conectar(manual) {
    clearTimeout(reintento);
    const c = cfg();
    estadoOBS('wait', 'Conectando con OBS…', `ws://${c.host}:${c.puerto}`);
    try {
      await obs.conectar({ host: c.host, puerto: c.puerto, clave: c.clave });
    } catch (e) {
      estadoOBS('off', 'OBS desconectado', e.message);
      if (manual) toast('OBS: ' + e.message);
      if (c.auto && !/contraseña/i.test(e.message)) reintento = setTimeout(() => conectar(false), 10000);
      return;
    }
    const v = await obs.call('GetVersion').catch(() => ({}));
    plataforma = v.platform || 'windows';
    estadoOBS('ok', 'OBS conectado', `OBS ${v.obsVersion || ''} · WebSocket ${v.obsWebSocketVersion || ''}`);
    if (manual) toast('Conectado con OBS');
    await Promise.all([cargarEscenas(), actualizarStream(), cargarEntradas()]);
    iniciarMiniaturas();
  }
  obs.on('desconectado', () => {
    estadoOBS('off', 'OBS desconectado', 'Se perdió la conexión');
    clearInterval(streamPoll); clearTimeout(miniT);
    if (cfg().auto) reintento = setTimeout(() => conectar(false), 5000);
  });
  $('#obsConectar').addEventListener('click', () => {
    if (obs.conectado) { const c = cfg(); c.auto = false; store.set('obs', c); clearTimeout(reintento); obs.desconectar(); estadoOBS('off', 'OBS desconectado', 'Desconectado por el usuario'); }
    else conectar(true);
  });

  async function configurarOBS() {
    const c = cfg();
    const r = await dialogo('Conexión con OBS Studio', `
      <p class="hint">En OBS: <b>Herramientas → Ajustes del servidor WebSocket</b>. Active “Habilitar servidor WebSocket” y use “Mostrar información de conexión” para ver puerto y contraseña.</p>
      <div class="f2"><div class="f grow"><label>Servidor (IP)</label><input id="ocH" class="full" value="${esc(c.host)}"></div>
      <div class="f" style="width:110px"><label>Puerto</label><input id="ocP" type="number" class="full" value="${c.puerto}"></div></div>
      <div class="f"><label>Contraseña</label><input id="ocC" type="password" class="full" value="${esc(c.clave)}" autocomplete="off"></div>
      <label class="chk"><input type="checkbox" id="ocA" ${c.auto ? 'checked' : ''}> Conectar automáticamente al abrir</label>`,
      [['cancel', 'Cancelar'], ['ok', 'Guardar y conectar', 'primary']]);
    if (r !== 'ok') return;
    store.set('obs', { host: $('#ocH').value.trim() || 'localhost', puerto: +$('#ocP').value || 4455, clave: $('#ocC').value, auto: $('#ocA').checked });
    conectar(true);
  }
  PP.conectarOBS = conectar;
  $('#obsCfg').addEventListener('click', configurarOBS);
  $('#btnObsCfg2').addEventListener('click', configurarOBS);

  // --- Transmisión
  function hms(ms) { const s = Math.floor(ms / 1000); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => String(x).padStart(2, '0')).join(':'); }
  async function actualizarStream() {
    try {
      const s = await obs.call('GetStreamStatus');
      $('#streamTxt').textContent = s.outputActive ? `● EN VIVO ${hms(s.outputDuration || 0)}` : s.outputReconnecting ? 'Reconectando…' : 'Transmisión detenida';
      $('#streamTxt').className = 'stream-txt' + (s.outputActive ? ' live' : '');
      $('#btnStream').className = 'stream-btn' + (s.outputActive ? ' live' : '');
      $('#btnStream').textContent = s.outputActive ? '■ DETENER' : '● TRANSMITIR';
      $('#btnStream').dataset.activo = s.outputActive ? '1' : '';
      clearInterval(streamPoll);
      if (s.outputActive) streamPoll = setInterval(actualizarStream, 1000);
    } catch (_) { /* sin conexión */ }
  }
  obs.on('StreamStateChanged', actualizarStream);
  $('#btnStream').addEventListener('click', async () => {
    const activo = $('#btnStream').dataset.activo === '1';
    if (!confirm(activo ? '¿DETENER la transmisión en vivo?' : '¿INICIAR la transmisión en vivo en OBS?')) return;
    try { await obs.call(activo ? 'StopStream' : 'StartStream'); toast(activo ? 'Deteniendo transmisión…' : 'Iniciando transmisión…'); } catch (e) { toast('OBS: ' + e.message); }
  });
  $('#btnAddCapa').addEventListener('click', async () => {
    try {
      const { currentProgramSceneName } = await obs.call('GetCurrentProgramScene');
      await obs.call('CreateInput', { sceneName: currentProgramSceneName, inputName: 'PK-PENTECOSTAL · Capa', inputKind: 'browser_source',
        inputSettings: { url: location.origin + '/capa', width: 1920, height: 1080, reroute_audio: false, shutdown: false } });
      toast(`Capa añadida a la escena "${currentProgramSceneName}"`);
    } catch (e) {
      if (e.code === 601) toast('La capa “PK-PENTECOSTAL · Capa” ya existe en OBS');
      else toast('OBS: ' + e.message);
    }
  });

  // --- Escenas
  async function cargarEscenas() {
    try {
      const r = await obs.call('GetSceneList');
      escenas = (r.scenes || []).slice().sort((a, b) => b.sceneIndex - a.sceneIndex).map((s) => s.sceneName);
      escenaActual = r.currentProgramSceneName;
      const t = await obs.call('GetSceneTransitionList').catch(() => ({ transitions: [] }));
      transiciones = t.transitions || [];
      pintarEscenas();
    } catch (_) { /* sin conexión */ }
  }
  function pintarEscenas() {
    const prev = {}; $$('#escenas .scene').forEach((s) => { const i = s.querySelector('img'); if (i) prev[s.dataset.s] = i.src; });
    $('#escenas').innerHTML = escenas.map((n) => `<div class="scene ${n === escenaActual ? 'active' : ''}" data-s="${esc(n)}">
      <div class="thumb">${prev[n] ? `<img src="${prev[n]}" alt="">` : '🎬'}</div><div class="nm">${esc(n)}</div></div>`).join('') || '<div class="hint">OBS no tiene escenas.</div>';
  }
  ['SceneListChanged', 'SceneCreated', 'SceneRemoved', 'SceneNameChanged'].forEach((ev) => obs.on(ev, cargarEscenas));
  obs.on('CurrentProgramSceneChanged', (d) => { escenaActual = d.sceneName; pintarEscenas(); cargarCamaras(); });
  obs.on('SceneTransitionCreated', cargarEscenas); obs.on('SceneTransitionRemoved', cargarEscenas);
  $('#escenas').addEventListener('click', (e) => { const s = e.target.closest('.scene'); if (s) cambiarEscena(s.dataset.s); });
  async function cambiarEscena(nombre) {
    try {
      // Stinger propio de PK-PENTECOSTAL (pestaña STINGERS): cubre, cambia la escena y descubre
      if (PP.stingerEscena && nombre !== escenaActual && await PP.stingerEscena(nombre)) return;
      if ($('#swStinger').checked) {
        const sting = transiciones.find((t) => /stinger/i.test(t.transitionKind));
        if (sting) await obs.call('SetCurrentSceneTransition', { transitionName: sting.transitionName });
        else toast('No hay una transición Stinger en OBS. Créela en OBS (Transiciones de escena → ＋ → Stinger).');
      }
      await obs.call('SetCurrentProgramScene', { sceneName: nombre });
    } catch (e) { toast('OBS: ' + e.message); }
  }
  $('#swStinger').checked = store.get('swStinger', false);
  $('#swStinger').addEventListener('change', (e) => store.set('swStinger', e.target.checked));
  $('#swMinis').checked = store.get('swMinis', true);
  $('#swMinis').addEventListener('change', (e) => { store.set('swMinis', e.target.checked); iniciarMiniaturas(); if (!e.target.checked) $$('#escenas .thumb').forEach((t) => (t.innerHTML = '🎬')); });
  function iniciarMiniaturas() {
    clearTimeout(miniT);
    if (!$('#swMinis').checked || !obs.conectado) return;
    const ciclo = async () => {
      if (!obs.conectado || !$('#swMinis').checked) return;
      if (!mod.classList.contains('hidden') && !document.hidden) {
        for (const n of escenas) {
          try {
            const r = await obs.call('GetSourceScreenshot', { sourceName: n, imageFormat: 'jpg', imageWidth: 256, imageCompressionQuality: 55 });
            const el = $$('#escenas .scene').find((s) => s.dataset.s === n);
            if (el) el.querySelector('.thumb').innerHTML = `<img src="${r.imageData}" alt="">`;
          } catch (_) { /* escena sin imagen */ }
        }
      }
      miniT = setTimeout(ciclo, 3000);
    };
    ciclo();
  }
  $('#btnEfectos').addEventListener('click', async () => {
    if (!obs.conectado) return toast('OBS no está conectado');
    const cur = await obs.call('GetCurrentSceneTransition').catch(() => ({}));
    const r = await dialogo('Transición entre escenas', `
      <div class="f"><label>Efecto</label><select id="efT" class="full">${transiciones.map((t) => `<option ${t.transitionName === cur.transitionName ? 'selected' : ''}>${esc(t.transitionName)}</option>`).join('')}</select></div>
      <div class="f"><label>Duración (ms)</label><input id="efD" type="number" min="50" max="20000" step="50" class="full" value="${cur.transitionDuration || 300}"></div>
      <p class="hint">Las transiciones se crean en OBS (panel “Transiciones de escena”).</p>`);
    if (r !== 'ok') return;
    try {
      await obs.call('SetCurrentSceneTransition', { transitionName: $('#efT').value });
      await obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: +$('#efD').value }).catch(() => {});
      toast('Transición: ' + $('#efT').value);
    } catch (e) { toast('OBS: ' + e.message); }
  });
  $('#btnTimer').addEventListener('click', async () => {
    if (timerT) { clearInterval(timerT); timerT = null; $('#timerTxt').textContent = 'Temporizador'; return toast('Temporizador cancelado'); }
    if (!obs.conectado) return toast('OBS no está conectado');
    const r = await dialogo('Cambio automático de escena', `
      <div class="f"><label>Cambiar a la escena</label><select id="tmS" class="full">${escenas.map((n) => `<option>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><label>Dentro de (segundos)</label><input id="tmN" type="number" min="1" value="60" class="full"></div>`, [['cancel', 'Cancelar'], ['ok', 'Iniciar', 'primary']]);
    if (r !== 'ok') return;
    const destino = $('#tmS').value; let quedan = Math.max(1, +$('#tmN').value || 60);
    const tick = () => { $('#timerTxt').textContent = `${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')} → ${destino}`; };
    tick();
    timerT = setInterval(() => { quedan--; tick(); if (quedan <= 0) { clearInterval(timerT); timerT = null; $('#timerTxt').textContent = 'Temporizador'; cambiarEscena(destino); } }, 1000);
  });

  // --- Entradas: cámaras y audio
  const KIND_CAM = { windows: 'dshow_input', macos: 'av_capture_input_v2', linux: 'v4l2_input' };
  const ES_CAM = /dshow_input|av_capture_input|v4l2_input/;
  const KIND_MIC = { windows: 'wasapi_input_capture', macos: 'coreaudio_input_capture', linux: 'pulse_input_capture' };
  const KIND_DESK = { windows: 'wasapi_output_capture', macos: 'coreaudio_output_capture', linux: 'pulse_output_capture' };
  let entradas = [], audios = [], audioSel = store.get('audioSel', '');
  async function cargarEntradas() {
    try {
      entradas = (await obs.call('GetInputList')).inputs || [];
      await Promise.all([cargarCamaras(), cargarAudio()]);
    } catch (_) { /* sin conexión */ }
  }
  ['InputCreated', 'InputRemoved', 'InputNameChanged'].forEach((ev) => obs.on(ev, cargarEntradas));
  obs.on('SceneItemEnableStateChanged', () => cargarCamaras());

  async function cargarCamaras() {
    if (!obs.conectado) return;
    const cams = entradas.filter((i) => ES_CAM.test(i.inputKind));
    const filas = await Promise.all(cams.map(async (c) => {
      const act = await obs.call('GetSourceActive', { sourceName: c.inputName }).catch(() => ({}));
      let enEscena = null, itemId = null;
      try { itemId = (await obs.call('GetSceneItemId', { sceneName: escenaActual, sourceName: c.inputName })).sceneItemId; enEscena = (await obs.call('GetSceneItemEnabled', { sceneName: escenaActual, sceneItemId: itemId })).sceneItemEnabled; } catch (_) { /* no está en la escena */ }
      return { n: c.inputName, activo: !!act.videoActive, enEscena, itemId };
    }));
    $('#camaras').innerHTML = filas.map((f) => `<div class="cam" data-n="${esc(f.n)}">
      <span class="dot ${f.activo ? 'ok' : ''}" title="${f.activo ? 'Activa (se ve en el programa)' : 'Inactiva'}"></span>
      <span class="nm">${esc(f.n)}<br><small>${f.activo ? 'Al aire' : 'Inactiva'}${f.enEscena === null ? ' · no está en esta escena' : ''}</small></span>
      ${f.enEscena === null ? '<button class="small" data-c="add">＋ Escena</button>' : `<button class="small" data-c="vis" data-id="${f.itemId}" data-v="${f.enEscena ? 1 : 0}">${f.enEscena ? '👁 Ocultar' : '👁 Mostrar'}</button>`}
      <button class="small" data-c="cfg" title="Elegir dispositivo">⚙</button></div>`).join('') || '<div class="hint">No hay cámaras en OBS. Pulse ＋ AÑADIR CÁMARA.</div>';
  }
  $('#camaras').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    const n = b.closest('.cam').dataset.n;
    try {
      if (b.dataset.c === 'vis') await obs.call('SetSceneItemEnabled', { sceneName: escenaActual, sceneItemId: +b.dataset.id, sceneItemEnabled: b.dataset.v !== '1' });
      if (b.dataset.c === 'add') await obs.call('CreateSceneItem', { sceneName: escenaActual, sourceName: n });
      if (b.dataset.c === 'cfg') await elegirDispositivo(n, /dshow/.test(KIND_CAM[plataforma]) ? 'video_device_id' : plataforma === 'linux' ? 'device_id' : 'device');
      cargarCamaras();
    } catch (err) { toast('OBS: ' + err.message); }
  });
  async function elegirDispositivo(input, prop) {
    const r = await obs.call('GetInputPropertiesListPropertyItems', { inputName: input, propertyName: prop }).catch(() => null);
    const items = r?.propertyItems || [];
    if (!items.length) { toast('OBS no listó dispositivos. Configúrelo directamente en OBS.'); return obs.call('OpenInputPropertiesDialog', { inputName: input }).catch(() => {}); }
    const actual = (await obs.call('GetInputSettings', { inputName: input }).catch(() => ({ inputSettings: {} }))).inputSettings[prop];
    const res = await dialogo(`Dispositivo de "${input}"`, `<select id="dvS" class="full">${items.filter((i) => i.itemEnabled !== false).map((i) => `<option value="${esc(i.itemValue)}" ${i.itemValue === actual ? 'selected' : ''}>${esc(i.itemName)}</option>`).join('')}</select>`);
    if (res === 'ok') { await obs.call('SetInputSettings', { inputName: input, inputSettings: { [prop]: $('#dvS').value } }); toast('Dispositivo actualizado'); }
  }
  $('#btnAddCam').addEventListener('click', async () => {
    if (!obs.conectado) return toast('OBS no está conectado');
    const r = await dialogo('Añadir cámara', `<div class="f"><label>Nombre</label><input id="nmC" class="full" value="CAM${entradas.filter((i) => ES_CAM.test(i.inputKind)).length + 1}"></div><p class="hint">Se agrega a la escena actual: <b>${esc(escenaActual)}</b>. Después elija el dispositivo.</p>`);
    if (r !== 'ok') return;
    const nombre = $('#nmC').value.trim() || 'CAM';
    try {
      await obs.call('CreateInput', { sceneName: escenaActual, inputName: nombre, inputKind: KIND_CAM[plataforma] || 'dshow_input', inputSettings: {} });
      await cargarEntradas();
      await elegirDispositivo(nombre, plataforma === 'windows' ? 'video_device_id' : plataforma === 'linux' ? 'device_id' : 'device');
    } catch (e) { toast('OBS: ' + (e.code === 601 ? 'ya existe una fuente con ese nombre' : e.message)); }
  });

  // Audio
  async function cargarAudio() {
    if (!obs.conectado) return;
    const res = await Promise.all(entradas.map(async (i) => {
      try {
        const v = await obs.call('GetInputVolume', { inputName: i.inputName });
        const m = await obs.call('GetInputMute', { inputName: i.inputName });
        return { n: i.inputName, kind: i.inputKind, db: v.inputVolumeDb, mute: m.inputMuted };
      } catch (_) { return null; }
    }));
    audios = res.filter(Boolean);
    if (!audios.find((a) => a.n === audioSel)) audioSel = audios[0]?.n || '';
    $('#audioSel').innerHTML = audios.map((a) => `<option ${a.n === audioSel ? 'selected' : ''}>${esc(a.n)}</option>`).join('') || '<option>Sin fuentes de audio</option>';
    const fila = (a) => `<div class="au" data-n="${esc(a.n)}">
        <span class="nm">${esc(a.n)}</span><span class="db">${a.db <= -100 ? '-∞' : a.db.toFixed(1)} dB</span>
        <div class="meter"><i></i></div>
        <input type="range" min="-60" max="0" step="0.5" value="${Math.max(-60, a.db)}" data-vol>
        <button class="small mute ${a.mute ? 'on' : ''}" data-mute>${a.mute ? '🔇 Silenciado' : '🔊'}</button></div>`;
    $('#mezclador').innerHTML = audios.map(fila).join('') || '<div class="hint">OBS no tiene fuentes de audio.</div>';
    const sel = audios.find((a) => a.n === audioSel);
    $('#audioMain').innerHTML = sel ? fila(sel) : '<div class="hint">Añada una fuente de audio.</div>';
  }
  $('#audioSel').addEventListener('change', (e) => { audioSel = e.target.value; store.set('audioSel', audioSel); cargarAudio(); });
  function alAudio(e) {
    const row = e.target.closest('.au'); if (!row) return;
    const n = row.dataset.n;
    if (e.type === 'input' && e.target.dataset.vol !== undefined) {
      $$(`.au[data-n="${CSS.escape(n)}"] .db`).forEach((d) => (d.textContent = (+e.target.value <= -60 ? '-∞' : (+e.target.value).toFixed(1)) + ' dB'));
      obs.call('SetInputVolume', { inputName: n, inputVolumeDb: +e.target.value <= -60 ? -100 : +e.target.value }).catch((err) => toast('OBS: ' + err.message));
    }
    if (e.type === 'click' && e.target.dataset.mute !== undefined) obs.call('ToggleInputMute', { inputName: n }).catch((err) => toast('OBS: ' + err.message));
  }
  ['#mezclador', '#audioMain'].forEach((s) => { $(s).addEventListener('input', alAudio); $(s).addEventListener('click', alAudio); });
  obs.on('InputMuteStateChanged', (d) => { const a = audios.find((x) => x.n === d.inputName); if (a) { a.mute = d.inputMuted; $$(`.au[data-n="${CSS.escape(d.inputName)}"] [data-mute]`).forEach((b) => { b.classList.toggle('on', d.inputMuted); b.textContent = d.inputMuted ? '🔇 Silenciado' : '🔊'; }); } });
  obs.on('InputVolumeChanged', (d) => {
    $$(`.au[data-n="${CSS.escape(d.inputName)}"]`).forEach((r) => {
      const s = r.querySelector('[data-vol]'); if (document.activeElement !== s) s.value = Math.max(-60, d.inputVolumeDb);
      r.querySelector('.db').textContent = (d.inputVolumeDb <= -100 ? '-∞' : d.inputVolumeDb.toFixed(1)) + ' dB';
    });
  });
  obs.on('InputVolumeMeters', (d) => {
    for (const i of d.inputs || []) {
      const peak = Math.max(0, ...(i.inputLevelsMul || []).map((c) => c[1] || 0));
      const db = peak > 0 ? 20 * Math.log10(peak) : -100;
      const pct = Math.max(0, Math.min(100, (db + 60) / 60 * 100));
      $$(`.au[data-n="${CSS.escape(i.inputName)}"] .meter i`).forEach((m) => (m.style.left = pct + '%'));
    }
  });
  $('#btnAddAudio').addEventListener('click', async () => {
    if (!obs.conectado) return toast('OBS no está conectado');
    const r = await dialogo('Añadir fuente de audio', `
      <div class="f"><label>Tipo</label><select id="auT" class="full"><option value="mic">Micrófono / entrada de audio</option><option value="desk">Audio del escritorio (salida)</option></select></div>
      <div class="f"><label>Nombre</label><input id="auN" class="full" value="Micrófono ${audios.length + 1}"></div>
      <p class="hint">Se agrega a la escena actual: <b>${esc(escenaActual)}</b>.</p>`);
    if (r !== 'ok') return;
    const nombre = $('#auN').value.trim() || 'Audio';
    try {
      await obs.call('CreateInput', { sceneName: escenaActual, inputName: nombre, inputKind: ($('#auT').value === 'mic' ? KIND_MIC : KIND_DESK)[plataforma] || KIND_MIC.windows, inputSettings: {} });
      await cargarEntradas();
      audioSel = nombre; store.set('audioSel', nombre); cargarAudio();
      await elegirDispositivo(nombre, 'device_id');
    } catch (e) { toast('OBS: ' + (e.code === 601 ? 'ya existe una fuente con ese nombre' : e.message)); }
  });

  // ================================================================ Inicio
  const vista = store.get('modView', 'overlay');
  $(`.mod-nav [data-view="${vista}"]`)?.click();
  cargarBiblioteca();
  if (cfg().auto) conectar(false); else estadoOBS('off', 'OBS desconectado', 'Pulse Conectar');
  if (PP.estado()) PP.alEstado(PP.estado());
})();
