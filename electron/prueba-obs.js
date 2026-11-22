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

// ---------- OBS simulado: servidor WebSocket v5 mínimo (handshake + tramas de texto)
function obsFalso(clave) {
  const srv = http.createServer();
  srv.on('upgrade', (req, sock) => {
    const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
    const enviar = (o) => { const b = Buffer.from(JSON.stringify(o)); const h = b.length < 126 ? Buffer.from([0x81, b.length]) : Buffer.from([0x81, 126, b.length >> 8, b.length & 255]); sock.write(Buffer.concat([h, b])); };
    const cerrar = (code, motivo) => { const r = Buffer.from(motivo); const p = Buffer.concat([Buffer.from([code >> 8, code & 255]), r]); sock.write(Buffer.concat([Buffer.from([0x88, p.length]), p])); sock.end(); };
    const salt = crypto.randomBytes(16).toString('base64'), challenge = crypto.randomBytes(16).toString('base64');
    enviar({ op: 0, d: { obsWebSocketVersion: '5.7.6', rpcVersion: 1, authentication: { salt, challenge } } });
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2) {
        const op = buf[0] & 15; let len = buf[1] & 127, i = 2;
        if (len === 126) { len = buf.readUInt16BE(2); i = 4; }
        if (buf.length < i + 4 + len) return;
        const m = buf.slice(i, i + 4), p = Buffer.from(buf.slice(i + 4, i + 4 + len).map((x, k) => x ^ m[k % 4]));
        buf = buf.slice(i + 4 + len);
        if (op === 8) { sock.end(); return; }
        const { op: o, d: dd } = JSON.parse(p.toString());
        if (o === 1) {
          if (dd.authentication !== sha(sha(clave + salt) + challenge)) return cerrar(4009, 'Authentication failed.');
          enviar({ op: 2, d: { negotiatedRpcVersion: 1 } });
        } else if (o === 6) {
          const datos = dd.requestType === 'GetVersion' ? { obsVersion: '33.0.1', obsWebSocketVersion: '5.7.6', platform: 'windows' } : {};
          enviar({ op: 7, d: { requestType: dd.requestType, requestId: dd.requestId, requestStatus: { result: true, code: 100 }, responseData: datos } });
        }
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((r) => srv.listen(0, () => r(srv))); // IPv4 + IPv6, como OBS
}

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
