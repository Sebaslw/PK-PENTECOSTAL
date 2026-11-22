// PK-PENTECOSTAL · Aplicación de escritorio (Electron)
// Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
// Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
//
// Qué hace al abrir PK-PENTECOSTAL.exe:
//   1. Evita instancias duplicadas (si ya está abierto, muestra esa ventana).
//   2. Prepara la carpeta de datos del usuario (separada de los archivos del programa).
//   3. Inicia el servidor interno (server.js) con el Node.js que trae Electron: no hace falta instalar Node.js.
//   4. El servidor elige un puerto libre (8888 o el siguiente disponible) y avisa cuando está listo.
//   5. Abre el panel. Si el servidor se cae, lo vuelve a levantar solo.
'use strict';
const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, session, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const NOMBRE = 'PK-PENTECOSTAL';
const RAIZ_APP = path.resolve(__dirname, '..');                 // biblias, fondos, css, PK-PENTECOSTAL/…
const SERVER_JS = path.join(RAIZ_APP, 'PK-PENTECOSTAL', 'server.js');
// Marca protegida: el logo, los iconos y el manual se leen desde el paquete .asar del programa, que Electron
// verifica (integridad). Si alguien altera esos archivos, el programa no los muestra y pide reinstalar.
const ICONO = path.join(RAIZ_APP, 'PK-PENTECOSTAL', 'pk-pentecostal.ico');

// ---------------------------------------------------------------- Carpeta de datos del usuario
// · Versión instalada: %APPDATA%\PK-PENTECOSTAL  (se conserva al desinstalar o actualizar)
// · Versión portable : carpeta "PK-PENTECOSTAL datos" junto al .exe (se lleva en la memoria USB)
// · Variable PK_DATA_ROOT: para pruebas
function carpetaDatos() {
  if (process.env.PK_DATA_ROOT) return path.resolve(process.env.PK_DATA_ROOT);
  if (process.env.PORTABLE_EXECUTABLE_DIR) return path.join(process.env.PORTABLE_EXECUTABLE_DIR, `${NOMBRE} datos`);
  return path.join(app.getPath('appData'), NOMBRE);
}
const DATOS = carpetaDatos();
app.setPath('userData', path.join(DATOS, 'BSPK', 'escritorio')); // caché y almacenamiento de la ventana
fs.mkdirSync(path.join(DATOS, 'BSPK', 'logs'), { recursive: true });

