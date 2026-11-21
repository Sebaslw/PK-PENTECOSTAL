// PK-PENTECOSTAL · Módulo OBS → Diseño PK
// Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
// Convierte los stingers clonados de ProyectoRP a la identidad visual de PK-PENTECOSTAL:
// azul noche #04162e, azul #3088c0, dorado #f8b800, letra Montserrat y adornos de biblioteca/pk.
// Los originales no se tocan: se crea una copia "PK · …" de cada uno.
'use strict';

const PK = { noche: '#04162e', panel: '#0a2142', azul: '#3088c0', celeste: '#7dd3fc', oro: '#f8b800', oroClaro: '#fde68a', texto: '#ffffff' };

// Adornos de ProyectoRP → su equivalente con el diseño PK
const ADORNOS = {
  'IPUC trama de puntos.svg': 'pk-trama.svg', 'IPUC marco esquinas.svg': 'pk-marco.svg', 'IPUC halo celeste.svg': 'pk-halo.svg',
  'IPUC rayos dorados.svg': 'pk-rayos.svg', 'IPUC haz de luz.svg': 'pk-rayos.svg', 'IPUC linea dorada.svg': 'pk-linea.svg',
  'IPUC lineas de libro.svg': 'pk-linea.svg', 'IPUC banda dorada.svg': 'pk-banda.svg', 'IPUC barra titulo.svg': 'pk-banda.svg',
  'IPUC destello.svg': 'pk-destello.svg', 'IPUC anillo dorado.svg': 'pk-anillo.svg',
};

const rgb = (c) => { const n = parseInt(String(c).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (c) => { const [r, g, b] = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
// Lleva cualquier color a la paleta PK según su tono
function aPaleta(c, porDefecto = PK.oro) {
  if (!/^#[0-9a-f]{6}$/i.test(c || '')) return porDefecto;
  const [r, g, b] = rgb(c), l = lum(c);
  if (r > 200 && g > 200 && b > 200) return PK.texto;          // blancos
  if (r > g && g > b && r - b > 60) return l > 0.75 ? PK.oroClaro : PK.oro; // dorados / amarillos / naranjas
  if (b >= r && b >= g) return l > 0.55 ? PK.celeste : l > 0.2 ? PK.azul : PK.noche; // azules
  return l < 0.2 ? PK.noche : PK.oro;
}

function variantePK(s) {
  const v = JSON.parse(JSON.stringify(s));
  v.id = 'pk-' + String(s.id).replace(/^pk-/, '');
  v.name = 'PK · ' + String(s.name).replace(/^(IPUC|PK)\s*[·-]\s*/i, '');
  v.origen = s.id;
  // Fondo azul noche y luz dorada
  v.color1 = PK.noche;
  v.color2 = PK.oro;
  v.effects = (v.effects || []).map((f) => ({ ...f, color: aPaleta(f.color, PK.oroClaro) }));
  v.elements = (v.elements || []).map((e) => {
    const n = { ...e };
    if (n.src) {
      const archivo = String(n.src).replace(/^lib:[^/]+\//, '');
      if (ADORNOS[archivo]) n.src = 'lib:pk/' + ADORNOS[archivo];
    }
    if (n.type === 'text') {
      n.font = 'Montserrat';
      // Blanco sigue blanco, oscuro sigue oscuro (p. ej. sobre la banda dorada) y el resto pasa a dorado
      const c = aPaleta(n.color, PK.texto);
      n.color = c === PK.texto || c === PK.noche ? c : PK.oro;
      n.bold = true;
    }
    if (n.type === 'shape') n.color = aPaleta(n.color, PK.azul);
    return n;
  });
  // Firma PK: línea dorada bajo los textos si el diseño no tiene ninguna
  if (!v.elements.some((e) => /pk-linea|linea/i.test(e.src || ''))) {
    const textos = v.elements.filter((e) => e.type === 'text');
    const y = textos.length ? Math.max(...textos.map((e) => +e.y || 0)) + 4 : 82;
    v.elements.push({ id: 'pk-firma', type: 'image', src: 'lib:pk/pk-linea.svg', x: 50, y: Math.min(96, y), w: 40, opacity: 90, in: 'fade', out: 'fade' });
  }
  return v;
}

// Agrega (o actualiza) la versión PK de cada stinger que venga de ProyectoRP, sin tocar los demás
function agregarVariantes(lista, origenes) {
  const ids = new Set(origenes.map((s) => s.id));
  const sinViejas = lista.filter((s) => !(s.origen && ids.has(s.origen)));
  const nuevas = origenes.map(variantePK);
  return [...nuevas, ...sinViejas];
}

// Banner lateral de ProyectoRP → versión PK (franjas azul noche, filos dorados, texto Montserrat)
function lateralPK(l) {
  const v = JSON.parse(JSON.stringify(l));
  v.id = 'pk-' + String(l.id).replace(/^pk-/, '');
  v.name = 'PK · ' + l.name;
  v.origen = l.id;
  let n = 0;
  v.elements = (v.elements || []).map((e) => {
    if (e.type !== 'shape') return e;
    const c = aPaleta(e.color, PK.noche);
    // La figura principal (la más ancha) queda azul noche; las demás alternan dorado / azul
    const fino = (+e.w || 0) < 2 || (+e.h || 0) < 8;
    return { ...e, color: fino ? PK.oro : c === PK.noche || c === PK.texto ? (n++ ? PK.panel : PK.noche) : c === PK.oro || c === PK.oroClaro ? PK.oro : PK.azul };
  });
  if (v.zona && v.zona.texto) v.zona.texto = { ...v.zona.texto, fuente: 'Montserrat', cita: PK.oro };
  return v;
}

module.exports = { PK, variantePK, agregarVariantes, aPaleta, lateralPK };
