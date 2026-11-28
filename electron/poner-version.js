// Pone el número de versión en todos los archivos que lo muestran, para que nunca queden desparejos.
//
// Uso:  npm run poner-version              -> copia la versión de package.json a todos lados
//       npm run poner-version -- 2.1.0     -> cambia package.json a 2.1.0 y la copia a todos lados
//       npm run poner-version -- --revisar -> solo revisa: falla (código 1) si algún archivo no coincide
//
// Solo cambia la versión ACTUAL (insignia, nombres de instaladores, portada, pie de página…).
// Las menciones de historia ("desde la 2.0.4", "corregido en la 2.0.8") no se tocan.
// No toca web/descargas/info.js: ese lo escribe web/crear-zip.ps1 con las huellas SHA-256.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const V = String.raw`\d+\.\d+\.\d+`;
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

// Cada regla: archivo, expresión con (antes)(versión)(después) y cuántas veces debe aparecer como mínimo.
const REGLAS = [
  ['README.md', `(img\\.shields\\.io/badge/versión-)(${V})(-)`, 1],
  ['README.md', `(PK-PENTECOSTAL-(?:Instalador|Portable)-)(${V})(\\.exe\`)`, 2],
  ['web/index.html', `(<span data-version>)(${V})(</span>)`, 2],
  ['web/index.html', `(<span id="d-version">)(${V})(</span>)`, 1],
  ['web/index.html', `(id="d-nombre">PK-PENTECOSTAL-Instalador-)(${V})(\\.exe)`, 1],
  ['docs/manual/manual.html', `(Manual de usuario · versión )(${V})(<)`, 1],
  ['PK-PENTECOSTAL/LEEME.txt', `(VERSIÓN )(${V})( - INSTALADORES)`, 1],
  ['PK-PENTECOSTAL/LEEME.txt', `(PK-PENTECOSTAL-(?:Instalador|Portable)-)(${V})(\\.exe)`, 2],
  ['PK-PENTECOSTAL/LEEME.txt', `(PK-PENTECOSTAL-)(${V})(-(?:mac|linux))`, 3],
  ['PK-PENTECOSTAL/server.js', `(catch \\(_\\) \\{ return ')(${V})('; \\} \\}\\)\\(\\);)`, 1],
  ['package-lock.json', `(^\\{\\s*"name": "pk-pentecostal",\\s*"version": ")(${V})(")`, 1],
  ['package-lock.json', `("packages": \\{\\s*"": \\{\\s*"name": "pk-pentecostal",\\s*"version": ")(${V})(")`, 1],
];

const args = process.argv.slice(2);
const revisar = args.includes('--revisar');
const nueva = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
if (args.some((a) => a !== '--revisar' && a !== nueva)) {
  console.error('Uso: npm run poner-version [-- 2.1.0] [-- --revisar]');
  process.exit(2);
}

const leer = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const escribir = (f, t) => fs.writeFileSync(path.join(RAIZ, f), t, 'utf8');

let version = JSON.parse(leer('package.json')).version;
if (nueva && nueva !== version) {
  if (revisar) { console.error('--revisar no cambia la versión'); process.exit(2); }
  escribir('package.json', leer('package.json').replace(/("version":\s*")[^"]+(")/, `$1${nueva}$2`));
  console.log(`package.json: ${version} → ${nueva}`);
  version = nueva;
}

const textos = new Map();
const malos = [];
let cambios = 0;
for (const [archivo, patron, minimo] of REGLAS) {
  const texto = textos.has(archivo) ? textos.get(archivo) : leer(archivo);
  const re = new RegExp(patron, 'gm');
  let hallados = 0;
  const nuevo = texto.replace(re, (_, a, v, d) => {
    hallados++;
    if (v !== version) { cambios++; if (revisar) malos.push(`${archivo}: dice ${v}`); }
    return a + version + d;
  });
  if (hallados < minimo) malos.push(`${archivo}: no se encontró "${patron}" (${hallados} de ${minimo}). ¿Cambió el texto?`);
  textos.set(archivo, nuevo);
}

// Portada del manual: con una versión nueva, también el mes y el año
const manual = 'docs/manual/manual.html';
if (nueva) {
  const hoy = new Date();
  const fecha = `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;
  textos.set(manual, textos.get(manual).replace(/(<div class="fecha">)([^<]*)(<\/div>)/, (t, a, f, d) => {
    if (f === fecha) return t;
    cambios++; return a + fecha + d;
  }));
}

if (revisar) {
  if (malos.length) { console.error(`✘ La versión ${version} no está en todos lados:\n  ` + malos.join('\n  ')); process.exit(1); }
  console.log(`✔ Versión ${version} en todos los archivos`);
  process.exit(0);
}
if (malos.length) { console.error('✘ No se cambió nada:\n  ' + malos.join('\n  ')); process.exit(1); }

const cambiados = [];
for (const [archivo, texto] of textos) if (texto !== leer(archivo)) { escribir(archivo, texto); cambiados.push(archivo); console.log('  ✎ ' + archivo); }
console.log(cambios ? `✔ Versión ${version} puesta en todos los archivos` : `✔ Todo ya decía ${version}`);
if (cambiados.includes(manual)) console.log('  Falta: volver a generar el manual  ->  node docs/manual/generar-pdf.js');
if (nueva) console.log('  Después de npm run dist: web/crear-zip.ps1 actualiza web/descargas/info.js');
