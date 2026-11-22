// PK-PENTECOSTAL · Prueba de la conexión con OBS (node electron/prueba-obs.js)
// Levanta un OBS simulado (WebSocket v5 con contraseña) y una carpeta de ajustes de OBS falsa, arranca el
// servidor con datos temporales y comprueba que el panel conecta aunque tenga guardados un puerto y una
// contraseña equivocados (caso real: guardado 8686 + clave vieja, OBS en 4455). Si OBS está abierto en
// este equipo, prueba también contra el OBS real. No toca BSPK ni los ajustes de OBS.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', 'PK-PENTECOSTAL');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-obs-'));
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');

const { obsFalso } = require('./obs-falso');

// ---------- cliente del panel (obsws.js) cargado tal cual, como en el navegador
function cargarCliente() {
  const window = {};
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'obs', 'obsws.js'), 'utf8'),
    vm.createContext({ window, WebSocket, crypto: globalThis.crypto, TextEncoder, btoa, setTimeout, clearTimeout, console, Map, Promise, Uint8Array, String, JSON, Error, Object }));
  return window.OBSWS;
}
const getJSON = (port, p) => new Promise((ok2) => {
  http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) { /* no JSON */ } ok2({ code: r.statusCode, json: j }); }); })
    .on('error', () => ok2({ code: 0, json: null }));
});

