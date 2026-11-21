// PK-PENTECOSTAL · Traductor automático español → inglés SIN internet
// Usa el modelo abierto Helsinki-NLP opus-mt-es-en (copia local en traductor/modelos).
// Conserva la estructura de las canciones: estrofas, //repeticiones//, etiquetas (CORO, I, II…).
'use strict';
const path = require('path');
const fs = require('fs');

const MODELOS = path.join(__dirname, 'modelos');
let tubo = null, cargando = null;

function disponible() {
  try { return fs.existsSync(path.join(__dirname, 'node_modules', '@huggingface', 'transformers')) && fs.existsSync(MODELOS); } catch (_) { return false; }
}

async function cargar() {
  if (tubo) return tubo;
  if (cargando) return cargando;
  cargando = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = MODELOS;
    env.allowRemoteModels = false; // nunca usar internet: solo el modelo guardado
    tubo = await pipeline('translation', 'Xenova/opus-mt-es-en', { dtype: 'q8' });
    return tubo;
  })();
  try { return await cargando; } finally { cargando = null; }
}

// Traduce una lista de frases (en lotes para ir rápido). Devuelve la lista traducida.
async function frases(lista) {
  const t = await cargar();
  const out = new Array(lista.length);
  const pend = [];
  lista.forEach((s, i) => { if (/\p{L}/u.test(s)) pend.push(i); else out[i] = s; });
  for (let i = 0; i < pend.length; i += 16) {
    const idx = pend.slice(i, i + 16);
    // Límite de largo: evita que el modelo se quede repitiendo palabras en líneas muy repetitivas
    const largo = Math.max(...idx.map((k) => lista[k].split(/\s+/).length));
    const r = await t(idx.map((k) => lista[k]), { max_new_tokens: Math.min(200, largo * 3 + 12), repetition_penalty: 1.2 });
    idx.forEach((k, j) => { out[k] = limpiar(r[j].translation_text, lista[k]); });
  }
  return out;
}

// Pequeños arreglos de estilo para canciones cristianas
function limpiar(en, es) {
  let s = String(en || '').trim();
  if (!s) return es;
  // Mantener mayúscula inicial y puntuación final del original
  if (/^\p{Lu}/u.test(es) && /^\p{Ll}/u.test(s)) s = s[0].toUpperCase() + s.slice(1);
  if (/^\p{Ll}/u.test(es) && /^\p{Lu}/u.test(s) && !/^(I|God|Lord|Jesus|Christ|Holy|Jehovah|Israel)\b/.test(s)) s = s[0].toLowerCase() + s.slice(1);
  if (!/[.,;:!?…]$/.test(es)) s = s.replace(/[.]$/, '');
  return glosario(s, es);
}

// "Señor" en una canción es "Lord", no "sir"/"Mr."/"lord"
function glosario(s, es = 'señor') {
  if (/se[ñn]or/i.test(es)) s = s.replace(/\b(?:Mr\.?|[Ss]ir|[Ss]eñor|[Mm]aster)(?=\b|\s|$)/g, 'Lord').replace(/\blord\b/g, 'Lord');
  return s;
}

const ETIQUETAS = [
  [/^(coro|estribillo)\s*(\d*)\s*[:.]?$/i, (m) => 'CHORUS' + (m[2] ? ' ' + m[2] : '')],
  [/^[úu]ltimo\s+coro\s*[:.]?$/i, () => 'LAST CHORUS'],
  [/^coro\s+final\s*[:.]?$/i, () => 'FINAL CHORUS'],
  [/^puente\s*[:.]?$/i, () => 'BRIDGE'],
  [/^estrofa\s*(\d+)\s*[:.]?$/i, (m) => 'VERSE ' + m[1]],
  [/^[IVX]+\s*[.:)]?$/, (m) => m[0]],
  [/^\*+$/, (m) => m[0]],
];

// Traduce la letra completa conservando estructura y marcas //…//
async function letra(texto) {
  const lineas = String(texto || '').replace(/\r\n?/g, '\n').split('\n');
  const piezas = []; // por cada línea: { pre, segs:[{marca, txt}], fijo }
  const aTraducir = [];
  for (const l of lineas) {
    const sangria = l.match(/^\s*/)[0];
    const t = l.trim();
    if (!t) { piezas.push({ fijo: '' }); continue; }
    const et = ETIQUETAS.find(([re]) => re.test(t));
    if (et) { piezas.push({ fijo: sangria + et[1](t.match(et[0])) }); continue; }
    // Separar marcas de repetición: "//texto// más texto"
    const partes = t.split(/(\/{2,})/);
    const segs = partes.map((p) => {
      if (/^\/{2,}$/.test(p)) return { marca: p };
      const txt = p.trim();
      if (!txt) return { espacio: p };
      aTraducir.push(txt);
      return { idx: aTraducir.length - 1, ante: /^\s/.test(p) ? ' ' : '', tras: /\s$/.test(p) ? ' ' : '' };
    });
    piezas.push({ pre: sangria, segs });
  }
  const tr = await frases(aTraducir);
  return piezas.map((p) => (p.fijo !== undefined ? p.fijo
    : p.pre + p.segs.map((s) => (s.marca || (s.espacio !== undefined ? s.espacio : s.ante + tr[s.idx] + s.tras))).join(''))).join('\n');
}

async function titulo(ti) {
  const t = String(ti || '').trim();
  const m = t.match(/^(\d+\.\s*)(.*)$/);
  if (m) return m[1] + (await frases([m[2]]))[0];
  return (await frases([t]))[0];
}

module.exports = { disponible, cargar, frases, letra, titulo, glosario };
