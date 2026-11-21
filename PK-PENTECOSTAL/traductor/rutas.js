// PK-PENTECOSTAL · Dónde está el traductor instalado.
// Lo pesado (librería y modelo, ~500 MB) vive en la carpeta privada BSPK/traductor, que no se sube a GitHub.
// Si se instaló a la antigua (npm install aquí mismo), también funciona.
'use strict';
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');

// En la app de escritorio los datos viven aparte (PK_DATA_ROOT); desde el código fuente, junto al programa
const RAIZ = process.env.PK_DATA_ROOT ? path.resolve(process.env.PK_DATA_ROOT) : path.resolve(__dirname, '..', '..');
const BSPK = path.join(RAIZ, 'BSPK', 'traductor');
const MODELOS = path.join(BSPK, 'modelos');
const BASES = [BSPK, __dirname];

// Carpeta de node_modules donde está @huggingface/transformers (o null)
function base() {
  return BASES.find((b) => fs.existsSync(path.join(b, 'node_modules', '@huggingface', 'transformers'))) || null;
}
// Carga la librería desde donde esté instalada
async function transformers() {
  const b = base();
  if (!b) throw new Error('Traductor no instalado: ejecute  node PK-PENTECOSTAL/traductor/instalar.js');
  const req = createRequire(path.join(b, 'package.json'));
  const m = await import(pathToFileURL(req.resolve('@huggingface/transformers')).href);
  return m.pipeline ? m : m.default; // la versión CommonJS llega dentro de "default"
}
module.exports = { BSPK, MODELOS, base, transformers };