// ---------------------------------------------------------------- Registro de eventos
const LOG = path.join(DATOS, 'BSPK', 'logs', 'escritorio.log');
function log(...a) {
  try {
    try { if (fs.statSync(LOG).size > 2 * 1024 * 1024) fs.renameSync(LOG, LOG + '.1'); } catch (_) { /* nuevo */ }
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${a.map((x) => (x instanceof Error ? x.stack : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}\n`);
  } catch (_) { /* sin registro */ }
}
process.on('uncaughtException', (e) => log('[error]', e));

// ---------------------------------------------------------------- Una sola instancia
if (!app.requestSingleInstanceLock()) {
  app.exit(0); // ya hay un PK-PENTECOSTAL abierto: esa ventana se muestra sola (second-instance)
} else {
  app.on('second-instance', () => {
    log('[instancia] se intentó abrir otra vez: se muestra la ventana existente');
    const w = ventana && !ventana.isDestroyed() ? ventana : null;
    if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
  });
  arrancar();
}

let ventana = null, splash = null, servidor = null, urlPanel = null, saliendo = false, reinicios = 0;
let externo = false; // el panel lo sirve otro PK-PENTECOSTAL ya abierto (versión de carpeta) con estos datos

function arrancar() {
  app.whenReady().then(() => {
    log('--- Inicio', app.getVersion(), 'datos:', DATOS, 'portable:', !!process.env.PORTABLE_EXECUTABLE_DIR);
    Menu.setApplicationMenu(menu());
    // Permisos de la ventana: solo para las páginas del propio programa (pantallas, pantalla completa, portapapeles)
    session.defaultSession.setPermissionRequestHandler((wc, permiso, cb, det) => cb(esPropia(det.requestingUrl || wc.getURL())));
    session.defaultSession.setPermissionCheckHandler((wc, permiso, origen) => esPropia(origen || (wc && wc.getURL()) || ''));
    mostrarSplash();
    iniciarServidor();
    iniciarActualizaciones();
  });
  app.on('window-all-closed', () => salir());
  app.on('before-quit', () => { saliendo = true; detenerServidor(); });
}

// URLs del propio programa: localhost, 127.0.0.1 y *.localhost
function esPropia(u) {
  try { const h = new URL(u).hostname; return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost'); } catch (_) { return false; }
}

// ---------------------------------------------------------------- Servidor interno
function iniciarServidor() {
  if (!fs.existsSync(SERVER_JS)) return fallo('Faltan archivos del programa', `No se encontró:\n${SERVER_JS}\n\nVuelva a instalar PK-PENTECOSTAL.`);
  const env = { ...process.env, PK_DATA_ROOT: DATOS, PK_ELECTRON: '1', PK_VERSION: app.getVersion() };
  delete env.ELECTRON_RUN_AS_NODE;
  // cwd = carpeta de datos: la del programa está dentro del paquete .asar (no es una carpeta real del disco)
  servidor = utilityProcess.fork(SERVER_JS, [], { env, cwd: DATOS, stdio: 'pipe', serviceName: 'PK-PENTECOSTAL servidor' });
  const proc = servidor;
  let listo = false;
  const t0 = Date.now();
  proc.stdout && proc.stdout.on('data', (d) => log('[servidor]', String(d).trim()));
  let alterado = false;
  proc.stderr && proc.stderr.on('data', (d) => {
    const t = String(d).trim();
    log('[servidor:error]', t);
    if (/ASAR Integrity Violation/i.test(t)) alterado = true;
  });
  const espera = setTimeout(() => { if (!listo) fallo('PK-PENTECOSTAL no respondió', 'El servidor interno tardó demasiado en iniciar.\n\nCierre el programa y ábralo de nuevo. Si se repite, reinicie el computador.'); }, 45000);
  proc.on('message', (m) => {
    if (!m || typeof m !== 'object') return;
    if (m.tipo === 'listo' || m.tipo === 'ya-abierto') {
      listo = true; clearTimeout(espera); reinicios = 0;
      externo = m.tipo === 'ya-abierto';
      urlPanel = m.url || m.urlLocal;
      log(`[servidor] ${m.tipo} en ${Date.now() - t0} ms →`, m);
      abrirPanel(urlPanel, m.urlLocal);
    } else if (m.tipo === 'buscar-actualizacion') { // botón de versión del panel
      buscarActualizacion(true);
    } else if (m.tipo === 'error') {
      clearTimeout(espera);
      fallo('No se pudo iniciar PK-PENTECOSTAL', m.codigo === 'SIN_PUERTO'
        ? 'Todos los puertos que usa PK-PENTECOSTAL (8888 a 8999) están ocupados por otros programas.\n\nCierre algún programa que use la red (servidores, otros proyectores) y vuelva a abrir PK-PENTECOSTAL.'
        : 'Detalle: ' + (m.mensaje || 'desconocido'));
    }
  });
  proc.on('exit', (codigo) => {
    log('[servidor] terminó con código', codigo);
    if (proc !== servidor) return;
    servidor = null;
    if (saliendo) return;
    if (externo && codigo === 0) return;              // otra copia sirve el panel: no hace falta servidor propio
    if (codigo === 0) { setTimeout(salir, 1800); return; } // se cerró desde el botón "Apagar" del panel (se ve el mensaje de despedida)
    // Cierre inesperado: se reinicia solo (hasta 3 veces seguidas)
    if (alterado) {
      clearTimeout(espera);
      fallo('Los archivos de PK-PENTECOSTAL fueron modificados', 'Por seguridad, el programa no abre si sus archivos (por ejemplo, el logo) fueron cambiados.\n\nVuelva a instalar PK-PENTECOSTAL desde https://sebaslw.github.io/pk-pentecostal.io/\nSus datos y ajustes se conservan.');
      return;
    }
    if (listo && reinicios < 3) { reinicios++; log('[servidor] reinicio automático', reinicios); iniciarServidor(); return; }
    clearTimeout(espera);
    fallo('PK-PENTECOSTAL se detuvo', `El servidor interno se cerró inesperadamente (código ${codigo}).\n\nRegistro de eventos:\n${LOG.replace('escritorio.log', '')}`);
  });
}
function detenerServidor() {
  const p = servidor; if (!p) return;
  try { p.postMessage({ tipo: 'apagar' }); } catch (_) { /* ya cerrado */ }
  setTimeout(() => { try { p.kill(); } catch (_) { /* ya cerrado */ } }, 2500);
}
function salir() {
  log('[salir] cierre solicitado');
  if (saliendo && !servidor) { app.quit(); return; }
  saliendo = true;
  const p = servidor;
  if (!p) { app.quit(); return; }
  // Cierre ordenado: el servidor guarda la configuración y apaga el Wi-Fi propio si lo encendió
  p.once('exit', () => app.quit());
  try { p.postMessage({ tipo: 'apagar' }); } catch (_) { app.quit(); }
  setTimeout(() => { try { p.kill(); } catch (_) { /* ya cerrado */ } app.quit(); }, 4000);
}

// ---------------------------------------------------------------- Actualización automática
// La versión instalada busca sola una versión nueva en las Releases de GitHub (al abrir y cada 6 horas),
// la descarga en segundo plano y avisa con una notificación de Windows. La actualización se instala ENCIMA,
// sin desinstalar: los datos del usuario viven aparte (%APPDATA%\PK-PENTECOSTAL) y se conservan.
// · «Actualizar ahora»: se cierra unos segundos, se instala sola y se vuelve a abrir.
// · «Al cerrar el programa»: se instala cuando el usuario cierre PK-PENTECOSTAL (útil en pleno culto).
// Al abrir la versión nueva aparece «PK-PENTECOSTAL se actualizó». La versión portable no se puede
// actualizar sola: avisa y da el enlace de descarga.
// Pruebas: PK_UPDATE_URL=<carpeta http con latest.yml> usa ese origen; PK_UPDATE_PRUEBA=1 no muestra diálogos.
const PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
const PRUEBA_ACT = process.env.PK_UPDATE_PRUEBA === '1';
const VERSION_FILE = path.join(DATOS, 'BSPK', 'version.json');
let autoUpdater = null, actEstado = 'nada', actManual = false, actInfo = null, preguntando = false;

function notificar(titulo, cuerpo) {
  try { if (Notification.isSupported()) new Notification({ title: titulo, body: cuerpo, icon: ICONO }).show(); } catch (e) { log('[notificación]', e); }
}
const textoPlano = (s) => String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
function novedades(info) {
  const n = textoPlano(Array.isArray(info && info.releaseNotes) ? info.releaseNotes.map((x) => x.note).join('\n') : info && info.releaseNotes);
  // Solo las viñetas (la tabla de descargas y las huellas SHA-256 no le sirven al usuario)
  const lineas = n.split('\n').map((l) => l.trim()).filter((l) => /^[-•*🖼🔠📦📘✅⬆]/u.test(l) && !/sha-?256/i.test(l)).slice(0, 8);
  return lineas.length ? `\n\nNovedades:\n${lineas.join('\n').slice(0, 900)}` : '';
}

function iniciarActualizaciones() {
  if ((!app.isPackaged && !PRUEBA_ACT) || PORTABLE) { log('[act] desactivada', { empaquetado: app.isPackaged, portable: PORTABLE }); return; }
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { log('[act] no se pudo cargar electron-updater', e); return; }
  autoUpdater.logger = { info: (m) => log('[act]', m), warn: (m) => log('[act:aviso]', m), error: (m) => log('[act:error]', m), debug: () => {} };
  autoUpdater.autoDownload = true;            // se descarga sola, en segundo plano
  autoUpdater.autoInstallOnAppQuit = !PRUEBA_ACT; // si no la instala ahora, se instala al cerrar (en pruebas, nunca)
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableWebInstaller = true;
  if (process.env.PK_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.PK_UPDATE_URL });
  autoUpdater.on('update-available', (i) => {
    actEstado = 'descargando'; actInfo = i;
    log('[act] versión nueva disponible', i.version);
    notificar(`⬆ Hay una nueva actualización: ${NOMBRE} ${i.version}`, 'Se está descargando en segundo plano. Puede seguir usando el programa con normalidad.');
  });
  autoUpdater.on('update-not-available', () => {
    actEstado = 'nada';
    if (actManual) dialog.showMessageBox(ventana, { type: 'info', title: NOMBRE, icon: ICONO, message: `Tiene la versión más reciente (${app.getVersion()})`, detail: 'PK-PENTECOSTAL busca actualizaciones solo cada vez que se abre.' });
    actManual = false;
  });
  autoUpdater.on('download-progress', (p) => { try { if (ventana) ventana.setProgressBar(Math.max(0.01, p.percent / 100)); } catch (_) { /* nada */ } });
  autoUpdater.on('update-downloaded', (i) => {
    try { if (ventana) ventana.setProgressBar(-1); } catch (_) { /* nada */ }
    actEstado = 'lista'; actInfo = i; actManual = false;
    log('[act] descargada y verificada', i.version);
    preguntarInstalar(i);
  });
  autoUpdater.on('error', (e) => {
    try { if (ventana) ventana.setProgressBar(-1); } catch (_) { /* nada */ }
    if (actEstado !== 'lista') actEstado = 'nada';
    log('[act:error]', e && (e.stack || e.message));
    if (actManual) dialog.showMessageBox(ventana, { type: 'warning', title: NOMBRE, icon: ICONO, message: 'No se pudo buscar la actualización', detail: 'Revise la conexión a internet e intente de nuevo.\nTambién puede descargarla de https://sebaslw.github.io/pk-pentecostal.io/ e instalarla encima (sin desinstalar).' });
    actManual = false;
  });
  setTimeout(() => buscarActualizacion(false), PRUEBA_ACT ? 3000 : 20000);
  setInterval(() => buscarActualizacion(false), 6 * 3600 * 1000);
}

function buscarActualizacion(manual) {
  if (!autoUpdater) {
    if (manual) dialog.showMessageBox(ventana, { type: 'info', title: NOMBRE, icon: ICONO, message: PORTABLE ? 'La versión portable no se actualiza sola' : 'Actualización automática no disponible',
      detail: 'Descargue la versión nueva de https://sebaslw.github.io/pk-pentecostal.io/\nSus datos se conservan.', buttons: ['Abrir la página', 'Cerrar'] })
      .then((r) => { if (r.response === 0) shell.openExternal('https://sebaslw.github.io/pk-pentecostal.io/'); });
    return;
  }
  if (actEstado === 'lista') { if (manual) preguntarInstalar(actInfo); return; }
  if (actEstado === 'descargando' || actEstado === 'buscando') {
    if (manual) dialog.showMessageBox(ventana, { type: 'info', title: NOMBRE, icon: ICONO, message: actInfo ? `Descargando ${NOMBRE} ${actInfo.version}…` : 'Buscando actualizaciones…', detail: 'Le avisaremos cuando esté lista para instalar.' });
    return;
  }
  actManual = !!manual; actEstado = 'buscando';
  autoUpdater.checkForUpdates().then((r) => { if (!r && actEstado === 'buscando') actEstado = 'nada'; })
    .catch((e) => { if (actEstado === 'buscando') actEstado = 'nada'; log('[act] búsqueda falló', e && e.message); });
}

async function preguntarInstalar(i) {
  notificar(`✅ ${NOMBRE} ${i.version} está lista para instalar`, 'No hace falta desinstalar: sus canciones, fondos y ajustes se conservan.');
  if (PRUEBA_ACT || preguntando) return;
  preguntando = true;
  try {
    const r = await dialog.showMessageBox(ventana, {
      type: 'info', title: NOMBRE, icon: ICONO, noLink: true,
      message: `⬆ Nueva actualización: ${NOMBRE} ${i.version}`,
      detail: `Usted tiene la versión ${app.getVersion()}. La actualización ya se descargó y se verificó.\n\n` +
        'Se instala ENCIMA, sin desinstalar nada: sus canciones, fondos, ajustes y claves de los celulares se conservan.\n\n' +
        '«Actualizar ahora»: el programa se cierra unos segundos, se actualiza y se vuelve a abrir solo.\n' +
        '«Al cerrar el programa»: si está en pleno culto, se actualizará cuando lo cierre.' + novedades(i),
      buttons: ['Actualizar ahora', 'Al cerrar el programa'], defaultId: 0, cancelId: 1,
    });
    if (r.response === 0) instalarYReiniciar();
    else log('[act] se instalará al cerrar');
  } finally { preguntando = false; }
}

function instalarYReiniciar() {
  log('[act] instalando y reiniciando');
  saliendo = true;
  let hecho = false;
  const fin = () => { if (hecho) return; hecho = true; try { autoUpdater.quitAndInstall(true, true); } catch (e) { log('[act] quitAndInstall', e); app.quit(); } };
  const p = servidor; // primero se apaga el servidor en orden (guarda la configuración)
  if (!p) return fin();
  p.once('exit', fin);
  try { p.postMessage({ tipo: 'apagar' }); } catch (_) { fin(); }
  setTimeout(() => { try { p.kill(); } catch (_) { /* ya cerrado */ } fin(); }, 4000);
}

// Al abrir una versión más nueva que la de la última vez: «PK-PENTECOSTAL se actualizó»
function compararVersiones(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0), pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let k = 0; k < Math.max(pa.length, pb.length); k++) { const d = (pa[k] || 0) - (pb[k] || 0); if (d) return d; }
  return 0;
}
function avisoSiSeActualizo() {
  const ahora = app.getVersion();
  let antes = null;
  try { antes = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')).version; }
  catch (_) { if (fs.existsSync(path.join(DATOS, 'BSPK', 'config.json'))) antes = 'anterior'; } // venía de la 2.0.2 o antes
  try { fs.writeFileSync(VERSION_FILE, JSON.stringify({ version: ahora, fecha: new Date().toISOString() })); } catch (e) { log('[act] version.json', e); }
  if (!antes || antes === ahora || (antes !== 'anterior' && compararVersiones(ahora, antes) <= 0)) return;
  log('[act] actualizado', antes, '→', ahora);
  notificar(`✅ ${NOMBRE} se actualizó a la versión ${ahora}`, 'Sus canciones, fondos y ajustes se conservaron.');
  if (PRUEBA_ACT) return;
  dialog.showMessageBox(ventana, { type: 'info', title: NOMBRE, icon: ICONO, noLink: true,
    message: `✅ ¡${NOMBRE} se actualizó!`,
    detail: `${antes === 'anterior' ? '' : `Versión anterior: ${antes}\n`}Versión nueva: ${ahora}\n\nSus canciones, fondos, ajustes y claves de los celulares se conservaron.\n\nDesde ahora el programa se actualiza solo: cuando haya una versión nueva le llegará un aviso.`,
    buttons: ['¡Listo!', 'Ver novedades'], defaultId: 0, cancelId: 0,
  }).then((r) => { if (r.response === 1) shell.openExternal(`https://github.com/Sebaslw/PK-PENTECOSTAL/releases/tag/v${ahora}`); });
}

// ---------------------------------------------------------------- Ventanas
function mostrarSplash() {
  splash = new BrowserWindow({ width: 520, height: 340, frame: false, resizable: false, show: false, center: true, backgroundColor: '#04162e', icon: ICONO, skipTaskbar: false, title: NOMBRE });
  splash.loadFile(path.join(__dirname, 'splash.html'), { query: { v: app.getVersion() } });
  splash.once('ready-to-show', () => splash && splash.show());
}
function cerrarSplash() { if (splash && !splash.isDestroyed()) splash.close(); splash = null; }

function abrirPanel(url, urlLocal) {
  if (ventana && !ventana.isDestroyed()) { ventana.loadURL(url); return; }
  ventana = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 600, show: false, backgroundColor: '#04162e', icon: ICONO, title: NOMBRE,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false },
  });
  ventana.maximize();
  configurarVentana(ventana);
  ventana.webContents.on('did-fail-load', (e, codigo, desc, u, principal) => {
    if (!principal) return;
    log('[ventana] no cargó', u, codigo, desc);
    // Si el nombre pkipuc.localhost no resuelve en este equipo, se usa localhost
    if (urlLocal && u && !u.startsWith(urlLocal)) ventana.loadURL(urlLocal + '?quedarse=1');
  });
  ventana.once('ready-to-show', () => { cerrarSplash(); ventana.show(); ventana.focus(); setTimeout(avisoSiSeActualizo, 2500); });
  ventana.on('page-title-updated', (e) => { e.preventDefault(); ventana.setTitle(NOMBRE); });
  ventana.on('closed', () => { log('[ventana] panel cerrado'); ventana = null; salir(); }); // al cerrar el panel se cierra todo (también el proyector)
  ventana.loadURL(url);
}