(async () => {
  const CLAVE = 'clave-prueba-123';
  const obs = await obsFalso(CLAVE);
  const PUERTO_OBS = obs.address().port;

  // Carpeta de ajustes de OBS falsa (obs-websocket 5: plugin_config/obs-websocket/config.json)
  const dirObs = path.join(TMP, 'obs-studio');
  fs.mkdirSync(path.join(dirObs, 'plugin_config', 'obs-websocket'), { recursive: true });
  fs.writeFileSync(path.join(dirObs, 'plugin_config', 'obs-websocket', 'config.json'),
    JSON.stringify({ auth_required: true, server_enabled: true, server_password: CLAVE, server_port: PUERTO_OBS }));

  const ch = spawn(process.execPath, [path.join(RAIZ, 'server.js')], { env: { ...process.env, PK_DATA_ROOT: path.join(TMP, 'datos'), PORT_WEB: '0', PK_OBS_DIR: dirObs }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let listo = null; ch.on('message', (m) => { if (!listo) listo = m; });
  for (let t = 0; !listo && t < 150; t++) await new Promise((r) => setTimeout(r, 100));
  ok(listo && listo.tipo === 'listo', 'Servidor arranca');
  const P = listo.puerto;

  console.log('\n1) El servidor lee la configuración de OBS de este equipo');
  const loc = await getJSON(P, '/api/obs/local');
  ok(loc.code === 200 && loc.json && loc.json.encontrado === true, 'GET /api/obs/local → encontrado');
  ok(loc.json && loc.json.puerto === PUERTO_OBS && loc.json.clave === CLAVE && loc.json.habilitado === true, 'Puerto, contraseña y "habilitado" correctos');

  console.log('\n2) Conexión con datos guardados equivocados (puerto 8686 + clave vieja)');
  const OBSWS = cargarCliente();
  ok(typeof OBSWS.prototype.conectarAuto === 'function', 'El cliente tiene conectarAuto()');
  const c1 = new OBSWS();
  const detectar = async () => (await getJSON(P, '/api/obs/local')).json;
  let r1 = null, e1 = null;
  try { r1 = await c1.conectarAuto({ host: 'localhost', puerto: 8686, clave: 'clave-vieja' }, detectar); } catch (e) { e1 = e; }
  ok(!e1 && c1.conectado, 'Conecta usando la configuración real de OBS' + (e1 ? ' → ' + e1.message : ''));
  ok(r1 && r1.corregida && r1.usada.puerto === PUERTO_OBS && r1.usada.clave === CLAVE, 'Avisa que corrigió los datos (para guardarlos)');
  ok(c1.conectado && (await c1.call('GetVersion')).obsVersion === '33.0.1', 'OBS responde a GetVersion');
  c1.desconectar();

  console.log('\n3) Puerto bueno y clave equivocada');
  const c2 = new OBSWS();
  let r2 = null; try { r2 = await c2.conectarAuto({ host: 'localhost', puerto: PUERTO_OBS, clave: 'otra' }, detectar); } catch (_) { /* fallo */ }
  ok(c2.conectado && r2 && r2.corregida, 'Corrige la contraseña y conecta'); c2.desconectar();

  console.log('\n4) Datos guardados correctos → no cambia nada');
  const c3 = new OBSWS();
  let r3 = null; try { r3 = await c3.conectarAuto({ host: 'localhost', puerto: PUERTO_OBS, clave: CLAVE }, detectar); } catch (_) { /* fallo */ }
  ok(c3.conectado && r3 && !r3.corregida, 'Conecta sin corregir'); c3.desconectar();

  console.log('\n5) OBS cerrado → mensaje claro, sin colgarse');
  obs.close(); await new Promise((r) => setTimeout(r, 200));
  const c4 = new OBSWS(); const t0 = Date.now(); let e4 = null;
  try { await c4.conectarAuto({ host: 'localhost', puerto: 8686, clave: 'x' }, detectar); } catch (e) { e4 = e; }
  ok(e4 && !c4.conectado && Date.now() - t0 < 15000, 'Falla con mensaje: ' + (e4 && e4.message));

  console.log('\n6) Servidor de OBS desactivado → lo indica');
  fs.writeFileSync(path.join(dirObs, 'plugin_config', 'obs-websocket', 'config.json'), JSON.stringify({ server_enabled: false, server_port: 4455, server_password: 'x', auth_required: true }));
  const c5 = new OBSWS(); let e5 = null;
  try { await c5.conectarAuto({ host: 'localhost', puerto: 8686, clave: 'x' }, detectar); } catch (e) { e5 = e; }
  ok(e5 && /desactivado|Habilitar/i.test(e5.message), 'Mensaje pide activar el servidor WebSocket → ' + (e5 && e5.message));

  ch.kill(); await new Promise((r) => ch.once('exit', r));

  console.log('\n8) OBS en otro equipo: IP de este computador para las capas');
  ok(OBSWS.ipPara('192.168.0.50', ['192.168.56.1', '192.168.0.12']) === '192.168.0.12', 'ipPara elige la IP de la misma red que OBS');
  ok(OBSWS.ipPara('10.0.0.9', ['192.168.0.12', '192.168.56.1']) === '192.168.0.12', 'ipPara usa la primera IP si ninguna comparte red');
  ok(OBSWS.ipPara('localhost', ['192.168.0.12']) === null && OBSWS.ipPara('127.0.0.1', ['192.168.0.12']) === null, 'ipPara devuelve null si OBS está en este equipo');

  console.log('\n9) Buscar OBS en la red');
  const obs2 = await obsFalso(CLAVE);
  const arrancarCon = async (env) => {
    const c = spawn(process.execPath, [path.join(RAIZ, 'server.js')], { env: { ...process.env, PK_DATA_ROOT: path.join(TMP, 'datos-' + Math.random()), PORT_WEB: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let m = null; c.on('message', (x) => { if (!m) m = x; });
    for (let t = 0; !m && t < 150; t++) await new Promise((r) => setTimeout(r, 100));
    return { c, puerto: m && m.puerto };
  };
  const s1 = await arrancarCon({ PK_OBS_REDES: '127.0.0', PK_OBS_PUERTO: String(obs2.address().port) });
  const tb = Date.now(); const bus = await getJSON(s1.puerto, '/api/obs/buscar');
  const ips = ((bus.json && bus.json.encontrados) || []).map((e) => e.ip);
  // (en Windows todo 127.x es este equipo: el OBS simulado responde en las 254 direcciones)
  ok(bus.code === 200 && ips.includes('127.0.0.1'), `GET /api/obs/buscar encuentra el OBS (${ips.length} direcciones, la primera ${ips[0]}) en ${Date.now() - tb} ms`);
  ok(Date.now() - tb < 5000, 'La búsqueda termina en menos de 5 s');
  s1.c.kill(); await new Promise((r) => s1.c.once('exit', r));
  const libre = await new Promise((r) => { const t = http.createServer().listen(0, () => { const p = t.address().port; t.close(() => r(p)); }); });
  const s3 = await arrancarCon({ PK_OBS_REDES: '127.0.0', PK_OBS_PUERTO: String(libre) });
  const bus3 = await getJSON(s3.puerto, '/api/obs/buscar');
  ok(bus3.code === 200 && bus3.json.encontrados.length === 0, 'Sin OBS en la red → lista vacía (' + (bus3.json && bus3.json.encontrados.length) + ')');
  s3.c.kill(); await new Promise((r) => s3.c.once('exit', r));
  const s2 = await arrancarCon({ PK_TEST_REMOTO: '1' });
  const bus2 = await getJSON(s2.puerto, '/api/obs/buscar');
  ok(bus2.code === 403, 'Desde otro equipo (celular): 403 → ' + bus2.code);
  s2.c.kill(); await new Promise((r) => s2.c.once('exit', r));
  obs2.close();

  // 7) OBS real de este equipo (si está abierto)
  const cfgReal = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
  if (fs.existsSync(cfgReal)) {
    const real = JSON.parse(fs.readFileSync(cfgReal, 'utf8'));
    const cr = new OBSWS(); let rr = null, er = null;
    try { rr = await cr.conectarAuto({ host: 'localhost', puerto: 8686, clave: 'clave-vieja' }, async () => ({ encontrado: true, habilitado: real.server_enabled, puerto: real.server_port, clave: real.auth_required ? real.server_password : '' })); } catch (e) { er = e; }
    if (er && /No se pudo conectar|Tiempo/.test(er.message)) console.log('\n7) OBS real: no está abierto (se omite)');
    else {
      console.log('\n7) OBS real de este equipo');
      const v = cr.conectado ? await cr.call('GetVersion') : {};
      ok(cr.conectado && rr && rr.corregida, `Conecta al OBS real con datos guardados equivocados → OBS ${v.obsVersion || '?'} · WS ${v.obsWebSocketVersion || '?'}${er ? ' · ' + er.message : ''}`);
      cr.desconectar();
    }
  }

  console.log(fallos ? `\n✘ ${fallos} prueba(s) fallaron` : '\n✔ Todas las pruebas de OBS pasaron');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
