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
const OBS_DIR = path.join(APP_DIR, 'obs');           // módulo OBS: código (panel, capa, stingers)
// Dos raíces:
//  · RES_ROOT  = contenido de fábrica (biblias, fondos, fuentes, cancioneros iniciales). En la versión
//                instalada (PK-PENTECOSTAL.exe) es de solo lectura.
//  · DATA_ROOT = datos del usuario (BSPK, cancioneros editados, biblioteca OBS). En la versión instalada
//                vive en %APPDATA%\PK-PENTECOSTAL (o junto al .exe portable); desde el código fuente es
//                la misma carpeta de siempre, así que todo sigue funcionando igual que antes.
const RES_ROOT = path.resolve(APP_DIR, '..');
const DATA_ROOT = process.env.PK_DATA_ROOT ? path.resolve(process.env.PK_DATA_ROOT) : RES_ROOT;
const DATOS_APARTE = DATA_ROOT !== RES_ROOT;
const OBS_DATA = DATOS_APARTE ? path.join(DATA_ROOT, 'obs') : OBS_DIR; // stingers.json, laterales, overlays, biblioteca
const DIRS = {
  biblias: path.join(RES_ROOT, 'biblias'),
  cancioneros: path.join(DATA_ROOT, 'cancioneros'),
  fondos: path.join(RES_ROOT, 'fondos'),
  fuentes: path.join(DATA_ROOT, 'css', 'font'),       // aquí se instalan las fuentes importadas
  fuentesFabrica: path.join(RES_ROOT, 'css', 'font'),
};
const PORT_PREFERIDO = Number(process.env.PORT) || 8888;
let PORT = PORT_PREFERIDO; // puede cambiar si 8888 lo usa otro programa (ver iniciarServidor)
const EN_ELECTRON = !!process.parentPort || process.env.PK_ELECTRON === '1';

// ---------------------------------------------------------------- Carpeta BSPK (privada)
// Todo lo propio de esta instalación (ajustes y claves, stingers, respaldos, fondos subidos, traductor)
// vive en BSPK/, al lado de PK-PENTECOSTAL/. Esa carpeta no se sube a GitHub.
const BSPK = path.join(DATA_ROOT, 'BSPK');
const PRIV = {
  config: path.join(BSPK, 'config.json'),
  obs: path.join(BSPK, 'obs'),       // solo para mudar instalaciones anteriores
  respaldos: path.join(BSPK, 'respaldos'),
  fondos: path.join(BSPK, 'fondos'),
  miniaturas: path.join(BSPK, 'miniaturas'), // miniaturas de fondos generadas en este equipo
  logs: path.join(BSPK, 'logs'),
  puerto: path.join(BSPK, 'puerto.json'), // puerto en uso (lo leen PK-PENTECOSTAL.vbs y la app de escritorio)
};
// Se declara aquí arriba (antes de cualquier guardado): antes estaba más abajo y en la primera ejecución
// escribirConfig() la leía antes de existir → "Cannot access 'guardadoBloqueado' before initialization".
let guardadoBloqueado = false; // tras importar un respaldo, la configuración en memoria ya no debe pisar la importada

// ¿Ya hay otro PK-PENTECOSTAL abierto en el puerto preferido? (entonces no se mueve nada).
// Síncrono a propósito: corre antes de leer la configuración. Antes se llamaba igual que la función
// asíncrona puertoOcupado(host, puerto) de más abajo, que la reemplazaba y devolvía siempre una Promise
// (verdadera) → la mudanza a BSPK nunca se hacía.
function otraInstanciaAbierta() {
  try {
    require('child_process').execFileSync(process.execPath, ['-e',
      `const s=require('net').connect(${PORT_PREFERIDO},'127.0.0.1');s.on('connect',()=>process.exit(1));s.on('error',()=>process.exit(0));setTimeout(()=>process.exit(0),800)`],
      { stdio: 'ignore', timeout: 3000, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    return false;
  } catch (_) { return true; }
}

// Contenido de fábrica que el usuario puede editar (cancioneros, biblioteca OBS): cuando los datos viven
// aparte, se copia UNA vez lo que falte. Nunca se reemplaza un archivo que ya exista.
function sembrar(origen, destino) {
  let lista = [];
  try { lista = fs.readdirSync(origen, { withFileTypes: true }); } catch (_) { return; }
  fs.mkdirSync(destino, { recursive: true });
  for (const e of lista) {
    const a = path.join(origen, e.name), b = path.join(destino, e.name);
    if (e.isDirectory()) sembrar(a, b);
    else if (e.isFile() && !fs.existsSync(b)) { try { fs.copyFileSync(a, b); } catch (_) { /* se intenta la próxima vez */ } }
  }
}
if (DATOS_APARTE) {
  sembrar(path.join(RES_ROOT, 'cancioneros'), DIRS.cancioneros);
  sembrar(path.join(OBS_DIR, 'biblioteca'), path.join(OBS_DATA, 'biblioteca'));
}
// Mueve un archivo o carpeta; si el destino ya existe, mezcla lo que falte
function mover(origen, destino) {
  if (!fs.existsSync(origen)) return;
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  if (!fs.existsSync(destino)) {
    try { fs.renameSync(origen, destino); return; }
    catch (e) { if (!fs.cpSync) throw e; fs.cpSync(origen, destino, { recursive: true }); fs.rmSync(origen, { recursive: true, force: true }); return; }
  }
  if (fs.statSync(origen).isDirectory()) {
    for (const n of fs.readdirSync(origen)) mover(path.join(origen, n), path.join(destino, n));
    try { fs.rmdirSync(origen); } catch (_) { /* quedó algo repetido */ }
  }
}
function migrarABSPK() {
  const TRAD = path.join(APP_DIR, 'traductor'), TRAD_B = path.join(BSPK, 'traductor');
  const lista = [
    [path.join(APP_DIR, 'config.json'), PRIV.config],
    [path.join(APP_DIR, 'respaldos'), PRIV.respaldos],
    [path.join(APP_DIR, 'respaldo-logo-anterior'), path.join(PRIV.respaldos, 'respaldo-logo-anterior')],
    [path.join(DIRS.fondos, 'Subidos'), path.join(PRIV.fondos, 'Subidos')],
    [path.join(TRAD, 'node_modules'), path.join(TRAD_B, 'node_modules')],
    [path.join(TRAD, 'modelos'), path.join(TRAD_B, 'modelos')],
  ];
  try { for (const n of fs.readdirSync(DATA_ROOT)) if (/^Respaldo ajustes/i.test(n)) lista.push([path.join(DATA_ROOT, n), path.join(PRIV.respaldos, n)]); } catch (_) { /* nada */ }
  try { for (const n of fs.readdirSync(TRAD)) if (n.endsWith('.log')) lista.push([path.join(TRAD, n), path.join(TRAD_B, n)]); } catch (_) { /* nada */ }
  // Videos de fondo de más de 95 MB (GitHub no acepta archivos de más de 100 MB)
  const walk = (dir) => { try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Subidos') walk(f); }
    else if (fs.statSync(f).size > 95 * 1024 * 1024) lista.push([f, path.join(PRIV.fondos, path.relative(DIRS.fondos, f))]);
  } } catch (_) { /* nada */ } };
  walk(DIRS.fondos);
  // Módulo OBS: la biblioteca de stingers vive en PK-PENTECOSTAL/obs/biblioteca (versiones anteriores la tenían
  // en BSPK/obs o directamente en PK-PENTECOSTAL/obs)
  const BIB = path.join(OBS_DIR, 'biblioteca');
  for (const c of ['imagenes', 'logos', 'sonidos', 'animaciones', 'fondos']) {
    lista.push([path.join(PRIV.obs, c), path.join(BIB, c)], [path.join(OBS_DIR, c), path.join(BIB, c)]);
  }
  if (!fs.existsSync(path.join(OBS_DIR, 'stingers.json'))) lista.push([path.join(PRIV.obs, 'stingers.json'), path.join(OBS_DIR, 'stingers.json')]);
  const pend = lista.filter(([a]) => fs.existsSync(a));
  if (!pend.length || otraInstanciaAbierta()) return;
  for (const [a, b] of pend) {
    try { mover(a, b); console.log('  BSPK ← ' + path.relative(DATA_ROOT, a)); }
    catch (e) { console.log('  No se pudo mover a BSPK: ' + path.relative(DATA_ROOT, a) + ' (' + e.message + ')'); }
  }
}
if (!DATOS_APARTE) migrarABSPK(); // la versión instalada ya nace con los datos separados
// Si otro PK-PENTECOSTAL abierto impidió mover config.json, se lee desde donde está
const CONFIG_FILE = fs.existsSync(PRIV.config) || !fs.existsSync(path.join(APP_DIR, 'config.json')) ? PRIV.config : path.join(APP_DIR, 'config.json');

// Dirección propia del proyector (distinta del panel): http://proyector.localhost:8889/
let PORT_PROY = Number(process.env.PORT_PROYECTOR) || PORT + 1;

