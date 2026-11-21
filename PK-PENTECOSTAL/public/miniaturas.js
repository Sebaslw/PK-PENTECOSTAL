/* PK-PENTECOSTAL · Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Miniaturas livianas de videos.
 * Antes cada miniatura era un <video> abierto (un decodificador por video, incluso los 4K).
 * Ahora: se captura UNA imagen pequeña de cada video solo cuando se ve en pantalla,
 * de a un video a la vez, se guarda en memoria y el <video> se libera.
 * Al pasar el mouse se reproduce una vista previa temporal que se elimina al salir.
 * Uso en HTML:  <img class="mini-video" data-video="URL" data-t="2" alt="">  */
(function () {
  const cache = new Map();      // url -> dataURL (o '' si falló)
  const cola = [];              // imágenes esperando captura
  let ocupado = false;
  const VACIO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  function capturar(url, t) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      let listo = false;
      const fin = (dato) => {
        if (listo) return; listo = true; clearTimeout(limite);
        v.removeAttribute('src'); v.load(); // libera el decodificador
        resolve(dato);
      };
      const limite = setTimeout(() => fin(''), 8000);
      v.muted = true; v.preload = 'auto'; v.playsInline = true;
      v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(t, Math.max(0, (v.duration || 0) - 0.1)); });
      v.addEventListener('seeked', () => {
        try {
          const w = 320, h = Math.round(w * (v.videoHeight || 9) / (v.videoWidth || 16));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(v, 0, 0, w, h);
          fin(c.toDataURL('image/jpeg', 0.72));
        } catch (_) { fin(''); }
      });
      v.addEventListener('error', () => fin(''));
      v.src = url;
    });
  }

  async function procesar() {
    if (ocupado) return;
    ocupado = true;
    while (cola.length) {
      const img = cola.shift();
      if (!img.isConnected) continue;
      const url = img.dataset.video;
      if (!cache.has(url)) cache.set(url, await capturar(url, +img.dataset.t || 1));
      pintar(img);
    }
    ocupado = false;
  }

  function pintar(img) {
    const d = cache.get(img.dataset.video);
    img.src = d || VACIO;
    img.classList.add('mini-lista');
  }

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      if (cache.has(e.target.dataset.video)) pintar(e.target);
      else { cola.push(e.target); procesar(); }
    }
  }, { rootMargin: '200px' }) : null;

  /** Activa las miniaturas dentro de un contenedor recién pintado */
  function activar(cont) {
    cont.querySelectorAll('img.mini-video:not(.mini-lista)').forEach((img) => {
      if (cache.has(img.dataset.video)) pintar(img);
      else if (io) io.observe(img);
      else { cola.push(img); procesar(); }
    });
  }

  /** Vista previa en movimiento al pasar el mouse (selector = tarjeta que contiene la miniatura) */
  function hover(cont, selector) {
    let actual = null;
    const quitar = () => { if (actual) { actual.removeAttribute('src'); actual.load(); actual.remove(); actual = null; } };
    cont.addEventListener('mouseover', (e) => {
      const card = e.target.closest(selector); if (!card) return;
      const img = card.querySelector('img.mini-video');
      if (!img || (actual && actual._card === card)) return;
      quitar();
      const v = document.createElement('video');
      Object.assign(v, { src: img.dataset.video, muted: true, loop: true, playsInline: true, autoplay: true });
      v.className = 'mini-hover'; v._card = card;
      img.after(v); actual = v;
    });
    cont.addEventListener('mouseout', (e) => {
      const card = e.target.closest(selector);
      if (card && actual && actual._card === card && !card.contains(e.relatedTarget)) quitar();
    });
  }

  window.Miniaturas = { activar, hover };
})();