// Ventanas que abre el panel (proyector, editor de overlays…) y enlaces externos
function configurarVentana(w) {
  w.webContents.setWindowOpenHandler(({ url, features }) => {
    if (!esPropia(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#000000', icon: ICONO, fullscreen: /(^|,)\s*fullscreen/.test(features || ''), webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } } };
  });
  w.webContents.on('did-create-window', (hija) => { hija.setMenuBarVisibility(false); configurarVentana(hija); });
  w.webContents.on('will-navigate', (e, url) => { if (!esPropia(url)) { e.preventDefault(); shell.openExternal(url); } });
  // F11 = pantalla completa · F12 = herramientas (soporte)
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { e.preventDefault(); w.setFullScreen(!w.isFullScreen()); }
    else if (input.key === 'F12' && input.control && input.shift) { e.preventDefault(); w.webContents.toggleDevTools(); }
  });
  // Descargas (respaldo .zip): preguntar dónde guardar
  w.webContents.session.removeAllListeners('will-download');
  w.webContents.session.on('will-download', (e, item) => {
    item.setSaveDialogOptions({ title: 'Guardar', defaultPath: path.join(app.getPath('documents'), item.getFilename()) });
  });
}

function fallo(titulo, texto) {
  log('[fallo]', titulo, texto);
  cerrarSplash();
  dialog.showMessageBoxSync({ type: 'error', title: NOMBRE, message: titulo, detail: texto, buttons: ['Cerrar'], icon: ICONO });
  saliendo = true;
  detenerServidor();
  app.quit();
}