// Dirección con nombre: http://pkipuc.localhost — Chrome, Edge, Firefox y OBS mandan cualquier
// "*.localhost" a este mismo equipo, sin instalar nada. Si el puerto 80 está libre la dirección queda
// sin número; si no, http://pkipuc.localhost:8888. Los celulares siguen usando la IP de la red (:8888)
// y las direcciones antiguas (localhost:8888, proyector.localhost:8889) siguen funcionando.
const DOMINIO = 'pkipuc.localhost';
const PORT_WEB = process.env.PORT_WEB === undefined ? 80 : Number(process.env.PORT_WEB); // 0 = no usar
let webActiva = false;
const sufijoWeb = () => (PORT_WEB === 80 ? '' : ':' + PORT_WEB);
const urlPanel = () => (webActiva ? `http://${DOMINIO}${sufijoWeb()}` : `http://${DOMINIO}:${PORT}`);
const urlProyector = () => (webActiva ? `http://proyector.${DOMINIO}${sufijoWeb()}` : `http://proyector.${DOMINIO}:${PORT_PROY}`);
// Ajustes que el navegador guardaba en la dirección antigua (OBS, textos, Biblia elegida…), de paso
// hacia la dirección nueva. Solo vive en memoria y se entrega una vez.
let almacenPendiente = null;
const APP_NOMBRE = 'PK-PENTECOSTAL';
const APP_VERSION = process.env.PK_VERSION || '2.0.5';
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
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
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
  // Mismo tamaño de letra en todas las diapositivas de una canción (y en los versículos de un capítulo)
  tamUniforme: true,
  // Canciones: máximo de renglones por diapositiva; una estrofa más larga se reparte en varias (todas las
  // canciones salen del mismo tamaño de letra)
  lineasMax: 6,
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
    // Plantilla "Imagen completa" (como el overlay de ProyectoRP): imagen 1920×1080 y textos en posiciones fijas
    diseno: '',          // diseño de overlay elegido (id de la imagen en obs/biblioteca)
    extra: '',           // texto adicional (evento, tema…) para los diseños con tercera línea
    completa: {
      fuente: 'Source Sans 3',
      nombre: { x: 273, y: 932, tam: 60, color: '#ffffff', negrita: true },
      sub: { x: 1080, y: 956, tam: 25, color: '#ffffff', negrita: false },
    },
  },
  cuenta: {
    texto: 'EMPEZAMOS EN', fuente: 'Montserrat', tam: 190, color: '#ffffff', colorTexto: '#f8b800', x: 960, y: 540,
    fondo: true, alTerminar: 'mensaje', mensaje: '¡Bienvenidos!', minutos: 10,
  },
  banner: {
    lateral: '',
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
// PowerShell no puede leer dentro del paquete .asar de la app de escritorio: se usa la copia desempaquetada
const ZONA_PS = path.join(APP_DIR, 'zona-wifi.ps1').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
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
  if (guardadoBloqueado) return; // se importó un respaldo: manda el archivo
  try {
    const tmp = CONFIG_FILE + '.tmp';
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
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
  stinger: { accion: '', id: '', n: 0, t: 0, alAire: false, pausa: 0 }, // última orden de stinger
  stingerRev: 0,
  overlayRev: 0,                                                         // cambia cuando se edita un diseño de overlay                                                         // cambia cuando se edita la biblioteca
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
  if (n === 1) return { ...state, visor: 1, ahora: Date.now() };
  const v = visor(n);
  return { ...state, vivo: v.vivo, negro: v.negro, ocultarTexto: v.ocultarTexto, estilo: v.estilo, visor: n, ahora: Date.now() };
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
    const isApp = file.startsWith(PUBLIC_DIR) || (file.startsWith(OBS_DIR) && !file.startsWith(path.join(OBS_DIR, 'biblioteca')));
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
    const bak = PRIV.respaldos;
    fs.mkdirSync(bak, { recursive: true });
    fs.copyFileSync(f, path.join(bak, `${name}.${Date.now()}.js`));
  }
  const body = 'var jscanciones=[\n' + songs.map((s) => JSON.stringify({ id: s.id, ti: s.ti, tono: s.tono || '', estilo: s.estilo || '0', le: s.le })).join(',\n') + '\n]\n';
  fs.writeFileSync(f, body, 'utf8');
  songbookCache.delete(name); gzipCache.delete('cancionero:' + name);
}

// ---------------------------------------------------------------- Fondos
// Un fondo puede estar en fondos/ (públicos) o en BSPK/fondos/ (subidos y videos pesados)
function archivoFondo(rel) {
  const priv = safeJoin(PRIV.fondos, rel);
  if (priv && fs.existsSync(priv)) return priv;
  return safeJoin(DIRS.fondos, rel);
}
// Miniaturas de fondos: imagen JPG pequeña (320 px) guardada en disco, para que la galería se vea
// completa apenas se abre el programa. Las de fábrica vienen en fondos-miniaturas/ (se crean con
// npm run miniaturas); las de fondos subidos se crean en este equipo y quedan en BSPK/miniaturas/.
// Clave = ruta relativa + tamaño del archivo (si el archivo cambia, se crea otra miniatura).
const MINI_FABRICA = path.join(RES_ROOT, 'fondos-miniaturas');
const miniClave = (rel, size) => crypto.createHash('sha1').update(rel + '|' + size).digest('hex').slice(0, 20);
function archivoMini(clave) {
  if (!/^[0-9a-f]{20}$/.test(clave)) return null;
  for (const d of [MINI_FABRICA, PRIV.miniaturas]) { const f = path.join(d, clave + '.jpg'); if (fs.existsSync(f)) return f; }
  return null;
}
function listBackgrounds() {
  const out = [];
  const vistos = new Set();
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), rel + '/' + e.name);
      else {
        const ext = path.extname(e.name).toLowerCase();
        if ((IMG_EXT.includes(ext) || VID_EXT.includes(ext)) && !vistos.has(rel + '/' + e.name)) {
          vistos.add(rel + '/' + e.name);
          let size = 0; try { size = fs.statSync(path.join(dir, e.name)).size; } catch (_) { /* nada */ }
          const clave = miniClave(decodeURIComponent(rel.slice(1)) + '/' + e.name, size);
          out.push({ categoria: rel.split('/')[1] || 'General', nombre: e.name, url: '/fondos' + rel + '/' + encodeURIComponent(e.name), tipo: VID_EXT.includes(ext) ? 'video' : 'imagen',
            clave, mini: archivoMini(clave) ? '/miniatura/' + clave + '.jpg' : '' });
        }
      }
    }
  };
  for (const raiz of [DIRS.fondos, PRIV.fondos]) {
    let cats = [];
    try { cats = fs.readdirSync(raiz, { withFileTypes: true }); } catch (_) { continue; }
    for (const c of cats) if (c.isDirectory()) walk(path.join(raiz, c.name), '/' + encodeURIComponent(c.name));
  }
  for (const [c, nombre] of [['fondos', null], ['pk', 'pk-franja-rotulo.svg']]) {
    let lista = [];
    try { lista = fs.readdirSync(path.join(OBS_LIB, c)); } catch (_) { continue; }
    for (const f of lista) {
      if (nombre ? f !== nombre : !IMG_EXT.includes(path.extname(f).toLowerCase())) continue;
      let size = 0; try { size = fs.statSync(path.join(OBS_LIB, c, f)).size; } catch (_) { /* nada */ }
      const clave = miniClave(`obs-lib/${c}/${f}`, size);
      out.push({ categoria: 'OBS · Rótulos', nombre: f, url: `/obs-lib/${c}/${encodeURIComponent(f)}`, tipo: 'imagen',
        clave, mini: archivoMini(clave) ? '/miniatura/' + clave + '.jpg' : '' });
    }
  }
  return out.map((b) => ({ ...b, categoria: decodeURIComponent(b.categoria) }));
}

