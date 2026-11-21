// Crea en cancioneros/CANCIONES los cancioneros en inglés (EE. UU. y Reino Unido),
// con el mismo formato de PK-PENTECOSTAL (var jscanciones=[...]).
// Uso: node exportar.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.resolve(__dirname, '..', '..', 'cancioneros');
const SALIDA = path.join(DIR, 'CANCIONES');
const TR = path.join(DIR, 'traducciones');

// Ortografía británica (conserva mayúsculas)
const GB = [
  ['savior', 'saviour'], ['honor', 'honour'], ['favor', 'favour'], ['color', 'colour'], ['labor', 'labour'],
  ['neighbor', 'neighbour'], ['splendor', 'splendour'], ['valor', 'valour'], ['fervor', 'fervour'], ['harbor', 'harbour'],
  ['armor', 'armour'], ['behavior', 'behaviour'], ['odor', 'odour'], ['vigor', 'vigour'], ['clamor', 'clamour'],
  ['ardor', 'ardour'], ['savor', 'savour'], ['endeavor', 'endeavour'], ['center', 'centre'], ['gray', 'grey'],
  ['worshiped', 'worshipped'], ['worshiping', 'worshipping'], ['worshiper', 'worshipper'], ['traveled', 'travelled'],
  ['traveling', 'travelling'], ['traveler', 'traveller'], ['fulfill', 'fulfil'], ['jewelry', 'jewellery'],
  ['canceled', 'cancelled'], ['counselor', 'counsellor'], ['marvelous', 'marvellous'], ['realize', 'realise'],
  ['recognize', 'recognise'], ['baptize', 'baptise'], ['baptized', 'baptised'], ['organize', 'organise'],
  ['sympathize', 'sympathise'], ['agonize', 'agonise'], ['apologize', 'apologise'], ['memorize', 'memorise'],
];
function aGB(s) {
  let out = String(s);
  for (const [us, uk] of GB) {
    out = out.replace(new RegExp(`\\b${us}(s|'s|ed|ing)?\\b`, 'gi'), (m, suf = '') => {
      const base = m.slice(0, m.length - suf.length);
      let r = uk;
      if (base === base.toUpperCase()) r = uk.toUpperCase();
      else if (base[0] === base[0].toUpperCase()) r = uk[0].toUpperCase() + uk.slice(1);
      return r + suf;
    });
  }
  // fulfil + ed/ing → fulfilled/fulfilling
  return out.replace(/\b(F|f)ulfiled\b/g, '$1ulfilled').replace(/\b(F|f)ulfiling\b/g, '$1ulfilling');
}

const leer = (n) => { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(DIR, n + '.js'), 'utf8').replace(/^﻿/, '') + ';this.r=(typeof jscanciones!=="undefined")?jscanciones:[]', ctx); return ctx.r; };
const leerTr = (n) => { try { return JSON.parse(fs.readFileSync(path.join(TR, n + '.en.json'), 'utf8')); } catch (_) { return {}; } };
const escribir = (archivo, canciones) => fs.writeFileSync(archivo,
  'var jscanciones=[\n' + canciones.map((s) => JSON.stringify(s)).join(',\n') + '\n]\n', 'utf8');

fs.mkdirSync(SALIDA, { recursive: true });
let resumen = [];
for (const libro of fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3))) {
  const tr = leerTr(libro);
  const us = [], uk = [];
  let mano = 0, auto = 0, sin = 0;
  for (const s of leer(libro)) {
    const t = tr[String(s.id)];
    if (!t || !t.le) { sin++; continue; }
    if (t.auto) auto++; else mano++;
    const base = { id: String(s.id), ti: t.ti || s.ti, tono: s.tono || '', estilo: s.estilo || '0' };
    us.push({ ...base, le: t.le });
    uk.push({ ...base, ti: aGB(base.ti), le: aGB(t.le) });
  }
  escribir(path.join(SALIDA, `${libro} (English US).txt`), us);
  escribir(path.join(SALIDA, `${libro} (English UK).txt`), uk);
  resumen.push(`${libro}: ${us.length} canciones en inglés (${mano} a mano, ${auto} automáticas)${sin ? ` · ${sin} sin traducir` : ''}`);
}
console.log(resumen.join('\n'));
