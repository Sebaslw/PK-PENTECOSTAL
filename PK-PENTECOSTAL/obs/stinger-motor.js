/* PK-PENTECOSTAL · Motor de STINGERS (transiciones a pantalla completa para OBS)
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 *
 * Lee el mismo formato de diseño que ProyectoRP (stingers.json): estilo de cortina, colores, tiempos,
 * sonidos de entrada/salida, efectos animados y elementos (imágenes, videos con transparencia,
 * textos animados y figuras). Todo se dibuja sobre un escenario de 1920×1080.
 *
 *   const m = StingerMotor.crear(escenario, { resolver: (src) => url });
 *   await m.entrar(stinger);   // cubre la pantalla (al terminar está 100 % cubierta)
 *   await m.salir();           // descubre la pantalla
 */
(() => {
  'use strict';
  const W = 1920, H = 1080;
  const ESTILOS = [
    ['iris', 'Iris (círculo)'], ['persianas', 'Persianas'], ['barrido', 'Barrido diagonal'], ['diamante', 'Rombo'],
    ['giro', 'Giro 3D (puertas)'], ['mosaico', 'Mosaico'], ['cortina', 'Cortina'], ['zoomlogo', 'Zoom al logo'],
    ['destello', 'Destello de luz'], ['ninguno', 'Sin cortina (solo elementos)'],
  ];
  const EFECTOS = [['particulas', 'Partículas'], ['chispas', 'Chispas'], ['bokeh', 'Bokeh'], ['brillo', 'Brillo'], ['ondas', 'Ondas'], ['estrellas', 'Estrellas']];
  const ENTRADAS = [['zoom', 'Zoom'], ['fade', 'Fundido'], ['izquierda', 'Desde la izquierda'], ['derecha', 'Desde la derecha'], ['abajo', 'Desde abajo'], ['arriba', 'Desde arriba'], ['giro', 'Girando']];
  const SALIDAS = [['fade', 'Fundido'], ['zoom', 'Zoom'], ['izquierda', 'Hacia la izquierda'], ['derecha', 'Hacia la derecha'], ['abajo', 'Hacia abajo'], ['arriba', 'Hacia arriba'], ['giro', 'Girando']];
  const TEXTO_ANIM = [['ninguna', 'Ninguna'], ['letras', 'Letra por letra'], ['maquina', 'Máquina de escribir'], ['rebote', 'Rebote'], ['brillo', 'Brillo dorado']];

  // ---------------------------------------------------------------- Colores
  const hex = (c, d = '#000000') => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : d);
  const rgb = (c) => { const n = parseInt(hex(c).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = (c) => { const [r, g, b] = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const mezclar = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const rgba = (c, a) => { const [r, g, b] = rgb(c); return `rgba(${r},${g},${b},${a})`; };
  // Fondo = el color más oscuro (con un leve degradé); acento = el más claro (bordes que van delante)
  function paleta(s) {
    const c1 = hex(s.color1, '#0e1c3a'), c2 = hex(s.color2, '#122459');
    const [osc, cla] = lum(c1) <= lum(c2) ? [c1, c2] : [c2, c1];
    const parecidos = Math.abs(lum(c1) - lum(c2)) < 0.12;
    const centro = parecidos ? cla : mezclar(osc, '#ffffff', 0.12);
    return { fondo: `radial-gradient(ellipse at 50% 45%, ${centro} 0%, ${osc} 72%)`, plano: osc, acento: parecidos ? mezclar(cla, '#ffffff', 0.25) : cla };
  }

  // ---------------------------------------------------------------- Utilidades DOM
  const css = `
  .stg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
  .stg * { box-sizing: border-box; }
  .stg-cv, .stg-cv > i { position: absolute; display: block; will-change: transform, clip-path, opacity; }
  .stg-fx { position: absolute; inset: 0; width: ${W}px; height: ${H}px; }
  .stg-els { position: absolute; inset: 0; }
  .stg-pos { position: absolute; transform: translate(-50%, -50%); }
  .stg-ani { will-change: transform, opacity; }
  .stg-img { display: block; width: 100%; height: auto; }
  .stg-vid { display: block; width: 100%; height: auto; }
  .stg-txt { white-space: nowrap; line-height: 1.15; text-align: center; }
  .stg-txt span { display: inline-block; white-space: pre; }
  .stg-brillo { background: linear-gradient(100deg, currentColor 0%, currentColor 40%, #fff6c9 50%, currentColor 60%, currentColor 100%); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: stgBrillo 2.2s linear infinite; }
  @keyframes stgBrillo { from { background-position: 100% 0; } to { background-position: -100% 0; } }`;
  function ponerCss() {
    if (document.getElementById('stg-css')) return;
    const s = document.createElement('style'); s.id = 'stg-css'; s.textContent = css; document.head.appendChild(s);
  }
  const div = (cls, style = {}) => { const d = document.createElement('div'); if (cls) d.className = cls; Object.assign(d.style, style); return d; };
  const anim = (el, kf, o) => el.animate(kf, { fill: 'both', easing: 'cubic-bezier(.65,0,.35,1)', ...o });
  const esperar = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
  const terminado = (a) => (a && a.finished ? a.finished.catch(() => {}) : Promise.resolve());

  // Franja de luz en un borde: visible mientras se mueve, invisible con la pantalla cubierta
  function franja(padre, lado, color) {
    const f = div('', { position: 'absolute', top: 0, bottom: 0, width: '8px', [lado]: 0, background: color, boxShadow: `0 0 24px ${color}`, opacity: 0 });
    padre.appendChild(f);
    return {
      entrar: (t) => anim(f, [{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: t, easing: 'linear' }),
      salir: (t) => anim(f, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1 }], { duration: t, easing: 'linear' }),
    };
  }

  // ---------------------------------------------------------------- Cortinas (estilos)
  // Cada estilo construye su cortina y devuelve { entrar(ms), salir(ms) } → promesas.
  const CORTINAS = {
    iris(cv, p) {
      const ac = div('', { inset: 0, background: p.acento, position: 'absolute' }), fo = div('', { inset: 0, background: p.fondo, position: 'absolute' });
      cv.append(ac, fo);
      const k = (a, b) => [{ clipPath: `circle(${a}% at 50% 50%)` }, { clipPath: `circle(${b}% at 50% 50%)` }];
      return {
        entrar: (t) => Promise.all([terminado(anim(ac, k(0, 78), { duration: t * 0.85 })), terminado(anim(fo, k(0, 78), { duration: t, delay: 0, easing: 'cubic-bezier(.7,0,.3,1)' }))]),
        salir: (t) => Promise.all([terminado(anim(fo, k(78, 0), { duration: t * 0.9 })), terminado(anim(ac, k(78, 0), { duration: t, easing: 'cubic-bezier(.7,0,.3,1)' }))]),
      };
    },
    persianas(cv, p) {
      const N = 9, tiras = [];
      for (let i = 0; i < N; i++) {
        const t = div('', { position: 'absolute', left: 0, right: 0, top: (H / N) * i + 'px', height: Math.ceil(H / N) + 1 + 'px', background: p.fondo, backgroundSize: `${W}px ${H}px`, backgroundPosition: `0 -${(H / N) * i}px`, borderBottom: `3px solid ${rgba(p.acento, 0.55)}` });
        cv.appendChild(t); tiras.push(t);
      }
      const k = (a, b) => [{ transform: `scaleY(${a})` }, { transform: `scaleY(${b})` }];
      return {
        entrar: (t) => Promise.all(tiras.map((x, i) => { x.style.transformOrigin = '50% 0'; return terminado(anim(x, k(0, 1), { duration: t * 0.6, delay: (t * 0.4 * i) / N })); })),
        salir: (t) => Promise.all(tiras.map((x, i) => { x.style.transformOrigin = '50% 100%'; return terminado(anim(x, k(1, 0), { duration: t * 0.6, delay: (t * 0.4 * (N - 1 - i)) / N })); })),
      };
    },
    barrido(cv, p) {
      const base = { position: 'absolute', top: '-10%', bottom: '-10%', left: '-30%', width: '160%', transform: 'skewX(-18deg)' };
      const ac = div('', { ...base, background: `linear-gradient(90deg, transparent, ${p.acento} 8%, ${p.acento})` }), fo = div('', { ...base, background: p.fondo });
      cv.append(ac, fo);
      const k = (a, b) => [{ transform: `skewX(-18deg) translateX(${a}%)` }, { transform: `skewX(-18deg) translateX(${b}%)` }];
      return {
        entrar: (t) => Promise.all([terminado(anim(ac, k(-110, 0), { duration: t * 0.8 })), terminado(anim(fo, k(-125, 0), { duration: t, delay: 0 }))]),
        salir: (t) => Promise.all([terminado(anim(fo, k(0, 125), { duration: t * 0.85 })), terminado(anim(ac, k(0, 112), { duration: t, delay: t * 0.05 }))]),
      };
    },
    diamante(cv, p) {
      const lado = Math.hypot(W, H) * 1.05;
      const base = { position: 'absolute', left: (W - lado) / 2 + 'px', top: (H - lado) / 2 + 'px', width: lado + 'px', height: lado + 'px' };
      const ac = div('', { ...base, background: p.acento }), fo = div('', { ...base, background: p.fondo });
      cv.append(ac, fo);
      const k = (a, b) => [{ transform: `rotate(45deg) scale(${a})` }, { transform: `rotate(45deg) scale(${b})` }];
      return {
        entrar: (t) => Promise.all([terminado(anim(ac, k(0, 1), { duration: t * 0.8 })), terminado(anim(fo, k(0, 1), { duration: t, easing: 'cubic-bezier(.75,0,.25,1)' }))]),
        salir: (t) => Promise.all([terminado(anim(fo, k(1, 0), { duration: t * 0.85 })), terminado(anim(ac, k(1, 0), { duration: t }))]),
      };
    },
    giro(cv, p) {
      cv.style.perspective = '1800px';
      const base = { position: 'absolute', top: 0, bottom: 0, width: '50%', background: p.fondo, backgroundSize: `${W}px ${H}px` };
      const iz = div('', { ...base, left: 0, transformOrigin: '0 50%' });
      const de = div('', { ...base, right: 0, transformOrigin: '100% 50%', backgroundPosition: `-${W / 2}px 0` });
      cv.append(iz, de);
      const fi = franja(iz, 'right', p.acento), fd = franja(de, 'left', p.acento);
      const k = (lado, a, b) => [{ transform: `rotateY(${lado * a}deg)` }, { transform: `rotateY(${lado * b}deg)` }];
      return {
        entrar: (t) => { fi.entrar(t); fd.entrar(t); return Promise.all([terminado(anim(iz, k(1, 90, 0), { duration: t })), terminado(anim(de, k(-1, 90, 0), { duration: t }))]); },
        salir: (t) => { fi.salir(t); fd.salir(t); return Promise.all([terminado(anim(iz, k(1, 0, -90), { duration: t })), terminado(anim(de, k(-1, 0, -90), { duration: t }))]); },
      };
    },
    mosaico(cv, p) {
      const C = 12, F = 7, w = W / C, h = H / F, celdas = [];
      for (let y = 0; y < F; y++) for (let x = 0; x < C; x++) {
        const c = div('', { position: 'absolute', left: x * w + 'px', top: y * h + 'px', width: Math.ceil(w) + 1 + 'px', height: Math.ceil(h) + 1 + 'px', background: p.fondo, backgroundSize: `${W}px ${H}px`, backgroundPosition: `-${x * w}px -${y * h}px` });
        c._d = Math.hypot(x - C / 2 + 0.5, y - F / 2 + 0.5) / Math.hypot(C / 2, F / 2) * 0.7 + Math.random() * 0.3;
        cv.appendChild(c); celdas.push(c);
      }
      const k = (a, b, ra, rb) => [{ transform: `scale(${a}) rotate(${ra}deg)`, opacity: a ? 1 : 0 }, { transform: `scale(${b}) rotate(${rb}deg)`, opacity: b ? 1 : 0 }];
      return {
        entrar: (t) => Promise.all(celdas.map((c) => terminado(anim(c, k(0, 1, 45, 0), { duration: t * 0.45, delay: c._d * t * 0.55 })))),
        salir: (t) => Promise.all(celdas.map((c) => terminado(anim(c, k(1, 0, 0, -45), { duration: t * 0.45, delay: (1 - c._d) * t * 0.55 })))),
      };
    },
    cortina(cv, p) {
      const base = { position: 'absolute', top: 0, bottom: 0, width: '50.5%', background: p.fondo, backgroundSize: `${W}px ${H}px` };
      const iz = div('', { ...base, left: 0 });
      const de = div('', { ...base, right: 0, backgroundPosition: `-${W / 2}px 0` });
      cv.append(iz, de);
      const fi = franja(iz, 'right', p.acento), fd = franja(de, 'left', p.acento);
      return {
        entrar: (t) => (fi.entrar(t), fd.entrar(t), Promise.all([terminado(anim(iz, [{ transform: 'translateX(-101%)' }, { transform: 'none' }], { duration: t })), terminado(anim(de, [{ transform: 'translateX(101%)' }, { transform: 'none' }], { duration: t }))])),
        salir: (t) => (fi.salir(t), fd.salir(t), Promise.all([terminado(anim(iz, [{ transform: 'none' }, { transform: 'translateX(-101%)' }], { duration: t })), terminado(anim(de, [{ transform: 'none' }, { transform: 'translateX(101%)' }], { duration: t }))])),
      };
    },
    zoomlogo(cv, p) {
      const fo = div('', { position: 'absolute', inset: 0, background: p.fondo });
      cv.appendChild(fo);
      return {
        entrar: (t) => terminado(anim(fo, [{ opacity: 0, transform: 'scale(1.25)' }, { opacity: 1, transform: 'scale(1)' }], { duration: t, easing: 'cubic-bezier(.2,.7,.2,1)' })),
        salir: (t) => terminado(anim(fo, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: t, easing: 'cubic-bezier(.6,0,.8,.4)' })),
      };
    },
    destello(cv, p) {
      const fo = div('', { position: 'absolute', inset: 0, background: p.fondo });
      const luz = div('', { position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 50%, #ffffff 0%, ${rgba(p.acento, 0.9)} 25%, transparent 60%)`, mixBlendMode: 'screen' });
      cv.append(fo, luz);
      return {
        entrar: (t) => Promise.all([terminado(anim(luz, [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1.6)', offset: 0.55 }, { opacity: 0, transform: 'scale(3)' }], { duration: t * 1.2, easing: 'ease-out' })),
          terminado(anim(fo, [{ opacity: 0 }, { opacity: 1 }], { duration: t * 0.6, delay: t * 0.4 }))]),
        salir: (t) => Promise.all([terminado(anim(luz, [{ opacity: 0, transform: 'scale(3)' }, { opacity: 1, transform: 'scale(1.6)', offset: 0.4 }, { opacity: 0, transform: 'scale(.2)' }], { duration: t, easing: 'ease-in' })),
          terminado(anim(fo, [{ opacity: 1 }, { opacity: 0 }], { duration: t * 0.6, delay: t * 0.35 }))]),
      };
    },
    ninguno() { return { entrar: () => Promise.resolve(), salir: () => Promise.resolve() }; },
  };

  // ---------------------------------------------------------------- Efectos (lienzo)
  function crearEfectos(canvas, lista) {
    const ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const sistemas = (lista || []).filter((e) => e && e.type).map((e) => {
      const n = Math.max(0, Math.min(100, +e.amount || 0)), vel = 0.2 + (Math.max(0, Math.min(100, +e.speed || 0)) / 100) * 2.8;
      const tam = e.size ? 0.4 + (+e.size / 60) : 1, alfa = Math.max(0, Math.min(100, e.opacity == null ? 60 : +e.opacity)) / 100, color = hex(e.color, '#ffffff');
      const s = { tipo: e.type, vel, tam, alfa, color, ps: [], t: 0 };
      const cant = { particulas: n * 1.6, chispas: n * 1.2, bokeh: n * 0.45, brillo: 1 + n / 25, ondas: 0, estrellas: n * 2 }[e.type] || n;
      for (let i = 0; i < cant; i++) s.ps.push(nueva(s, true));
      return s;
    });
    function nueva(s, inicio) {
      switch (s.tipo) {
        case 'chispas': { const a = rnd(-Math.PI * 0.9, -Math.PI * 0.1); return { x: rnd(0, W), y: inicio ? rnd(0, H) : H + 10, vx: Math.cos(a) * rnd(2, 7), vy: Math.sin(a) * rnd(4, 10), v: rnd(0.4, 1), r: rnd(1, 2.6) * s.tam }; }
        case 'bokeh': return { x: rnd(0, W), y: rnd(0, H), r: rnd(30, 120) * s.tam, vx: rnd(-0.4, 0.4), vy: rnd(-0.6, -0.1), f: rnd(0, 6.28), v: rnd(0.3, 1) };
        case 'brillo': return { x: rnd(-W * 0.3, W), y: rnd(0, H), r: rnd(250, 520) * s.tam, vx: rnd(0.8, 2), f: rnd(0, 6.28) };
        case 'estrellas': return { x: rnd(0, W), y: rnd(0, H), r: rnd(0.6, 2.2) * s.tam, f: rnd(0, 6.28), v: rnd(0.5, 2) };
        default: return { x: rnd(0, W), y: inicio ? rnd(0, H) : H + 10, r: rnd(1.5, 4.5) * s.tam, vx: rnd(-0.3, 0.3), vy: -rnd(0.3, 1.4), f: rnd(0, 6.28) };
      }
    }
    let raf = 0, alfaGlobal = 1, vivo = true;
    function cuadro() {
      if (!vivo) return;
      ctx.clearRect(0, 0, W, H);
      for (const s of sistemas) {
        s.t += 0.016 * s.vel;
        ctx.globalAlpha = s.alfa * alfaGlobal;
        if (s.tipo === 'ondas') {
          if (!s.ps.length || s.ps[s.ps.length - 1].r > 140 / s.vel) s.ps.push({ r: 0 });
          ctx.strokeStyle = s.color; ctx.lineWidth = 3 * s.tam;
          s.ps = s.ps.filter((o) => o.r < Math.hypot(W, H) / 2);
          for (const o of s.ps) { o.r += 2.2 * s.vel; ctx.globalAlpha = s.alfa * alfaGlobal * Math.max(0, 1 - o.r / (Math.hypot(W, H) / 2)); ctx.beginPath(); ctx.arc(W / 2, H / 2, o.r, 0, Math.PI * 2); ctx.stroke(); }
          continue;
        }
        for (let i = 0; i < s.ps.length; i++) {
          const p = s.ps[i];
          if (s.tipo === 'chispas') {
            p.x += p.vx * s.vel; p.y += p.vy * s.vel; p.vy += 0.05 * s.vel; p.v -= 0.006 * s.vel;
            if (p.v <= 0 || p.y > H + 20) { s.ps[i] = nueva(s, false); continue; }
            ctx.globalAlpha = s.alfa * alfaGlobal * p.v; ctx.strokeStyle = s.color; ctx.lineWidth = p.r; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke();
          } else if (s.tipo === 'bokeh') {
            p.x += p.vx * s.vel; p.y += p.vy * s.vel; p.f += 0.01 * s.vel;
            if (p.y < -p.r) { p.y = H + p.r; p.x = rnd(0, W); }
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, rgba(s.color, 0.55 * p.v)); g.addColorStop(0.7, rgba(s.color, 0.25 * p.v)); g.addColorStop(1, rgba(s.color, 0));
            ctx.globalAlpha = s.alfa * alfaGlobal * (0.6 + 0.4 * Math.sin(p.f)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          } else if (s.tipo === 'brillo') {
            p.x += p.vx * s.vel; p.f += 0.02 * s.vel;
            if (p.x - p.r > W) Object.assign(p, nueva(s), { x: -p.r });
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, rgba(s.color, 0.5)); g.addColorStop(1, rgba(s.color, 0));
            ctx.globalAlpha = s.alfa * alfaGlobal * (0.65 + 0.35 * Math.sin(p.f)); ctx.fillStyle = g; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
          } else if (s.tipo === 'estrellas') {
            p.f += 0.05 * p.v * s.vel;
            ctx.globalAlpha = s.alfa * alfaGlobal * (0.35 + 0.65 * Math.abs(Math.sin(p.f))); ctx.fillStyle = s.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          } else { // partículas
            p.x += p.vx * s.vel; p.y += p.vy * s.vel; p.f += 0.04 * s.vel;
            if (p.y < -10) { s.ps[i] = nueva(s, false); continue; }
            ctx.globalAlpha = s.alfa * alfaGlobal * (0.5 + 0.5 * Math.sin(p.f)); ctx.fillStyle = s.color;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(cuadro);
    }
    if (sistemas.length) raf = requestAnimationFrame(cuadro);
    return { alfa(v) { alfaGlobal = v; }, parar() { vivo = false; cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); } };
  }

  // ---------------------------------------------------------------- Elementos
  const DESPLAZA = { izquierda: 'translateX(-1300px)', derecha: 'translateX(1300px)', abajo: 'translateY(520px)', arriba: 'translateY(-520px)' };
  function kfEntrada(tipo) {
    if (tipo === 'zoom') return [{ opacity: 0, transform: 'scale(.35)' }, { opacity: 1, transform: 'scale(1)' }];
    if (tipo === 'giro') return [{ opacity: 0, transform: 'rotate(-200deg) scale(.3)' }, { opacity: 1, transform: 'none' }];
    if (DESPLAZA[tipo]) return [{ opacity: 0, transform: DESPLAZA[tipo] }, { opacity: 1, transform: 'none' }];
    return [{ opacity: 0 }, { opacity: 1 }];
  }
  function kfSalida(tipo) {
    if (tipo === 'zoom') return [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.7)' }];
    if (tipo === 'giro') return [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'rotate(200deg) scale(.3)' }];
    if (DESPLAZA[tipo]) return [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: DESPLAZA[tipo] }];
    return [{ opacity: 1 }, { opacity: 0 }];
  }
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);

  function crearElemento(e, resolver) {
    const pos = div('stg-pos', { left: num(e.x, 50) + '%', top: num(e.y, 50) + '%', zIndex: 1 });
    const ani = div('stg-ani');
    const cont = div('', { opacity: Math.max(0, Math.min(100, num(e.opacity, 100))) / 100 });
    const c = e.crop || {};
    if (c.t || c.r || c.b || c.l) cont.style.clipPath = `inset(${num(c.t, 0)}% ${num(c.r, 0)}% ${num(c.b, 0)}% ${num(c.l, 0)}%)`;
    let letras = null, media = null;
    if (e.type === 'image' || e.type === 'anim') {
      pos.style.width = (num(e.w, 100) / 100) * W + 'px';
      if (e.type === 'anim') {
        media = document.createElement('video');
        Object.assign(media, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
        media.setAttribute('muted', ''); media.className = 'stg-vid'; media.src = resolver(e.src);
      } else {
        media = document.createElement('img'); media.className = 'stg-img'; media.alt = ''; media.decoding = 'async'; media.src = resolver(e.src);
      }
      cont.appendChild(media);
    } else if (e.type === 'shape') {
      Object.assign(cont.style, { width: (num(e.w, 20) / 100) * W + 'px', height: (num(e.h, 20) / 100) * H + 'px', background: hex(e.color, '#ffffff'), borderRadius: num(e.radius, 0) + 'px', transform: e.skew ? `skewX(${-num(e.skew, 0)}deg)` : '' });
    } else if (e.type === 'text') {
      const t = String(e.text || '');
      Object.assign(cont.style, {
        fontFamily: `'${String(e.font || 'Source Sans 3').replace(/'/g, '')}', 'Source Sans 3', 'Montserrat', 'Segoe UI', sans-serif`,
        fontSize: num(e.size, 40) + 'px', color: hex(e.color, '#ffffff'), fontWeight: e.bold ? 800 : 500,
        textTransform: e.upper ? 'uppercase' : 'none', letterSpacing: e.upper ? '.06em' : '0',
        textShadow: e.shadow ? '0 3px 12px rgba(0,0,0,.65), 0 1px 2px rgba(0,0,0,.6)' : 'none',
      });
      cont.className = 'stg-txt' + (e.textAnim === 'brillo' ? ' stg-brillo' : '');
      if (e.textAnim === 'letras' || e.textAnim === 'maquina') {
        letras = [...t].map((ch) => { const s = document.createElement('span'); s.textContent = ch; s.style.opacity = 0; cont.appendChild(s); return s; });
      } else cont.textContent = t;
    }
    ani.appendChild(cont); pos.appendChild(ani);
    return { e, pos, ani, cont, letras, media };
  }

  function entrarElemento(x, t, retraso) {
    const dur = Math.max(380, t * 0.9);
    const a = anim(x.ani, kfEntrada(x.e.in || 'fade'), { duration: dur, delay: retraso, easing: x.e.in === 'zoom' ? 'cubic-bezier(.2,1.25,.4,1)' : 'cubic-bezier(.2,.8,.2,1)' });
    if (x.letras) {
      const paso = x.e.textAnim === 'maquina' ? 45 : 28;
      x.letras.forEach((s, i) => anim(s, x.e.textAnim === 'maquina' ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(.5em) scale(.6)' }, { opacity: 1, transform: 'none' }],
        { duration: x.e.textAnim === 'maquina' ? 1 : 420, delay: retraso + dur * 0.35 + i * paso, easing: 'cubic-bezier(.2,.9,.3,1.2)' }));
    } else if (x.e.textAnim === 'rebote') {
      anim(x.cont, [{ transform: 'scale(.4)' }, { transform: 'scale(1.18)', offset: 0.55 }, { transform: 'scale(.94)', offset: 0.8 }, { transform: 'scale(1)' }], { duration: 750, delay: retraso + dur * 0.3, easing: 'ease-out' });
    }
    return a;
  }

  // ---------------------------------------------------------------- Diseños fijos (banners laterales)
  // Dibuja una lista de elementos que se queda en pantalla (no cubre todo). Un elemento con "clip"
  // se ve solo dentro de la figura indicada (por ejemplo, un logo tenue recortado por la franja).
  function dibujar(contenedor, elementos, opciones = {}) {
    ponerCss();
    const resolver = opciones.resolver || resolverLib;
    const raiz = div('stg');
    const figuras = {};
    for (const e of elementos || []) if (e.type === 'shape') figuras[e.id] = e;
    const items = (elementos || []).map((e) => {
      const x = crearElemento(e, resolver);
      const f = e.clip && figuras[e.clip];
      if (!f) { raiz.appendChild(x.pos); return x; }
      const w = (num(f.w, 20) / 100) * W, h = (num(f.h, 20) / 100) * H;
      const l = (num(f.x, 50) / 100) * W - w / 2, t = (num(f.y, 50) / 100) * H - h / 2;
      const marco = div('', { position: 'absolute', left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px', overflow: 'hidden',
        borderRadius: num(f.radius, 0) + 'px', transform: f.skew ? `skewX(${-num(f.skew, 0)}deg)` : '' });
      const escena = div('', { position: 'absolute', left: -l + 'px', top: -t + 'px', width: W + 'px', height: H + 'px', transform: f.skew ? `skewX(${num(f.skew, 0)}deg)` : '' });
      escena.appendChild(x.pos); marco.appendChild(escena); raiz.appendChild(marco);
      return x;
    });
    contenedor.appendChild(raiz);
    items.forEach((x) => x.media && x.media.tagName === 'VIDEO' && x.media.play().catch(() => {}));
    return {
      raiz,
      entrar(t = 600) { return Promise.all(items.map((x, i) => terminado(entrarElemento(x, t, i * 60)))); },
      salir(t = 500) {
        return Promise.all(items.map((x, i) => terminado(anim(x.ani, kfSalida(x.e.out || 'fade'), { duration: Math.max(200, t), delay: i * 30, easing: 'cubic-bezier(.5,0,.75,0)' }))));
      },
      limpiar() {
        items.forEach((x) => { if (x.media && x.media.tagName === 'VIDEO') { x.media.pause(); x.media.removeAttribute('src'); x.media.load(); } });
        raiz.remove();
      },
    };
  }
  // "lib:logos/x.png" → archivo de la biblioteca; "fondo:x.jpg" → fondos de la biblioteca
  function resolverLib(src) {
    src = String(src || '');
    const enc = (r) => '/obs-lib/' + r.split('/').map(encodeURIComponent).join('/');
    if (src.startsWith('lib:')) return enc(src.slice(4));
    if (src.startsWith('fondo:')) return enc('fondos/' + src.slice(6));
    return src;
  }

  // ---------------------------------------------------------------- Sonido
  function sonar(snd, resolver, almacen) {
    if (!snd || !snd.src) return null;
    const a = almacen.get(snd.src) || new Audio(resolver(snd.src));
    almacen.set(snd.src, a);
    a.volume = Math.max(0, Math.min(1, num(snd.volume, 80) / 100));
    const t = setTimeout(() => { try { a.currentTime = 0; a.play().catch(() => {}); } catch (_) { /* sin audio */ } }, Math.max(0, num(snd.offset, 0)));
    return t;
  }

  // ---------------------------------------------------------------- Motor
  function crear(escenario, opciones = {}) {
    ponerCss();
    const resolver = opciones.resolver || resolverLib;
    const audios = new Map();
    let actual = null, ocupado = Promise.resolve(), silencio = !!opciones.silencio;

    function construir(s) {
      const raiz = div('stg');
      const p = paleta(s);
      const cv = div('stg-cv', { position: 'absolute', inset: 0 });
      const fx = document.createElement('canvas'); fx.className = 'stg-fx';
      const els = div('stg-els');
      raiz.append(cv, fx, els);
      const estilo = CORTINAS[s.style] || CORTINAS.iris;
      const cortina = estilo(cv, p);
      const elementos = (Array.isArray(s.elements) ? s.elements : []).map((e) => crearElemento(e, resolver));
      elementos.forEach((x) => els.appendChild(x.pos));
      return { s, raiz, cortina, fx, els, elementos, efectos: null };
    }

    async function entrar(s) {
      await ocupado;
      let fin;
      ocupado = new Promise((r) => (fin = r));
      try {
        if (actual) limpiarYa();
        const x = construir(s);
        actual = x;
        escenario.appendChild(x.raiz);
        const tIn = Math.max(150, num(s.inTime, 800));
        if (!silencio) sonar(s.soundIn, resolver, audios);
        x.efectos = crearEfectos(x.fx, s.effects);
        anim(x.fx, [{ opacity: 0 }, { opacity: 1 }], { duration: tIn });
        x.elementos.forEach((el) => el.media && el.media.tagName === 'VIDEO' && el.media.play().catch(() => {}));
        const inicioEls = s.style === 'ninguno' || s.style === 'zoomlogo' ? 0 : tIn * 0.45;
        const anims = x.elementos.map((el, i) => entrarElemento(el, tIn, inicioEls + i * 70));
        await x.cortina.entrar(tIn);
        x.listo = Promise.all(anims.map(terminado));
      } finally { fin(); }
    }

    async function salir() {
      await ocupado;
      const x = actual;
      if (!x) return;
      let fin;
      ocupado = new Promise((r) => (fin = r));
      try {
        const s = x.s, tOut = Math.max(150, num(s.outTime, 700));
        if (!silencio) sonar(s.soundOut, resolver, audios);
        x.elementos.forEach((el, i) => anim(el.ani, kfSalida(el.e.out || 'fade'), { duration: Math.max(260, tOut * 0.55), delay: i * 30, easing: 'cubic-bezier(.5,0,.75,0)' }));
        anim(x.fx, [{ opacity: 1 }, { opacity: 0 }], { duration: tOut * 0.8 });
        await esperar(s.style === 'ninguno' ? tOut * 0.55 : tOut * 0.22);
        await x.cortina.salir(tOut * (s.style === 'ninguno' ? 0.45 : 0.78));
        if (actual === x) limpiarYa();
      } finally { fin(); }
    }

    function limpiarYa() {
      const x = actual; actual = null;
      if (!x) return;
      x.efectos && x.efectos.parar();
      x.elementos.forEach((el) => { if (el.media && el.media.tagName === 'VIDEO') { el.media.pause(); el.media.removeAttribute('src'); el.media.load(); } });
      x.raiz.remove();
    }

    // Precarga imágenes, videos y sonidos para que el stinger salga sin tropiezos
    function precargar(s) {
      if (!s) return;
      for (const e of s.elements || []) {
        if (e.type === 'image') { const i = new Image(); i.src = resolver(e.src); }
        if (e.type === 'anim') { const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = resolver(e.src); }
      }
      for (const snd of [s.soundIn, s.soundOut]) if (snd && snd.src && !audios.has(snd.src)) { const a = new Audio(resolver(snd.src)); a.preload = 'auto'; audios.set(snd.src, a); }
    }

    return {
      entrar, salir, precargar,
      limpiar: () => { limpiarYa(); },
      activo: () => !!actual,
      silenciar: (v) => { silencio = !!v; },
    };
  }

  window.StingerMotor = { crear, dibujar, resolver: resolverLib, ESTILOS, EFECTOS, ENTRADAS, SALIDAS, TEXTO_ANIM, paleta };
})();
