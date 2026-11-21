// Genera "Manual PK-PENTECOSTAL.pdf" a partir de manual.html.
// 1) Crea los fondos (img/fondo-portada.png, img/fondo-pagina.png) desde fondos.html.
// 2) Imprime el manual, busca en qué página quedó cada capítulo y escribe esos números en el índice.
// Uso: node generar-pdf.js        (requiere Google Chrome o Microsoft Edge)
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const NAV = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const SALIDA = path.resolve(__dirname, '..', '..', 'Manual PK-PENTECOSTAL.pdf');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const url = (f, q = '') => 'file:///' + path.join(__dirname, f).split(path.sep).join('/') + q;

async function navegador() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-manual-'));
  const ch = spawn(NAV, ['--headless=new', '--remote-debugging-port=9335', '--user-data-dir=' + perfil, '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let lista;
  for (let i = 0; i < 60; i++) { try { lista = await (await fetch('http://127.0.0.1:9335/json')).json(); if (lista.find((t) => t.type === 'page')) break; } catch (_) {} await sleep(200); }
  const ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable');
  return { send, ev, cerrar: () => { try { ws.close(); } catch (_) {} try { execSync('taskkill /T /F /PID ' + ch.pid, { stdio: 'ignore' }); } catch (_) { ch.kill(); } } };
}

async function imprimir(nav) {
  const r = await nav.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
  return Buffer.from(r.result.data, 'base64');
}
const contarPaginas = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length;

// Cada capítulo (h1) empieza en página nueva: se imprime todo lo anterior a él y se cuentan las páginas.
async function numerarIndice(nav) {
  const n = await nav.ev(`document.querySelectorAll('h1[id]').length`);
  const pags = [];
  for (let i = 0; i < n; i++) {
    await nav.ev(`(()=>{const h=document.querySelectorAll('h1[id]')[${i}];let e=h;while(e){e.dataset.oculto=1;e.style.display='none';e=e.nextElementSibling;}})()`);
    pags.push(contarPaginas(await imprimir(nav)) + 1);
    await nav.ev(`document.querySelectorAll('[data-oculto]').forEach(e=>{e.style.display='';delete e.dataset.oculto;})`);
  }
  await nav.ev(`(()=>{const p=${JSON.stringify(pags)};document.querySelectorAll('h1[id]').forEach((h,i)=>{const s=document.querySelector('.indice a[href="#'+h.id+'"] small');if(s)s.textContent=p[i];});})()`);
  return pags;
}

(async () => {
  const nav = await navegador();
  try {
    for (const tipo of ['portada', 'pagina']) {
      await nav.send('Emulation.setDeviceMetricsOverride', { width: 1275, height: 1650, deviceScaleFactor: 2, mobile: false });
      await nav.send('Page.navigate', { url: url('fondos.html', '?tipo=' + tipo) }); await sleep(800);
      const s = await nav.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1275, height: 1650, scale: 1 } });
      fs.writeFileSync(path.join(__dirname, 'img', `fondo-${tipo}.png`), Buffer.from(s.result.data, 'base64'));
    }
    await nav.send('Emulation.clearDeviceMetricsOverride');
    await nav.send('Page.navigate', { url: url('manual.html') }); await sleep(3500);
    const rotas = await nav.ev(`[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src).join(', ')`);
    if (rotas) console.log('Imágenes que no cargaron:', rotas);
    const paginas = await numerarIndice(nav);
    const pdf = await imprimir(nav);
    fs.writeFileSync(SALIDA, pdf);
    console.log(`✓ PDF creado: ${SALIDA} · ${contarPaginas(pdf)} páginas · capítulos en: ${paginas.join(', ')}`);
  } finally { nav.cerrar(); }
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
