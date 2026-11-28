// PK-PENTECOSTAL · Biblias: lectura de los archivos .bi / .txt y versículos completos.
// Uso:  const biblias = require('./lib/biblias')(carpetaBiblias);  biblias.listar();  biblias.cargar(nombre);
'use strict';
const fs = require('fs');
const path = require('path');
const { primerArchivo } = require('./zip');

// Varias traducciones (TLA, DHH, NTV) unen versículos: "Génesis 2:1-3" viene en UNA línea numerada 1, y el 2 y el 3
// no existían (o venían vacíos), así que "Juan 3:24" no se encontraba y la Biblia parecía incompleta. Otras (NVI, DHH,
// NTV, BBE, WEB) dejan fuera del texto los versículos que faltan en los manuscritos más antiguos (Mateo 17:21, 18:11…).
// Aquí cada capítulo se completa contra la Biblia de referencia del mismo idioma (RV1960 / KJV):
//   · versículo unido → la línea lleva el rango "1-3" y cualquier número del rango la encuentra;
//   · versículo omitido → se muestra el texto de la Reina-Valera 1960 (o KJV), avisando de dónde sale.
// Ningún texto de la versión se cambia ni se pierde.
const VERSICULOS_OMITIDOS = new Set(['40:12:47', '40:17:21', '40:18:11', '40:23:14', '41:7:16', '41:9:44', '41:9:46', '41:11:26', '41:15:28',
  '42:17:36', '42:23:17', '43:5:4', '44:8:37', '44:15:34', '44:24:7', '44:28:29', '45:16:24']);
const SIGLAS_INGLES = ['KJV', 'WEB', 'WEBBE', 'NIV', 'NLT', 'ESV', 'NKJV', 'GNT', 'CEV', 'ASV', 'BBE', 'NASB', 'AMP', 'MSG', 'CSB', 'NRSV', 'YLT', 'DRB', 'ERV', 'NCV', 'TLB'];
const esIngles = (name) => SIGLAS_INGLES.includes(String(name).split(' - ').pop().trim().toUpperCase()) || /\b(english|king james)\b/i.test(name);

const parsearBiblia = (texto) => {
  const caps = new Map(); // "b:c" → [{v, t}]
  for (const linea of texto.split(/\r?\n/)) {
    const p = linea.split('|');
    if (p.length < 4 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1])) continue;
    const k = `${+p[0]}:${+p[1]}`;
    if (!caps.has(k)) caps.set(k, []);
    caps.get(k).push({ v: p[2].trim(), t: p.slice(3).join('|').trim() });
  }
  return caps;
};

module.exports = function crearBiblias(DIR) {
  const cache = new Map();
  const refBiblias = new Map();

  function listar() {
    try {
      return fs.readdirSync(DIR).filter((f) => /\.(bi|txt)$/i.test(f)).map((f) => f.replace(/\.(bi|txt)$/i, '')).sort();
    } catch (_) { return []; }
  }
  function leerCruda(name) {
    const file = ['.bi', '.txt'].map((e) => path.join(DIR, name + e)).find((f) => fs.existsSync(f));
    if (!file || path.dirname(file) !== DIR) return null;
    return primerArchivo(fs.readFileSync(file)).toString('utf8').replace(/^﻿/, '');
  }
  function cargar(name) {
    if (cache.has(name)) return cache.get(name);
    const cruda = leerCruda(name);
    if (cruda == null) return null;
    let text = cruda;
    try { text = completar(cruda, name); } catch (e) { console.error('[biblia] no se pudo completar', name, e.message); }
    cache.set(name, text);
    return text;
  }

  function referencia(ingles) {
    const clave = ingles ? 'en' : 'es';
    if (refBiblias.has(clave)) return refBiblias.get(clave);
    const sigla = ingles ? 'KJV' : 'RV1960';
    const nombre = listar().find((b) => b.split(' - ').pop().trim().toUpperCase() === sigla);
    const caps = nombre ? parsearBiblia(leerCruda(nombre) || '') : new Map();
    const ref = { sigla, caps, texto: new Map() };
    for (const [k, vs] of caps) for (const { v, t } of vs) ref.texto.set(`${k}:${parseInt(v, 10)}`, t);
    refBiblias.set(clave, ref);
    return ref;
  }

  function completar(texto, name) {
    const ingles = esIngles(name);
    const ref = referencia(ingles);
    const sigla = String(name).split(' - ').pop().trim().toUpperCase();
    if (sigla === ref.sigla) return texto; // la referencia ya está completa
    const nota = (b, c, v) => {
      const t = ref.texto.get(`${b}:${c}:${v}`);
      if (!t) return null;
      return ingles ? `${t} (${ref.sigla} · this version leaves this verse out of its main text)`
        : `${t} (Reina-Valera 1960 · esta versión no trae este versículo en su texto, solo en nota)`;
    };
    const out = [];
    const caps = parsearBiblia(texto);
    for (const [k, filas] of caps) {
      const [b, c] = k.split(':').map(Number);
      const items = []; // {a, z, t, omitido}
      for (const { v, t } of filas) {
        const m = v.match(/^(\d+)(?:\s*[-–]\s*(\d+))?/);
        if (!m) continue;
        let a = +m[1], z = m[2] ? +m[2] : a, txt = /^[-–—\s]*$/.test(t) ? '' : t; // "--" = versículo que no viene
        // "(20–21) texto" (NTV) → rango 20-21
        const r = txt.match(/^\((\d+)\s*[-–]\s*(\d+)\)\s*/);
        if (r && +r[1] === a) { z = Math.max(z, +r[2]); txt = txt.slice(r[0].length); }
        // Línea basura con solo el número del versículo omitido ("40|17|20|21")
        if (/^\d+$/.test(txt) && +txt > a && +txt <= a + 3) continue; // se rellena abajo como cualquier versículo faltante
        if (!txt) { // versículo vacío = va unido al anterior
          const ult = items[items.length - 1];
          if (ult && !ult.omitido && a === ult.z + 1) ult.z = a;
          continue;
        }
        const ult = items[items.length - 1];
        if (ult && a <= ult.z) { ult.t += ' ' + txt; ult.z = Math.max(ult.z, z); continue; } // repetido
        items.push({ a, z, t: txt });
      }
      if (!items.length) continue;
      const refFilas = ref.caps.get(k) || [];
      const ultimoRef = refFilas.reduce((mx, f) => Math.max(mx, parseInt(f.v, 10) || 0), 0);
      const ultimo = Math.max(ultimoRef, items[items.length - 1].z);
      const res = [];
      let i = 0;
      for (let v = 1; v <= ultimo; v++) {
        if (i < items.length && items[i].a === v) { res.push(items[i]); v = items[i].z; i++; continue; }
        if (i < items.length && items[i].a < v) { i++; v--; continue; }
        // Falta el versículo v
        const omitido = VERSICULOS_OMITIDOS.has(`${b}:${c}:${v}`) || ingles;
        const prev = res[res.length - 1];
        if (!omitido && prev && !prev.omitido && prev.z === v - 1) { prev.z = v; continue; } // unido al anterior
        const t = nota(b, c, v);
        if (t) res.push({ a: v, z: v, t, omitido: true });
        else if (prev && !prev.omitido && prev.z === v - 1) prev.z = v;
      }
      for (; i < items.length; i++) res.push(items[i]);
      for (const it of res) out.push(`${b}|${c}|${it.a === it.z ? it.a : `${it.a}-${it.z}`}|${it.t}`);
    }
    return out.join('\n') + '\n';
  }

  return { listar, cargar };
};
