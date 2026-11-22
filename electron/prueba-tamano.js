// PK-PENTECOSTAL · Prueba del tamaño de letra de las canciones (npx electron electron/prueba-tamano.js)
// Arranca el servidor con datos temporales, proyecta canciones de todos los cancioneros (una de una sola
// estrofa, la de líneas más largas, la de la estrofa más larga y varias al azar) y mide la letra en la
// salida a pantalla completa y en el tercio inferior de OBS: todas deben salir del MISMO tamaño.
'use strict';
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const L = require('../PK-PENTECOSTAL/public/letra.js');

const RAIZ = path.join(__dirname, '..');
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pk-tam-ud-')));

function cancioneros() {
  const dir = path.join(RAIZ, 'cancioneros'), out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const c = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8') + ';this.r=jscanciones', c); out[f] = c.r;
  }
  return out;
}
function elegir(libros) {
  const casos = [];
  const todas = Object.entries(libros).flatMap(([f, s]) => s.map((x) => ({ f, x })));
  const crudo = (x) => (x.le || '').replace(/\r\n?/g, '\n');
  const una = todas.find(({ x }) => L.estrofas(x.le, 6).length === 1 && crudo(x).split('\n').filter((l) => l.trim()).length <= 3);
  if (una) casos.push(['una sola estrofa corta', una]);
  const masLarga = (x) => Math.max(0, ...crudo(x).split('\n').map((l) => L.limpiarLinea(l).length));
  casos.push(['línea más larga', todas.reduce((a, b) => (masLarga(b.x) > masLarga(a.x) ? b : a))]);
  const estrofaMax = (x) => Math.max(0, ...crudo(x).split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim()).length));
  casos.push(['estrofa más larga', todas.reduce((a, b) => (estrofaMax(b.x) > estrofaMax(a.x) ? b : a))]);
  for (const [f, s] of Object.entries(libros)) for (let k = 1; k <= 3; k++) casos.push([`${f} #${(k * 37) % s.length}`, { f, x: s[(k * 37) % s.length] }]);
  return casos;
}

