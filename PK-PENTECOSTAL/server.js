// PK-PENTECOSTAL - servidor local (Node.js, sin dependencias externas)
// Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
// Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
// «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
// Reutiliza las carpetas biblias/, cancioneros/, fondos/ y css/font/ del Proyektor original.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const os = require('os');
const crypto = require('crypto');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const DATA_ROOT = path.resolve(APP_DIR, '..');
const DIRS = {
  biblias: path.join(DATA_ROOT, 'biblias'),
  cancioneros: path.join(DATA_ROOT, 'cancioneros'),
  fondos: path.join(DATA_ROOT, 'fondos'),
  fuentes: path.join(DATA_ROOT, 'css', 'font'),
};
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const PORT = Number(process.env.PORT) || 8888;
// Dirección propia del proyector (distinta del panel): http://proyector.localhost:8889/
const PORT_PROY = Number(process.env.PORT_PROYECTOR) || PORT + 1;
const APP_NOMBRE = 'PK-PENTECOSTAL';
const APP_VERSION = '1.0.0';
const ABRIR = process.argv.includes('--abrir');

if (parseInt(process.versions.node, 10) < 16) {
  console.error(`\n  ${APP_NOMBRE} necesita Node.js 16 o superior (tiene ${process.version}).\n  Descárguelo de https://nodejs.org\n`);
  process.exit(3);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.ico': 'image/x-icon',
};
const IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VID_EXT = ['.mp4', '.webm'];

// ---------------------------------------------------------------- Estado / configuración
const DEFAULT_STYLE = {
  // Pantalla completa (proyector / OBS a pantalla completa)
  fuente: 'Montserrat', peso: '800', interlineado: 1.18, tamMax: 96, color: '#ffffff', sombra: true, contorno: false,
  mayusculas: false, alineacion: 'center', negrita: true, margen: 8, posicionV: 0,
  // Resolución de la pantalla del proyector / LED ('auto' = la de la ventana) y ajuste de la imagen de fondo
  pantalla: '3200x1440', ajusteFondo: 'completa',
  refColor: '#ffffff', mostrarRef: true, oscurecerFondo: 15,
  fondo: { tipo: 'imagen', valor: '/fondos/IMAGENES/Bokeh%20verde.png' },
  transicion: 400,
  // Tercio inferior para OBS
  obs: {
    posicion: 'abajo', ancho: 90, altoMax: 30, tamMax: 54, fuente: 'Lato',
    color: '#ffffff', barra: true, barraColor: '#0b1a33', barraOpacidad: 82,
    acento: '#f5b301', refColor: '#f5b301', redondeo: 14, sombra: true, mayusculas: false,
    mostrarRef: true,
  },
};

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(extra || {})) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = deepMerge(base[k], v);
    else out[k] = v;
  }
  return out;
}

