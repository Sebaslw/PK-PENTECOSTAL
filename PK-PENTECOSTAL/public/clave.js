// PK-PENTECOSTAL · Vinculación de celulares por QR
// 1) Si la dirección trae ?vincular=CLAVE (viene del QR), la guarda en este teléfono.
// 2) Agrega la clave a todas las peticiones al programa (cabecera X-PK-Clave).
// 3) Si este teléfono no está vinculado, muestra un aviso para escanear el QR.
(() => {
  'use strict';
  const K = 'pk-clave';
  const leer = () => { try { return localStorage.getItem(K) || ''; } catch (_) { return window.__pkClave || ''; } };
  const guardar = (v) => { window.__pkClave = v; try { localStorage.setItem(K, v); } catch (_) { /* modo privado */ } };

  const u = new URL(location.href);
  const nueva = u.searchParams.get('vincular');
  if (nueva) {
    guardar(nueva);
    u.searchParams.delete('vincular');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin === location.origin) {
      const h = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      const c = leer();
      if (c) h.set('X-PK-Clave', c);
      init = { ...init, headers: h };
    }
    const r = await fetchOriginal(input, init);
    if (r.status === 403 && url.origin === location.origin) {
      r.clone().json().then((d) => { if (d && d.vincular) mostrarAviso(); }).catch(() => {});
    }
    return r;
  };

  function mostrarAviso() {
    if (document.getElementById('pkVincular')) return;
    const el = document.createElement('div');
    el.id = 'pkVincular';
    el.innerHTML = `<div class="pkv-caja">
      <div class="pkv-ico">📱</div>
      <h2>Vincule este teléfono</h2>
      <p>En el computador donde está abierto <b>PK-PENTECOSTAL</b>, presione el botón <b>📱 Celular</b> y escanee el código QR con la cámara de este teléfono.</p>
      <p class="pkv-nota">El teléfono debe estar conectado al mismo Wi-Fi que el computador.</p>
      <button type="button" id="pkvReintentar">Ya lo escaneé · Reintentar</button>
    </div>`;
    document.body.appendChild(el);
    el.querySelector('#pkvReintentar').addEventListener('click', () => location.reload());
  }

  async function revisar() {
    try {
      const r = await fetch('/api/movil/estado', { cache: 'no-store' });
      const d = await r.json();
      document.documentElement.classList.toggle('pk-equipo', !!d.equipo);
      if (!d.equipo && !d.vinculado) mostrarAviso();
    } catch (_) { /* sin conexión: control.js ya lo muestra */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', revisar); else revisar();
})();
