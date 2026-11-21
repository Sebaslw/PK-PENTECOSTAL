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
const { app, BrowserWindow, Menu, dialog, shell, utilityProcess, session } = require('electron');
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
  ventana.once('ready-to-show', () => { cerrarSplash(); ventana.show(); ventana.focus(); });
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
      { type: 'separator' },
      { label: 'Acerca de PK-PENTECOSTAL', click: () => dialog.showMessageBox(ventana, { type: 'info', title: NOMBRE, icon: ICONO, message: `${NOMBRE} ${app.getVersion()}`, detail: 'Biblia y canciones en vivo para proyector, OBS y celulares.\n\nHecho por Sebastian Lopez · IPUC Natania 6° Etapa\nZona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina\n\n«Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4\n\nDatos: ' + DATOS } ) },
    ] },
  ]);
}