// Módulo OBS: overlay (rótulos) + banner
const DEFAULT_MODULO = {
  exclusivos: true,
  overlay: {
    plantilla: 'IPUC-Blanco', x: 0, y: 0, escala: 100, aparicion: 'progresivo',
    luces: { on: true, intensidad: 60, velocidad: 3 },
    fondo: { url: '', nombre: '' },
    temporizador: { on: false, segundos: 10 },
    borde: { on: true, color: '#ffffff', ancho: 3, radio: 10 },
    stinger: { on: false, color1: '#00d4ff', color2: '#ff2d55', duracion: 0.9 },
  },
  banner: {
    posicion: 'abajo', fuente: 'Lato', negrita: false, cursiva: false, tam: 46, alineacion: 'center',
    color: '#ffffff', colorCita: '#f5b301', opacidad: 100, espaciado: 0, interlineado: 125, subir: 0,
    alto: 260, margen: 40, colorFondo: '#0b1a33', difuminado: true, opacidadFondo: 75, oscurecer: 35, desenfoque: 4,
    transicion: 0.6, aparicion: 'progresivo', ejemplo: true, tamPreview: 100,
    fondo: { tipo: '', url: '', nombre: '' },
    efecto: { on: true, tipo: 'particulas', color: '#ffffff', opacidad: 60, velocidad: 40, intensidad: 50 },
  },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_ROTULOS = [
  { id: uid(), nombre: 'Nombres', subtitulo: 'IPUC Castilla', reloj: false, items: [
    ['Arnulfo Gomez', '#00bcd4'], ['Estefania Lopez', '#e91e63'], ['Jesus Muñoz', '#4caf50'], ['Juan Andrés Uribe', '#ff9800'],
    ['Juan Felipe', '#9c27b0'], ['Pastor Andres Perez', '#f44336'], ['Pedrito Perez', '#3f51b5'],
  ].map(([texto, color]) => ({ id: uid(), texto, sub: '', color })) },
  { id: uid(), nombre: 'Eventos', subtitulo: 'Programación', reloj: false, items: [
    ['Culto de Damas Dorcas', '#d81b60'], ['Culto de evangelismo', '#00897b'], ['Culto de Jovenes', '#5e35b1'],
    ['Dominical', '#1e88e5'], ['Escuela Dominical', '#f4511e'],
  ].map(([texto, color]) => ({ id: uid(), texto, sub: '', color })) },
  { id: uid(), nombre: 'Escuela Dominical', subtitulo: 'Participantes', reloj: false, items: [] },
];

const IDIOMAS = ['es', 'en-US', 'en-GB'];
let config = { estilo: DEFAULT_STYLE, historial: [], modulo: DEFAULT_MODULO, rotulos: DEFAULT_ROTULOS, idioma: 'es' };
try {
  const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  config = {
    estilo: deepMerge(DEFAULT_STYLE, saved.estilo || {}), historial: saved.historial || [],
    modulo: deepMerge(DEFAULT_MODULO, saved.modulo || {}),
    rotulos: Array.isArray(saved.rotulos) ? saved.rotulos : DEFAULT_ROTULOS,
    estilosVisor: saved.estilosVisor && typeof saved.estilosVisor === 'object' ? saved.estilosVisor : {},
    movil: saved.movil && /^[0-9a-f]{24}$/.test(saved.movil.clave) ? saved.movil : undefined,
    idioma: IDIOMAS.includes(saved.idioma) ? saved.idioma : 'es',
  };
} catch (_) { /* primera ejecución */ }
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- Celulares vinculados (QR)
// La clave viaja dentro del QR. Sin ella, otros equipos de la red solo pueden LEER (proyector, OBS),
// no cambiar nada. El propio computador nunca necesita clave.
const nuevaClave = () => crypto.randomBytes(12).toString('hex');
let claveNueva = false;
if (!config.movil) { config.movil = { clave: nuevaClave() }; claveNueva = true; }

// ---------------------------------------------------------------- Wi-Fi propio (zona móvil de Windows)
// Para lugares donde la red no deja que el celular vea al computador (hoteles, redes de invitados)
// o donde no hay Wi-Fi: el computador crea su propia red y el celular se une con un QR.
const ZONA_PS = path.join(APP_DIR, 'zona-wifi.ps1');
const ZONA_IP = '192.168.137.';
function claveWifi() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join('');
}
if (!config.movil.wifi || !config.movil.wifi.clave) { config.movil.wifi = { ssid: 'PK-PENTECOSTAL', clave: claveWifi() }; claveNueva = true; }
let zonaEncendidaPorNosotros = false;
let zonaCola = Promise.resolve();
function zona(accion, ...args) {
  const correr = () => new Promise((ok) => {
    if (process.platform !== 'win32') return ok({ ok: false, soportado: false, error: 'El Wi-Fi propio solo está disponible en Windows.' });
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ZONA_PS, accion, ...args],
      { timeout: 45000, windowsHide: true }, (err, out) => {
        const linea = String(out || '').trim().split(/\r?\n/).pop();
        try { ok(JSON.parse(linea)); } catch (_) { ok({ ok: false, soportado: false, error: err ? err.message : 'Respuesta inesperada de Windows' }); }
      });
  });
  const p = zonaCola.then(correr, correr);
  zonaCola = p;
  return p;
}
function apagarZonaAlSalir() {
  if (!zonaEncendidaPorNosotros || process.platform !== 'win32') return;
  const ant = config.movil.anterior || {};
  try {
    require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ZONA_PS, 'detener', ant.ssid || '', ant.clave || ''], { timeout: 20000, windowsHide: true });
    delete config.movil.anterior;
  } catch (_) { /* Windows la apagará sola al quedar sin uso */ }
}

// Guardado seguro: escribe a un archivo temporal y lo renombra (no se corrompe si se apaga el equipo)
let saveTimer = null, savePendiente = false;
function escribirConfig() {
  clearTimeout(saveTimer); savePendiente = false;
  try {
    const tmp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
    fs.renameSync(tmp, CONFIG_FILE);
  } catch (e) { console.error('No se pudo guardar la configuración:', e.message); }
}
function saveConfig() {
  clearTimeout(saveTimer); savePendiente = true;
  saveTimer = setTimeout(escribirConfig, 300);
}
function apagar(codigo = 0) {
  apagarZonaAlSalir();
  if (savePendiente || zonaEncendidaPorNosotros) escribirConfig();
  process.exit(codigo);
}
if (claveNueva) escribirConfig();
process.on('SIGINT', () => apagar(0));
process.on('SIGTERM', () => apagar(0));
process.on('SIGHUP', () => apagar(0));

// Lo que se ve en vivo
const state = {
  vivo: null,        // { tipo, titulo, texto, ref, id }
  negro: false,      // pantalla negra
  ocultarTexto: false,
  estilo: config.estilo,
  overlay: { visible: false, item: null, id: 0 },  // rótulo al aire
  banner: { visible: false },
  modulo: clone(config.modulo),                    // ajustes en edición (vista previa en vivo)
  moduloGuardado: true,
  rotulos: config.rotulos,
  idioma: config.idioma,
  version: 0,
};

// Reglas de convivencia overlay / banner y temporizador del rótulo
let overlayTimer = null;
function aplicarCapa(b) {
  const excl = state.modulo.exclusivos && state.modulo.banner.posicion === 'abajo';
  if (b.overlay) {
    if (b.overlay.item !== undefined) {
      const it = b.overlay.item;
      state.overlay.item = it ? { texto: String(it.texto || ''), sub: String(it.sub || ''), color: String(it.color || '#00bcd4'), grupo: String(it.grupo || ''), itemId: String(it.itemId || '') } : null;
      state.overlay.id = Date.now();
      if (it && b.overlay.visible === undefined) b.overlay.visible = true;
    }
    if (typeof b.overlay.visible === 'boolean') state.overlay.visible = b.overlay.visible && !!state.overlay.item;
    if (state.overlay.visible && excl) state.banner.visible = false;
    clearTimeout(overlayTimer);
    if (state.overlay.visible) {
      const g = state.rotulos.find((x) => x.id === state.overlay.item.grupo);
      const t = state.modulo.overlay.temporizador;
      if (t.on || (g && g.reloj)) {
        overlayTimer = setTimeout(() => { state.overlay.visible = false; broadcast(); }, Math.max(2, +t.segundos || 10) * 1000);
      }
    }
  }
  if (b.banner && typeof b.banner.visible === 'boolean') {
    state.banner.visible = b.banner.visible;
    if (state.banner.visible && excl) { state.overlay.visible = false; clearTimeout(overlayTimer); }
  }
}

