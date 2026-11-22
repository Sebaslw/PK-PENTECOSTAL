/* PK-PENTECOSTAL · Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Miniaturas de fondos (imágenes y videos) que se ven apenas se abre el programa.
 *  · Los fondos de fábrica traen su miniatura lista (fondos-miniaturas/, se crean con npm run miniaturas).
 *  · Si un fondo no tiene miniatura (p. ej. uno subido), se genera UNA vez en segundo plano, apenas abre
 *    el panel (sin esperar a que se abra la pestaña Fondos), y se guarda en BSPK/miniaturas: la próxima
 *    vez aparece al instante.
 *  · Se genera de a un archivo a la vez y el <video> se libera enseguida (no se abren decodificadores 4K).
 *  · Al pasar el mouse se reproduce una vista previa temporal que se elimina al salir.
 * Uso en HTML:
 *   <img class="mini-video" data-video="URL" data-t="2" data-clave="CLAVE" alt="">   (video)
 *   <img class="mini-imagen" data-imagen="URL" data-clave="CLAVE" alt="">            (imagen)  */
(function () {
  const cache = new Map();      // url -> dataURL (o '' si falló)
  const cola = [];              // imágenes esperando captura
  let ocupado = false;
  const VACIO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const ANCHO = 320;

  function aJpeg(fuente, w0, h0) {
    const w = ANCHO, h = Math.max(1, Math.round(w * (h0 || 9) / (w0 || 16)));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(fuente, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.74);
  }

  function capturarVideo(url, t) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      let listo = false;
      const fin = (dato) => {
        if (listo) return; listo = true; clearTimeout(limite);
        v.removeAttribute('src'); v.load(); // libera el decodificador
        resolve(dato);
      };
      const limite = setTimeout(() => fin(''), 15000);
      v.muted = true; v.preload = 'metadata'; v.playsInline = true;
      v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(t, Math.max(0, (v.duration || 0) - 0.1)); });
      v.addEventListener('seeked', () => { try { fin(aJpeg(v, v.videoWidth, v.videoHeight)); } catch (_) { fin(''); } });
      v.addEventListener('error', () => fin(''));
      v.src = url;
    });
  }

  function capturarImagen(url) {
    return new Promise((resolve) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { try { resolve(aJpeg(im, im.naturalWidth, im.naturalHeight)); } catch (_) { resolve(''); } };
      im.onerror = () => resolve('');
      im.src = url;
    });
  }

  // Guarda la miniatura en el servidor (BSPK/miniaturas) para las próximas veces
  function guardar(clave, dato) {
    if (!clave || !dato) return;
    fetch('/api/miniatura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, dato }) }).catch(() => {});
  }

  const urlDe = (img) => img.dataset.video || img.dataset.imagen;

  async function procesar() {
    if (ocupado) return;
    ocupado = true;
    while (cola.length) {
      const img = cola.shift();
      if (!img.isConnected || img.classList.contains('mini-lista')) continue;
      const url = urlDe(img);
      if (!cache.has(url)) {
        const dato = img.dataset.video ? await capturarVideo(url, +img.dataset.t || 1) : await capturarImagen(url);
        cache.set(url, dato);
        guardar(img.dataset.clave, dato);
      }
      pintar(img);
    }
    ocupado = false;
  }

  function pintar(img) {
    const d = cache.get(urlDe(img));
    // Si no se pudo generar, la imagen se muestra tal cual (los videos quedan con su etiqueta)
    img.src = d || (img.dataset.imagen || VACIO);
    img.classList.add('mini-lista');
  }

  /** Activa las miniaturas dentro de un contenedor recién pintado.
   *  Todas se ponen en cola de inmediato (también si la pestaña está oculta), las visibles primero. */
  function activar(cont) {
    const pend = [...cont.querySelectorAll('img.mini-video:not(.mini-lista), img.mini-imagen:not(.mini-lista)')];
    const visibles = [], resto = [];
    for (const img of pend) {
      if (cache.has(urlDe(img))) { pintar(img); continue; }
      (img.offsetParent ? visibles : resto).push(img);
    }
    cola.unshift(...visibles); cola.push(...resto);
    if (cola.length) setTimeout(procesar, visibles.length ? 0 : 300);
  }

  /** Vista previa en movimiento al pasar el mouse (selector = tarjeta que contiene la miniatura) */
  function hover(cont, selector) {
    let actual = null;
    const quitar = () => { if (actual) { actual.removeAttribute('src'); actual.load(); actual.remove(); actual = null; } };
    cont.addEventListener('mouseover', (e) => {
      const card = e.target.closest(selector); if (!card) return;
      const src = card.dataset.tipo === 'video' ? card.dataset.url : card.querySelector('img.mini-video')?.dataset.video;
      if (!src || (actual && actual._card === card)) return;
      quitar();
      const v = document.createElement('video');
      Object.assign(v, { src, muted: true, loop: true, playsInline: true, autoplay: true });
      v.className = 'mini-hover'; v._card = card;
      card.querySelector('img')?.after(v); actual = v;
    });
    cont.addEventListener('mouseout', (e) => {
      const card = e.target.closest(selector);
      if (card && actual && actual._card === card && !card.contains(e.relatedTarget)) quitar();
    });
  }

  window.Miniaturas = { activar, hover };
})();
