// Traduce al inglés (sin internet) todas las canciones que aún no tienen traducción.
// Uso: node traducir-todo.js        (las traducciones hechas a mano no se tocan)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const m = require('./motor');
const DIR = path.resolve(__dirname, '..', '..', 'cancioneros');
const TR = path.join(DIR, 'traducciones');

const leer = (n) => { const ctx = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(DIR, n + '.js'), 'utf8').replace(/^﻿/, '') + ';this.r=(typeof jscanciones!=="undefined")?jscanciones:[]', ctx); return ctx.r; };
const trPath = (n) => path.join(TR, n + '.en.json');
const leerTr = (n) => { try { return JSON.parse(fs.readFileSync(trPath(n), 'utf8')); } catch (_) { return {}; } };

(async () => {
  fs.mkdirSync(TR, { recursive: true });
  await m.cargar();
  const libros = fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
  let total = 0; for (const l of libros) { const tr = leerTr(l); total += leer(l).filter((s) => !(tr[s.id] && tr[s.id].le)).length; }
  console.log(`Pendientes: ${total}`);
  let hechas = 0; const t0 = Date.now();
  for (const libro of libros) {
    const canciones = leer(libro);
    let nuevas = {}, sin = 0;
    // Guarda sin pisar lo que el programa haya guardado mientras tanto (las de mano ganan)
    const guardar = () => { const tr = leerTr(libro); for (const [id, v] of Object.entries(nuevas)) if (!(tr[id] && tr[id].le)) tr[id] = v; fs.writeFileSync(trPath(libro), JSON.stringify(tr, null, 1), 'utf8'); nuevas = {}; sin = 0; };
    const ya = leerTr(libro);
    for (const s of canciones) {
      if (ya[s.id] && ya[s.id].le) continue;
      try {
        const ti = await m.titulo(s.ti), le = await m.letra(s.le);
        nuevas[String(s.id)] = { ti, le, auto: true }; sin++;
      } catch (e) { console.log('  error en', libro, s.id, e.message); }
      hechas++;
      if (sin >= 10) guardar();
      if (hechas % 50 === 0) console.log(`${hechas}/${total} · ${Math.round((Date.now() - t0) / 1000)}s · ${libro}`);
    }
    if (sin) guardar();
    console.log(`✓ ${libro}`);
  }
  console.log(`TERMINADO: ${hechas} canciones en ${Math.round((Date.now() - t0) / 60000)} min`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