// ---------------------------------------------------------------- SSE
// ---------------------------------------------------------------- Visores independientes
// Cada pestaña del panel controla su propio visor (1, 2, 3…): texto en vivo, pantalla negra y estilo/fondo
// propios. El visor 1 es el de siempre (celulares y OBS). Rótulos, banner e idioma son comunes.
const MAX_VISORES = 9;
if (!config.estilosVisor) config.estilosVisor = {};
const visores = new Map(); // n (2..9) -> { vivo, negro, ocultarTexto, estilo }
function visorDe(req, url) {
  const n = parseInt(url.searchParams.get('canal') || req.headers['x-pk-canal'] || '1', 10);
  return n >= 1 && n <= MAX_VISORES ? n : 1;
}
function visor(n) {
  if (n === 1) return state;
  if (!visores.has(n)) visores.set(n, { vivo: null, negro: false, ocultarTexto: false, estilo: deepMerge(DEFAULT_STYLE, config.estilosVisor[n] || config.estilo) });
  return visores.get(n);
}
function vista(n) {
  if (n === 1) return { ...state, visor: 1 };
  const v = visor(n);
  return { ...state, vivo: v.vivo, negro: v.negro, ocultarTexto: v.ocultarTexto, estilo: v.estilo, visor: n };
}

const clients = new Set();
function broadcast(evt = 'estado') {
  state.version++;
  if (!clients.size) return;
  const datos = new Map();
  for (const res of clients) {
    const n = res._visor || 1;
    if (!datos.has(n)) datos.set(n, `event: ${evt}\ndata: ${JSON.stringify(vista(n))}\n\n`);
    res.write(datos.get(n));
  }
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

// ---------------------------------------------------------------- Utilidades
function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}
function sendJSON(res, obj, code = 200) { send(res, code, JSON.stringify(obj)); }

// Las respuestas grandes (biblias, cancioneros) se comprimen UNA vez y se guardan en memoria.
const gzipCache = new Map();
function sendGzip(req, res, body, type, cacheKey) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let gz = cacheKey && gzipCache.get(cacheKey);
    if (!gz) { gz = zlib.gzipSync(buf); if (cacheKey) gzipCache.set(cacheKey, gz); }
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-cache' });
    res.end(gz);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(buf);
  }
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Evita salir de la carpeta permitida (path traversal)
function safeJoin(root, rel) {
  const p = path.resolve(root, '.' + path.sep + rel);
  if (p !== root && !p.startsWith(root + path.sep)) return null;
  return p;
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) { // necesario para videos
      const [s, e] = range.replace('bytes=', '').split('-');
      let start = parseInt(s, 10), end = e ? Math.min(parseInt(e, 10), st.size - 1) : st.size - 1;
      if (Number.isNaN(start)) { start = Math.max(0, st.size - (parseInt(e, 10) || 0)); end = st.size - 1; } // bytes=-N
      if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    const isApp = file.startsWith(PUBLIC_DIR);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': isApp ? 'no-cache' : 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
}

// ---------------------------------------------------------------- Biblias (.bi = zip con un archivo de texto)
function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf; // texto plano
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP sin directorio central');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOff = buf.readUInt32LE(cdOffset + 42);
  const nameLen = buf.readUInt16LE(localOff + 26);
  const extraLen = buf.readUInt16LE(localOff + 28);
  const start = localOff + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error('Compresión ZIP no soportada: ' + method);
}

const bibleCache = new Map();
function listBibles() {
  try {
    return fs.readdirSync(DIRS.biblias).filter((f) => /\.(bi|txt)$/i.test(f)).map((f) => f.replace(/\.(bi|txt)$/i, '')).sort();
  } catch (_) { return []; }
}
function loadBible(name) {
  if (bibleCache.has(name)) return bibleCache.get(name);
  const file = ['.bi', '.txt'].map((e) => path.join(DIRS.biblias, name + e)).find((f) => fs.existsSync(f));
  if (!file || path.dirname(file) !== DIRS.biblias) return null;
  const text = unzipFirst(fs.readFileSync(file)).toString('utf8').replace(/^﻿/, '');
  bibleCache.set(name, text);
  return text;
}

// ---------------------------------------------------------------- Cancioneros (.js: var jscanciones=[...])
function listSongbooks() {
  try { return fs.readdirSync(DIRS.cancioneros).filter((f) => /\.js$/i.test(f)).map((f) => f.replace(/\.js$/i, '')).sort(); } catch (_) { return []; }
}
function songbookPath(name) {
  const f = path.join(DIRS.cancioneros, name + '.js');
  return path.dirname(f) === DIRS.cancioneros ? f : null;
}
// Traducciones al inglés: cancioneros/traducciones/<cancionero>.en.json = { id: { ti, le } }
// (archivo aparte: los cancioneros originales no se tocan)
function tradPath(name) {
  const dir = path.join(DIRS.cancioneros, 'traducciones');
  const f = path.join(dir, name + '.en.json');
  return path.dirname(f) === dir ? f : null;
}
function leerTraducciones(name) {
  const f = tradPath(name);
  try { return f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')) : {}; } catch (_) { return {}; }
}
function escribirTraducciones(name, tr) {
  const f = tradPath(name);
  if (!f) return;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(tr, null, 1), 'utf8');
  songbookCache.delete(name); gzipCache.delete('cancionero:' + name);
}
function guardarTraduccion(name, id, ti, le, auto = false) {
  const tr = leerTraducciones(name);
  if (String(le || '').trim()) tr[id] = { ti: String(ti || '').trim(), le: String(le).replace(/\r\n?/g, '\n'), ...(auto ? { auto: true } : {}) };
  else delete tr[id];
  escribirTraducciones(name, tr);
}

