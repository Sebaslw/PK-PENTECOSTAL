/* PK-PENTECOSTAL
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
/* Efectos visuales sobre <canvas>. Para añadir uno nuevo:
 *   Efectos.registrar('nombre', { etiqueta: 'Nombre visible', crear(w, h, p) {...}, paso(ctx, w, h, p, dt) {...} })
 * p = { color, opacidad (0-100), velocidad (0-100), intensidad (0-100) }  */
(function () {
  const registro = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  function rgb(hex) { const n = parseInt(String(hex).replace('#', ''), 16) || 0xffffff; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const cuantos = (w, h, p, base) => Math.round(base * (w * h) / (1920 * 300) * (0.2 + p.intensidad / 50));

  // Imágenes pre-dibujadas (se crean una sola vez por color): mucho más livianas que
  // crear un degradado nuevo por cada partícula en cada cuadro.
  const sprites = new Map();
  function sprite(tipo, c) {
    const k = tipo + c.join(',');
    if (sprites.has(k)) return sprites.get(k);
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const x = cv.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    if (tipo === 'brillo') { g.addColorStop(0, rgba(c, 1)); g.addColorStop(.3, rgba(c, .5)); g.addColorStop(1, rgba(c, 0)); }
    else { g.addColorStop(0, rgba(c, 1)); g.addColorStop(.7, rgba(c, .6)); g.addColorStop(1, rgba(c, 0)); }
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    if (sprites.size > 40) sprites.clear();
    sprites.set(k, cv);
    return cv;
  }

  function registrar(nombre, def) { registro[nombre] = def; }

  registrar('particulas', {
    etiqueta: 'Partículas',
    crear(w, h, p) { return Array.from({ length: cuantos(w, h, p, 60) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(1, 3.2), vy: rnd(.3, 1), vx: rnd(-.3, .3), f: rnd(0, 6.28) })); },
    paso(ctx, w, h, p, dt, s) {
      const c = rgb(p.color), v = .3 + p.velocidad / 25, spr = sprite('brillo', c);
      for (const q of s) {
        q.y -= q.vy * v * dt * 60; q.x += (q.vx + Math.sin(q.f += .02 * dt * 60) * .2) * dt * 60;
        if (q.y < -5) { q.y = h + 5; q.x = rnd(0, w); }
        const R = q.r * 4;
        ctx.drawImage(spr, q.x - R, q.y - R, R * 2, R * 2);
      }
    },
  });

  registrar('nieve', {
    etiqueta: 'Nieve',
    crear(w, h, p) { return Array.from({ length: cuantos(w, h, p, 90) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(1, 3.5), vy: rnd(.5, 1.5), f: rnd(0, 6.28) })); },
    paso(ctx, w, h, p, dt, s) {
      const c = rgb(p.color), v = .3 + p.velocidad / 25;
      ctx.fillStyle = rgba(c, .9);
      for (const q of s) {
        q.y += q.vy * v * dt * 60; q.x += Math.sin(q.f += .015 * dt * 60) * .6;
        if (q.y > h + 5) { q.y = -5; q.x = rnd(0, w); }
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
      }
    },
  });

  registrar('bokeh', {
    etiqueta: 'Luces bokeh',
    crear(w, h, p) { return Array.from({ length: cuantos(w, h, p, 14) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(15, 55), vx: rnd(-.4, .4), vy: rnd(-.25, .25), a: rnd(.15, .5) })); },
    paso(ctx, w, h, p, dt, s) {
      const c = rgb(p.color), v = .2 + p.velocidad / 30, spr = sprite('bokeh', c), base = ctx.globalAlpha;
      for (const q of s) {
        q.x += q.vx * v * dt * 60; q.y += q.vy * v * dt * 60;
        if (q.x < -q.r) q.x = w + q.r; if (q.x > w + q.r) q.x = -q.r;
        if (q.y < -q.r) q.y = h + q.r; if (q.y > h + q.r) q.y = -q.r;
        ctx.globalAlpha = base * q.a;
        ctx.drawImage(spr, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
      }
      ctx.globalAlpha = base;
    },
  });

  registrar('estrellas', {
    etiqueta: 'Estrellas',
    crear(w, h, p) { return Array.from({ length: cuantos(w, h, p, 70) }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(.6, 2), f: rnd(0, 6.28), s: rnd(.5, 1.5) })); },
    paso(ctx, w, h, p, dt, s) {
      const c = rgb(p.color), v = .2 + p.velocidad / 25;
      for (const q of s) {
        q.f += q.s * v * dt * 3;
        const a = (Math.sin(q.f) + 1) / 2;
        ctx.fillStyle = rgba(c, a);
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.6 + a * .6), 0, 7); ctx.fill();
        if (a > .92) { ctx.strokeStyle = rgba(c, a * .5); ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(q.x - q.r * 5, q.y); ctx.lineTo(q.x + q.r * 5, q.y); ctx.moveTo(q.x, q.y - q.r * 5); ctx.lineTo(q.x, q.y + q.r * 5); ctx.stroke(); }
      }
    },
  });

  registrar('rayos', {
    etiqueta: 'Rayos de luz',
    crear(w, h, p) { return Array.from({ length: Math.max(2, Math.round(2 + p.intensidad / 15)) }, (_, i) => ({ x: rnd(0, w), a: rnd(-.5, .5), wd: rnd(40, 140), f: rnd(0, 6.28) })); },
    paso(ctx, w, h, p, dt, s) {
      const c = rgb(p.color), v = .1 + p.velocidad / 60;
      for (const q of s) {
        q.f += v * dt; q.x += Math.sin(q.f) * .5;
        const al = (Math.sin(q.f * 1.7) + 1) / 2 * .35;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, rgba(c, al)); g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g; ctx.beginPath();
        ctx.moveTo(q.x - q.wd / 4, 0); ctx.lineTo(q.x + q.wd / 4, 0); ctx.lineTo(q.x + q.wd + q.a * h, h); ctx.lineTo(q.x - q.wd + q.a * h, h); ctx.fill();
      }
    },
  });

  /** Anima un efecto en un canvas. Devuelve { actualizar(p), detener() }
   *  Ahorro: la animación se DETIENE por completo cuando el efecto está apagado,
   *  cuando el canvas no se ve (pestaña oculta, vista previa fuera de pantalla) y,
   *  dentro de las vistas previas del panel, se limita a 30 cuadros por segundo. */
  function animar(canvas, p) {
    const ctx = canvas.getContext('2d');
    let params = { ...p }, estado = null, clave = '', raf = 0, t0 = 0, visible = true, ultimo = 0;
    const EN_IFRAME = window.parent !== window;
    const MIN_MS = EN_IFRAME ? 1000 / 30 - 2 : 0;
    function tam() {
      const r = canvas.getBoundingClientRect(); // tamaño real en pantalla (en vistas previas reducidas = menos trabajo)
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; estado = null; }
    }
    const debeCorrer = () => !!(params.on && registro[params.tipo] && visible && !document.hidden);
    function frame(t) {
      raf = 0;
      if (!debeCorrer()) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      raf = requestAnimationFrame(frame);
      if (MIN_MS && t - ultimo < MIN_MS) return;
      ultimo = t;
      const dt = t0 ? Math.min(.05, (t - t0) / 1000) : 1 / 60; t0 = t;
      tam();
      const ef = registro[params.tipo];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const k = params.tipo + '|' + params.intensidad;
      if (!estado || k !== clave) { estado = ef.crear(canvas.width, canvas.height, params); clave = k; }
      ctx.globalAlpha = params.opacidad / 100;
      ef.paso(ctx, canvas.width, canvas.height, params, dt, estado);
      ctx.globalAlpha = 1;
    }
    function revisar() {
      if (debeCorrer()) { if (!raf) { t0 = 0; raf = requestAnimationFrame(frame); } }
      else { if (raf) cancelAnimationFrame(raf); raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    }
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; revisar(); }).observe(canvas);
    document.addEventListener('visibilitychange', revisar);
    revisar();
    return { actualizar(np) { params = { ...np }; revisar(); }, detener() { params = { on: false }; revisar(); } };
  }

  window.Efectos = { registrar, animar, lista: () => Object.entries(registro).map(([k, v]) => ({ id: k, etiqueta: v.etiqueta || k })) };
})();
