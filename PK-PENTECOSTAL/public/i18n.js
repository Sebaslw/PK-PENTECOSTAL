// PK-PENTECOSTAL · Idiomas: Español latino (original) · English (US) · English (UK)
// Traduce en vivo los textos de la pantalla (y los que el programa agrega después) usando i18n-en.js.
// Guarda el texto original de cada elemento para poder volver al español al instante.
(() => {
  'use strict';
  const LS = 'pk-idioma';
  const VALIDOS = ['es', 'en-US', 'en-GB'];
  let idioma = 'es';
  try { const v = localStorage.getItem(LS); if (VALIDOS.includes(v)) idioma = v; } catch (_) { /* sin almacenamiento */ }

  // Ortografía británica a partir del inglés de EE. UU.
  const GB = [
    [/\bcolor/g, 'colour'], [/\bColor/g, 'Colour'], [/\bCOLOR/g, 'COLOUR'], [/\brecolor/g, 'recolour'],
    [/\bcenter\b/g, 'centre'], [/\bCenter\b/g, 'Centre'], [/\bcentered\b/g, 'centred'],
    [/\bfavorite/g, 'favourite'], [/\bgray\b/g, 'grey'], [/\borganization/g, 'organisation'], [/\bOrganization/g, 'Organisation'],
    [/\bcanceled\b/g, 'cancelled'], [/\bCanceled\b/g, 'Cancelled'], [/\brecognized\b/g, 'recognised'], [/\bbehavior/g, 'behaviour'],
    [/\bcustomize/g, 'customise'], [/\bminimize/g, 'minimise'], [/\bmaximize/g, 'maximise'],
  ];
  // Partes que NO se traducen: contenido (versículos, letras, listas de canciones, campos de texto)
  const SALTAR = 'script, style, textarea, code, [contenteditable], [data-no-traducir], .verse, .slide, .list-item, #nowTxt, #nowRef, .pkv-no';
  const ATRIBUTOS = ['title', 'placeholder', 'aria-label', 'alt'];

  const RE = /^([^\p{L}\d¿¡«(]*)([\s\S]*?)([^\p{L}\d.?!)»:…%"]*)$/u;
  function dic() { return window.I18N_EN || {}; }
  function patrones() { return window.I18N_EN_PATRONES || []; }

  function traducirClave(k) {
    let out = dic()[k];
    if (out !== undefined) return out;
    for (const [re, rep] of patrones()) if (re.test(k)) return k.replace(re, rep);
    // "Prefijo: resto" → traducir ambas partes (p. ej. "Error al guardar: Nombre inválido")
    const i = k.indexOf(': ');
    if (i > 0) {
      const a = dic()[k.slice(0, i + 1)];
      if (a !== undefined) return a + ' ' + (traducir(k.slice(i + 2)));
    }
    return undefined;
  }
  function traducir(s) {
    if (idioma === 'es' || s == null) return s;
    s = String(s);
    if (!/\p{L}/u.test(s)) return s;
    // Varias líneas (alert/confirm): traducir cada párrafo
    if (s.includes('\n')) return s.split('\n').map((l) => traducir(l)).join('\n');
    const m = s.match(RE);
    if (!m) return s;
    const clave = m[2].replace(/\s+/g, ' ').trim();
    if (!clave) return s;
    let out = traducirClave(clave);
    if (out === undefined) return s;
    if (idioma === 'en-GB') for (const [re, r] of GB) out = out.replace(re, r);
    return m[1] + out + m[3];
  }

  // ---------- Texto en pantalla
  const textos = new WeakMap();  // nodo -> { src, out }
  const attrs = new WeakMap();   // elemento -> { atributo: { src, out } }
  const saltar = (el) => !el || (el.closest && el.closest(SALTAR));

  function nodoTexto(n) {
    if (saltar(n.parentElement)) return;
    const v = n.nodeValue;
    const r = textos.get(n);
    const src = r && v === r.out ? r.src : v;
    const out = traducir(src);
    textos.set(n, { src, out });
    if (out !== v) n.nodeValue = out;
  }
  function atributosDe(el) {
    if (saltar(el)) return;
    let mapa = attrs.get(el);
    for (const a of ATRIBUTOS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      if (!mapa) { mapa = {}; attrs.set(el, mapa); }
      const r = mapa[a];
      const src = r && v === r.out ? r.src : v;
      const out = traducir(src);
      mapa[a] = { src, out };
      if (out !== v) el.setAttribute(a, out);
    }
  }
  function recorrer(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) return nodoTexto(raiz);
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    if (raiz.nodeType === 1) { if (saltar(raiz)) return; atributosDe(raiz); }
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SALTAR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) nodoTexto(n); else atributosDe(n); }
  }

  let tituloSrc = null;
  function todo() {
    if (tituloSrc === null) tituloSrc = document.title;
    document.title = traducir(tituloSrc);
    document.documentElement.lang = idioma === 'es' ? 'es' : idioma;
    recorrer(document.body);
  }

  const obs = new MutationObserver((lista) => {
    for (const m of lista) {
      if (m.type === 'characterData') nodoTexto(m.target);
      else if (m.type === 'attributes') atributosDe(m.target);
      else m.addedNodes.forEach(recorrer);
    }
  });
  function iniciar() {
    todo();
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  // ---------- Diálogos del navegador
  const a0 = window.alert.bind(window), c0 = window.confirm.bind(window), p0 = window.prompt.bind(window);
  window.alert = (m) => a0(traducir(m));
  window.confirm = (m) => c0(traducir(m));
  window.prompt = (m, d) => p0(traducir(m), d);

  // ---------- API pública
  const oyentes = [];
  window.I18N = {
    get idioma() { return idioma; },
    t: traducir,
    set(nuevo) {
      if (!VALIDOS.includes(nuevo) || nuevo === idioma) return false;
      idioma = nuevo;
      try { localStorage.setItem(LS, idioma); } catch (_) { /* sin almacenamiento */ }
      if (document.body) todo();
      oyentes.forEach((f) => { try { f(idioma); } catch (_) { /* nada */ } });
      return true;
    },
    alCambiar(f) { oyentes.push(f); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  // Sincronizar con el idioma guardado en el programa (lo comparten computador y celulares)
  fetch('/api/idioma', { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (d && d.idioma) window.I18N.set(d.idioma); }).catch(() => {});
})();