// ---------------------------------------------------------------- Fuentes
// Fuentes de fábrica (css/font del programa) + las instaladas por el usuario (al importar de ProyectoRP)
const raicesFuentes = () => [...new Set([DIRS.fuentes, DIRS.fuentesFabrica])];
function archivoFuente(rel) {
  for (const r of raicesFuentes()) { const f = safeJoin(r, rel); if (f && fs.existsSync(f)) return f; }
  return safeJoin(DIRS.fuentesFabrica, rel);
}
function buildFontsCss() {
  let css = ''; const families = new Set(); const vistas = new Set();
  for (const raiz of raicesFuentes()) try {
    for (const d of fs.readdirSync(raiz, { withFileTypes: true })) {
      if (!d.isDirectory() || vistas.has(d.name)) continue;
      vistas.add(d.name);
      for (const f of fs.readdirSync(path.join(raiz, d.name))) {
        if (!f.endsWith('.css')) continue;
        // Los CSS originales tienen llaves mal cerradas: se re-generan las @font-face limpias.
        const txt = fs.readFileSync(path.join(raiz, d.name, f), 'utf8');
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
let FONTS = buildFontsCss();

// ---------------------------------------------------------------- Stingers (OBS)
// Biblioteca en PK-PENTECOSTAL/obs: stingers.json + biblioteca/ (imagenes, logos, sonidos, animaciones, fondos, fuentes, pk)
// El formato de cada stinger es el mismo de ProyectoRP, así se pueden importar tal cual.
const OBS_LIB = path.join(OBS_DATA, 'biblioteca');
const PK_MARCA = path.join(OBS_DIR, 'biblioteca', 'pk'); // logo y diseños PK de fábrica (protegidos, solo lectura)
const STG_FILE = path.join(OBS_DATA, 'stingers.json');
const STG_CARPETAS = {
  imagenes: [...IMG_EXT, '.svg'], logos: [...IMG_EXT, '.svg'], fondos: [...IMG_EXT, '.svg'], pk: [...IMG_EXT, '.svg'],
  sonidos: ['.mp3', '.wav', '.ogg', '.m4a'], animaciones: VID_EXT,
};
const DISENO_PK = require(path.join(OBS_DIR, 'diseno-pk.js'));
const STG_AJUSTES = { espera: 300, pausa: 900, cambiarEscena: false };
const STG_ACCIONES = ['entrar', 'salir', 'completo', 'cancelar'];

function stingersDeFabrica() {
  const txt = (id, text, y, size, color, anim) => ({ id, type: 'text', x: 50, y, opacity: 100, in: 'abajo', out: 'fade', text, font: 'Montserrat', size, color, bold: true, upper: true, shadow: true, textAnim: anim });
  const logo = (y, w) => ({ id: 'logo', type: 'image', src: '/logo-ipuc.webp', x: 50, y, w, opacity: 100, in: 'zoom', out: 'zoom', role: 'logo' });
  const base = (id, name, style, color1, color2, effects, inTime = 800, outTime = 700) => ({
    id, name, mode: 'hold', style, color1, color2, inTime, outTime, logo: '/logo-ipuc.webp', soundIn: null, soundOut: null, effects,
    elements: [logo(42, 22), txt('t1', 'IPUC NATANIA 6° ETAPA', 76, 54, '#ffffff', 'letras'), txt('t2', 'Zona Especial Misionera', 83, 30, '#f2dc9b', 'maquina')],
  });
  return [
    base('pk-iris', 'PK · Iris básico', 'iris', '#0b1f45', '#f2b705', [{ id: 'f1', type: 'particulas', color: '#ffd666', amount: 45, speed: 30, size: 40, opacity: 35 }]),
    base('pk-barrido', 'PK · Barrido básico', 'barrido', '#00427f', '#f2b705', [{ id: 'f2', type: 'brillo', color: '#ffffff', amount: 60, speed: 20, size: 80, opacity: 25 }]),
    base('pk-cortina', 'PK · Cortina básica', 'cortina', '#061f45', '#d4a537', [{ id: 'f3', type: 'bokeh', color: '#3fa9dc', amount: 35, speed: 25, size: 60, opacity: 45 }], 600, 600),
    base('pk-destello', 'PK · Destello básico', 'destello', '#071a3a', '#fde68a', [{ id: 'f4', type: 'estrellas', color: '#ffffff', amount: 60, speed: 30, size: 50, opacity: 70 }], 900, 700),
  ];
}
function leerStingers() {
  try {
    const d = JSON.parse(fs.readFileSync(STG_FILE, 'utf8'));
    if (Array.isArray(d.stingers) && d.stingers.length) return { activo: String(d.activo || d.stingers[0].id), ajustes: { ...STG_AJUSTES, ...(d.ajustes || {}) }, stingers: d.stingers };
  } catch (_) { /* primera vez */ }
  const stingers = stingersDeFabrica();
  return { activo: stingers[0].id, ajustes: { ...STG_AJUSTES }, stingers };
}
let STG = leerStingers();
function guardarStingers() {
  fs.mkdirSync(OBS_LIB, { recursive: true });
  const tmp = STG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(STG, null, 2));
  fs.renameSync(tmp, STG_FILE);
  state.stingerRev++;
}
function recursosStinger() {
  const out = {};
  for (const [c, exts] of Object.entries(STG_CARPETAS)) {
    try { out[c] = fs.readdirSync(path.join(OBS_LIB, c)).filter((f) => exts.includes(path.extname(f).toLowerCase())).sort((a, b) => a.localeCompare(b, 'es')); } catch (_) { out[c] = []; }
  }
  return out;
}
// Limpia lo que llega del panel: solo datos simples y tamaños razonables
function limpiarStinger(s) {
  if (!s || typeof s !== 'object') return null;
  const o = JSON.parse(JSON.stringify(s));
  o.id = String(o.id || uid()).slice(0, 40);
  o.name = String(o.name || 'Stinger').slice(0, 80);
  o.mode = 'hold';
  o.inTime = Math.max(100, Math.min(10000, +o.inTime || 800));
  o.outTime = Math.max(100, Math.min(10000, +o.outTime || 700));
  o.effects = (Array.isArray(o.effects) ? o.effects : []).slice(0, 6);
  o.elements = (Array.isArray(o.elements) ? o.elements : []).slice(0, 40);
  return JSON.stringify(o).length < 200000 ? o : null;
}

// ---- Importar desde ProyectoRP (misma computadora)
function proyectoRPDir() {
  const cands = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'ProyectoRP'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'ProyectoRP'),
    path.join(os.homedir(), 'Library', 'Application Support', 'ProyectoRP'),
    path.join(os.homedir(), '.config', 'ProyectoRP'),
  ].filter(Boolean);
  return cands.find((d) => { try { return fs.statSync(path.join(d, 'obs')).isDirectory(); } catch (_) { return false; } }) || null;
}
function copiarCarpeta(origen, destino, exts) {
  let n = 0;
  let lista = [];
  try { lista = fs.readdirSync(origen, { withFileTypes: true }); } catch (_) { return 0; }
  fs.mkdirSync(destino, { recursive: true });
  for (const e of lista) {
    if (!e.isFile() || (exts && !exts.includes(path.extname(e.name).toLowerCase()))) continue;
    const a = path.join(origen, e.name), b = path.join(destino, e.name);
    try { if (fs.existsSync(b) && fs.statSync(b).size === fs.statSync(a).size) continue; } catch (_) { /* se copia */ }
    fs.copyFileSync(a, b); n++;
  }
  return n;
}
// "SourceSans3-SemiboldIt.otf" → familia "Source Sans 3", peso 600, cursiva
function instalarFuentes(origen) {
  let archivos = [];
  try { archivos = fs.readdirSync(origen).filter((f) => /\.(otf|ttf|woff2?)$/i.test(f)); } catch (_) { return 0; }
  const PESOS = { thin: 100, extralight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
  const grupos = {};
  for (const f of archivos) {
    const [fam, est = 'Regular'] = path.basename(f, path.extname(f)).split('-');
    const familia = fam.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9])([A-Z])/g, '$1 $2');
    const cursiva = /(It|Italic)$/.test(est);
    const peso = PESOS[est.replace(/(It|Italic)$/, '').toLowerCase() || 'regular'] || 400;
    (grupos[familia] ||= []).push({ f, peso, cursiva });
  }
  let n = 0;
  for (const [familia, lista] of Object.entries(grupos)) {
    const dir = path.join(DIRS.fuentes, familia.toLowerCase().replace(/[^a-z0-9]/g, ''));
    fs.mkdirSync(dir, { recursive: true });
    for (const x of lista) { if (!fs.existsSync(path.join(dir, x.f))) { fs.copyFileSync(path.join(origen, x.f), path.join(dir, x.f)); n++; } }
    const cssTxt = lista.map((x) => `@font-face {\n  font-family: '${familia}';\n  font-weight: ${x.peso};\n  font-style: ${x.cursiva ? 'italic' : 'normal'};\n  src: url('${x.f}');\n}\n`).join('');
    fs.writeFileSync(path.join(dir, familia.toLowerCase().replace(/[^a-z0-9]/g, '') + '.css'), cssTxt);
    for (const lic of fs.readdirSync(origen).filter((f) => /licen/i.test(f))) fs.copyFileSync(path.join(origen, lic), path.join(dir, lic));
  }
  if (n) FONTS = buildFontsCss();
  return n;
}
function importarProyectoRP() {
  const dir = proyectoRPDir();
  if (!dir) throw new Error('No se encontró ProyectoRP en este computador');
  const obs = path.join(dir, 'obs');
  const r = { archivos: 0, stingers: 0, fuentes: 0, rotulos: 0, overlay: false, obs: null };
  for (const c of ['imagenes', 'logos', 'sonidos']) r.archivos += copiarCarpeta(path.join(obs, 'stingers', c), path.join(OBS_LIB, c), STG_CARPETAS[c]);
  r.archivos += copiarCarpeta(path.join(dir, 'animaciones'), path.join(OBS_LIB, 'animaciones'), STG_CARPETAS.animaciones);
  r.archivos += copiarCarpeta(path.join(obs, 'fondos'), path.join(OBS_LIB, 'fondos'), STG_CARPETAS.fondos);
  r.fuentes = instalarFuentes(path.join(obs, 'fuentes'));
  try { fs.mkdirSync(path.join(OBS_LIB, 'proyectorp'), { recursive: true }); fs.copyFileSync(path.join(dir, 'config', 'obs.json'), path.join(OBS_LIB, 'proyectorp', 'obs-banners.json')); } catch (_) { /* sin banners */ }
  r.archivos += copiarFondosLaterales(dir);
  r.archivos += copiarCarpeta(path.join(obs, 'fuentes'), path.join(OBS_LIB, 'fuentes'));
  for (const [a, b] of [[path.join(obs, 'stingers.json'), 'stingers.json'], [path.join(obs, 'overlay.json'), 'overlay.json'], [path.join(dir, 'config', 'obs.json'), 'obs-banners.json']]) {
    try { fs.mkdirSync(path.join(OBS_LIB, 'proyectorp'), { recursive: true }); fs.copyFileSync(a, path.join(OBS_LIB, 'proyectorp', b)); } catch (_) { /* no existe */ }
  }

  // Stingers: los de ProyectoRP reemplazan a los de igual id; los de fábrica de PK se conservan al final
  try {
    const d = JSON.parse(fs.readFileSync(path.join(obs, 'stingers.json'), 'utf8'));
    const nuevos = (d.stingers || []).map(limpiarStinger).filter(Boolean);
    const ids = new Set(nuevos.map((s) => s.id));
    // Cada stinger de ProyectoRP llega tal cual y además con su versión "PK · …" (diseño PK-PENTECOSTAL)
    STG.stingers = DISENO_PK.agregarVariantes([...nuevos, ...STG.stingers.filter((s) => !ids.has(s.id))], nuevos);
    if (d.activo && ids.has(d.activo)) STG.activo = d.activo;
    r.stingers = nuevos.length;
  } catch (_) { /* sin stingers */ }
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'config', 'obs_control.json'), 'utf8'));
    if (Number.isFinite(+c.stinger_espera_ms)) STG.ajustes.espera = +c.stinger_espera_ms;
    if (typeof c.stinger_al_cambiar === 'boolean') STG.ajustes.cambiarEscena = c.stinger_al_cambiar;
    if (c.puerto) r.obs = { host: c.host || '', puerto: +c.puerto || 4455, clave: String(c.clave || '') };
  } catch (_) { /* sin conexión guardada */ }
  guardarStingers();

  // Overlay de rótulos: fondo a pantalla completa, posiciones, luces y listas de nombres
  try {
    const ov = JSON.parse(fs.readFileSync(path.join(obs, 'overlay.json'), 'utf8'));
    const m = state.modulo.overlay;
    if (ov.background && fs.existsSync(path.join(OBS_LIB, 'fondos', ov.background))) {
      m.fondo = { url: '/obs-lib/fondos/' + encodeURIComponent(ov.background), nombre: ov.background };
      m.plantilla = 'Imagen-Completa';
    }
    const t1 = (ov.texts || {}).text1 || {}, t2 = (ov.texts || {}).text2 || {}, p = ov.positions || {};
    m.completa = deepMerge(m.completa, {
      fuente: t1.font || m.completa.fuente,
      nombre: { x: +(p.text1 || {}).x || m.completa.nombre.x, y: +(p.text1 || {}).y || m.completa.nombre.y, tam: +t1.size || m.completa.nombre.tam, color: t1.color || '#ffffff' },
      sub: { x: +(p.text2 || {}).x || m.completa.sub.x, y: +(p.text2 || {}).y || m.completa.sub.y, tam: +t2.size || m.completa.sub.tam, color: t2.color || '#ffffff' },
    });
    if (ov.lightEffect) m.luces = { ...m.luces, on: ov.lightEffect !== 'none', intensidad: Math.max(5, Math.min(100, +ov.lightsOpacity || m.luces.intensidad)) };
    // Listas: "Pastor | Jesus Muñoz" → nombre "Pastor Jesus Muñoz"; se agregan solo los que falten
    const inp = ov.inputs || {};
    for (let i = 1; i <= 5; i++) {
      const nombre = inp['desc_text' + i]; if (!nombre) continue;
      let g = state.rotulos.find((x) => x.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase());
      if (!g) { g = { id: uid(), nombre: String(nombre), subtitulo: '', reloj: false, items: [] }; state.rotulos.push(g); }
      if (inp['default_text' + i]) g.subtitulo = String(inp['default_text' + i]);
      const sinTildes = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
      for (const linea of String(inp['db_text' + i] || '').split('\n')) {
        const partes = linea.split('|').map((x) => x.trim()).filter(Boolean);
        if (!partes.length) continue;
        const nom = partes[partes.length - 1];
        const texto = partes.length > 1 && !sinTildes(nom).startsWith(sinTildes(partes[0])) ? `${partes[0]} ${nom}` : nom;
        if (g.items.some((it) => sinTildes(it.texto).endsWith(sinTildes(nom)))) continue;
        g.items.push({ id: uid(), texto, sub: '', color: ['#00bcd4', '#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#f44336', '#3f51b5'][g.items.length % 7] });
        r.rotulos++;
      }
    }
    config.rotulos = state.rotulos; saveConfig();
    state.moduloGuardado = JSON.stringify(state.modulo) === JSON.stringify(config.modulo);
    r.overlay = true;
  } catch (_) { /* sin overlay */ }
  return r;
}

