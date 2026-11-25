// PK-PENTECOSTAL · Prueba del panel: CANCIONES EN LÍNEA IPUC y editor de canciones (npm run probar-enlinea)
// Necesita internet (consulta generacionpentecostal.com). Usa datos temporales: no toca los cancioneros reales.
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
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pk-enl-ud-')));

app.whenReady().then(async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk enl '));
  const srv = spawn('node', [path.join(RAIZ, 'PK-PENTECOSTAL', 'server.js')], { env: { ...process.env, PK_DATA_ROOT: datos, PORT_WEB: '0', ELECTRON_RUN_AS_NODE: '' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let m = null; srv.on('message', (x) => { if (!m) m = x; });
  for (let t = 0; !m && t < 150; t++) await sleep(100);
  const P = m.puerto;
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false } });
  const js = (c) => win.webContents.executeJavaScript(c).catch((e) => ({ error: String(e) }));
  const esperar = async (fn, ms = 15000) => { for (let t = 0; t < ms / 150; t++) { const r = await fn(); if (r && !r.error) return r; await sleep(150); } return null; };
  const errores = [];
  win.webContents.on('console-message', (e, nivel, msg) => { if (nivel >= 3) errores.push(msg); });
  try {
    await win.loadURL(`http://127.0.0.1:${P}/?quedarse=1`);
    await js(`document.querySelector('[data-tab="canciones"]')?.click(); 1`);
    await esperar(() => js(`document.querySelectorAll('#cancionero option').length > 2`));
    const opciones = await js(`[...document.querySelectorAll('#cancionero option')].map(o => o.textContent)`);
    const iCor = opciones.findIndex((o) => /corario ipuc/i.test(o));
    ok(iCor >= 0 && /CANCIONES EN LÍNEA IPUC/.test(opciones[iCor + 1]), 'La opción «🌐 CANCIONES EN LÍNEA IPUC» aparece justo después del Corario IPUC castilla → ' + opciones.join(' | '));

    // Búsqueda local sin resultados → botón para buscar en línea
    await js(`{ const b = document.querySelector('#canBuscar'); b.value = 'santo es el que vive'; b.dispatchEvent(new Event('input')); } 1`);
    const boton = await esperar(() => js(`!!document.querySelector('[data-ir-enlinea]')`));
    ok(boton, 'Si no la tiene en sus cancioneros aparece «🌐 Buscar … en CANCIONES EN LÍNEA IPUC»');
    await js(`document.querySelector('[data-ir-enlinea]').click(); 1`);
    const n = await esperar(() => js(`document.querySelectorAll('#listaCanciones [data-enl]').length || 0`));
    ok(n > 0, `Búsqueda en línea trae ${n} canciones · ${await js(`document.querySelector('#listaCanciones .hint')?.textContent`)}`);
    ok(await js(`document.querySelector('#cancionero').value === '__enlinea__'`), 'El selector cambia a CANCIONES EN LÍNEA IPUC');

    // Abrir la primera → diapositivas
    await js(`document.querySelector('#listaCanciones [data-enl]').click(); 1`);
    const slides = await esperar(() => js(`document.querySelectorAll('#items .slide').length || 0`));
    ok(slides > 1, `La canción en línea se abre en ${slides} diapositivas: «${await js(`document.querySelector('#cTitulo').textContent`)}» · ${await js(`document.querySelector('#cSub').textContent`)}`);
    ok(await js(`!!document.querySelector('#cActions [data-act="guardarEnLinea"]') && !document.querySelector('#cActions [data-act="editar"]')`), 'Muestra «💾 Guardar en mi cancionero» (no «Editar»)');

    // Guardar en Mi Cancionero → aparece en el cancionero y persiste
    await js(`document.querySelector('#cActions [data-act="guardarEnLinea"]').click(); 1`);
    const dlg = await esperar(() => js(`document.querySelector('#dlgCancion').open && document.querySelector('#edLe').value.length > 20 && document.querySelector('#edTi').value`));
    ok(!!dlg, 'El editor se abre ya lleno (título y letra): ' + dlg);
    await js(`document.querySelector('#edLibro').value = 'Mi Cancionero'; document.querySelector('#edGuardar').click(); 1`);
    await sleep(2500);
    const r = await (await fetch(`http://127.0.0.1:${P}/api/cancionero/${encodeURIComponent('Mi Cancionero')}`)).json();
    ok(r.some((s) => s.ti === dlg), `Quedó guardada en Mi Cancionero (${r.length} canciones)`);

    // Lista completa (sin buscar) y «Cargar más»
    await js(`{ const b = document.querySelector('#canBuscar'); b.value = ''; b.dispatchEvent(new Event('input')); } 1`);
    await sleep(600);
    const n1 = await esperar(() => js(`(!document.querySelector('#listaCanciones .empty') || null) && document.querySelectorAll('#listaCanciones [data-enl]').length >= 50 && document.querySelectorAll('#listaCanciones [data-enl]').length`));
    ok(n1 >= 50, `Catálogo completo: ${n1} primeras · ${await js(`document.querySelector('#listaCanciones .hint')?.textContent`)}`);
    await js(`document.querySelector('[data-enl-mas]').click(); 1`);
    const n2 = await esperar(() => js(`document.querySelectorAll('#listaCanciones [data-enl]').length >= 100 && document.querySelectorAll('#listaCanciones [data-enl]').length`));
    ok(n2 >= 100, '«Cargar más canciones» trae la siguiente página → ' + n2);

    // Editor normal: validación sin cancionero y sin letra
    await js(`document.querySelector('#cancionero').value = 'Mi Cancionero'; document.querySelector('#cancionero').dispatchEvent(new Event('change')); 1`);
    await sleep(800);
    await js(`document.querySelector('#btnNuevaCancion').click(); document.querySelector('#edTi').value = 'Sin letra'; document.querySelector('#edLe').value = '  '; document.querySelector('#edGuardar').click(); 1`);
    ok(await js(`document.querySelector('#dlgCancion').open && document.querySelector('#toast').textContent`) === 'Escriba o pegue la letra', 'Sin letra: no se cierra el editor y avisa');
    await js(`document.querySelector('#edLe').value = 'Línea 1\\nLínea 2'; document.querySelector('#edGuardar').click(); 1`);
    await sleep(1500);
    ok(await js(`document.querySelector('#cTitulo').textContent`) === 'Sin letra', 'Canción nueva desde el editor: se guarda y se abre');
    ok(!errores.length, 'Sin errores en la consola del panel' + (errores.length ? ': ' + errores.join(' | ') : ''));
  } catch (e) { ok(false, 'Error: ' + (e.stack || e)); }
  try { srv.send({ tipo: 'apagar' }); } catch (_) { srv.kill(); }
  await sleep(800);
  try { fs.rmSync(datos, { recursive: true, force: true }); } catch (_) { /* nada */ }
  console.log(fallos ? `\n  ${fallos} prueba(s) fallaron` : '\n  Todas las pruebas del panel en línea pasaron');
  app.exit(fallos ? 1 : 0);
});
