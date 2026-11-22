// PK-PENTECOSTAL · Prueba del panel con OBS en OTRO equipo (npx electron electron/prueba-obs-panel.js)
// Un OBS simulado escucha en la red y el panel se conecta a él por la IP de la red (como si OBS estuviera en
// otro computador). Comprueba que la capa y el stinger que el panel crea en OBS apuntan a la IP de ESTE
// computador (no a pkipuc.localhost), que una capa vieja se corrige sin duplicarse, y el aviso del firewall.
'use strict';
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { obsFalso } = require('./obs-falso');

const RAIZ = path.join(__dirname, '..');
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pk-obsp-ud-')));
const CLAVE = 'clave-remota-123';
const CAPA = 'PK-PENTECOSTAL · Capa', STINGER = 'PK-PENTECOSTAL · Stinger';

function ipRed() {
  for (const [nombre, l] of Object.entries(os.networkInterfaces())) for (const i of l || []) {
    if ((i.family === 'IPv4' || i.family === 4) && !i.internal && !i.address.startsWith('169.254.') && !i.address.startsWith('192.168.56.') && !/virtual|vethernet|vbox/i.test(nombre)) return i.address;
  }
  return null;
}

app.whenReady().then(async () => {
  const ip = ipRed();
  if (!ip) { console.log('Sin red local: se omite la prueba'); return app.exit(0); }
  const obs = await obsFalso(CLAVE);
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-obsp-'));
  const srv = spawn('node', [path.join(RAIZ, 'PK-PENTECOSTAL', 'server.js')], { env: { ...process.env, PK_DATA_ROOT: datos, PORT_WEB: '0', ELECTRON_RUN_AS_NODE: '', PK_OBS_DIR: path.join(datos, 'sin-obs') }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let listo = null; srv.on('message', (m) => { if (!listo) listo = m; });
  for (let t = 0; !listo && t < 150; t++) await sleep(100);
  const P = listo.puerto;
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  const js = (c) => win.webContents.executeJavaScript(c).catch(() => null);
  const esperar = async (fn, ms = 10000) => { for (let t = 0; t < ms / 100; t++) { const r = await fn(); if (r) return r; await sleep(100); } return null; };
  const abrirCon = async (cfg) => {
    await win.loadURL(`http://127.0.0.1:${P}/?quedarse=1`).catch(() => {});
    await esperar(() => js(`!!document.querySelector('#obsConectar')`));
    await js(`localStorage.setItem('pp.obs', ${JSON.stringify(JSON.stringify(cfg))}); 1`);
    await win.loadURL(`http://127.0.0.1:${P}/?quedarse=1`).catch(() => {});
    await esperar(() => js(`!!document.querySelector('#obsConectar')`));
  };
  try {
    console.log(`OBS simulado «en otro equipo»: ${ip}:${obs.address().port} · PK-PENTECOSTAL en el puerto ${P}`);
    await abrirCon({ host: ip, puerto: obs.address().port, clave: CLAVE, auto: true });
    const con = await esperar(() => js(`document.querySelector('#obsTxt').textContent === 'OBS conectado'`));
    ok(con, 'El panel se conecta al OBS por la IP de la red → ' + await js(`document.querySelector('#obsTxt').textContent + ' · ' + document.querySelector('#obsSub').textContent`));

    const esperada = `http://${ip}:${P}`;
    console.log('\nCapa de rótulos/banner');
    await js(`document.querySelector('#btnAddCapa').click()`);
    await esperar(() => obs.fuentes.has(CAPA));
    ok(obs.fuentes.has(CAPA) && obs.fuentes.get(CAPA).url === esperada + '/capa', `Capa nueva apunta a este equipo → ${obs.fuentes.get(CAPA) && obs.fuentes.get(CAPA).url}`);
    if (!obs.fuentes.has(CAPA)) {
      console.log('    peticiones a OBS:', [...new Set(obs.peticiones.map((p) => p.requestType))].join(', '));
      console.log('    botón:', await js(`(() => { const b = document.querySelector('#btnAddCapa'); return b ? 'disabled=' + b.disabled : 'no existe'; })()`), '· aviso:', await js(`document.querySelector('#toast') && document.querySelector('#toast').textContent`));
      throw new Error('sin capa');
    }
    obs.fuentes.get(CAPA).url = 'http://pkipuc.localhost/capa'; // capa creada con una versión anterior
    const antes = obs.peticiones.length;
    await js(`document.querySelector('#btnAddCapa').click()`);
    await esperar(() => obs.peticiones.slice(antes).some((p) => p.requestType === 'SetInputSettings'));
    ok(obs.fuentes.get(CAPA).url === esperada + '/capa', `Capa vieja (pkipuc.localhost) se corrige → ${obs.fuentes.get(CAPA).url}`);
    ok(obs.peticiones.filter((p) => p.requestType === 'CreateInput' && p.requestData.inputName === CAPA).length === 2 && obs.fuentes.size === 1, 'No se duplica la capa');

    console.log('\nStinger');
    await js(`document.querySelector('#stgAddObs').disabled = false; document.querySelector('#stgAddObs').click()`);
    await esperar(() => obs.fuentes.has(STINGER));
    ok(obs.fuentes.has(STINGER) && obs.fuentes.get(STINGER).url === esperada + '/stinger', `Stinger apunta a este equipo → ${obs.fuentes.get(STINGER) && obs.fuentes.get(STINGER).url}`);
    obs.fuentes.get(STINGER).url = 'http://pkipuc.localhost/stinger';
    const antes2 = obs.peticiones.length;
    await js(`document.querySelector('#stgAddObs').click()`);
    await esperar(() => obs.peticiones.slice(antes2).some((p) => p.requestType === 'SetInputSettings'));
    ok(obs.fuentes.get(STINGER).url === esperada + '/stinger', `Stinger viejo se corrige → ${obs.fuentes.get(STINGER).url}`);

    console.log('\nOBS en otro equipo que no responde');
    const libre = await new Promise((r) => { const t = http.createServer().listen(0, () => { const p = t.address().port; t.close(() => r(p)); }); });
    await abrirCon({ host: ip, puerto: libre, clave: CLAVE, auto: false });
    await js(`document.querySelector('#obsConectar').click()`);
    const msg = await esperar(() => js(`(() => { const t = document.querySelector('#obsSub').textContent; return /Firewall/i.test(t) && t; })()`));
    ok(!!msg, 'El aviso explica qué revisar en el otro equipo → ' + (msg || await js(`document.querySelector('#obsSub').textContent`)));

    console.log('\nBuscar OBS en la red (ventana ⚙)');
    await js(`document.querySelector('#obsCfg').click()`);
    const boton = await esperar(() => js(`(() => { const b = [...document.querySelectorAll('button')].find(x => /Buscar OBS en la red/.test(x.textContent)); return !!b; })()`));
    ok(!!boton, 'La ventana ⚙ tiene el botón «Buscar OBS en la red»');
  } catch (e) { ok(false, "Error: " + e.message); } finally { srv.kill(); obs.close(); }
  console.log(fallos ? `\n✘ ${fallos} prueba(s) fallaron` : '\n✔ OBS en otro equipo: todo correcto');
  app.exit(fallos ? 1 : 0);
});