let stgTimer = null;
async function rutasStinger(req, res, p, url, equipo) {
  if (p === '/api/stingers' && req.method === 'GET') {
    return sendJSON(res, { ...STG, recursos: recursosStinger(), proyectoRP: !!proyectoRPDir() });
  }
  if (p === '/api/stingers' && req.method === 'PUT') {
    const b = await readBody(req, 4 * 1024 * 1024);
    const lista = (Array.isArray(b.stingers) ? b.stingers : []).map(limpiarStinger).filter(Boolean).slice(0, 200);
    if (!lista.length) return sendJSON(res, { error: 'Debe quedar al menos un stinger' }, 400);
    const aj = b.ajustes || {};
    STG = {
      activo: lista.some((s) => s.id === b.activo) ? String(b.activo) : lista[0].id,
      ajustes: { espera: Math.max(0, Math.min(5000, +aj.espera || 0)), pausa: Math.max(0, Math.min(30000, +aj.pausa || 0)), cambiarEscena: !!aj.cambiarEscena },
      stingers: lista,
    };
    guardarStingers(); broadcast();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/stinger' && req.method === 'POST') {
    const b = await readBody(req);
    if (!STG_ACCIONES.includes(b.accion)) return sendJSON(res, { error: 'Acción inválida' }, 400);
    const s = STG.stingers.find((x) => x.id === b.id) || STG.stingers.find((x) => x.id === STG.activo) || STG.stingers[0];
    const pausa = b.pausa != null ? Math.max(0, Math.min(30000, +b.pausa || 0)) : STG.ajustes.pausa;
    const t = Date.now();
    state.stinger = { accion: b.accion, id: s ? s.id : '', n: Math.max(t, state.stinger.n + 1), t, alAire: b.accion === 'entrar' || b.accion === 'completo', pausa };
    clearTimeout(stgTimer);
    if (b.accion === 'completo' && s) stgTimer = setTimeout(() => { state.stinger.alAire = false; broadcast(); }, s.inTime + pausa + s.outTime);
    broadcast();
    return sendJSON(res, { ok: true, stinger: state.stinger, inTime: s ? s.inTime : 0, outTime: s ? s.outTime : 0 });
  }
  if (p === '/api/stingers/importar' && req.method === 'POST') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    try { const r = importarProyectoRP(); broadcast(); return sendJSON(res, { ok: true, ...r }); }
    catch (e) { return sendJSON(res, { error: e.message }, 400); }
  }
  if (p === '/api/stingers/subir' && req.method === 'PUT') { // imágenes, logos, sonidos o animaciones para los stingers
    const carpeta = url.searchParams.get('carpeta') || '';
    const nombre = path.basename(url.searchParams.get('nombre') || '').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_');
    const ext = path.extname(nombre).toLowerCase();
    if (carpeta === 'pk') return sendJSON(res, { error: 'Los diseños y el logo de PK-PENTECOSTAL están protegidos y no se pueden cambiar' }, 403);
    if (!STG_CARPETAS[carpeta] || !nombre || !STG_CARPETAS[carpeta].includes(ext)) return sendJSON(res, { error: 'Tipo de archivo no permitido aquí' }, 400);
    const dir = path.join(OBS_LIB, carpeta);
    fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, nombre), n = 1;
    while (fs.existsSync(dest)) dest = path.join(dir, `${path.basename(nombre, ext)} (${n++})${ext}`);
    const ws = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 300 * 1024 * 1024) { req.destroy(); ws.destroy(); fs.unlink(dest, () => {}); } });
    req.pipe(ws);
    ws.on('finish', () => { state.stingerRev++; sendJSON(res, { ok: true, src: `lib:${carpeta}/${path.basename(dest)}`, nombre: path.basename(dest) }); });
    ws.on('error', (e) => sendJSON(res, { error: e.message }, 500));
    return;
  }
  return false;
}

// ---------------------------------------------------------------- Banners laterales (diseños de ProyectoRP + versión PK)
const LAT_FILE = path.join(OBS_DATA, 'laterales.json');
function leerLaterales() {
  let lista = null;
  try { lista = JSON.parse(fs.readFileSync(LAT_FILE, 'utf8')); } catch (_) { /* aún no hay copia propia */ }
  if (!Array.isArray(lista)) {
    try { lista = JSON.parse(fs.readFileSync(path.join(OBS_LIB, 'proyectorp', 'obs-banners.json'), 'utf8')).laterales; } catch (_) { lista = []; }
  }
  const originales = (Array.isArray(lista) ? lista : []).filter((l) => l && l.id && !l.origen);
  return [...originales.map(DISENO_PK.lateralPK), ...originales];
}
// Copia los fondos "fondo:x.jpg" que usan los laterales (ProyectoRP los guarda aparte)
function copiarFondosLaterales(dirRP) {
  let n = 0;
  for (const l of leerLaterales()) for (const e of l.elements || []) {
    const m = /^fondo:(.+)$/.exec(e.src || ''); if (!m) continue;
    for (const sub of ['f_images', 'f_videos', '']) {
      const a = path.join(dirRP, 'fondos', sub, m[1]), b = path.join(OBS_LIB, 'fondos', m[1]);
      if (fs.existsSync(a) && !fs.existsSync(b)) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); n++; break; }
    }
  }
  return n;
}

// ---------------------------------------------------------------- Cuenta regresiva ("EMPEZAMOS EN…")
// state.cuenta.fin = hora (ms) en que llega a cero. Cada pantalla calcula lo que falta con su reloj
// corregido por la hora del servidor (st.ahora), así coinciden el proyector, OBS y los celulares.
state.cuenta = { activa: false, fin: 0, id: 0 };
function iniciarCuenta(b) {
  const ahora = Date.now();
  let fin = 0;
  if (b.accion === 'iniciar') fin = ahora + Math.max(1, Math.min(24 * 3600, +b.segundos || 0)) * 1000;
  else if (b.accion === 'hasta') {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(b.hora || ''));
    if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('Hora inválida (use HH:MM, de 00:00 a 23:59)');
    const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
    if (d.getTime() <= ahora) d.setDate(d.getDate() + 1); // si la hora ya pasó, es mañana
    fin = d.getTime();
  } else if (b.accion === 'sumar') {
    if (!state.cuenta.activa) throw new Error('No hay una cuenta regresiva activa');
    fin = Math.max(ahora, state.cuenta.fin) + (+b.segundos || 0) * 1000;
  }
  if (b.accion === 'detener') state.cuenta = { activa: false, fin: 0, id: Date.now() };
  else state.cuenta = { activa: true, fin, id: Date.now() };
}

