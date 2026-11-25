// PK-PENTECOSTAL · Prueba del guardado de canciones (npm run probar-canciones)
// Reproduce el error de las iglesias: "EPERM: operation not permitted, open '...\cancioneros\Mi Cancionero.js'"
// (archivo OCULTO y de SOLO LECTURA en una carpeta con espacios, abierto desde el código fuente) y comprueba
// que crear, editar, borrar, tildes, varias estrofas y reinicio funcionen. No toca la carpeta real.
'use strict';
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pk canciones '));
const COPIA = path.join(TMP, 'Escritorio de LENOVO', 'PK-PENTECOSTAL ñ'); // ruta con espacios y tildes
const ALT = path.join(TMP, 'AppData', 'cancioneros-guardados');
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const attrib = (args) => { if (process.platform === 'win32') execFileSync('attrib', args, { stdio: 'ignore' }); };

function copiar(a, b, filtro = () => true) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (!filtro(e.name)) continue;
    const x = path.join(a, e.name), y = path.join(b, e.name);
    if (e.isDirectory()) copiar(x, y, filtro); else fs.copyFileSync(x, y);
  }
}
function pedir(port, metodo, ruta, cuerpo) {
  return new Promise((res) => {
    const datos = cuerpo ? Buffer.from(JSON.stringify(cuerpo)) : null;
    const r = http.request({ host: '127.0.0.1', port, path: ruta, method: metodo, headers: { 'Content-Type': 'application/json', ...(datos ? { 'Content-Length': datos.length } : {}) } }, (s) => {
      let d = ''; s.setEncoding('utf8'); s.on('data', (c) => (d += c));
      s.on('end', () => { let j = d; try { j = JSON.parse(d); } catch (_) { /* texto */ } res({ code: s.statusCode, body: j }); });
    });
    r.on('error', (e) => res({ code: 0, body: { error: e.message } }));
    if (datos) r.write(datos); r.end();
  });
}
async function arrancar(extraEnv = {}) {
  // Desde el código fuente (como PK-PENTECOSTAL.bat): sin PK_DATA_ROOT
  const env = { ...process.env, PORT: String(19000 + Math.floor(Math.random() * 900)), PORT_WEB: '0', PK_CANC_ALT: ALT, ...extraEnv };
  delete env.PK_DATA_ROOT;
  const ch = spawn(process.execPath, [path.join(COPIA, 'PK-PENTECOSTAL', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  ch.out = ''; ch.stdout.on('data', (d) => (ch.out += d)); ch.stderr.on('data', (d) => (ch.out += d));
  const m = await new Promise((res) => { ch.on('message', res); setTimeout(() => res(null), 20000); });
  ch.puerto = m && m.puerto;
  return ch;
}
const parar = (ch) => new Promise((res) => { ch.on('exit', res); try { ch.send({ tipo: 'apagar' }); } catch (_) { ch.kill(); } setTimeout(() => ch.kill(), 5000); });
const LIBRO = encodeURIComponent('Mi Cancionero');
const leer = async (p) => (await pedir(p, 'GET', '/api/cancionero/' + LIBRO)).body;

(async () => {
  console.log('Copia de prueba: ' + COPIA);
  copiar(path.join(RAIZ, 'PK-PENTECOSTAL'), path.join(COPIA, 'PK-PENTECOSTAL'), (n) => !['node_modules', 'modelos', 'config.json', 'respaldos'].includes(n));
  copiar(path.join(RAIZ, 'cancioneros'), path.join(COPIA, 'cancioneros'));
  fs.mkdirSync(path.join(COPIA, 'biblias'), { recursive: true });
  fs.mkdirSync(path.join(COPIA, 'fondos'), { recursive: true });
  const mi = path.join(COPIA, 'cancioneros', 'Mi Cancionero.js');
  const fuentes = fs.readdirSync(path.join(COPIA, 'PK-PENTECOSTAL'), { recursive: true }).filter((f) => /\.js$/.test(f));
  const huella = () => fuentes.map((f) => fs.statSync(path.join(COPIA, 'PK-PENTECOSTAL', f)).mtimeMs).join('|');
  const huella0 = huella();
  // Como en la iglesia: carpetas y archivos ocultos; además "solo lectura" en Mi Cancionero.js
  attrib(['+h', '+s', path.join(COPIA, 'cancioneros')]);
  attrib(['+h', '+r', mi]);
  attrib(['+h', path.join(COPIA, 'cancioneros', 'Canciones.js')]);
  try { fs.writeFileSync(mi, fs.readFileSync(mi)); ok(false, 'Reproducción: escribir directo debería dar EPERM'); }
  catch (e) { ok(e.code === 'EPERM', 'Reproducción del error original con writeFileSync → ' + e.code); }
  const antes = fs.readFileSync(mi, 'utf8');

  let s = await arrancar();
  ok(!!s.puerto, 'Servidor arranca desde el código fuente (puerto ' + s.puerto + ')');
  const n0 = (await leer(s.puerto)).length;

  // 1) Nueva canción
  let r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: 'Prueba nueva', le: 'Primera línea\nSegunda línea' });
  ok(r.code === 200 && r.body.ok, '1) Crear canción nueva en archivo oculto + solo lectura → ' + (r.body.error || 'id ' + r.body.cancion.id));
  const id1 = r.body.cancion && r.body.cancion.id;
  // 2) Varias estrofas  3) Tildes y caracteres especiales
  const letra = 'Señor, ¡qué grande es tu amor!\nÉl vive, ¿quién como Él?\n\nCORO\nAleluya, «gloria» — ñandú 100% “santo”\n\nII\nÚltima estrofa: güira, acción';
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: 'Canción con tildes ñ ¿¡', le: letra });
  ok(r.code === 200, '2-3) Varias estrofas con tildes, ñ, signos y comillas');
  const id2 = r.body.cancion && r.body.cancion.id;
  // 4) Varias consecutivas (en paralelo, como dos dispositivos a la vez)
  const rs = await Promise.all([1, 2, 3, 4, 5].map((i) => pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: 'Consecutiva ' + i, le: 'Letra ' + i })));
  const ids = rs.map((x) => x.body.cancion && x.body.cancion.id);
  ok(rs.every((x) => x.code === 200) && new Set(ids).size === 5, '4) Cinco canciones a la vez, ids únicos: ' + ids.join(','));
  // Duplicado accidental (doble clic en Guardar)
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: 'Prueba nueva', le: 'Primera línea\r\nSegunda línea\n' });
  ok(r.code === 200 && r.body.repetida && r.body.cancion.id === id1, 'Duplicado accidental no crea otra canción');
  // Validación
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: '  ', le: 'x' });
  ok(r.code === 400, 'Validación: título vacío rechazado → ' + r.body.error);
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: 'x', le: ' \n ' });
  ok(r.code === 400, 'Validación: letra vacía rechazada → ' + r.body.error);
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + encodeURIComponent('No existe'), { ti: 'x', le: 'y' });
  ok(r.code === 400, 'Validación: cancionero inexistente rechazado');
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + encodeURIComponent('..\\x'), { ti: 'x', le: 'y' });
  ok(r.code >= 400, 'Seguridad: nombre con ruta rechazado');
  // 5) Editar
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { id: id1, ti: 'Prueba editada', le: 'Línea editada\n\nOtra estrofa', tono: 'G' });
  ok(r.code === 200 && r.body.cancion.id === id1, '5) Editar la canción mantiene su id');
  let lista = await leer(s.puerto);
  ok(lista.filter((x) => x.id === id1).length === 1 && lista.length === n0 + 7, 'Editar no duplica (total ' + lista.length + ')');
  // Otro archivo solo oculto (Canciones.js)
  r = await pedir(s.puerto, 'POST', '/api/cancionero/Canciones', { ti: 'En Canciones oculto', le: 'Letra' });
  ok(r.code === 200, 'Guardar en Canciones.js (oculto)');
  // 8) Borrar
  r = await pedir(s.puerto, 'DELETE', '/api/cancionero/' + LIBRO + '?id=' + encodeURIComponent(ids[4]));
  ok(r.code === 200, '8) Eliminar canción');
  await parar(s);

  // 6-7) Reiniciar y comprobar
  s = await arrancar();
  lista = await leer(s.puerto);
  const c1 = lista.find((x) => x.id === id1), c2 = lista.find((x) => x.id === id2);
  ok(c1 && c1.ti === 'Prueba editada' && c1.le === 'Línea editada\n\nOtra estrofa' && c1.tono === 'G', '6-7) Tras reiniciar: la canción editada sigue igual');
  ok(c2 && c2.le === letra && c2.ti === 'Canción con tildes ñ ¿¡', 'Tras reiniciar: tildes y estrofas intactas');
  ok(!lista.some((x) => x.id === ids[4]) && lista.length === n0 + 6, '8) Tras reiniciar: la eliminada no vuelve (total ' + lista.length + ')');
  // Volver a editar después del reinicio
  r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { id: id2, ti: c2.ti, le: c2.le + '\n\nEstrofa añadida' });
  lista = await leer(s.puerto);
  ok(r.code === 200 && lista.find((x) => x.id === id2).le.endsWith('Estrofa añadida') && lista.length === n0 + 6, 'Se puede volver a editar después de reiniciar');
  const canc = (await pedir(s.puerto, 'GET', '/api/cancionero/Canciones')).body;
  ok(canc.some((x) => x.ti === 'En Canciones oculto'), 'Canciones.js conserva la canción tras reiniciar');
  await parar(s);

  // Canciones antiguas intactas
  const vm = require('vm');
  const cargar = (txt) => { const c = vm.createContext({}); vm.runInContext(txt + ';this.r=jscanciones', c); return c.r; };
  const viejas = cargar(antes), nuevas = cargar(fs.readFileSync(mi, 'utf8'));
  ok(viejas.every((v) => nuevas.some((n) => String(n.id) === String(v.id) && n.le.replace(/\r\n?/g, '\n') === String(v.le).replace(/\r\n?/g, '\n'))), 'Las canciones que ya existían siguen intactas (' + viejas.length + ')');
  ok(fs.readdirSync(path.join(COPIA, 'BSPK', 'respaldos')).some((n) => n.startsWith('Mi Cancionero.')), 'Se hizo copia de respaldo antes de cada cambio');
  ok(!fs.readdirSync(path.join(COPIA, 'cancioneros')).some((n) => n.endsWith('.tmp')), 'No quedan archivos temporales');
  // 10) No se tocan archivos fuente
  ok(huella() === huella0, '10) Ningún archivo de código .js del programa fue modificado');

  // Carpeta que no deja escribir en absoluto (USB protegido / acceso controlado) → se guarda en ALT
  if (process.platform === 'win32') {
    const usuario = os.userInfo().username;
    const dirC = path.join(COPIA, 'cancioneros');
    execFileSync('icacls', [dirC, '/deny', `${usuario}:(WD,AD,DC)`], { stdio: 'ignore' });
    execFileSync('icacls', [mi, '/deny', `${usuario}:(WD,AD,WA)`], { stdio: 'ignore' });
    try {
      s = await arrancar();
      r = await pedir(s.puerto, 'POST', '/api/cancionero/' + LIBRO, { ti: 'Carpeta bloqueada', le: 'Se guarda aparte' });
      if (r.code !== 200) console.log('    ', r.code, JSON.stringify(r.body), s.out.slice(-600));
      ok(r.code === 200 && fs.existsSync(path.join(ALT, 'Mi Cancionero.js')), 'Carpeta sin permiso de escritura: se guarda en la carpeta de datos del usuario');
      await parar(s);
      s = await arrancar();
      lista = await leer(s.puerto);
      ok(lista.some((x) => x.ti === 'Carpeta bloqueada') && lista.some((x) => x.id === id1), 'Tras reiniciar se lee la copia guardada aparte, con todas las canciones (' + lista.length + ')');
      await parar(s);
    } finally {
      execFileSync('icacls', [mi, '/remove:d', usuario], { stdio: 'ignore' });
      execFileSync('icacls', [dirC, '/remove:d', usuario], { stdio: 'ignore' });
    }
  }

  try { attrib(['-h', '-s', '-r', '/s', '/d', path.join(COPIA, '*')]); fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* nada */ }
  console.log(fallos ? `\n  ${fallos} prueba(s) fallaron` : '\n  Todas las pruebas de canciones pasaron');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
