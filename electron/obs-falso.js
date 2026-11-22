// PK-PENTECOSTAL · OBS simulado para las pruebas: servidor WebSocket v5 mínimo (handshake, tramas de texto,
// autenticación con contraseña). Escucha en todas las interfaces (IPv4 e IPv6, como OBS), así sirve
// también como "OBS en otro equipo" usando la IP de la red. Registra cada petición en srv.peticiones y
// guarda las fuentes creadas (CreateInput / SetInputSettings) en srv.fuentes.
'use strict';
const http = require('http');
const crypto = require('crypto');

const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');

function obsFalso(clave, puerto = 0) {
  const srv = http.createServer();
  srv.peticiones = [];
  srv.fuentes = new Map(); // nombre → inputSettings
  function responder(tipo, datos) {
    switch (tipo) {
      case 'GetVersion': return { obsVersion: '33.0.1', obsWebSocketVersion: '5.7.6', platform: 'windows' };
      case 'GetCurrentProgramScene': return { currentProgramSceneName: 'Escena', sceneName: 'Escena' };
      case 'GetSceneList': return { currentProgramSceneName: 'Escena', scenes: [{ sceneName: 'Escena', sceneIndex: 0 }] };
      case 'GetSceneItemList': return { sceneItems: [...srv.fuentes.keys()].map((n, i) => ({ sourceName: n, sceneItemId: i + 1 })) };
      case 'GetInputList': return { inputs: [] };
      case 'CreateInput':
        if (srv.fuentes.has(datos.inputName)) return { error: 601, comment: 'Ya existe una fuente con ese nombre' };
        srv.fuentes.set(datos.inputName, { ...(datos.inputSettings || {}) });
        return { inputUuid: 'u' + srv.fuentes.size, sceneItemId: srv.fuentes.size };
      case 'GetInputSettings':
        if (!srv.fuentes.has(datos.inputName)) return { error: 600, comment: 'No existe' };
        return { inputSettings: srv.fuentes.get(datos.inputName), inputKind: 'browser_source' };
      case 'SetInputSettings':
        if (!srv.fuentes.has(datos.inputName)) return { error: 600, comment: 'No existe' };
        Object.assign(srv.fuentes.get(datos.inputName), datos.inputSettings || {});
        return {};
      case 'CreateSceneItem': return { sceneItemId: 99 };
      default: return {};
    }
  }
  srv.on('upgrade', (req, sock) => {
    const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
    const enviar = (o) => {
      const b = Buffer.from(JSON.stringify(o));
      const h = b.length < 126 ? Buffer.from([0x81, b.length]) : b.length < 65536 ? Buffer.from([0x81, 126, b.length >> 8, b.length & 255]) : (() => { const x = Buffer.alloc(10); x[0] = 0x81; x[1] = 127; x.writeBigUInt64BE(BigInt(b.length), 2); return x; })();
      sock.write(Buffer.concat([h, b]));
    };
    const cerrar = (code, motivo) => { const r = Buffer.from(motivo); const p = Buffer.concat([Buffer.from([code >> 8, code & 255]), r]); sock.write(Buffer.concat([Buffer.from([0x88, p.length]), p])); sock.end(); };
    const salt = crypto.randomBytes(16).toString('base64'), challenge = crypto.randomBytes(16).toString('base64');
    enviar({ op: 0, d: { obsWebSocketVersion: '5.7.6', rpcVersion: 1, authentication: { salt, challenge } } });
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 2) {
        const op = buf[0] & 15; let len = buf[1] & 127, i = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); i = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); i = 10; }
        if (buf.length < i + 4 + len) return;
        const m = buf.slice(i, i + 4), p = Buffer.from(buf.slice(i + 4, i + 4 + len).map((x, k) => x ^ m[k % 4]));
        buf = buf.slice(i + 4 + len);
        if (op === 8) { sock.end(); return; }
        if (op !== 1) continue;
        const { op: o, d: dd } = JSON.parse(p.toString());
        if (o === 1) {
          if (dd.authentication !== sha(sha(clave + salt) + challenge)) return cerrar(4009, 'Authentication failed.');
          enviar({ op: 2, d: { negotiatedRpcVersion: 1 } });
        } else if (o === 6) {
          srv.peticiones.push({ requestType: dd.requestType, requestData: dd.requestData || {} });
          const r = responder(dd.requestType, dd.requestData || {});
          const fallo = r && r.error;
          enviar({ op: 7, d: { requestType: dd.requestType, requestId: dd.requestId, requestStatus: fallo ? { result: false, code: r.error, comment: r.comment } : { result: true, code: 100 }, responseData: fallo ? undefined : r } });
        }
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((r) => srv.listen(puerto, () => r(srv))); // IPv4 + IPv6, como OBS
}

module.exports = { obsFalso };