// ---------------------------------------------------------------- Respaldo completo (exportar / importar BSPK)
// Un .zip con todo lo propio de esta instalación: BSPK (ajustes, claves, respaldos, fondos subidos) y la
// biblioteca de stingers. Sirve para pasar PK-PENTECOSTAL a otro computador con todo configurado.
// El traductor no se incluye (se reinstala con instalar.js).
const CRC_TABLA = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function archivosRespaldo() {
  const out = [];
  const walk = (dir, prefijo, saltar) => {
    let lista = [];
    try { lista = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of lista) {
      const f = path.join(dir, e.name), rel = prefijo + '/' + e.name;
      if (saltar && saltar(rel)) continue;
      if (e.isDirectory()) walk(f, rel, saltar);
      else if (e.isFile() && fs.statSync(f).size < 400 * 1024 * 1024) out.push([rel, f]);
    }
  };
  walk(BSPK, 'BSPK', (r) => /^BSPK\/traductor\/(node_modules|modelos)$/.test(r) || /\.tmp$/.test(r));
  for (const f of ['stingers.json', 'laterales.json']) if (fs.existsSync(path.join(OBS_DATA, f))) out.push(['obs/' + f, path.join(OBS_DATA, f)]);
  walk(OBS_LIB, 'obs/biblioteca');
  // Cancioneros (canciones nuevas o editadas y sus traducciones)
  walk(DIRS.cancioneros, 'cancioneros', (r) => /\.tmp$/.test(r));
  return out;
}
function crearZip(lista) {
  const partes = [], central = [];
  let offset = 0;
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [nombre, archivo] of lista) {
    const datos = fs.readFileSync(archivo);
    const comprimir = /\.(json|js|txt|svg|css|html|md|bi)$/i.test(nombre);
    const cuerpo = comprimir ? zlib.deflateRawSync(datos) : datos;
    const n = Buffer.from(nombre, 'utf8'), crc = crc32(datos);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(comprimir ? 8 : 0, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(fecha, 12); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(cuerpo.length, 18);
    loc.writeUInt32LE(datos.length, 22); loc.writeUInt16LE(n.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(comprimir ? 8 : 0, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(fecha, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(cuerpo.length, 20); cen.writeUInt32LE(datos.length, 24);
    cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    partes.push(loc, n, cuerpo); central.push(cen, n);
    offset += 30 + n.length + cuerpo.length;
  }
  const cd = Buffer.concat(central), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(lista.length, 8); fin.writeUInt16LE(lista.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, cd, fin]);
}
function leerZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('El archivo no es un .zip válido');
  const total = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('El .zip está dañado');
    const metodo = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), nombre = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.slice(ini, ini + csize);
    if (!nombre.endsWith('/')) out.push([nombre, metodo === 8 ? zlib.inflateRawSync(datos) : datos]);
    p += 46 + nl + xl + cl;
  }
  return out;
}
function importarRespaldo(buf) {
  const entradas = leerZip(buf);
  if (!entradas.some(([n]) => n.startsWith('BSPK/') || n.startsWith('obs/'))) throw new Error('Este .zip no es un respaldo de PK-PENTECOSTAL');
  // Copia de seguridad de lo actual antes de reemplazar
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const copia = path.join(PRIV.respaldos, 'antes-de-importar-' + sello);
  for (const f of [PRIV.config, STG_FILE, LAT_FILE]) if (fs.existsSync(f)) { fs.mkdirSync(copia, { recursive: true }); fs.copyFileSync(f, path.join(copia, path.basename(f))); }
  let n = 0;
  for (const [nombre, datos] of entradas) {
    const destino = nombre.startsWith('BSPK/') ? safeJoin(BSPK, nombre.slice(5)) : nombre.startsWith('obs/') ? safeJoin(OBS_DATA, nombre.slice(4)) : nombre.startsWith('cancioneros/') ? safeJoin(DIRS.cancioneros, nombre.slice(12)) : null;
    if (!destino || /[\\/]traductor[\\/](node_modules|modelos)/.test(destino)) continue;
    if (destino.startsWith(OBS_DATA) && !destino.startsWith(OBS_LIB) && !/[\\/](stingers|laterales)\.json$/.test(destino)) continue; // nunca reemplaza código
    if (destino.startsWith(path.join(OBS_LIB, 'pk') + path.sep)) continue; // marca protegida: el logo y los diseños PK no se reemplazan
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    if (destino.startsWith(DIRS.cancioneros) && fs.existsSync(destino)) { // copia del cancionero actual antes de reemplazarlo
      const c = path.join(copia, 'cancioneros', path.relative(DIRS.cancioneros, destino));
      fs.mkdirSync(path.dirname(c), { recursive: true }); fs.copyFileSync(destino, c);
    }
    fs.writeFileSync(destino, datos); n++;
  }
  guardadoBloqueado = true;
  STG = leerStingers(); state.stingerRev++;
  return { archivos: n, copia: path.relative(DATA_ROOT, copia) };
}

// ---------------------------------------------------------------- ¿Hay una versión nueva en GitHub?
const REPO_GITHUB = process.env.PK_REPO || 'Sebaslw/PK-PENTECOSTAL';
let actCache = null;
const numVersion = (v) => String(v || '').replace(/^v/i, '').split('.').map((x) => parseInt(x, 10) || 0);
function esMasNueva(a, b) { const x = numVersion(a), y = numVersion(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
function pedirGitHub(ruta) {
  return new Promise((ok, mal) => {
    require('https').get({ host: 'api.github.com', path: ruta, timeout: 8000, headers: { 'User-Agent': 'PK-PENTECOSTAL', Accept: 'application/vnd.github+json' } }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { if (r.statusCode === 404) return ok(null); if (r.statusCode !== 200) return mal(new Error('GitHub respondió ' + r.statusCode)); try { ok(JSON.parse(d)); } catch (e) { mal(e); } });
    }).on('error', mal).on('timeout', function () { this.destroy(new Error('Sin respuesta de GitHub')); });
  });
}
async function buscarActualizacion(forzar) {
  if (!forzar && actCache && Date.now() - actCache.t < 6 * 3600 * 1000) return actCache.r;
  let r = { actual: APP_VERSION, ultima: APP_VERSION, hay: false, url: `https://github.com/${REPO_GITHUB}`, notas: '' };
  const rel = await pedirGitHub(`/repos/${REPO_GITHUB}/releases/latest`);
  if (rel && rel.tag_name) r = { ...r, ultima: rel.tag_name.replace(/^v/i, ''), url: rel.html_url, notas: String(rel.body || '').slice(0, 1500), fecha: rel.published_at };
  else {
    const tags = await pedirGitHub(`/repos/${REPO_GITHUB}/tags?per_page=20`);
    const mejor = (tags || []).map((t) => t.name).filter((t) => /^v?\d+\.\d+/.test(t)).sort((a, b) => (esMasNueva(a, b) ? -1 : 1))[0];
    if (mejor) r = { ...r, ultima: mejor.replace(/^v/i, ''), url: `https://github.com/${REPO_GITHUB}/releases` };
  }
  r.hay = esMasNueva(r.ultima, APP_VERSION);
  actCache = { t: Date.now(), r };
  return r;
}

async function rutasIdeas(req, res, p, url, equipo) {
  if (p === '/api/laterales' && req.method === 'GET') return sendJSON(res, leerLaterales());
  if (p === '/api/cuenta' && req.method === 'POST') {
    try { iniciarCuenta(await readBody(req)); } catch (e) { return sendJSON(res, { error: e.message }, 400); }
    broadcast();
    return sendJSON(res, { ok: true, cuenta: state.cuenta });
  }
  if (p === '/api/bspk/exportar' && req.method === 'GET') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    const zip = crearZip(archivosRespaldo());
    const nombre = `PK-PENTECOSTAL respaldo ${new Date().toISOString().slice(0, 10)}.zip`;
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': zip.length, 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}` });
    return res.end(zip);
  }
  if (p === '/api/bspk/importar' && req.method === 'PUT') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    const trozos = []; let size = 0;
    await new Promise((ok, mal) => {
      req.on('data', (c) => { size += c.length; if (size > 1024 * 1024 * 1024) { req.destroy(); mal(new Error('Demasiado grande')); } else trozos.push(c); });
      req.on('end', ok); req.on('error', mal);
    });
    try { const r = importarRespaldo(Buffer.concat(trozos)); broadcast(); return sendJSON(res, { ok: true, ...r, reiniciar: true }); }
    catch (e) { return sendJSON(res, { error: e.message }, 400); }
  }
  // La app de escritorio instalada se actualiza sola (electron/main.js): el panel solo se lo pide
  const autoActualiza = EN_ELECTRON && !process.env.PORTABLE_EXECUTABLE_DIR;
  if (p === '/api/actualizacion' && req.method === 'GET') {
    try { return sendJSON(res, { ...(await buscarActualizacion(url.searchParams.get('forzar') === '1')), autoActualiza }); }
    catch (e) { return sendJSON(res, { actual: APP_VERSION, hay: false, autoActualiza, error: 'No se pudo consultar GitHub: ' + e.message }); }
  }
  if (p === '/api/actualizacion/buscar' && req.method === 'POST') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    if (!autoActualiza) return sendJSON(res, { ok: false, autoActualiza });
    avisarPadre({ tipo: 'buscar-actualizacion' });
    return sendJSON(res, { ok: true, autoActualiza });
  }
  return false;
}

