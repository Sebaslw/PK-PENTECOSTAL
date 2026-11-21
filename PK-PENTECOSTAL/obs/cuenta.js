/* PK-PENTECOSTAL · Módulo OBS: cuenta regresiva ("EMPEZAMOS EN…"), diseños laterales del banner y atajos de stingers
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
(() => {
  'use strict';
  const PP = window.PP;
  const { api, toast, esc, $, $$ } = PP;
  let st = null, desfase = 0, relojT = 0;

  // ================================================================ Cuenta regresiva
  const cuenta = (body) => api('/api/cuenta', { method: 'POST', body }).catch((e) => toast('Error: ' + e.message));
  $('#cuentaCard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmin]');
    if (b) { $('#cuentaMin').value = b.dataset.cmin; cuenta({ accion: 'iniciar', segundos: +b.dataset.cmin * 60 }); }
  });
  $('#cuentaIniciar').addEventListener('click', () => {
    const m = +$('#cuentaMin').value;
    if (!(m > 0)) return toast('Escriba los minutos');
    cuenta({ accion: 'iniciar', segundos: Math.round(m * 60) });
  });
  $('#cuentaHasta').addEventListener('click', () => cuenta({ accion: 'hasta', hora: $('#cuentaHora').value }));
  $('#cuentaMas').addEventListener('click', () => cuenta({ accion: 'sumar', segundos: 60 }));
  $('#cuentaMenos').addEventListener('click', () => cuenta({ accion: 'sumar', segundos: -60 }));
  $('#cuentaDetener').addEventListener('click', () => cuenta({ accion: 'detener' }));
  // Hora sugerida: la próxima media hora
  (() => { const d = new Date(Date.now() + 30 * 60000); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0); $('#cuentaHora').value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })();

  function relojPanel() {
    clearTimeout(relojT);
    const c = st && st.cuenta, el = $('#cuentaEstado');
    if (!c || !c.activa) { el.textContent = 'Detenida'; el.className = 'cuenta-estado'; return; }
    const r = c.fin - (Date.now() + desfase);
    if (r <= 0) { el.textContent = '● Terminó'; el.className = 'cuenta-estado fin'; return; }
    const s = Math.ceil(r / 1000);
    el.textContent = '● ' + (s >= 3600 ? `${Math.floor(s / 3600)}:` : '') + `${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    el.className = 'cuenta-estado on';
    relojT = setTimeout(relojPanel, 500);
  }

  // ================================================================ Diseños laterales del banner
  let latKey = '';
  async function cargarLaterales() {
    let lista = [];
    try { lista = await api('/api/laterales'); } catch (_) { return; }
    const k = JSON.stringify(lista.map((l) => l.id));
    if (k === latKey) return;
    latKey = k;
    const sel = $('#bLateral');
    const grupo = (titulo, xs) => xs.length ? `<optgroup label="${titulo}">${xs.map((l) => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</optgroup>` : '';
    sel.innerHTML = '<option value="">Clásico (caja con fondo y efectos)</option>' +
      grupo('Diseño PK-PENTECOSTAL', lista.filter((l) => l.origen)) + grupo('ProyectoRP (tal cual)', lista.filter((l) => !l.origen));
    if (st) sel.value = st.modulo.banner.lateral || '';
  }

  // ================================================================ Atajos de teclado de los stingers
  // S = stinger completo (entra y sale) · Shift+S = cubrir / descubrir
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 's') return;
    if (document.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    e.preventDefault();
    const accion = e.shiftKey ? (st && st.stinger && st.stinger.alAire ? 'salir' : 'entrar') : 'completo';
    api('/api/stinger', { method: 'POST', body: { accion } })
      .then(() => toast({ completo: '⚡ Stinger', entrar: '⚡ Stinger: cubriendo', salir: '⚡ Stinger: descubriendo' }[accion]))
      .catch((err) => toast('Error: ' + err.message));
  });

  // ================================================================ Estado
  const prev = PP.alEstado;
  let rev = -1;
  function alEstado(s) {
    st = s;
    if (typeof s.ahora === 'number') desfase = s.ahora - Date.now();
    if (s.stingerRev !== rev) { rev = s.stingerRev; cargarLaterales(); }
    const sel = $('#bLateral'); if (sel && document.activeElement !== sel) sel.value = s.modulo.banner.lateral || '';
    relojPanel();
  }
  PP.alEstado = (s) => { prev && prev(s); alEstado(s); };
  if (PP.estado && PP.estado()) alEstado(PP.estado()); else cargarLaterales();
})();
