// PK-PENTECOSTAL · Prueba del programa YA COMPILADO (Windows, macOS o Linux)
// Uso: node electron/prueba-app.js <ruta del ejecutable> [argumentos extra]
//   Windows: dist/win-unpacked/PK-PENTECOSTAL.exe
//   macOS:   dist/mac-universal/PK-PENTECOSTAL.app/Contents/MacOS/PK-PENTECOSTAL
//   Linux:   dist/PK-PENTECOSTAL-x.y.z-linux-x86_64.AppImage  ·  /opt/PK-PENTECOSTAL/pk-pentecostal (.deb)
// Abre el programa con una carpeta de datos temporal, espera a que el servidor interno responda y comprueba
// la versión, las 9 Biblias completas (31102 versículos), los cancioneros, los fondos y el panel. Luego lo cierra.
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) { console.error('Falta el ejecutable:', exe); process.exit(2); }
const VERSION = require('../package.json').version;
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk app '));
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (port, p) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(8000) }); return { code: r.status, text: await r.text() }; };

(async () => {
  console.log(`Abriendo ${exe} (${process.platform}) con datos en ${datos}`);
  const ch = spawn(exe, process.argv.slice(3), { env: { ...process.env, PK_DATA_ROOT: datos }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
  let salida = ''; ch.stdout.on('data', (d) => (salida += d)); ch.stderr.on('data', (d) => (salida += d));
  let cerrado = null; ch.on('exit', (c) => (cerrado = c));
  let port = null;
  const t0 = Date.now();
  while (!port && Date.now() - t0 < 120000 && cerrado === null) {
    for (let p = 8888; p <= 8899 && !port; p++) {
      try { const r = await get(p, '/api/info'); if (r.code === 200 && JSON.parse(r.text).app === 'PK-PENTECOSTAL') port = p; } catch (_) { /* aún no */ }
    }
    if (!port) await sleep(1000);
  }
  try {
    ok(!!port, port ? `El programa abrió y el servidor respondió en ${((Date.now() - t0) / 1000).toFixed(1)} s (puerto ${port})` : 'El programa no respondió (código de salida: ' + cerrado + ')');
    if (!port) throw new Error('sin servidor');
    const info = JSON.parse((await get(port, '/api/info')).text);
    ok(info.version === VERSION, `Versión ${info.version} (esperada ${VERSION})`);
    const lista = JSON.parse((await get(port, '/api/biblias')).text);
    ok(lista.length === 9, `9 Biblias: ${lista.join(' · ')}`);
    for (const n of lista) {
      const t = (await get(port, '/api/biblia/' + encodeURIComponent(n))).text;
      const vistos = new Set();
      for (const l of t.split(/\r?\n/)) {
        const p = l.split('|'); if (p.length < 4 || !p.slice(3).join('|').trim()) continue;
        const [a, h] = p[2].split('-').map(Number);
        for (let v = a; v <= (h || a); v++) vistos.add(`${p[0]}:${p[1]}:${v}`);
      }
      ok(vistos.size >= 31102, `${n}: ${vistos.size} versículos`);
    }
    const canc = JSON.parse((await get(port, '/api/cancioneros')).text);
    ok(Array.isArray(canc) && canc.length > 0, `Cancioneros: ${canc.length}`);
    const fondos = (await get(port, '/api/fondos'));
    ok(fondos.code === 200 && fondos.text.length > 100, 'Fondos disponibles');
    const panel = await get(port, '/?quedarse=1');
    ok(panel.code === 200 && /PK-PENTECOSTAL/.test(panel.text), 'El panel se sirve');
    const log = path.join(datos, 'BSPK', 'logs', 'escritorio.log');
    ok(fs.existsSync(log), 'La app de escritorio escribió su registro');
    if (fs.existsSync(log)) console.log('    · ' + fs.readFileSync(log, 'utf8').split('\n').filter((l) => /Inicio|\[act\]|listo/.test(l)).slice(0, 4).join('\n    · '));
  } catch (e) {
    if (e.message !== 'sin servidor') ok(false, 'Error: ' + e.message);
    console.log('--- salida del programa ---\n' + salida.slice(-3000));
    const log = path.join(datos, 'BSPK', 'logs', 'escritorio.log');
    if (fs.existsSync(log)) console.log('--- escritorio.log ---\n' + fs.readFileSync(log, 'utf8').slice(-3000));
  }
  // Cerrar el programa y sus procesos hijos
  try {
    if (process.platform === 'win32') execSync(`taskkill /T /F /PID ${ch.pid}`, { stdio: 'ignore' });
    else process.kill(-ch.pid, 'SIGTERM');
  } catch (_) { try { ch.kill('SIGKILL'); } catch (__) { /* ya cerrado */ } }
  await sleep(2500);
  try { fs.rmSync(datos, { recursive: true, force: true }); } catch (_) { /* en uso */ }
  console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallaron` : '\n✔ El programa compilado funciona');
  process.exit(fallos ? 1 : 0);
})();