// ---------------------------------------------------------------- Diseños de overlay (imagen de fondo + zonas de texto)
// Cada diseño es una imagen 1920×1080 transparente (franja, logo, adornos) y su propia distribución de textos:
// zonas { nombre, sub, extra } con x, y, w, h en píxeles. Los diseños PK traen sus zonas; para el resto
// (ProyectoRP o imágenes subidas) el panel las detecta solo analizando la imagen y las guarda aquí.
const OVL_FILE = path.join(OBS_DATA, 'overlays.json');
const OVL_EXT = ['.png', '.webp', '.svg'];
const z = (x, y, w, h, alinear = 'left', color = '#ffffff', negrita = true) => ({ x, y, w, h, alinear, color, negrita });
const OVL_PK = {
  'pk/pk-franja-rotulo.svg': { nombre: 'PK · Franja con logo', fuente: 'Montserrat', zonas: { nombre: z(275, 910, 930, 96), sub: z(1230, 928, 560, 60, 'right', '#fde68a', false) } },
  'pk/pk-overlay-doble.svg': { nombre: 'PK · Doble barra', fuente: 'Montserrat', zonas: { nombre: z(250, 866, 860, 76, 'left', '#04162e'), sub: z(250, 952, 720, 50, 'left', '#ffffff', false) } },
  'pk/pk-overlay-centro.svg': { nombre: 'PK · Cinta central', fuente: 'Montserrat', zonas: { nombre: z(430, 908, 1060, 84, 'center'), sub: z(790, 866, 340, 32, 'center', '#04162e') } },
  'pk/pk-overlay-esquina.svg': { nombre: 'PK · Esquina (3 líneas)', fuente: 'Montserrat', zonas: { nombre: z(1140, 834, 700, 72), sub: z(1130, 920, 710, 44, 'left', '#ffffff', false), extra: z(1120, 966, 700, 34, 'left', '#f8b800') } },
};
function leerOverlaysCfg() { try { return JSON.parse(fs.readFileSync(OVL_FILE, 'utf8')); } catch (_) { return {}; } }
function listarOverlays() {
  const cfg = leerOverlaysCfg();
  const ids = [];
  for (const c of ['overlays', 'fondos']) {
    try { for (const f of fs.readdirSync(path.join(OBS_LIB, c))) if (OVL_EXT.includes(path.extname(f).toLowerCase())) ids.push(c + '/' + f); } catch (_) { /* sin carpeta */ }
  }
  for (const id of Object.keys(OVL_PK)) if (fs.existsSync(path.join(OBS_LIB, id))) ids.push(id);
  return ids.map((id) => {
    const base = OVL_PK[id] || {}, propio = cfg[id] || {};
    const nombre = propio.nombre || base.nombre || path.basename(id, path.extname(id)).replace(/[_-]+/g, ' ');
    return { id, url: '/obs-lib/' + id.split('/').map(encodeURIComponent).join('/'), nombre, fuente: propio.fuente || base.fuente || 'Source Sans 3',
      zonas: propio.zonas || base.zonas || null, pk: !!OVL_PK[id], origen: id.startsWith('fondos/') ? 'ProyectoRP' : id.startsWith('pk/') ? 'PK' : 'Propio' };
  });
}
function limpiarZona(v) {
  if (!v || typeof v !== 'object') return undefined;
  const n = (x, d, a, b) => Math.max(a, Math.min(b, Number.isFinite(+x) ? Math.round(+x) : d));
  return { x: n(v.x, 0, -200, 2120), y: n(v.y, 0, -200, 1280), w: n(v.w, 400, 10, 1920), h: n(v.h, 60, 8, 1080),
    alinear: ['left', 'center', 'right'].includes(v.alinear) ? v.alinear : 'left', color: /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : '#ffffff',
    negrita: !!v.negrita, mayus: !!v.mayus };
}

async function rutasOverlays(req, res, p, url) {
  if (p === '/api/overlays' && req.method === 'GET') return sendJSON(res, listarOverlays());
  if (p === '/api/overlays' && req.method === 'PUT') { // guarda la distribución de un diseño
    const b = await readBody(req);
    const id = String(b.id || '');
    if (!listarOverlays().some((o) => o.id === id)) return sendJSON(res, { error: 'Diseño no encontrado' }, 404);
    const cfg = leerOverlaysCfg();
    if (b.restaurar) delete cfg[id];
    else {
      const zonas = {};
      for (const k of ['nombre', 'sub', 'extra']) { const v = limpiarZona(b.zonas && b.zonas[k]); if (v) zonas[k] = v; }
      if (!zonas.nombre) return sendJSON(res, { error: 'Falta la zona del nombre' }, 400);
      cfg[id] = { nombre: String(b.nombre || '').slice(0, 80) || undefined, fuente: String(b.fuente || '').slice(0, 60) || undefined, zonas, detectado: !!b.detectado };
    }
    fs.writeFileSync(OVL_FILE + '.tmp', JSON.stringify(cfg, null, 2)); fs.renameSync(OVL_FILE + '.tmp', OVL_FILE);
    state.overlayRev++; broadcast();
    return sendJSON(res, { ok: true });
  }
  if (p === '/api/overlays/subir' && req.method === 'PUT') { // nueva imagen de overlay (PNG transparente 1920×1080)
    const nombre = path.basename(url.searchParams.get('nombre') || '').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_');
    const ext = path.extname(nombre).toLowerCase();
    if (!nombre || !OVL_EXT.includes(ext)) return sendJSON(res, { error: 'Use una imagen PNG, WEBP o SVG (con fondo transparente)' }, 400);
    const dir = path.join(OBS_LIB, 'overlays');
    fs.mkdirSync(dir, { recursive: true });
    let dest = path.join(dir, nombre), n = 1;
    while (fs.existsSync(dest)) dest = path.join(dir, `${path.basename(nombre, ext)} (${n++})${ext}`);
    const ws = fs.createWriteStream(dest);
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 40 * 1024 * 1024) { req.destroy(); ws.destroy(); fs.unlink(dest, () => {}); } });
    req.pipe(ws);
    ws.on('finish', () => { state.overlayRev++; broadcast(); sendJSON(res, { ok: true, id: 'overlays/' + path.basename(dest) }); });
    ws.on('error', (e) => sendJSON(res, { error: e.message }, 500));
    return;
  }
  return false;
}