// ---------------------------------------------------------------- Importar datos de una versión anterior (carpeta)
// Copia BSPK, cancioneros y la biblioteca OBS de una carpeta "PK-PENTECOSTAL" antigua (la que se abría con
// PK-PENTECOSTAL.vbs) a la carpeta de datos de esta aplicación. Antes guarda una copia de lo actual.
function copiarArbol(origen, destino, filtro) {
  let n = 0;
  if (!fs.existsSync(origen)) return 0;
  const st = fs.statSync(origen);
  if (st.isFile()) { fs.mkdirSync(path.dirname(destino), { recursive: true }); fs.copyFileSync(origen, destino); return 1; }
  for (const e of fs.readdirSync(origen, { withFileTypes: true })) {
    const a = path.join(origen, e.name), b = path.join(destino, e.name);
    if (filtro && !filtro(a, e)) continue;
    n += copiarArbol(a, b, filtro);
  }
  return n;
}
async function importarVersionAnterior() {
  const r = await dialog.showOpenDialog(ventana, { title: 'Elija la carpeta de la versión anterior de PK-PENTECOSTAL', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return;
  let raiz = r.filePaths[0];
  if (path.basename(raiz).toUpperCase() === 'PK-PENTECOSTAL' && fs.existsSync(path.join(raiz, 'server.js'))) raiz = path.dirname(raiz);
  if (!fs.existsSync(path.join(raiz, 'BSPK')) && !fs.existsSync(path.join(raiz, 'PK-PENTECOSTAL', 'server.js'))) {
    dialog.showMessageBox(ventana, { type: 'warning', title: NOMBRE, message: 'Esa carpeta no parece de PK-PENTECOSTAL', detail: 'Elija la carpeta que contiene PK-PENTECOSTAL.vbs y la carpeta BSPK.' });
    return;
  }
  const ok = dialog.showMessageBoxSync(ventana, { type: 'question', title: NOMBRE, message: 'Importar ajustes, canciones y stingers', detail: `Desde:\n${raiz}\n\nAntes de importar se guarda una copia de los datos actuales. El programa se reiniciará.`, buttons: ['Importar', 'Cancelar'], defaultId: 0, cancelId: 1 });
  if (ok !== 0) return;
  try {
    const sello = new Date().toISOString().replace(/[:.]/g, '-');
    const copia = path.join(DATOS, 'BSPK', 'respaldos', 'antes-de-importar-carpeta-' + sello);
    const sinPesado = (a) => !/[\\/]traductor[\\/](node_modules|modelos)$/.test(a) && !/[\\/]escritorio$/.test(a) && !/[\\/]logs$/.test(a) && !/puerto\.json$/.test(a);
    copiarArbol(path.join(DATOS, 'BSPK', 'config.json'), path.join(copia, 'config.json'));
    copiarArbol(path.join(DATOS, 'cancioneros'), path.join(copia, 'cancioneros'));
    for (const f of ['stingers.json', 'laterales.json', 'overlays.json']) copiarArbol(path.join(DATOS, 'obs', f), path.join(copia, 'obs', f));
    // Se detiene el servidor para que no pise la configuración importada
    saliendo = true;
    await new Promise((ok2) => { if (!servidor) return ok2(); servidor.once('exit', ok2); try { servidor.postMessage({ tipo: 'apagar' }); } catch (_) { ok2(); } setTimeout(ok2, 4000); });
    let n = 0;
    n += copiarArbol(path.join(raiz, 'BSPK'), path.join(DATOS, 'BSPK'), sinPesado);
    n += copiarArbol(path.join(raiz, 'cancioneros'), path.join(DATOS, 'cancioneros'));
    const obsViejo = path.join(raiz, 'PK-PENTECOSTAL', 'obs');
    for (const f of ['stingers.json', 'laterales.json', 'overlays.json']) n += copiarArbol(path.join(obsViejo, f), path.join(DATOS, 'obs', f));
    n += copiarArbol(path.join(obsViejo, 'biblioteca'), path.join(DATOS, 'obs', 'biblioteca'));
    n += copiarArbol(path.join(raiz, 'css', 'font'), path.join(DATOS, 'css', 'font'), (a) => !fs.existsSync(path.join(RAIZ_APP, 'css', 'font', path.relative(path.join(raiz, 'css', 'font'), a))));
    log('[importar] carpeta', raiz, 'archivos', n);
    dialog.showMessageBoxSync({ type: 'info', title: NOMBRE, message: 'Datos importados', detail: `${n} archivos copiados.\nCopia de seguridad de lo anterior en:\n${copia}\n\nPK-PENTECOSTAL se reiniciará.` });
  } catch (e) {
    log('[importar] error', e);
    dialog.showMessageBoxSync({ type: 'error', title: NOMBRE, message: 'No se pudo importar', detail: e.message });
  }
  app.relaunch(); app.exit(0);
}

// El manual vive dentro del paquete protegido: se copia (verificado) a una carpeta temporal y se abre desde ahí
function abrirManual() {
  try {
    const destino = path.join(app.getPath('temp'), 'Manual PK-PENTECOSTAL.pdf');
    fs.copyFileSync(path.join(RAIZ_APP, 'Manual PK-PENTECOSTAL.pdf'), destino);
    shell.openPath(destino);
  } catch (e) { log('[manual]', e); shell.openExternal('https://sebaslw.github.io/pk-pentecostal.io/'); }
}

// ---------------------------------------------------------------- Menú (se muestra con la tecla Alt)
function menu() {
  const ir = (ruta) => () => { if (urlPanel) shell.openExternal(urlPanel.replace(/\/$/, '') + ruta); };
  return Menu.buildFromTemplate([
    { label: 'Archivo', submenu: [
      { label: 'Abrir el panel en el navegador', click: ir('/') },
      { label: 'Abrir el proyector en el navegador', click: ir('/proyector') },
      { type: 'separator' },
      { label: 'Abrir carpeta de datos', click: () => shell.openPath(DATOS) },
      { label: 'Importar datos de una versión anterior…', click: importarVersionAnterior },
      { label: 'Ver registro de eventos', click: () => shell.openPath(path.join(DATOS, 'BSPK', 'logs')) },
      { type: 'separator' },
      { label: 'Salir', accelerator: 'Alt+F4', click: () => salir() },
    ] },
    { label: 'Ver', submenu: [
      { role: 'reload', label: 'Recargar' },
      { role: 'togglefullscreen', label: 'Pantalla completa' },
      { type: 'separator' },
      { role: 'zoomIn', label: 'Acercar' }, { role: 'zoomOut', label: 'Alejar' }, { role: 'resetZoom', label: 'Tamaño normal' },
    ] },
    { label: 'Ayuda', submenu: [
      { label: 'Manual de PK-PENTECOSTAL', click: abrirManual },
      { label: 'Página web', click: () => shell.openExternal('https://sebaslw.github.io/pk-pentecostal.io/') },
      { label: 'Buscar actualizaciones…', click: () => buscarActualizacion(true) },
      { type: 'separator' },
      { label: 'Acerca de PK-PENTECOSTAL', click: () => dialog.showMessageBox(ventana, { type: 'info', title: NOMBRE, icon: ICONO, message: `${NOMBRE} ${app.getVersion()}`, detail: 'Biblia y canciones en vivo para proyector, OBS y celulares.\n\nHecho por Sebastian Lopez · IPUC Natania 6° Etapa\nZona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina\n\n«Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4\n\nDatos: ' + DATOS } ) },
    ] },
  ]);
}
