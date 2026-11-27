// PK-PENTECOSTAL · Prueba de Biblias completas (npm run probar-biblias)
// Arranca el servidor real (copia en una carpeta temporal) y pide cada Biblia por /api/biblia/... como lo hace el
// panel de control. Comprueba que TODOS los versículos de la Reina-Valera 1960 (o KJV para las de inglés) se
// encuentren en cada versión: directamente, dentro de un versículo unido ("Génesis 2:1-3") o con la nota del
// versículo que la traducción deja fuera del texto (Mateo 17:21…). También revisa que no queden versículos vacíos
// ni números repetidos, y algunos pasajes que las iglesias reportaron.
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pk biblias '));
const COPIA = path.join(TMP, 'PK-PENTECOSTAL ñ');
let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };

function copiar(a, b, filtro = () => true) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (!filtro(e.name)) continue;
    const x = path.join(a, e.name), y = path.join(b, e.name);
    if (e.isDirectory()) copiar(x, y, filtro); else fs.copyFileSync(x, y);
  }
}
const get = (port, ruta) => new Promise((res) => {
  http.get({ host: '127.0.0.1', port, path: ruta }, (s) => {
    let d = ''; s.setEncoding('utf8'); s.on('data', (c) => (d += c)); s.on('end', () => res({ code: s.statusCode, body: d }));
  }).on('error', (e) => res({ code: 0, body: e.message }));
});

// Igual que control.js → cargarBiblia()
function parsear(txt) {
  const caps = {};
  for (const line of txt.split(/\r?\n/)) {
    const p = line.split('|');
    if (p.length < 4) continue;
    const [v, h] = p[2].split('-').map((x) => parseInt(x, 10));
    if (!v) continue;
    ((caps[p[0] + ':' + p[1]] ||= [])).push({ v, h: h > v ? h : v, t: p.slice(3).join('|').trim() });
  }
  return caps;
}
const palabras = (vs) => new Set((vs || []).flatMap((x) => (x.t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-zñ]{5,}/g) || []).map((w) => w.slice(0, 5))));
const sim = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.min(a.size, b.size); };
const buscar = (caps, b, c, v) => (caps[b + ':' + c] || []).find((x) => v >= x.v && v <= x.h);