// ---------------------------------------------------------------- Rutas
// ¿El nombre con que se llamó al programa es de este equipo o de la red local? (evita "DNS rebinding":
// una página de internet que se hace pasar por localhost para leer la clave de los celulares)
function hostPermitido(req) {
  const h = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (!h) return true;
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === os.hostname().toLowerCase()
    || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':');
}
// Las órdenes (POST/PUT/DELETE) solo se aceptan desde las páginas del propio programa: el navegador
// marca el origen de cada petición y una página ajena no puede falsificarlo.
function origenPropio(req) {
  const o = req.headers.origin;
  if (!o || o === 'null') {
    const sitio = req.headers['sec-fetch-site'];
    return !o && (!sitio || sitio === 'same-origin' || sitio === 'none');
  }
  try { return new URL(o).host === String(req.headers.host || ''); } catch (_) { return false; }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (_) { return send(res, 400, 'Dirección inválida', 'text/plain'); }
  if (!hostPermitido(req)) return send(res, 403, 'Prohibido', 'text/plain');
  if (p.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method) && !origenPropio(req)) {
    return sendJSON(res, { error: 'Orden rechazada: no viene del panel de PK-PENTECOSTAL' }, 403);
  }

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
      // Textos de todas las diapositivas de la canción / versículos del capítulo: la salida calcula con ellos
      // UN solo tamaño de letra, así todas se ven iguales
      if (Array.isArray(b.vivo.grupo)) v.vivo.grupo = b.vivo.grupo.slice(0, 400).map((x) => String(x).slice(0, 4000));
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
    const it = state.overlay.item;
    if (it && it.itemId) {
      const g = state.rotulos.find((x) => x.id === it.grupo), i = g && g.items.find((x) => x.id === it.itemId);
      if (i) Object.assign(it, { texto: i.texto, sub: i.sub || g.subtitulo || '', color: i.color });
    }
    saveConfig(); broadcast();
    return sendJSON(res, { ok: true, rotulos: state.rotulos });
  }
  if (p === '/api/subir' && req.method === 'PUT') { // subida de imágenes/videos a fondos/Subidos
    const nombre = path.basename(url.searchParams.get('nombre') || '').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_');
    const ext = path.extname(nombre).toLowerCase();
    if (!nombre || ![...IMG_EXT, ...VID_EXT].includes(ext)) return sendJSON(res, { error: 'Solo imágenes (.jpg .png .webp .gif) o videos (.mp4 .webm)' }, 400);
    const dir = path.join(PRIV.fondos, 'Subidos');
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
    // Solo se pueden quitar los fondos que añadió el usuario («Mis fondos» = BSPK/fondos/Subidos);
    // los de fábrica vienen dentro del programa y no se borran.
    const rel = u.startsWith('/fondos/Subidos/') ? decodeURIComponent(u.slice(8)) : null;
    const f = rel ? safeJoin(path.join(PRIV.fondos, 'Subidos'), rel.slice('Subidos/'.length)) : null;
    if (!f || !fs.existsSync(f) || !fs.statSync(f).isFile()) return sendJSON(res, { error: u.startsWith('/fondos/') && !rel ? 'Los fondos incluidos en el programa no se pueden quitar' : 'Archivo no encontrado' }, 404);
    const mini = path.join(PRIV.miniaturas, miniClave(rel, fs.statSync(f).size) + '.jpg');
    fs.unlinkSync(f);
    try { fs.unlinkSync(mini); } catch (_) { /* no tenía miniatura */ }
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
  if (p === '/api/miniatura' && req.method === 'POST') { // el panel guarda la miniatura que generó
    const b = await readBody(req, 600 * 1024);
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dato || ''));
    if (!/^[0-9a-f]{20}$/.test(String(b.clave || '')) || !m) return sendJSON(res, { error: 'Formato inválido' }, 400);
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8) return sendJSON(res, { error: 'Formato inválido' }, 400);
    fs.mkdirSync(PRIV.miniaturas, { recursive: true });
    const dest = path.join(PRIV.miniaturas, b.clave + '.jpg');
    fs.writeFileSync(dest + '.tmp', buf); fs.renameSync(dest + '.tmp', dest);
    return sendJSON(res, { ok: true, mini: '/miniatura/' + b.clave + '.jpg' });
  }
  if (/^\/api\/(laterales|cuenta|bspk\/|actualizacion)/.test(p)) { const r = await rutasIdeas(req, res, p, url, equipo); if (r !== false) return; }
  if (p.startsWith('/api/overlays')) { const r = await rutasOverlays(req, res, p, url); if (r !== false) return; }
  if (p.startsWith('/api/stinger')) { const r = await rutasStinger(req, res, p, url, equipo); if (r !== false) return; }
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
  // --- Paso de los ajustes del navegador de la dirección antigua a http://pkipuc.localhost
  if (p === '/api/migrar-almacen') {
    if (!equipo) return sendJSON(res, { error: 'Solo desde el computador' }, 403);
    if (req.method === 'POST') {
      const b = await readBody(req, 4 * 1024 * 1024);
      const datos = {};
      if (b && b.datos && typeof b.datos === 'object') {
        for (const [k, v] of Object.entries(b.datos).slice(0, 500)) if (typeof v === 'string' && k.length < 200) datos[k] = v;
      }
      almacenPendiente = datos;
      config.almacenMigrado = true; escribirConfig();
      return sendJSON(res, { ok: true, url: urlPanel() });
    }
    const datos = almacenPendiente || {};
    almacenPendiente = null;
    return sendJSON(res, { datos });
  }
  if (p === '/api/obs/local') { // contiene la contraseña de OBS: solo para el panel abierto en este mismo equipo
    if (!equipo) return sendJSON(res, { encontrado: false, error: 'Solo desde el computador' }, 403);
    return sendJSON(res, obsLocal());
  }
  if (p === '/api/obs/buscar') { // OBS en otro computador de la red (solo desde el panel de este equipo)
    if (!equipo) return sendJSON(res, { encontrados: [], error: 'Solo desde el computador' }, 403);
    return sendJSON(res, await buscarOBS());
  }
  if (p === '/api/info') return sendJSON(res, { app: APP_NOMBRE, version: APP_VERSION, url: urlPanel(), urlProyector: urlProyector(), puertoProyector: PORT_PROY, autor: 'Hecho por Sebastian Lopez · IPUC Natania 6° Etapa', zona: 'Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina', puerto: PORT, ips: process.env.PK_TEST_IPS ? process.env.PK_TEST_IPS.split(",") : localIPs(), /* PK_TEST_IPS: solo pruebas */ sistema: process.platform, datos: ID_DATOS, escritorio: EN_ELECTRON });
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
  if (p.startsWith('/miniatura/')) { // miniaturas de fondos (no cambian nunca: caché larga)
    const f = archivoMini(p.slice(11).replace(/\.jpg$/, ''));
    if (!f) return send(res, 404, 'No encontrado', 'text/plain');
    return fs.readFile(f, (e, d) => { if (e) return send(res, 404, 'No encontrado', 'text/plain'); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': d.length, 'Cache-Control': 'max-age=31536000, immutable' }); res.end(d); });
  }
  if (p.startsWith('/fondos/')) { const f = archivoFondo(p.slice(8)); return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain'); }
  if (p.startsWith('/fuentes/')) { const f = archivoFuente(p.slice(9)); return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain'); }
  // Dirección antigua (localhost:8888) en este equipo → salto a http://pkipuc.localhost llevando los
  // ajustes. Si el navegador no conoce los nombres *.localhost (Safari antiguo), se queda aquí.
  if ((p === '/' || p === '/control') && req.method === 'GET' && esHostAntiguo(req) && !url.searchParams.has('quedarse')) {
    return send(res, 200, paginaSalto(), 'text/html; charset=utf-8');
  }
  if (p === '/' || p === '/control') return serveFile(req, res, path.join(PUBLIC_DIR, 'control.html'));
  if (p === '/salida' || p === '/proyector' || /^\/(visor|proyector)\/[1-9]$/.test(p) || p === '/obs' || p === '/pantalla' || p === '/chroma') return serveFile(req, res, path.join(PUBLIC_DIR, 'salida.html'));
  if (p === '/stinger') return serveFile(req, res, path.join(OBS_DIR, 'stinger.html'));
  if (p.startsWith('/obs/')) { // código del módulo OBS (no sus datos)
    const f = safeJoin(OBS_DIR, p.slice(5));
    return f && /\.(js|css|html)$/i.test(f) && !f.startsWith(OBS_LIB) ? serveFile(req, res, f) : send(res, 404, 'No encontrado', 'text/plain');
  }
  // Marca protegida: el logo y los diseños PK siempre salen de los archivos del programa, nunca de la carpeta de datos
  if (p.startsWith('/obs-lib/pk/')) { const f = safeJoin(PK_MARCA, p.slice(12)); return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain'); }
  if (p.startsWith('/obs-lib/')) { const f = safeJoin(OBS_LIB, p.slice(9)); return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain'); }
  if (p === '/capa' || p === '/overlay' || p === '/banner' || p === '/cuenta') return serveFile(req, res, path.join(OBS_DIR, 'capa.html'));
  const f = safeJoin(PUBLIC_DIR, p);
  return f ? serveFile(req, res, f) : send(res, 403, 'Prohibido', 'text/plain');
}

function esHostAntiguo(req) {
  const h = String(req.headers.host || '').toLowerCase();
  return esLocal(req) && ['localhost:' + PORT, '127.0.0.1:' + PORT, '[::1]:' + PORT].includes(h);
}
// Página mínima de la dirección antigua: comprueba que http://pkipuc.localhost responde, le pasa los
// ajustes guardados en este navegador (solo la primera vez) y salta. Si no responde, sigue en la antigua.
function paginaSalto() {
  const destino = JSON.stringify(urlPanel());
  const migrar = config.almacenMigrado ? 'false' : 'true';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>PK-PENTECOSTAL</title>
<link rel="icon" href="/icono-192.png"><style>body{margin:0;height:100vh;display:grid;place-items:center;background:#04162e;color:#cfe0ff;font:16px system-ui,sans-serif}</style></head>
<body><p>Abriendo PK-PENTECOSTAL…</p><script>
(async () => {
  const destino = ${destino}, migrar = ${migrar};
  const quedarse = () => location.replace('/?quedarse=1' + location.hash);
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 2500);
    await fetch(destino + '/icono-64.png?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: c.signal });
  } catch (_) { return quedarse(); }
  let extra = '';
  if (migrar) {
    const datos = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); datos[k] = localStorage.getItem(k); } } catch (_) { /* sin almacenamiento */ }
    try {
      await fetch('/api/migrar-almacen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datos }) });
      if (Object.keys(datos).length) extra = '?migrar=1';
    } catch (_) { /* sigue sin ajustes */ }
  }
  location.replace(destino + '/' + extra + location.hash);
})();
</script></body></html>`;
}
// Ajustes del servidor WebSocket de OBS instalado en ESTE equipo (OBS 28+: plugin_config/obs-websocket/config.json;
// versiones antiguas: sección [OBSWebSocket] de global.ini). El panel los usa cuando el puerto o la contraseña
// guardados no sirven, para que la conexión no dependa de copiarlos a mano.
function carpetaOBS() {
  if (process.env.PK_OBS_DIR) return process.env.PK_OBS_DIR; // solo para pruebas automáticas
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'obs-studio');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'obs-studio');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'obs-studio');
}
function obsLocal() {
  const dir = carpetaOBS();
  try {
    const c = JSON.parse(fs.readFileSync(path.join(dir, 'plugin_config', 'obs-websocket', 'config.json'), 'utf8'));
    return { encontrado: true, habilitado: c.server_enabled !== false, puerto: +c.server_port || 4455, clave: c.auth_required === false ? '' : String(c.server_password || '') };
  } catch (_) { /* sin config.json */ }
  try {
    const ini = fs.readFileSync(path.join(dir, 'global.ini'), 'utf8');
    const sec = (ini.match(/\[OBSWebSocket\]([\s\S]*?)(?:\n\[|$)/) || [])[1];
    if (sec) {
      const v = (k) => ((sec.match(new RegExp('^' + k + '=(.*)$', 'mi')) || [])[1] || '').trim();
      return { encontrado: true, habilitado: v('ServerEnabled') !== 'false', puerto: +v('ServerPort') || 4455, clave: v('AuthRequired') === 'false' ? '' : v('ServerPassword') };
    }
  } catch (_) { /* sin global.ini */ }
  return { encontrado: false };
}
// OBS en otro computador: prueba el puerto del servidor WebSocket de OBS (4455) en las redes de este equipo
// (/24), todos a la vez y con espera corta. Devuelve las IP que responden.
function buscarOBS() {
  const puerto = +process.env.PK_OBS_PUERTO || 4455;  // PK_OBS_PUERTO / PK_OBS_REDES: solo para pruebas
  const propias = localIPs();
  const redes = process.env.PK_OBS_REDES ? process.env.PK_OBS_REDES.split(',').map((x) => x.trim()).filter(Boolean)
    : [...new Set(propias.map((ip) => ip.split('.').slice(0, 3).join('.')))];
  const probar = (ip) => new Promise((ok) => {
    const s = require('net').connect({ host: ip, port: puerto });
    const fin = (r) => { s.destroy(); ok(r); };
    s.setTimeout(300, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
  const ips = redes.flatMap((r) => Array.from({ length: 254 }, (_, i) => `${r}.${i + 1}`));
  return Promise.all(ips.map((ip) => probar(ip).then((si) => (si ? { ip, propio: propias.includes(ip) || ip.startsWith('127.') } : null))))
    .then((r) => ({ puerto, encontrados: r.filter(Boolean) }));
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

// ---------------------------------------------------------------- Inicio del servidor y puertos
// 1) Si ya hay un PK-PENTECOSTAL abierto con ESTOS MISMOS datos, no se abre otro: se muestra ese.
// 2) Si 8888 lo usa otro programa (Proyektor original, etc.) se busca solo un puerto libre (8890…8999).
//    Nunca se cierra ni se toca un programa ajeno.
// 3) El puerto elegido queda en BSPK/puerto.json para el lanzador y la app de escritorio.
const ID_DATOS = crypto.createHash('sha1').update(DATA_ROOT.toLowerCase()).digest('hex').slice(0, 12);
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) sendJSON(res, { error: e.message }, 500); });
});
const serverProy = http.createServer(manejarProy);

function manejarProy(req, res) {
  const p = (req.url || '/').split('?')[0];
  if (p === '/' || p === '/control' || p === '/index.html') { res.writeHead(302, { Location: '/proyector' }); return res.end(); }
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) sendJSON(res, { error: e.message }, 500); });
}

// Puerto 80 (solo dentro de este equipo): http://pkipuc.localhost y http://proyector.pkipuc.localhost
function manejarWeb(req, res) {
  if (/^proyector\./i.test(String(req.headers.host || ''))) return manejarProy(req, res);
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) sendJSON(res, { error: e.message }, 500); });
}
// ¿Algún otro programa (IIS, XAMPP, Skype…) ya atiende ese puerto? Entonces no lo tocamos.
function puertoOcupado(host, puerto) {
  return new Promise((ok) => {
    const s = require('net').connect({ host, port: puerto });
    const fin = (v) => { s.destroy(); ok(v); };
    s.setTimeout(700, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}
async function abrirPuertoWeb() {
  if (!PORT_WEB || PORT_WEB === PORT || PORT_WEB === PORT_PROY) return;
  if ((await puertoOcupado('127.0.0.1', PORT_WEB)) || (await puertoOcupado('::1', PORT_WEB))) {
    console.log(`   (El puerto ${PORT_WEB} lo usa otro programa: se usará ${urlPanel()})`);
    return;
  }
  const escuchar = (host) => new Promise((ok) => {
    const s = http.createServer(manejarWeb);
    s.once('error', () => ok(false));
    s.listen(PORT_WEB, host, () => ok(true));
  });
  if (await escuchar('127.0.0.1')) { webActiva = true; await escuchar('::1'); }
}

// Registro interno (BSPK/logs/servidor.log): en la app de escritorio no hay consola visible
const LOG_FILE = path.join(PRIV.logs, 'servidor.log');
function registrar(nivel, args) {
  try {
    fs.mkdirSync(PRIV.logs, { recursive: true });
    try { if (fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.1'); } catch (_) { /* aún no existe */ }
    const txt = args.map((a) => (a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${nivel}] ${txt}\n`);
  } catch (_) { /* sin registro */ }
}
for (const [nivel, fn] of [['info', 'log'], ['error', 'error'], ['aviso', 'warn']]) {
  const orig = console[fn].bind(console);
  console[fn] = (...a) => { registrar(nivel, a); if (!EN_ELECTRON) orig(...a); };
}
process.on('uncaughtException', (e) => { console.error('Error inesperado (el programa sigue funcionando):', e); });
process.on('unhandledRejection', (e) => { console.error('Promesa rechazada sin manejar:', e); });

function infoEn(puerto) {
  return new Promise((ok) => {
    const r = http.get({ host: '127.0.0.1', port: puerto, path: '/api/info', timeout: 1500 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { ok(JSON.parse(d)); } catch (_) { ok(null); } });
    });
    r.on('error', () => ok(null)); r.on('timeout', () => { r.destroy(); ok(null); });
  });
}
function escucharEn(srv, puerto) {
  return new Promise((ok) => {
    const mal = (e) => { srv.removeListener('listening', bien); ok(e.code || 'ERROR'); };
    const bien = () => { srv.removeListener('error', mal); ok(true); };
    srv.once('error', mal); srv.once('listening', bien);
    srv.listen(puerto, '0.0.0.0');
  });
}
// Escucha en el primer puerto libre de la lista. En Windows otro programa puede tener el puerto solo en
// 127.0.0.1 y aun así dejarnos abrir 0.0.0.0 → primero se comprueba que nadie conteste allí.
async function primerPuertoLibre(srv, candidatos) {
  for (const p of candidatos) {
    if (!p || p > 65535) continue;
    if ((await puertoOcupado('127.0.0.1', p)) || (await puertoOcupado('::1', p))) continue;
    if ((await escucharEn(srv, p)) === true) return p;
  }
  return 0;
}
const rango = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