async function medir(win, puerto, texto, grupo) {
  await fetch(`http://127.0.0.1:${puerto}/api/vivo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vivo: { tipo: 'cancion', titulo: 'Prueba', texto, ref: 'Prueba', grupo } }) });
  const primera = texto.split('\n').find((l) => !L.ES_MARCADOR.test(l.trim())) || texto.split('\n')[0];
  for (let i = 0; i < 40; i++) {
    await sleep(60);
    const r = await win.webContents.executeJavaScript(`(() => { const s = [...document.querySelectorAll('.slide')].pop(); const t = s && s.querySelector('.txt');
      return t ? { tam: parseFloat(getComputedStyle(t).fontSize), txt: t.textContent } : null; })()`);
    if (r && r.txt.includes(primera.slice(0, 20))) { await sleep(150); return parseFloat(await win.webContents.executeJavaScript(`getComputedStyle([...document.querySelectorAll('.slide')].pop().querySelector('.txt')).fontSize`)); }
  }
  return NaN;
}

app.whenReady().then(async () => {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-tam-'));
  const srv = spawn('node', [path.join(RAIZ, 'PK-PENTECOSTAL', 'server.js')], { env: { ...process.env, PK_DATA_ROOT: datos, PORT_WEB: '0', ELECTRON_RUN_AS_NODE: '', PK_OBS_DIR: path.join(datos, 'sin-obs') }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let listo = null; srv.on('message', (m) => { if (!listo) listo = m; });
  for (let t = 0; !listo && t < 150; t++) await sleep(100);
  const puerto = listo.puerto;
  const casos = elegir(cancioneros());
  try {
    const win = new BrowserWindow({ show: false, width: 1920, height: 1080, useContentSize: true, webPreferences: { backgroundThrottling: false } });
    for (const modo of ['pantalla', 'obs']) {
      console.log(`\nSalida: ${modo === 'pantalla' ? 'pantalla completa' : 'tercio inferior (OBS)'}`);

      await win.loadURL(`http://127.0.0.1:${puerto}/salida?modo=${modo}&quedarse=1`).catch(() => {}); // la página puede redirigir
      for (let i = 0; i < 50 && !(await win.webContents.executeJavaScript(`!!document.getElementById('stage') && document.readyState === 'complete'`).catch(() => false)); i++) await sleep(100);
      await sleep(800);
      const tams = [];
      for (const [nombre, { f, x }] of casos) {
        const diapos = L.estrofas(x.le, 6);
        const t = [];
        for (const d of diapos) t.push(await medir(win, puerto, d, diapos));
        tams.push(...t);
        console.log(`    ${nombre} (${f}: «${x.ti}») · ${diapos.length} diapositivas · ${[...new Set(t.map((v) => v.toFixed(1)))].join(' / ')} px`);
      }
      const comun = [...tams].sort((a, b) => a - b)[Math.floor(tams.length / 2)];
      const distintas = tams.filter((v) => !(Math.abs(v - comun) <= 0.5));
      ok(distintas.length === 0, `${tams.length} diapositivas con el mismo tamaño (${comun.toFixed(1)} px) · distintas: ${distintas.length}${distintas.length ? ' → ' + distintas.map((v) => v.toFixed(1)).join(', ') : ''}`);
    }

    // Fuente recién elegida: el tamaño no debe quedar calculado con la fuente de respaldo (antes de que cargue)
    console.log('\nFuente recién elegida (aún sin cargar)');
    const post = (ruta, body) => fetch(`http://127.0.0.1:${puerto}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const [, { x: cf }] = casos[3];
    const dcf = L.estrofas(cf.le, 6);
    await win.loadURL(`http://127.0.0.1:${puerto}/salida?modo=pantalla&quedarse=1`).catch(() => {});
    await post('/api/estilo', { fuente: 'Tangerine' });
    await post('/api/vivo', { vivo: { tipo: 'cancion', titulo: 'F', texto: dcf[0], ref: 'F', grupo: dcf } });
    await sleep(3000);
    const tamA = parseFloat(await win.webContents.executeJavaScript(`getComputedStyle([...document.querySelectorAll('.slide')].pop().querySelector('.txt')).fontSize`));
    await win.loadURL(`http://127.0.0.1:${puerto}/salida?modo=pantalla&quedarse=1`).catch(() => {});
    await win.webContents.executeJavaScript(`document.fonts.load("800 40px 'Tangerine'").then(() => document.fonts.ready).then(() => 1)`).catch(() => {});
    await sleep(500);
    await post('/api/vivo', { vivo: { tipo: 'cancion', titulo: 'F2', texto: dcf[0], ref: 'F2', grupo: dcf } });
    await sleep(1500);
    const tamB = parseFloat(await win.webContents.executeJavaScript(`getComputedStyle([...document.querySelectorAll('.slide')].pop().querySelector('.txt')).fontSize`));
    ok(Math.abs(tamA - tamB) <= 0.5, `Mismo tamaño proyectando antes y después de cargar la fuente → ${tamA.toFixed(1)} px / ${tamB.toFixed(1)} px`);
    await post('/api/estilo', { reset: true });

    // Panel: la canción se reparte con «Líneas por diapositiva» y se recalcula al cambiar el ajuste
    console.log('\nPanel');
    const libro = 'Corario IPUC castilla';
    const lista = cancioneros()[libro + '.js'];
    const crudo = (x) => (x.le || '').replace(/\r\n?/g, '\n');
    const estrofaMax = (x) => Math.max(0, ...crudo(x).split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim()).length));
    const cancion = lista.slice(0, 400).reduce((a, b) => (estrofaMax(b) > estrofaMax(a) ? b : a));
    await win.loadURL(`http://127.0.0.1:${puerto}/?quedarse=1`).catch(() => {});
    const js = (c) => win.webContents.executeJavaScript(c).catch(() => null);
    const esperar = async (c, ms = 8000) => { for (let t = 0; t < ms / 100; t++) { const r = await js(c); if (r) return r; await sleep(100); } return null; };
    await esperar(`[...document.querySelectorAll('#cancionero option')].some(o => o.value === ${JSON.stringify(libro)})`);
    await js(`(() => { const s = document.querySelector('#cancionero'); s.value = ${JSON.stringify(libro)}; s.dispatchEvent(new Event('change')); })()`);
    const k = `${libro}|${cancion.id}`;
    await esperar(`!!document.querySelector('#listaCanciones .list-item[data-k=${JSON.stringify(JSON.stringify(k)).slice(1, -1)}]')`);
    await js(`document.querySelector('#listaCanciones .list-item[data-k=${JSON.stringify(JSON.stringify(k)).slice(1, -1)}]').click()`);
    const n6 = L.estrofas(cancion.le, 6).length, n4 = L.estrofas(cancion.le, 4).length;
    const d6 = await esperar(`document.querySelectorAll('#items .slide').length === ${n6} && ${n6}`);
    ok(d6 === n6, `«${cancion.ti}» (estrofa de ${estrofaMax(cancion)} líneas) → ${n6} diapositivas con 6 líneas · panel: ${await js(`document.querySelectorAll('#items .slide').length`)}`);
    const sucias = await js(`[...document.querySelectorAll('#items .slide')].filter(s => /\\/\\/|\\n /.test(s.textContent)).length`);
    ok(sucias === 0, `Sin // ni espacios al inicio en las diapositivas del panel (${sucias})`);
    await fetch(`http://127.0.0.1:${puerto}/api/estilo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lineasMax: 4 }) });
    const d4 = await esperar(`document.querySelectorAll('#items .slide').length === ${n4} && ${n4}`);
    ok(d4 === n4, `Con «Líneas por diapositiva» = 4 se recalcula sola → ${n4} diapositivas · panel: ${await js(`document.querySelectorAll('#items .slide').length`)}`);
    const rango = await js(`(() => { const r = document.querySelector('#formEstilo [data-k="lineasMax"]'); return r && r.min + '-' + r.max + '=' + r.value; })()`);
    ok(rango === '2-12=4', `Ajuste «Líneas por diapositiva» en Estilo (2–12) muestra el valor → ${rango}`);

    // Texto libre / anuncios: sale tal cual se escribió (la limpieza de // es solo para canciones)
    await js(`document.querySelector('#txtTitulo').value = 'Anuncio'; document.querySelector('#txtCuerpo').value = 'Visite https://www.facebook.com/ipuc\\nOfrenda 50 / 100'; document.querySelector('#btnTxtCargar').click()`);
    const anuncio = await esperar(`(() => { const s = document.querySelector('#items .slide'); return s && /Visite/.test(s.textContent) && s.textContent; })()`);
    ok(!!anuncio && anuncio.includes('https://www.facebook.com/ipuc') && anuncio.includes('50 / 100'), 'Texto libre conserva enlaces y « / » → ' + JSON.stringify(anuncio));
  } finally { srv.kill(); }
  console.log(fallos ? `\n✘ ${fallos} prueba(s) fallaron` : '\n✔ Mismo tamaño en todas las canciones');
  app.exit(fallos ? 1 : 0);
});
