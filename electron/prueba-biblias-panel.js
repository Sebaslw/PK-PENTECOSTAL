// PK-PENTECOSTAL · Prueba del panel con Biblias completas (npm run probar-biblias-panel)
// Abre el panel de control real en Electron, cambia de versión y proyecta pasajes que antes no aparecían
// (versículos unidos de la TLA, versículos omitidos de la DHH/NVI). Usa datos temporales.
'use strict';
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pk-bib-ud-')));

app.whenReady().then(async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk bib '));
  const srv = spawn('node', [path.join(RAIZ, 'PK-PENTECOSTAL', 'server.js')], { env: { ...process.env, PK_DATA_ROOT: datos, PORT_WEB: '0', ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let m = null; srv.on('message', (x) => { if (!m) m = x; });
  for (let t = 0; !m && t < 150; t++) await sleep(100);
  const P = m.puerto;
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  const js = (c) => win.webContents.executeJavaScript(c).catch((e) => ({ error: String(e) }));
  const esperar = async (fn, ms = 15000) => { for (let t = 0; t < ms / 150; t++) { const r = await fn(); if (r && !r.error) return r; await sleep(150); } return null; };
  const errores = [];
  win.webContents.on('console-message', (e, nivel, msg) => { if (nivel >= 3) errores.push(msg); });
  const version = async (sigla) => {
    const v = await js(`(() => { const s = document.querySelector('#bibVersion'); const o = [...s.options].find(o => o.value.endsWith(' - ${sigla}')); s.value = o.value; s.dispatchEvent(new Event('change')); return o.value; })()`);
    await esperar(() => js(`document.querySelector('#cSub').textContent.includes(${JSON.stringify(v)})`));
    return v;
  };
  const referencia = async (ref) => {
    await js(`{ const i = document.querySelector('#refInput'); i.value = ${JSON.stringify(ref)}; document.querySelector('#refForm').requestSubmit(); } 1`);
    await sleep(700);
    const st = await (await fetch(`http://127.0.0.1:${P}/api/estado`)).json();
    const vivo = st.vivo || st.estado?.vivo || {};
    return { vivo, sel: await js(`[...document.querySelectorAll('#items .verse.live, #items .verse.sel, #items .verse.selected')].map(x => x.textContent).join(' | ')`), titulo: await js(`document.querySelector('#cTitulo').textContent + ' · ' + document.querySelector('#cSub').textContent`) };
  };
  try {
    await win.loadURL(`http://127.0.0.1:${P}/?quedarse=1`);
    await esperar(() => js(`document.querySelectorAll('#bibVersion option').length >= 9`));
    await esperar(() => js(`/versículos/.test(document.querySelector('#cSub').textContent)`)); // la Biblia inicial terminó de cargar
    await sleep(1500);
    const opciones = await js(`[...document.querySelectorAll('#bibVersion option')].map(o => o.textContent)`);
    ok(opciones.length === 9 && opciones.every((o) => !/Ã/.test(o)), 'Selector con 9 Biblias y nombres correctos → ' + opciones.join(' | '));

    await version('TLA');
    let r = await referencia('Juan 3:24');
    ok(/Juan 3:23-24/.test(r.vivo.titulo || r.vivo.ref || '') && /Juan el Bautista/.test(r.vivo.texto || ''), `TLA «Juan 3:24» se proyecta como ${r.vivo.titulo} → ${(r.vivo.texto || '').slice(0, 70)}…`);
    ok(await js(`[...document.querySelectorAll('#items .verse .n')].some(n => n.textContent === '23-24')`), 'TLA Juan 3 muestra el número «23-24» en la lista');
    ok(/36 versículos/.test(r.titulo), 'TLA Juan 3 dice 36 versículos → ' + r.titulo);
    r = await referencia('Génesis 2:2');
    ok(/séptimo día/.test(r.vivo.texto || ''), `TLA «Génesis 2:2» → ${r.vivo.titulo}`);

    await version('DHH');
    r = await referencia('Mateo 17:21');
    ok(/oración y ayuno/.test(r.vivo.texto || '') && /Reina-Valera 1960/.test(r.vivo.texto || ''), `DHH «Mateo 17:21» → ${(r.vivo.texto || '').slice(0, 90)}…`);
    ok(await js(`![...document.querySelectorAll('#items .verse')].some(v => v.textContent.trim() === '2021' || v.querySelector('span:last-child').textContent.trim() === '21')`), 'DHH Mateo 17 sin la línea basura «21»');
    r = await referencia('Mateo 17:20-22');
    ok((r.vivo.texto || '').includes('[[21]]') && (r.vivo.texto || '').includes('[[22]]'), 'DHH Mateo 17:20-22 proyecta los tres versículos');

    await version('NVI');
    r = await referencia('Salmos 112:10');
    ok(/malvado verá esto/.test(r.vivo.texto || ''), `NVI «Salmo 112:10» → ${(r.vivo.texto || '').slice(0, 60)}…`);
    r = await referencia('Hechos 9:1');
    ok(/^Mientras tanto, Saulo/.test(r.vivo.texto || ''), `NVI «Hechos 9:1» → ${(r.vivo.texto || '').slice(0, 60)}…`);
    r = await referencia('Isaías 66:1');
    ok(/El cielo es mi trono/.test(r.vivo.texto || ''), `NVI «Isaías 66:1» → ${(r.vivo.texto || '').slice(0, 60)}…`);

    await version('RV1960');
    r = await referencia('Juan 3:16');
    ok(/de tal manera amó Dios al mundo/.test(r.vivo.texto || ''), 'RV1960 «Juan 3:16» igual que siempre');
    // Búsqueda por palabras encuentra versículos unidos
    await version('TLA');
    await js(`{ const b = document.querySelector('#bibBuscar'); b.value = 'Juan el Bautista todavía'; b.dispatchEvent(new Event('input')); } 1`);
    const res = await esperar(() => js(`document.querySelectorAll('#bResultados .list-item').length && [...document.querySelectorAll('#bResultados .list-item .t')].map(x => x.textContent).join(', ')`));
    ok(/Juan 3:23-24/.test(res || ''), 'Búsqueda por palabras muestra «Juan 3:23-24» → ' + res);
    ok(!errores.length, 'Sin errores en la consola del panel' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } catch (e) { ok(false, 'Error: ' + (e.stack || e)); }
  try { srv.send({ tipo: 'apagar' }); } catch (_) { srv.kill(); }
  await sleep(800);
  try { fs.rmSync(datos, { recursive: true, force: true }); } catch (_) { /* nada */ }
  console.log(fallos ? `\n  ${fallos} prueba(s) fallaron` : '\n  Todas las pruebas del panel de Biblias pasaron');
  app.exit(fallos ? 1 : 0);
});
