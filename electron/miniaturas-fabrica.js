// PK-PENTECOSTAL · Crea las miniaturas de los fondos de fábrica (fondos/ → fondos-miniaturas/).
// Uso:  npm run miniaturas      (ejecútelo cada vez que agregue o cambie imágenes o videos en fondos/)
// Así la galería de Fondos se ve completa apenas se abre el programa, sin esperar a que cargue cada video.
// La clave de cada miniatura es la misma que calcula server.js: sha1("<carpeta>/<archivo>|<tamaño>").
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const RAIZ = path.resolve(__dirname, '..');
const FONDOS = path.join(RAIZ, 'fondos');
const DEST = path.join(RAIZ, 'fondos-miniaturas');
const IMG = ['.jpg', '.jpeg', '.png', '.webp', '.gif'], VID = ['.mp4', '.webm'];
const clave = (rel, size) => crypto.createHash('sha1').update(rel + '|' + size).digest('hex').slice(0, 20);

function listar() {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (rel || e.name !== 'Subidos') walk(f, r); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!rel || (!IMG.includes(ext) && !VID.includes(ext))) continue;
      const size = fs.statSync(f).size;
      if (size > 95 * 1024 * 1024) continue; // los videos pesados no van en el programa
      out.push({ archivo: f, url: pathToFileURL(f).href, video: VID.includes(ext), clave: clave(r, size), rel: r });
    }
  };
  walk(FONDOS, '');
  return out;
}

const CAPTURA = `(async (url, video) => {
  const jpeg = (src, w0, h0) => { const w = 320, h = Math.max(1, Math.round(w * (h0 || 9) / (w0 || 16)));
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.74); };
  if (!video) return await new Promise((ok) => { const im = new Image(); im.onload = () => ok(jpeg(im, im.naturalWidth, im.naturalHeight)); im.onerror = () => ok(''); im.src = url; });
  return await new Promise((ok) => { const v = document.createElement('video'); v.muted = true; v.preload = 'auto';
    const t = setTimeout(() => ok(''), 30000);
    v.onloadedmetadata = () => { v.currentTime = Math.min(2, Math.max(0, v.duration - 0.1)); };
    v.onseeked = () => { clearTimeout(t); ok(jpeg(v, v.videoWidth, v.videoHeight)); v.removeAttribute('src'); v.load(); };
    v.onerror = () => { clearTimeout(t); ok(''); }; v.src = url; });
})`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false, offscreen: false } });
  await win.loadURL('data:text/html,<meta charset=utf-8><title>miniaturas</title>');
  fs.mkdirSync(DEST, { recursive: true });
  const lista = listar(), usadas = new Set();
  let nuevas = 0, fallos = 0;
  for (const f of lista) {
    usadas.add(f.clave + '.jpg');
    const dest = path.join(DEST, f.clave + '.jpg');
    if (fs.existsSync(dest)) continue;
    const dato = await win.webContents.executeJavaScript(`${CAPTURA}(${JSON.stringify(f.url)}, ${f.video})`);
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(dato || '');
    if (!m) { fallos++; console.log('  ✗ no se pudo:', f.rel); continue; }
    fs.writeFileSync(dest, Buffer.from(m[1], 'base64')); nuevas++;
    console.log('  ✓', f.rel);
  }
  // Borra miniaturas de fondos que ya no existen
  let borradas = 0;
  for (const n of fs.readdirSync(DEST)) if (n.endsWith('.jpg') && !usadas.has(n)) { fs.unlinkSync(path.join(DEST, n)); borradas++; }
  console.log(`\n  Miniaturas: ${lista.length} fondos · ${nuevas} nuevas · ${borradas} borradas · ${fallos} con error`);
  app.exit(fallos ? 1 : 0);
});
