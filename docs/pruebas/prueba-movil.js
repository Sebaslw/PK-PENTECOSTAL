// Prueba de la vinculación por QR. Uso: node prueba-movil.js
// Arranca el servidor en el puerto 7788 tratando todas las peticiones como "otro equipo".
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const APP = path.resolve(__dirname, '..', '..', 'PK-PENTECOSTAL');
const CFG = path.join(APP, '..', 'BSPK', 'config.json');
const copia = fs.readFileSync(CFG);
const BASE = 'http://127.0.0.1:7788';

async function req(p, { method = 'GET', clave, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (clave) headers['X-PK-Clave'] = clave;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
}

function arrancar(remoto) {
  const env = { ...process.env, PORT: '7788' };
  if (remoto) env.PK_TEST_REMOTO = '1';
  const srv = spawn(process.execPath, ['server.js'], { cwd: APP, env, stdio: 'ignore' });
  return new Promise((ok, mal) => {
    let n = 0;
    const t = setInterval(async () => {
      try { await fetch(BASE + '/api/info'); clearInterval(t); ok(srv); } catch (_) { if (++n > 50) { clearInterval(t); mal(new Error('no arrancó')); } }
    }, 100);
  });
}

(async () => {
  let srv;
  try {
    // 1) Como el propio equipo: obtener la clave
    srv = await arrancar(false);
    const m = await req('/api/movil');
    assert.strictEqual(m.status, 200, 'equipo puede leer /api/movil');
    assert.match(m.data.clave, /^[0-9a-f]{24}$/, 'clave de 24 hex');
    assert.ok(Array.isArray(m.data.ips) && m.data.puerto === 7788);
    const e0 = await req('/api/movil/estado');
    assert.deepStrictEqual(e0.data, { equipo: true, vinculado: true });
    assert.strictEqual((await req('/api/vivo', { method: 'POST', body: { negro: false } })).status, 200, 'equipo no necesita clave');
    const clave = m.data.clave;
    srv.kill(); await new Promise((r) => setTimeout(r, 500));

    // 2) Como teléfono
    srv = await arrancar(true);
    assert.strictEqual((await req('/api/movil')).status, 403, 'teléfono no puede leer la clave');
    const sin = await req('/api/vivo', { method: 'POST', body: { negro: false } });
    assert.strictEqual(sin.status, 403, 'sin clave → 403');
    assert.strictEqual(sin.data.vincular, true);
    assert.strictEqual((await req('/api/vivo', { method: 'POST', clave: 'mala', body: { negro: false } })).status, 403, 'clave mala → 403');
    assert.strictEqual((await req('/api/vivo', { method: 'POST', clave, body: { negro: false } })).status, 200, 'clave buena → 200');
    assert.strictEqual((await req('/api/estado')).status, 200, 'lectura abierta (proyector/OBS)');
    assert.strictEqual((await req('/api/biblias')).status, 200, 'lectura abierta');
    assert.deepStrictEqual((await req('/api/movil/estado')).data, { equipo: false, vinculado: false });
    assert.deepStrictEqual((await req('/api/movil/estado', { clave })).data, { equipo: false, vinculado: true });
    assert.strictEqual((await req('/api/movil/renovar', { method: 'POST', clave })).status, 403, 'teléfono no puede renovar');
    assert.strictEqual((await req('/api/apagar', { method: 'POST', clave })).status, 403, 'teléfono no apaga');
    srv.kill(); await new Promise((r) => setTimeout(r, 500));

    // 3) Renovar invalida la clave vieja; la clave persiste entre reinicios
    srv = await arrancar(false);
    assert.strictEqual((await req('/api/movil')).data.clave, clave, 'clave persiste');
    const nueva = (await req('/api/movil/renovar', { method: 'POST' })).data.clave;
    assert.notStrictEqual(nueva, clave);
    srv.kill(); await new Promise((r) => setTimeout(r, 800));
    srv = await arrancar(true);
    assert.strictEqual((await req('/api/vivo', { method: 'POST', clave, body: { negro: false } })).status, 403, 'clave vieja ya no sirve');
    assert.strictEqual((await req('/api/vivo', { method: 'POST', clave: nueva, body: { negro: false } })).status, 200, 'clave nueva sirve');
    console.log('OK: todas las pruebas de vinculación pasaron');
  } catch (e) {
    console.error('FALLÓ:', e.message); process.exitCode = 1;
  } finally {
    if (srv) srv.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(CFG, copia); // dejar config.json como estaba
  }
})();
