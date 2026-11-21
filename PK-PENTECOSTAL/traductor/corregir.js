// Aplica el glosario ("Señor" → "Lord") a las traducciones automáticas ya guardadas.
// Uso: node corregir.js     (las traducciones hechas a mano no se tocan)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { glosario } = require('./motor');
const DIR = path.resolve(__dirname, '..', '..', 'cancioneros');
const TR = path.join(DIR, 'traducciones');
const leer = (n) => { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(DIR, n + '.js'), 'utf8').replace(/^﻿/, '') + ';this.r=(typeof jscanciones!=="undefined")?jscanciones:[]', ctx); return ctx.r; };

for (const libro of fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3))) {
  const archivo = path.join(TR, libro + '.en.json');
  if (!fs.existsSync(archivo)) continue;
  const tr = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const es = new Map(leer(libro).map((s) => [String(s.id), s]));
  let cambios = 0;
  for (const [id, t] of Object.entries(tr)) {
    const s = es.get(id);
    if (!t.auto || !s || !t.le) continue;
    const lineasEs = String(s.le).split('\n'), lineasEn = String(t.le).split('\n');
    const mismas = lineasEs.length === lineasEn.length;
    const le = lineasEn.map((l, i) => glosario(l, mismas ? lineasEs[i] : s.le)).join('\n');
    const ti = glosario(t.ti || '', s.ti || '');
    if (le !== t.le || ti !== t.ti) { t.le = le; t.ti = ti; cambios++; }
  }
  if (cambios) fs.writeFileSync(archivo, JSON.stringify(tr, null, 1), 'utf8');
  console.log(`${libro}: ${cambios} canciones corregidas`);
}
