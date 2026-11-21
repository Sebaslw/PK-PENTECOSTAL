// PK-PENTECOSTAL · Pruebas del servidor (npm run probar)
// Primera ejecución sin config.json, módulos principales, instancia duplicada, puerto 8888 ocupado por
// otro programa (elige otro y no lo toca) y cierre ordenado. Usa carpetas de datos temporales: no toca BSPK.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');

const SERVER = process.argv[2] || path.join(__dirname, '..', 'PK-PENTECOSTAL', 'server.js');
const TMP = process.argv[3] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'pk-pruebas-'));
const get = (port, p) => new Promise((ok) => {
  http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => ok({ code: r.statusCode, body: d })); })
    .on('error', (e) => ok({ code: 0, body: e.message }));
});
function arrancar(datos, extraEnv = {}) {
  const ch = spawn(process.execPath, [SERVER], { env: { ...process.env, PK_DATA_ROOT: datos, PORT_WEB: '0', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  ch.msgs = []; ch.out = '';
  ch.on('message', (m) => ch.msgs.push(m));
  ch.stdout.on('data', (d) => (ch.out += d)); ch.stderr.on('data', (d) => (ch.out += d));
  ch.fin = new Promise((ok) => ch.on('exit', (c) => ok(c)));
  return ch;
}
const esperarMsg = async (ch, ms = 15000) => { const t = Date.now(); while (!ch.msgs.length && Date.now() - t < ms && ch.exitCode === null) await new Promise((r) => setTimeout(r, 100)); return ch.msgs[0]; };
let fallos = 0;
const ok = (cond, txt) => { console.log((cond ? '  ✔ ' : '  ✘ ') + txt); if (!cond) fallos++; };

(async () => {
  const d1 = path.join(TMP, 'datos-' + Date.now());
  // 1) Primera ejecución (sin config.json): antes fallaba con "guardadoBloqueado before initialization"
  const a = arrancar(d1);
  const m1 = await esperarMsg(a);
  ok(m1 && m1.tipo === 'listo', 'Primera ejecución arranca (sin ReferenceError) → ' + JSON.stringify(m1));
  ok(!/guardadoBloqueado/.test(a.out), 'Sin error de guardadoBloqueado');
  ok(fs.existsSync(path.join(d1, 'BSPK', 'config.json')), 'config.json creado en la carpeta de datos');
  ok(fs.existsSync(path.join(d1, 'BSPK', 'puerto.json')), 'puerto.json anotado');
  ok(fs.existsSync(path.join(d1, 'cancioneros', 'Corario IPUC castilla.js')), 'Cancioneros sembrados en datos');
  const info = await get(m1.puerto, '/api/info');
  ok(info.code === 200 && JSON.parse(info.body).app === 'PK-PENTECOSTAL', 'GET /api/info responde');
  for (const r of ['/', '/api/biblias', '/api/cancioneros', '/api/fondos', '/fuentes.css', '/api/stingers', '/api/overlays', '/api/estado']) {
    const x = await get(m1.puerto, r); ok(x.code === 200, `GET ${r} → ${x.code} (${x.body.length} bytes)`);
  }
  const bib = JSON.parse((await get(m1.puerto, '/api/biblias')).body);
  const rv = await get(m1.puerto, '/api/biblia/' + encodeURIComponent(bib.find((b) => /RV1960/.test(b)) || bib[0]));
  ok(rv.code === 200 && rv.body.length > 100000, 'Biblia RV1960 se carga');
  const canc = await get(m1.puerto, '/api/cancionero/' + encodeURIComponent('Corario IPUC castilla'));
  ok(canc.code === 200 && JSON.parse(canc.body).length > 100, 'Cancionero se carga');

  // 2) Segunda apertura con los MISMOS datos → no crea otro servidor
  const b = arrancar(d1);
  const m2 = await esperarMsg(b);
  const c2 = await b.fin;
  ok(m2 && m2.tipo === 'ya-abierto' && m2.puerto === m1.puerto && c2 === 0, 'Segunda apertura detecta la instancia y sale → ' + JSON.stringify(m2));

  // 3) Puerto 8888 ocupado por OTRO programa → busca otro y no lo cierra
  a.kill(); await a.fin;
  const ajeno = http.createServer((q, r) => r.end('otro programa')).listen(8888, '127.0.0.1');
  await new Promise((r) => ajeno.once('listening', r));
  const d2 = path.join(TMP, 'datos2-' + Date.now());
  const c = arrancar(d2);
  const m3 = await esperarMsg(c);
  ok(m3 && m3.tipo === 'listo' && m3.puerto !== 8888, 'Con 8888 ocupado usa otro puerto → ' + JSON.stringify(m3));
  const sigue = await get(8888, '/');
  ok(sigue.body === 'otro programa', 'El programa ajeno en 8888 sigue funcionando (no se tocó)');
  // 4) Otra apertura ahora encuentra la instancia en el puerto anotado (no el 8888)
  const d = arrancar(d2);
  const m4 = await esperarMsg(d); await d.fin;
  ok(m4 && m4.tipo === 'ya-abierto' && m4.puerto === m3.puerto, 'Instancia en puerto alterno detectada por puerto.json → ' + JSON.stringify(m4));
  // 5) Cierre ordenado por mensaje
  c.send({ tipo: 'apagar' });
  const cod = await c.fin;
  ok(cod === 0 && !fs.existsSync(path.join(d2, 'BSPK', 'puerto.json')), 'Cierre limpio (código ' + cod + ')');
  ajeno.close();
  console.log(fallos ? `\n  ${fallos} prueba(s) fallaron` : '\n  Todas las pruebas pasaron');
  process.exit(fallos ? 1 : 0);
})();