// ---------------------------------------------------------------- Traductor automático (sin internet)
// Carpeta traductor/: modelo abierto español→inglés. Las traducciones hechas a mano tienen prioridad;
// el traductor solo rellena las canciones que no tienen traducción y las marca como "auto".
let MOTOR;
function motor() {
  if (MOTOR === undefined) {
    try { MOTOR = require(path.join(APP_DIR, 'traductor', 'motor.js')); if (!MOTOR.disponible()) MOTOR = null; } catch (_) { MOTOR = null; }
  }
  return MOTOR;
}
const TRAD = { activo: false, total: 0, hechas: 0, actual: '', error: '', fin: 0, cancelar: false };
async function traducirTodo() {
  const m = motor();
  if (!m) throw new Error('El traductor automático no está instalado');
  Object.assign(TRAD, { activo: true, total: 0, hechas: 0, actual: 'Preparando el traductor…', error: '', cancelar: false });
  try {
    await m.cargar();
    const pend = [];
    for (const libro of listSongbooks()) {
      const tr = leerTraducciones(libro);
      for (const s of loadSongbook(libro) || []) if (!(tr[s.id] && tr[s.id].le)) pend.push([libro, s]);
    }
    TRAD.total = pend.length;
    let libroAct = null, tr = null, sinGuardar = 0;
    const guardar = () => { if (libroAct && sinGuardar) { escribirTraducciones(libroAct, tr); sinGuardar = 0; } };
    for (const [libro, s] of pend) {
      if (TRAD.cancelar) break;
      if (libro !== libroAct) { guardar(); libroAct = libro; tr = leerTraducciones(libro); }
      TRAD.actual = libro + ' · ' + s.ti;
      try {
        const ti = await m.titulo(s.ti);
        const le = await m.letra(s.le);
        if (!(tr[s.id] && tr[s.id].le)) { tr[s.id] = { ti, le, auto: true }; sinGuardar++; }
      } catch (e) { /* una canción con problemas no detiene las demás */ }
      TRAD.hechas++;
      if (sinGuardar >= 15) guardar();
    }
    guardar();
  } catch (e) { TRAD.error = e.message; }
  finally { TRAD.activo = false; TRAD.actual = ''; TRAD.fin = Date.now(); broadcast(); }
}
// Traduce en segundo plano una canción recién guardada sin traducción
function traducirCancionLuego(name, song) {
  const m = motor();
  if (!m || TRAD.activo) return;
  (async () => {
    try {
      const tr = leerTraducciones(name);
      if (tr[song.id] && tr[song.id].le) return;
      guardarTraduccion(name, song.id, await m.titulo(song.ti), await m.letra(song.le), true);
      broadcast();
    } catch (_) { /* sin traducción automática */ }
  })();
}
const songbookCache = new Map(); // nombre -> { mtime, json } (se relee solo si el archivo o su traducción cambió)
function loadSongbookCached(name) {
  const f = songbookPath(name);
  if (!f || !fs.existsSync(f)) return null;
  const tf = tradPath(name);
  const mtime = fs.statSync(f).mtimeMs + '|' + (tf && fs.existsSync(tf) ? fs.statSync(tf).mtimeMs : 0);
  const c = songbookCache.get(name);
  if (c && c.mtime === mtime) return c;
  const songs = loadSongbook(name);
  if (!songs) return null;
  const entry = { mtime, json: JSON.stringify(songs) };
  songbookCache.set(name, entry);
  gzipCache.delete('cancionero:' + name);
  return entry;
}
function loadSongbook(name) {
  const f = songbookPath(name);
  if (!f || !fs.existsSync(f)) return null;
  const code = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
  const ctx = vm.createContext({});
  vm.runInContext(code + '\n;this.__r = (typeof jscanciones !== "undefined") ? jscanciones : [];', ctx, { timeout: 2000 });
  const arr = Array.isArray(ctx.__r) ? ctx.__r : [];
  const tr = leerTraducciones(name);
  return arr.filter((s) => s && typeof s === 'object').map((s) => {
    const id = String(s.id ?? ''), t = tr[id];
    return {
      id, ti: String(s.ti ?? ''), le: String(s.le ?? '').replace(/\r\n?/g, '\n'),
      tono: String(s.tono ?? ''), estilo: String(s.estilo ?? '0'),
      ...(t && t.le ? { tien: String(t.ti || ''), leen: String(t.le), ...(t.auto ? { enauto: true } : {}) } : {}),
    };
  });
}
function saveSongbook(name, songs) {
  const f = songbookPath(name);
  if (!f) throw new Error('Nombre inválido');
  if (fs.existsSync(f)) {
    const bak = path.join(APP_DIR, 'respaldos');
    fs.mkdirSync(bak, { recursive: true });
    fs.copyFileSync(f, path.join(bak, `${name}.${Date.now()}.js`));
  }
  const body = 'var jscanciones=[\n' + songs.map((s) => JSON.stringify({ id: s.id, ti: s.ti, tono: s.tono || '', estilo: s.estilo || '0', le: s.le })).join(',\n') + '\n]\n';
  fs.writeFileSync(f, body, 'utf8');
  songbookCache.delete(name); gzipCache.delete('cancionero:' + name);
}

