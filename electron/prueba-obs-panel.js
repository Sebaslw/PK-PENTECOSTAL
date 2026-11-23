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
  // PK_OBS_DIR vacío: el panel nunca toma la contraseña del OBS real. PK_TEST_IPS: IP que el servidor
  // anuncia como suya (10.9.9.9 = este equipo "está en otra red" → el OBS simulado queda en OTRO equipo)
  async function arrancar(extra) {
    const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-obsp-'));
    const c = spawn('node', [path.join(RAIZ, 'PK-PENTECOSTAL', 'server.js')], { env: { ...process.env, PK_DATA_ROOT: datos, PORT_WEB: '0', ELECTRON_RUN_AS_NODE: '', PK_OBS_DIR: path.join(datos, 'sin-obs'), ...extra }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let m = null; c.on('message', (x) => { if (!m) m = x; });
    for (let t = 0; !m && t < 150; t++) await sleep(100);
    return { c, P: m.puerto };
  }
  let srv = await arrancar({ PK_TEST_IPS: '10.9.9.9' });
  let P = srv.P;
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  const js = (c) => win.webContents.executeJavaScript(c).catch(() => null);
  const esperar = async (fn, ms = 10000) => { for (let t = 0; t < ms / 100; t++) { const r = await fn(); if (r) return r; await sleep(100); } return null; };
  const abrirCon = async (cfg) => {
    // primero una página sin panel (no conecta a nada) para guardar la configuración de OBS de la prueba
    await win.loadURL(`http://127.0.0.1:${P}/api/info`).catch(() => {});
    await js(`localStorage.setItem('pp.obs', ${JSON.stringify(JSON.stringify(cfg))}); 1`);
    await win.loadURL(`http://127.0.0.1:${P}/?quedarse=1`).catch(() => {});
    await esperar(() => js(`!!document.querySelector('#obsConectar')`));
  };
  try {
    console.log(`OBS simulado «en otro equipo»: ${ip}:${obs.address().port} · este equipo anuncia 10.9.9.9 · PK-PENTECOSTAL en el puerto ${P}`);
    await abrirCon({ host: ip, puerto: obs.address().port, clave: CLAVE, auto: true });
    const con = await esperar(() => js(`document.querySelector('#obsTxt').textContent === 'OBS conectado'`));
    ok(con, 'El panel se conecta al OBS por la IP de la red → ' + await js(`document.querySelector('#obsTxt').textContent + ' · ' + document.querySelector('#obsSub').textContent`));

    const esperada = `http://10.9.9.9:${P}`;
    // URLs para OBS (pestaña OBS): con OBS en otro equipo deben usar la IP de este computador
    await js(`window.PP.pintarOBS()`);
    const urls = await esperar(() => js(`(() => { const v = [...document.querySelectorAll('.url')].map(i => i.value); return v.length && v.every(x => x.startsWith(${JSON.stringify(`http://10.9.9.9:${P}/`)})) && v; })()`));
    ok(!!urls, 'URLs para OBS usan la IP de este equipo (no pkipuc.localhost) → ' + (urls ? urls.find((u) => /solo=banner/.test(u)) : await js(`document.querySelector('.url').value`)));

    // El OBS "remoto" abre la capa: conexión desde 127.0.0.2 (el servidor no la reconoce como este equipo)
    const abrirComoOBS = (pagina) => new Promise((r) => {
      const q = http.get({ host: '127.0.0.1', port: P, path: '/api/eventos', localAddress: '127.0.0.2', headers: { Referer: `http://10.9.9.9:${P}${pagina}`, Host: `10.9.9.9:${P}` } }, (res) => r({ res, q }));
      q.on('error', () => r(null));
    });

    console.log('\nCapa de rótulos/banner');
    await js(`document.querySelector('#btnAddCapa').click()`);
    await esperar(() => obs.fuentes.has(CAPA));
    const conOBS = await abrirComoOBS('/capa');
    ok(!!conOBS && conOBS.res.statusCode === 200, 'El OBS de otro equipo puede abrir los eventos de la capa');
    const visto = await esperar(() => js(`(() => { const t = document.querySelector('#obsSub').textContent; return /La capa se ve en OBS/.test(t) && t; })()`), 12000);
    ok(!!visto, 'El panel confirma que el OBS del otro equipo abrió la capa → ' + (visto || await js(`document.querySelector('#obsSub').textContent`)));
    const ajeno = await new Promise((r) => http.get({ host: '127.0.0.1', port: P, path: '/api/obs/clientes', localAddress: '127.0.0.2' }, (x) => r(x.statusCode)).on('error', () => r(0)));
    ok(ajeno === 403, 'Otro equipo no puede ver quién está conectado (/api/obs/clientes → ' + ajeno + ')');
    if (conOBS) conOBS.q.destroy();
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
    // Nadie abrió la capa desde el otro equipo (Firewall / red): el panel lo dice y ofrece el Firewall
    const aviso = await esperar(() => js(`(() => { const d = document.querySelector('#dlgGen'); return d && d.open && /no logra abrir la capa/.test(d.textContent) && /Permitir en el Firewall/.test(d.textContent) && document.querySelector('#dgTitulo').textContent; })()`), 15000);
    ok(!!aviso, 'Si el OBS del otro equipo no abre la capa, avisa y ofrece «Permitir en el Firewall» → ' + aviso);
    await js(`document.querySelector('#dlgGen').close('cancel')`);

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

    console.log('\nOBS en ESTE equipo, conectado por su propia IP de la red (' + ip + ')');
    srv.c.kill(); await new Promise((r) => srv.c.once('exit', r));
    srv = await arrancar({}); P = srv.P; obs.fuentes.clear();
    await abrirCon({ host: ip, puerto: obs.address().port, clave: CLAVE, auto: true });
    ok(await esperar(() => js(`document.querySelector('#obsTxt').textContent === 'OBS conectado'`)), 'Conecta');
    await js(`document.querySelector('#btnAddCapa').click()`);
    await esperar(() => obs.fuentes.has(CAPA));
    const local = `http://127.0.0.1:${P}/capa`;
    ok(obs.fuentes.has(CAPA) && obs.fuentes.get(CAPA).url === local, `Se trata como OBS local: la capa usa la dirección del panel, no la IP de la red → ${obs.fuentes.get(CAPA) && obs.fuentes.get(CAPA).url}`);
  } catch (e) { ok(false, 'Error: ' + e.message); } finally { srv.c.kill(); obs.close(); }
  console.log(fallos ? `\n✘ ${fallos} prueba(s) fallaron` : '\n✔ OBS en otro equipo: todo correcto');
  app.exit(fallos ? 1 : 0);
});