function avisarPadre(msg) { try { if (process.parentPort) process.parentPort.postMessage(msg); else if (process.send) process.send(msg); } catch (_) { /* sin ventana */ } }
function escribirPuerto() {
  try {
    fs.mkdirSync(BSPK, { recursive: true });
    fs.writeFileSync(PRIV.puerto, JSON.stringify({ puerto: PORT, proyector: PORT_PROY, pid: process.pid, url: urlPanel(), datos: ID_DATOS, t: Date.now() }));
  } catch (_) { /* no crítico */ }
}
function borrarPuerto() {
  try { const d = JSON.parse(fs.readFileSync(PRIV.puerto, 'utf8')); if (d.pid === process.pid) fs.unlinkSync(PRIV.puerto); } catch (_) { /* ya no está */ }
}
process.on('exit', borrarPuerto);

async function iniciarServidor() {
  // ¿Ya está abierto con estos mismos datos? (puerto preferido o el que quedó anotado)
  let anotado = 0;
  try { anotado = +JSON.parse(fs.readFileSync(PRIV.puerto, 'utf8')).puerto || 0; } catch (_) { /* no hay */ }
  for (const p of [...new Set([PORT_PREFERIDO, anotado].filter(Boolean))]) {
    const info = await infoEn(p);
    if (info && info.app === APP_NOMBRE && (info.datos === ID_DATOS || (!info.datos && !DATOS_APARTE))) {
      const url = `http://localhost:${p}/`;
      console.log(`\n   ${APP_NOMBRE} ya estaba abierto (puerto ${p}). Mostrando el panel…\n`);
      avisarPadre({ tipo: 'ya-abierto', puerto: p, url: info.url || url, urlLocal: url });
      if (ABRIR && !EN_ELECTRON) abrirNavegador(url);
      setTimeout(() => process.exit(0), 200);
      return;
    }
  }
  const p = await primerPuertoLibre(server, [PORT_PREFERIDO, ...rango(PORT_PREFERIDO + 2, PORT_PREFERIDO + 111)]);
  if (!p) {
    const msg = `No se encontró un puerto libre entre ${PORT_PREFERIDO} y ${PORT_PREFERIDO + 111}.`;
    console.error('\n  ' + msg + '\n');
    avisarPadre({ tipo: 'error', codigo: 'SIN_PUERTO', mensaje: msg });
    setTimeout(() => process.exit(2), 200);
    return;
  }
  PORT = p;
  if (PORT !== PORT_PREFERIDO) console.log(`   El puerto ${PORT_PREFERIDO} lo usa otro programa: PK-PENTECOSTAL usará el ${PORT}.`);
  server.on('error', (e) => console.error('Servidor:', e));
  const deseadoProy = Number(process.env.PORT_PROYECTOR) || PORT + 1;
  PORT_PROY = await primerPuertoLibre(serverProy, [deseadoProy, ...rango(PORT + 112, PORT + 140)]);
  if (!PORT_PROY) { PORT_PROY = PORT; console.error(`   Aviso: no se pudo abrir la dirección exclusiva del proyector; use ${urlPanel()}/proyector`); }
  serverProy.on('error', (e) => console.error('Proyector:', e));
  await abrirPuertoWeb();
  escribirPuerto();

  const en = String(config.idioma).startsWith('en');
  const T = (es, ing) => (en ? ing : es);
  const U = urlPanel();
  console.log('\n  ==============================================');
  console.log(T('   PK-PENTECOSTAL  -  Biblia y Canciones en vivo', '   PK-PENTECOSTAL  -  Bible and Songs, live'));
  console.log('  ==============================================');
  console.log(T('   Panel de control : ', '   Control panel     : ') + `${U}/`);
  console.log(T('   OBS (tercio inf.) : ', '   OBS (lower third) : ') + `${U}/salida?modo=obs`);
  console.log(T('   OBS (pantalla)    : ', '   OBS (full screen) : ') + `${U}/salida?modo=pantalla`);
  console.log(T('   Proyector (F11)   : ', '   Projector (F11)   : ') + `${urlProyector()}/`);
  console.log(T('   OBS rótulos+banner: ', '   OBS tags+banner   : ') + `${U}/capa`);
  console.log(T('   (Si su navegador no abre esas direcciones, use http://localhost:' + PORT + '/ )', '   (If your browser cannot open them, use http://localhost:' + PORT + '/ )'));
  for (const ip of localIPs()) console.log(T('   En la red local   : ', '   On local network  : ') + `http://${ip}:${PORT}/`);
  console.log(T('   Celular           : botón 📱 "Conectar celular" del panel (código QR)', '   Phone             : 📱 "Connect phone" button on the panel (QR code)'));
  console.log(T('\n   Deje esta ventana abierta mientras use el programa.', '\n   Keep this window open while using the program.'));
  console.log('  ----------------------------------------------');
  console.log(T('   Hecho por Sebastian Lopez · IPUC Natania 6° Etapa', '   Made by Sebastian Lopez · IPUC Natania 6th Stage'));
  console.log(T('   Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina', '   Special Missionary Zone – Archipelago of San Andrés, Providencia and Santa Catalina'));
  console.log(T('   «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4\n', '   “Their line is gone out through all the earth, and their words to the end of the world.” Psalm 19:4\n'));
  avisarPadre({ tipo: 'listo', puerto: PORT, proyector: PORT_PROY, url: urlPanel(), urlLocal: `http://localhost:${PORT}/` });
  if (ABRIR && !EN_ELECTRON) abrirNavegador(`http://localhost:${PORT}/`);
}
// La app de escritorio pide cerrar con un mensaje (cierre ordenado: guarda y apaga el Wi-Fi propio)
if (process.parentPort) process.parentPort.on('message', (e) => { if (e && e.data && e.data.tipo === 'apagar') apagar(0); });
else if (process.send) process.on('message', (m) => { if (m && m.tipo === 'apagar') apagar(0); });
iniciarServidor().catch((e) => {
  console.error('No se pudo iniciar el servidor:', e);
  avisarPadre({ tipo: 'error', codigo: 'INICIO', mensaje: e.message });
  setTimeout(() => process.exit(1), 200);
});
