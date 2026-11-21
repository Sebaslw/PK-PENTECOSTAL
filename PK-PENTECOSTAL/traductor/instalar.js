// PK-PENTECOSTAL · Instala el traductor automático sin internet (una sola vez, necesita internet):
//   node PK-PENTECOSTAL/traductor/instalar.js
// La librería y el modelo quedan en BSPK/traductor (carpeta privada que no se sube a GitHub).
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { BSPK } = require('./rutas');
const pkg = require('./package.json');

fs.mkdirSync(BSPK, { recursive: true });
if (!fs.existsSync(path.join(BSPK, 'package.json'))) fs.writeFileSync(path.join(BSPK, 'package.json'), JSON.stringify({ name: 'pk-traductor-bspk', private: true }, null, 2));
const deps = Object.entries(pkg.dependencies).map(([n, v]) => `${n}@${v}`).join(' ');
console.log('  Instalando la librería del traductor en BSPK/traductor…');
execSync(`npm install --no-audit --no-fund ${deps}`, { cwd: BSPK, stdio: 'inherit', shell: true });
require('./descargar-modelo');
