// PK-PENTECOSTAL · Visores independientes
// Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
// Cada pestaña del panel controla SU PROPIO visor (1, 2, 3…). Si se duplica la pestaña en el
// navegador, la copia toma sola el siguiente visor libre: lo que se proyecta en una pestaña
// no aparece en el visor de la otra. Cada visor tiene su texto en vivo, pantalla negra y fondo/estilo.
(() => {
  'use strict';
  const MAX = 9, SS = 'pk-visor', LS = 'pk-visores', VIGENCIA = 6000;
  const yo = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const leer = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (_) { return {}; } };
  const escribir = (o) => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (_) { /* sin almacenamiento */ } };
  const activos = () => { const o = leer(), t = Date.now(); for (const k of Object.keys(o)) if (!o[k] || t - o[k].t > VIGENCIA) delete o[k]; return o; };
  const libre = (o) => { let n = 1; while (n < MAX && o[n] && o[n].id !== yo) n++; return n; };

  const u = new URL(location.href);
  const pedido = parseInt(u.searchParams.get('pk'), 10);
  let n;
  try { n = parseInt(sessionStorage.getItem(SS), 10) || 1; } catch (_) { n = 1; }
  const o = activos();
  if (pedido >= 1 && pedido <= MAX) n = pedido;           // elegido a mano: se respeta
  else if (o[n] && o[n].id !== yo) n = libre(o);          // pestaña duplicada: siguiente visor libre
  if (pedido) { u.searchParams.delete('pk'); history.replaceState(null, '', u.pathname + u.search + u.hash); }

  function reclamar() {
    const a = activos();
    // Dos pestañas abiertas al mismo tiempo con el mismo visor: la más nueva se cambia
    if (a[n] && a[n].id !== yo && a[n].desde < desde) { n = libre(a); guardarSesion(); location.reload(); return; }
    a[n] = { id: yo, t: Date.now(), desde };
    escribir(a);
  }
  const desde = Date.now();
  const guardarSesion = () => { try { sessionStorage.setItem(SS, String(n)); } catch (_) { /* modo privado */ } };
  guardarSesion();
  reclamar();
  setInterval(reclamar, 2000);
  addEventListener('pagehide', () => { const a = leer(); if (a[n] && a[n].id === yo) { delete a[n]; escribir(a); } });

  window.PK_VISOR = n;

  // Todas las peticiones de este panel van a su visor (cabecera X-PK-Canal)
  const fetchAnterior = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin) {
      const h = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      h.set('X-PK-Canal', String(n));
      init = { ...init, headers: h };
    }
    return fetchAnterior(input, init);
  };

  // Indicador y selector del visor en la barra superior
  function pintar() {
    document.documentElement.dataset.visor = n;
    document.title = 'PK-PENTECOSTAL';
    const proy = document.querySelector('#btnProyectar');
    if (!proy || document.getElementById('visorSel')) return;
    const sel = document.createElement('select');
    sel.id = 'visorSel';
    sel.className = 'visor-sel';
    sel.title = 'PK-PENTECOSTAL ' + n;
    for (let i = 1; i <= MAX; i++) sel.add(new Option('📽 ' + i, String(i), i === n, i === n));
    sel.addEventListener('change', () => {
      const v = +sel.value;
      const a = activos();
      if (a[v] && a[v].id !== yo && !confirm('El número ' + v + ' ya lo usa otra pestaña.\n\n¿Usarlo también desde aquí?')) { sel.value = String(n); return; }
      const d = new URL(location.href); d.searchParams.set('pk', String(v));
      location.href = d.toString();
    });
    proy.before(sel);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintar); else pintar();
})();