// ---------------------------------------------------------------- Fondos
function listBackgrounds() {
  const out = [];
  let cats = [];
  try { cats = fs.readdirSync(DIRS.fondos, { withFileTypes: true }); } catch (_) { return out; }
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), rel + '/' + e.name);
      else {
        const ext = path.extname(e.name).toLowerCase();
        if (IMG_EXT.includes(ext) || VID_EXT.includes(ext)) {
          out.push({ categoria: rel.split('/')[1] || 'General', nombre: e.name, url: '/fondos' + rel + '/' + encodeURIComponent(e.name), tipo: VID_EXT.includes(ext) ? 'video' : 'imagen' });
        }
      }
    }
  };
  for (const c of cats) {
    if (c.isDirectory()) walk(path.join(DIRS.fondos, c.name), '/' + encodeURIComponent(c.name));
  }
  return out.map((b) => ({ ...b, categoria: decodeURIComponent(b.categoria) }));
}

// ---------------------------------------------------------------- Fuentes
function buildFontsCss() {
  let css = ''; const families = new Set();
  try {
    for (const d of fs.readdirSync(DIRS.fuentes, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for (const f of fs.readdirSync(path.join(DIRS.fuentes, d.name))) {
        if (!f.endsWith('.css')) continue;
        // Los CSS originales tienen llaves mal cerradas: se re-generan las @font-face limpias.
        const txt = fs.readFileSync(path.join(DIRS.fuentes, d.name, f), 'utf8');
        for (const block of txt.split('@font-face').slice(1)) {
          const fam = (block.match(/font-family:\s*['"]?([^;'"\n]+)/) || [])[1];
          const url = (block.match(/url\((['"]?)([^)'"]+)\1\)/) || [])[2];
          if (!fam || !url || /^(https?:|data:|\/)/.test(url)) continue;
          const weight = (block.match(/font-weight:\s*(\d+)/) || [])[1] || '400';
          const style = /font-style:\s*italic/i.test(block) ? 'italic' : 'normal';
          families.add(fam.trim());
          css += `@font-face{font-family:'${fam.trim()}';font-style:${style};font-weight:${weight};font-display:block;src:url("/fuentes/${encodeURIComponent(d.name)}/${encodeURIComponent(url)}");}\n`;
        }
      }
    }
  } catch (_) { /* sin fuentes */ }
  return { css, families: [...families].sort() };
}
const FONTS = buildFontsCss();

// ---------------------------------------------------------------- Rutas
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  // --- Celular: vinculación por QR
  const equipo = esEquipo(req);
  const claveOk = equipo || claveValida(req.headers['x-pk-clave']);
  if (p.startsWith('/api/') && req.method !== 'GET' && req.method !== 'HEAD' && !claveOk) {
    return sendJSON(res, { error: 'Este teléfono no está vinculado. Escanee el código QR del panel del computador.', vincular: true }, 403);
  }
  if (p === '/api/movil/estado') return sendJSON(res, { equipo, vinculado: claveOk });
  if (p === '/api/movil') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    const redes = redesLocales().filter((r) => !r.ip.startsWith(ZONA_IP));
    return sendJSON(res, { clave: config.movil.clave, ips: redes.map((r) => r.ip), redes, puerto: PORT, sistema: process.platform, wifi: config.movil.wifi });
  }
  if (p === '/api/movil/wifi') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    let r;
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.encender) {
        r = await zona('iniciar', config.movil.wifi.ssid, config.movil.wifi.clave);
        if (r.ok) {
          zonaEncendidaPorNosotros = true;
          if (r.anterior && r.anterior.ssid && !config.movil.anterior) { config.movil.anterior = r.anterior; escribirConfig(); }
        }
      } else {
        const ant = config.movil.anterior || {};
        r = await zona('detener', ant.ssid || '', ant.clave || '');
        if (r.ok) { zonaEncendidaPorNosotros = false; delete config.movil.anterior; escribirConfig(); }
      }
    } else r = await zona('estado');
    if (r.ok && r.activo && !r.ip) r.ip = localIPs().find((ip) => ip.startsWith(ZONA_IP)) || null;
    delete r.anterior;
    return sendJSON(res, { ...r, wifi: config.movil.wifi, puerto: PORT });
  }
  if (p === '/api/movil/renovar' && req.method === 'POST') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    config.movil = { clave: nuevaClave() }; escribirConfig();
    return sendJSON(res, { ok: true, clave: config.movil.clave });
  }

  // --- API
  if (p === '/api/eventos') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res._visor = visorDe(req, url);
    res.write(`retry: 1500\nevent: estado\ndata: ${JSON.stringify(vista(res._visor))}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/estado' && req.method === 'GET') return sendJSON(res, vista(visorDe(req, url)));
  if (p === '/api/idioma') {
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!IDIOMAS.includes(b.idioma)) return sendJSON(res, { error: 'Formato inválido' }, 400);
      config.idioma = state.idioma = b.idioma; saveConfig(); broadcast();
    }
    return sendJSON(res, { idioma: config.idioma });
  }
  if (p === '/api/vivo' && req.method === 'POST') {
    const b = await readBody(req);
    const v = visor(visorDe(req, url));
    if (b.vivo === null) v.vivo = null;
    else if (b.vivo) {
      v.vivo = { tipo: String(b.vivo.tipo || 'texto'), titulo: String(b.vivo.titulo || ''), texto: String(b.vivo.texto || ''), ref: String(b.vivo.ref || ''), id: Date.now() };
      v.ocultarTexto = false;
      if (b.vivo.tipo === 'biblia' && b.vivo.ref) {
        config.historial = [{ ref: b.vivo.ref, texto: b.vivo.texto, t: Date.now() }, ...config.historial.filter((h) => h.ref !== b.vivo.ref)].slice(0, 60);
        saveConfig();
      }
    }
    if (typeof b.negro === 'boolean') v.negro = b.negro;
    if (typeof b.ocultarTexto === 'boolean') v.ocultarTexto = b.ocultarTexto;
    broadcast();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/estilo' && req.method === 'POST') {
    const b = await readBody(req);
    const n = visorDe(req, url);
    if (n === 1) {
      if (b.reset) config.estilo = JSON.parse(JSON.stringify(DEFAULT_STYLE));
      else config.estilo = deepMerge(config.estilo, b);
      state.estilo = config.estilo;
    } else {
      const v = visor(n);
      v.estilo = b.reset ? clone(DEFAULT_STYLE) : deepMerge(v.estilo, b);
      config.estilosVisor[n] = v.estilo;
    }
    saveConfig();
    broadcast();
    return sendJSON(res, { ok: true, estilo: visor(n).estilo });
  }
  if (p === '/api/historial') {
    if (req.method === 'DELETE') { config.historial = []; saveConfig(); }
    return sendJSON(res, config.historial);
  }
  // --- Módulo OBS: overlay / banner
  if (p === '/api/capa' && req.method === 'POST') {
    aplicarCapa(await readBody(req));
    broadcast();
    return sendJSON(res, { ok: true, overlay: state.overlay, banner: state.banner });
  }
  if (p === '/api/modulo' && req.method === 'POST') {
    state.modulo = deepMerge(state.modulo, await readBody(req));
    state.moduloGuardado = JSON.stringify(state.modulo) === JSON.stringify(config.modulo);
    broadcast();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/modulo/guardar' && req.method === 'POST') {
    config.modulo = clone(state.modulo); state.moduloGuardado = true; saveConfig(); broadcast();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/modulo/restaurar' && req.method === 'POST') {
    const b = await readBody(req);
    state.modulo = clone(b.defecto ? DEFAULT_MODULO : config.modulo);
    state.moduloGuardado = JSON.stringify(state.modulo) === JSON.stringify(config.modulo);
    broadcast();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/rotulos' && req.method === 'PUT') {
    const b = await readBody(req);
    if (!Array.isArray(b)) return sendJSON(res, { error: 'Formato inválido' }, 400);
    const s = (v, n = 200) => String(v ?? '').slice(0, n);
    const col = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : '#00bcd4');
    config.rotulos = state.rotulos = b.map((g) => ({
      id: s(g.id, 20) || uid(), nombre: s(g.nombre, 80), subtitulo: s(g.subtitulo, 120), reloj: !!g.reloj,
      items: (Array.isArray(g.items) ? g.items : []).map((i) => ({ id: s(i.id, 20) || uid(), texto: s(i.texto), sub: s(i.sub), color: col(i.color) })),
    }));
    saveConfig(); broadcast();
    return sendJSON(res, { ok: true, rotulos: state.rotulos });
  }
  if (p === '/api/subir' && req.method === 'PUT') { // subida de imágenes/videos a fondos/Subidos
    const nombre = path.basename(url.searchParams.get('nombre') || '').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_');
    const ext = path.extname(nombre).toLowerCase();
    if (!nombre || ![...IMG_EXT, ...VID_EXT].includes(ext)) return sendJSON(res, { error: 'Solo imágenes (.jpg .png .webp .gif) o videos (.mp4 .webm)' }, 400);
    const dir = path.join(DIRS.fondos, 'Subidos');
    fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, nombre), n = 1;
    while (fs.existsSync(dest)) dest = path.join(dir, `${path.basename(nombre, ext)} (${n++})${ext}`);
    const ws = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1024 * 1024 * 1024) { req.destroy(); ws.destroy(); fs.unlink(dest, () => {}); } });
    req.pipe(ws);
    ws.on('finish', () => sendJSON(res, { ok: true, url: '/fondos/Subidos/' + encodeURIComponent(path.basename(dest)), nombre: path.basename(dest), tipo: VID_EXT.includes(ext) ? 'video' : 'imagen' }));
    ws.on('error', (e) => sendJSON(res, { error: e.message }, 500));
    return;
  }
  if (p === '/api/fondo' && req.method === 'DELETE') {
    const u = url.searchParams.get('url') || '';
    const f = u.startsWith('/fondos/') ? safeJoin(DIRS.fondos, decodeURIComponent(u.slice(8))) : null;
    if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) return sendJSON(res, { error: 'Archivo no encontrado' }, 404);
    fs.unlinkSync(f);
    return sendJSON(res, { ok: true });
  }

  // --- Traductor automático de canciones
  if (p === '/api/traducir/estado') return sendJSON(res, { ...TRAD, disponible: !!motor() });
  if (p === '/api/traducir/todo' && req.method === 'POST') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    if (!motor()) return sendJSON(res, { error: 'El traductor automático no está instalado' }, 400);
    if (!TRAD.activo) traducirTodo();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/traducir/cancelar' && req.method === 'POST') { TRAD.cancelar = true; return sendJSON(res, { ok: true }); }
  if (p === '/api/traducir/texto' && req.method === 'POST') {
    const m = motor();
    if (!m) return sendJSON(res, { error: 'El traductor automático no está instalado' }, 400);
    const b = await readBody(req);
    return sendJSON(res, { ti: b.ti ? await m.titulo(b.ti) : '', le: b.le ? await m.letra(b.le) : '' });
  }
  if (p === '/api/biblias') return sendJSON(res, listBibles());
  if (p.startsWith('/api/biblia/')) {
    const text = loadBible(p.slice('/api/biblia/'.length));
    if (text == null) return send(res, 404, '{"error":"Biblia no encontrada"}');
    return sendGzip(req, res, text, 'text/plain; charset=utf-8', 'biblia:' + p);
  }
  if (p === '/api/cancioneros') return sendJSON(res, listSongbooks());
  if (p.startsWith('/api/cancionero/')) {
    const name = p.slice('/api/cancionero/'.length);
    if (req.method === 'GET') {
      try {
        const c = loadSongbookCached(name);
        if (!c) return send(res, 404, '{"error":"Cancionero no encontrado"}');
        return sendGzip(req, res, c.json, 'application/json; charset=utf-8', 'cancionero:' + name);
      } catch (e) { return sendJSON(res, { error: 'No se pudo leer el cancionero: ' + e.message }, 500); }
    }
    if (req.method === 'POST') { // guardar / crear canción
      const b = await readBody(req);
      if (!b.ti || !b.le) return sendJSON(res, { error: 'Falta título o letra' }, 400);
      const songs = loadSongbook(name) || [];
      const song = { id: String(b.id || ''), ti: String(b.ti).trim(), le: String(b.le).replace(/\r\n?/g, '\n'), tono: String(b.tono || ''), estilo: String(b.estilo || '0') };
      const i = song.id ? songs.findIndex((s) => s.id === song.id) : -1;
      if (i >= 0) songs[i] = song;
      else { song.id = String(songs.reduce((m, s) => Math.max(m, parseInt(s.id, 10) || 0), 0) + 1); songs.push(song); }
      saveSongbook(name, songs);
      if (b.leen !== undefined) guardarTraduccion(name, song.id, b.tien, b.leen, !!b.enauto);
      if (!String(b.leen || '').trim()) traducirCancionLuego(name, song);
      return sendJSON(res, { ok: true, cancion: song });
    }
    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      const songs = (loadSongbook(name) || []).filter((s) => s.id !== id);
      saveSongbook(name, songs);
      return sendJSON(res, { ok: true });
    }
  }
  if (p === '/api/fondos') return sendJSON(res, listBackgrounds());
  if (p === '/api/fuentes') return sendJSON(res, FONTS.families);
  if (p === '/api/pantallas' && req.method === 'POST') {
    // Extender = el proyector muestra solo la salida · Duplicar = muestra lo mismo que el computador
    if (!esEquipo(req)) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    if (process.platform !== 'win32') return sendJSON(res, { error: 'Solo disponible en Windows. Use la configuración de pantallas del sistema.' }, 400);
    const b = await readBody(req);
    const modo = { extender: '/extend', duplicar: '/clone' }[b.modo];
    if (!modo) return sendJSON(res, { error: 'Modo inválido' }, 400);
    const { spawn } = require('child_process');
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'DisplaySwitch.exe');
    try { spawn(exe, [modo], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref(); }
    catch (e) { return sendJSON(res, { error: e.message }, 500); }
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/info') return sendJSON(res, { app: APP_NOMBRE, version: APP_VERSION, puertoProyector: PORT_PROY, autor: 'Hecho por Sebastian Lopez · IPUC Natania 6° Etapa', zona: 'Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina', puerto: PORT, ips: localIPs(), sistema: process.platform });
  if (p === '/api/apagar' && req.method === 'POST') {
    // Solo desde este mismo equipo (no desde celulares/tabletas de la red)
    if (!esEquipo(req)) return sendJSON(res, { error: 'Solo se puede cerrar desde el equipo donde corre el programa' }, 403);
    sendJSON(res, { ok: true });
    console.log('\n   Programa cerrado desde el panel.\n');
    setTimeout(() => apagar(0), 300);
    return;
  }
  if (p === '/favicon.ico') return serveFile(req, res, path.join(APP_DIR, 'pk-pentecostal.ico'));
  if (p === '/fuentes.css') return send(res, 200, FONTS.css, 'text/css; charset=utf-8');

  // --- Archivos
  if (p.startsWith('/fondos/')) { const f = safeJoin(DIRS.fondos, p.slice(8)); return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain'); }
  if (p.startsWith('/fuentes/')) { const f = safeJoin(DIRS.fuentes, p.slice(9)); return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain'); }
  if (p === '/' || p === '/control') return serveFile(req, res, path.join(PUBLIC_DIR, 'control.html'));
  if (p === '/salida' || p === '/proyector' || /^\/(visor|proyector)\/[1-9]$/.test(p) || p === '/obs' || p === '/pantalla' || p === '/chroma') return serveFile(req, res, path.join(PUBLIC_DIR, 'salida.html'));
  if (p === '/capa' || p === '/overlay' || p === '/banner') return serveFile(req, res, path.join(PUBLIC_DIR, 'capa.html'));
  const f = safeJoin(PUBLIC_DIR, p);
  return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain');
}

function esLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
// ¿La petición viene de este mismo computador (localhost o una de sus propias IPs)?
function esEquipo(req) {
  if (process.env.PK_TEST_REMOTO === '1') return false; // solo para pruebas automáticas
  if (esLocal(req)) return true;
  const a = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return localIPs().includes(a);
}
function claveValida(c) {
  const a = Buffer.from(String(c || '')), b = Buffer.from(config.movil.clave);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Abre el navegador predeterminado en Windows, macOS o Linux
function abrirNavegador(url) {
  const { spawn } = require('child_process');
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    const ch = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' });
    ch.on('error', () => console.log(`   Abra manualmente en su navegador: ${url}`));
    ch.unref();
  } catch (_) { console.log(`   Abra manualmente en su navegador: ${url}`); }
}

// IPs de este equipo en la red. Primero el Wi-Fi / cable real; al final adaptadores virtuales
// (VirtualBox, VMware, Hyper-V, WSL, VPN), que un celular no puede alcanzar.
function redesLocales() {
  const VIRTUAL_MAC = /^(0a:00:27|08:00:27|00:50:56|00:0c:29|00:05:69|00:1c:14|00:15:5d|00:03:ff)/i;
  const VIRTUAL_NOM = /virtual|vbox|vmware|vethernet|hyper-v|wsl|docker|vpn|tailscale|zerotier|hamachi|bluetooth/i;
  const lista = [];
  for (const [nombre, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || i.address.startsWith('169.254.')) continue;
      let puntos = 0;
      if (/wi-?fi|wlan|wireless|inal/i.test(nombre)) puntos += 2;
      if (VIRTUAL_MAC.test(i.mac || '') || VIRTUAL_NOM.test(nombre) || i.address.startsWith('192.168.56.')) puntos -= 5;
      lista.push({ ip: i.address, nombre, puntos });
    }
  }
  return lista.sort((a, b) => b.puntos - a.puntos).map(({ ip, nombre }) => ({ ip, nombre }));
}
function localIPs() { return redesLocales().map((r) => r.ip); }

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) sendJSON(res, { error: e.message }, 500); });
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    // ¿Ya está abierto PK-PENTECOSTAL? Entonces solo abrimos el panel.
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/info', timeout: 2000 }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => {
        let info = null; try { info = JSON.parse(d); } catch (_) { /* no es nuestro */ }
        if (info && info.app === APP_NOMBRE) {
          console.log(`\n   ${APP_NOMBRE} ya estaba abierto. Abriendo el panel…\n`);
          if (ABRIR) abrirNavegador(`http://localhost:${PORT}/`);
          process.exit(0);
        }
        errorPuerto();
      });
    }).on('error', errorPuerto).on('timeout', errorPuerto);
    return;
  }
  throw e;
});
function errorPuerto() {
  console.error(`\n  El puerto ${PORT} está ocupado por otro programa (¿el Proyektor original?).\n  Ciérrelo e intente de nuevo.\n`);
  process.exit(2);
}
// Servidor exclusivo del proyector: otra dirección y otro puerto, solo muestra la salida.
const serverProy = http.createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p === '/' || p === '/control' || p === '/index.html') { res.writeHead(302, { Location: '/proyector' }); return res.end(); }
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) sendJSON(res, { error: e.message }, 500); });
});
serverProy.on('error', (e) => console.error(`
   Aviso: no se pudo abrir la dirección del proyector (puerto ${PORT_PROY}): ${e.code || e.message}
`));
server.listen(PORT, '0.0.0.0', () => {
  serverProy.listen(PORT_PROY, '0.0.0.0');
  const en = String(config.idioma).startsWith('en');
  const T = (es, ing) => (en ? ing : es);
  console.log('\n  ==============================================');
  console.log(T('   PK-PENTECOSTAL  -  Biblia y Canciones en vivo', '   PK-PENTECOSTAL  -  Bible and Songs, live'));
  console.log('  ==============================================');
  console.log(T('   Panel de control : ', '   Control panel     : ') + `http://localhost:${PORT}/`);
  console.log(T('   OBS (tercio inf.) : ', '   OBS (lower third) : ') + `http://localhost:${PORT}/salida?modo=obs`);
  console.log(T('   OBS (pantalla)    : ', '   OBS (full screen) : ') + `http://localhost:${PORT}/salida?modo=pantalla`);
  console.log(T('   Proyector (F11)   : ', '   Projector (F11)   : ') + `http://proyector.localhost:${PORT_PROY}/`);
  console.log(T('   OBS rótulos+banner: ', '   OBS tags+banner   : ') + `http://localhost:${PORT}/capa`);
  for (const ip of localIPs()) console.log(T('   En la red local   : ', '   On local network  : ') + `http://${ip}:${PORT}/`);
  console.log(T('   Celular           : botón 📱 "Conectar celular" del panel (código QR)', '   Phone             : 📱 "Connect phone" button on the panel (QR code)'));
  console.log(T('\n   Deje esta ventana abierta mientras use el programa.', '\n   Keep this window open while using the program.'));
  console.log('  ----------------------------------------------');
  console.log(T('   Hecho por Sebastian Lopez · IPUC Natania 6° Etapa', '   Made by Sebastian Lopez · IPUC Natania 6th Stage'));
  console.log(T('   Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina', '   Special Missionary Zone – Archipelago of San Andrés, Providencia and Santa Catalina'));
  console.log(T('   «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4\n', '   “Their line is gone out through all the earth, and their words to the end of the world.” Psalm 19:4\n'));
  if (ABRIR) abrirNavegador(`http://localhost:${PORT}/`);
});