(async () => {
  console.log('Copiando el programa a', COPIA);
  copiar(path.join(RAIZ, 'PK-PENTECOSTAL'), path.join(COPIA, 'PK-PENTECOSTAL'), (n) => !['node_modules', 'modelos', 'respaldos', 'config.json'].includes(n));
  copiar(path.join(RAIZ, 'biblias'), path.join(COPIA, 'biblias'));
  const env = { ...process.env, PORT: String(19000 + Math.floor(Math.random() * 900)), PORT_WEB: '0' };
  delete env.PK_DATA_ROOT;
  const ch = spawn(process.execPath, [path.join(COPIA, 'PK-PENTECOSTAL', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let salida = ''; ch.stdout.on('data', (d) => (salida += d)); ch.stderr.on('data', (d) => (salida += d));
  const m = await new Promise((res) => { ch.on('message', res); setTimeout(() => res(null), 20000); });
  const port = m && m.puerto;
  if (!port) { console.log(salida); throw new Error('el servidor no arrancó'); }

  try {
    const lista = JSON.parse((await get(port, '/api/biblias')).body);
    console.log('\nBiblias:', lista.join(' · '));
    ok(lista.length === 9, '9 Biblias en la lista');
    ok(lista.every((n) => !/Ã|Â/.test(n)), 'nombres sin letras dañadas (Traducción, Versión)');
    const cargar = async (n) => parsear((await get(port, '/api/biblia/' + encodeURIComponent(n))).body);
    const RV = await cargar(lista.find((n) => /RV1960/.test(n)));
    const KJV = await cargar(lista.find((n) => /KJV/.test(n)));
    const totalRef = (r) => Object.values(r).reduce((s, vs) => s + vs.length, 0);
    ok(totalRef(RV) === 31102, `RV1960 tiene ${totalRef(RV)} versículos (31102)`);
    ok(totalRef(KJV) === 31102, `KJV tiene ${totalRef(KJV)} versículos (31102)`);
    const resultados = [];
    for (const nombre of lista) {
      const B = await cargar(nombre);
      const ingles = /KJV|WEB|BBE/.test(nombre);
      const ref = ingles ? KJV : RV;
      let faltan = [], vacios = 0, repetidos = 0, unidos = 0, notas = 0, total = 0;
      for (const [k, vs] of Object.entries(ref)) {
        const [b, c] = k.split(':');
        for (const { v } of vs) { total++; if (!buscar(B, b, c, v)) faltan.push(`${k}:${v}`); }
      }
      for (const vs of Object.values(B)) {
        const vistos = new Set();
        for (const x of vs) {
          if (!x.t) vacios++;
          if (x.h > x.v) unidos++;
          if (/esta versión no trae este versículo|this version leaves this verse out/.test(x.t)) notas++;
          for (let i = x.v; i <= x.h; i++) { if (vistos.has(i)) repetidos++; vistos.add(i); }
        }
      }
      // Contenido en su sitio: cada capítulo se parece más al mismo capítulo de la referencia que al vecino
      // (detecta capítulos o versículos corridos, como los que tenía la NVI en 1 Samuel, Job, Isaías y Hechos)
      const corridos = [];
      if (!/KJV|RV1960|BBE|WEB/.test(nombre)) {
        const claves = Object.keys(ref);
        claves.forEach((k, i) => {
          const s0 = sim(palabras(B[k]), palabras(ref[k]));
          const sv = Math.max(sim(palabras(B[k]), palabras(ref[claves[i - 1]])), sim(palabras(B[k]), palabras(ref[claves[i + 1]])));
          // (los capítulos cortos, como Salmo 70 o Ezequiel 15, tienen muy pocas palabras para comparar)
          if (sv > s0 + 0.1 && ref[k].length >= 10) corridos.push(k);
        });
        // y por versículo, en ventanas de 5: si casi todos encajan mejor con el vecino, están corridos
        for (const [k, vs] of Object.entries(B)) {
          const r = ref[k] || []; let racha = 0;
          for (const x of vs) {
            const rv = (v) => r.find((y) => y.v === v);
            const s0 = sim(palabras([x]), palabras([rv(x.v)].filter(Boolean)));
            const sv = Math.max(sim(palabras([x]), palabras([rv(x.v - 1)].filter(Boolean))), sim(palabras([x]), palabras([rv(x.h + 1)].filter(Boolean))));
            racha = (sv > s0 + 0.25 && x.h === x.v) ? racha + 1 : 0;
            if (racha === 5) corridos.push(`${k}:${x.v}`);
          }
        }
      }
      ok(corridos.length === 0, `contenido en su sitio (sin capítulos ni versículos corridos)${corridos.length ? ': ' + corridos.slice(0, 10).join(' ') : ''}`);
      ok(!Object.values(B).some((vs) => vs.some((x) => /^[-–—\s]*$/.test(x.t))), 'sin versículos de solo guiones');
      const pct = ((total - faltan.length) / total) * 100;
      resultados.push({ nombre, pct });
      console.log(`\n${nombre}\n    ${total - faltan.length}/${total} versículos encontrados (${pct.toFixed(2)} %) · unidos: ${unidos} · con nota: ${notas}`);
      ok(faltan.length === 0, `sin versículos faltantes${faltan.length ? ': ' + faltan.slice(0, 10).join(' ') : ''}`);
      ok(vacios === 0, `sin versículos vacíos (${vacios})`);
      ok(repetidos === 0, `sin números repetidos (${repetidos})`);
      ok(Object.keys(B).length === 1189, `1189 capítulos (${Object.keys(B).length})`);
    }

    console.log('\nPasajes reportados:');
    const B = {};
    for (const n of lista) B[n.split(' - ').pop()] = await cargar(n);
    const tla = buscar(B.TLA, 43, 3, 24);
    ok(tla && tla.v === 23 && tla.h === 24, `TLA Juan 3:24 → se encuentra en ${tla ? tla.v + '-' + tla.h : 'nada'}`);
    const gn = buscar(B.TLA, 1, 2, 2);
    ok(gn && /séptimo día descansó/.test(gn.t), 'TLA Génesis 2:2 → "el séptimo día descansó"');
    const mt = buscar(B.DHH, 40, 17, 21);
    ok(mt && /Reina-Valera 1960/.test(mt.t) && /oración y ayuno/.test(mt.t), 'DHH Mateo 17:21 → texto RV1960 con nota');
    ok((B.DHH['40:17'] || []).every((x) => x.t !== '21'), 'DHH Mateo 17 sin la línea basura "21"');
    const sal = buscar(B.NVI, 19, 112, 10);
    ok(sal && /malvado verá esto/.test(sal.t), 'NVI Salmo 112:10 completo');
    const hch = buscar(B.NVI, 44, 8, 37);
    ok(hch && /Hijo de Dios/.test(hch.t), 'NVI Hechos 8:37 → presente (con nota)');
    const hch9 = buscar(B.NVI, 44, 9, 1);
    ok(hch9 && /^Mientras tanto, Saulo/.test(hch9.t), 'NVI Hechos 9:1 empieza con "Mientras tanto, Saulo"');
    const isa = buscar(B.NVI, 23, 66, 1);
    ok(isa && /El cielo es mi trono/.test(isa.t) && !B.NVI['23:67'], 'NVI Isaías 66:1 "El cielo es mi trono" y sin capítulo 67');
    const job = buscar(B.NVI, 18, 33, 1);
    ok(job && /Te ruego, Job/.test(job.t), 'NVI Job 33:1 "Te ruego, Job"');
    const sam = buscar(B.NVI, 9, 14, 1);
    ok(sam && /Jonatán hijo de Saúl/.test(sam.t), 'NVI 1 Samuel 14:1 "Jonatán hijo de Saúl"');
    const mc = buscar(B.NVI, 41, 9, 44);
    ok(mc && /Reina-Valera 1960/.test(mc.t), 'NVI Marcos 9:44 → nota con RV1960 (antes "--")');
    const num = buscar(B.NTV, 4, 1, 21);
    ok(num && num.v === 20 && num.h === 21 && !/^\(/.test(num.t), 'NTV Números 1:21 → versículo 20-21 sin "(20–21)" al inicio');
    const jn = buscar(B.RV1960, 43, 3, 16);
    ok(jn && /de tal manera amó Dios al mundo/.test(jn.t), 'RV1960 Juan 3:16 intacto');
    const ro = buscar(B.WEB, 45, 16, 25);
    ok(!!ro, 'WEB Romanos 16:25 presente');

    console.log('\nResumen:');
    for (const r of resultados) console.log(`    ${r.pct.toFixed(2).padStart(6)} %  ${r.nombre}`);
  } finally {
    try { ch.send({ tipo: 'apagar' }); } catch (_) { ch.kill(); }
    setTimeout(() => ch.kill(), 3000);
  }
  await new Promise((r) => setTimeout(r, 1500));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* en uso */ }
  console.log(fallos ? `\n✘ ${fallos} comprobación(es) fallaron` : '\n✔ Todas las Biblias están completas');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
