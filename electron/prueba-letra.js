// PK-PENTECOSTAL · Prueba de la limpieza y el reparto de la letra (node electron/prueba-letra.js)
// Comprueba que se quitan espacios y marcas // y que cada estrofa larga se reparte en diapositivas
// parejas de máximo N renglones, también en todas las canciones de los cancioneros de fábrica.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('../PK-PENTECOSTAL/public/letra.js');

let fallos = 0;
const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallos++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lineas = (n, txt = 'Linea') => Array.from({ length: n }, (_, i) => `${txt} ${i + 1}`).join('\n');
const tam = (partes) => partes.map((p) => p.split('\n').length);

console.log('1) Limpieza de líneas');
ok(L.limpiarLinea('  //Una nube de victoria//  ') === 'Una nube de victoria', 'Quita // pegadas y espacios');
ok(L.limpiarLinea('Gloria a Dios //') === 'Gloria a Dios', 'Quita // suelta al final');
ok(L.limpiarLinea('/ Aleluya /') === 'Aleluya', 'Quita / sueltas');
ok(L.limpiarLinea('y/o') === 'y/o', 'Respeta / entre letras (y/o)');
ok(L.limpiarLinea('//') === '', 'Línea que es solo // queda vacía');
ok(L.limpiarLinea('Santo   santo') === 'Santo santo', 'Quita espacios dobles');

console.log('\n2) Estrofas y reparto');
ok(igual(L.estrofas('a\n \nb\n//\nc'), ['a', 'b', 'c']), 'Línea con espacio o solo // separa estrofas → ' + JSON.stringify(L.estrofas('a\n \nb\n//\nc')));
ok(igual(L.estrofas(' uno\r\n dos\r\n\r\n tres'), ['uno\ndos', 'tres']), 'Normaliza \\r\\n y quita espacios al inicio');
ok(igual(tam(L.estrofas(lineas(8), 6)), [4, 4]), '8 líneas con N=6 → 4+4 → ' + tam(L.estrofas(lineas(8), 6)));
ok(igual(tam(L.estrofas(lineas(13), 6)), [5, 4, 4]), '13 líneas con N=6 → 5+4+4 → ' + tam(L.estrofas(lineas(13), 6)));
ok(igual(tam(L.estrofas(lineas(6), 6)), [6]), '6 líneas con N=6 → 1 parte');
const coro6 = L.estrofas('Coro\n' + lineas(6), 6);
ok(coro6.length === 1 && coro6[0].startsWith('Coro\n'), 'Marcador «Coro» + 6 líneas → 1 parte (el marcador no cuenta)');
const coro8 = L.estrofas('Coro\n' + lineas(8), 6);
ok(coro8.length === 2 && coro8[0].startsWith('Coro\n') && !coro8[1].startsWith('Coro'), 'Marcador + 8 líneas → 2 partes, solo la primera con «Coro»');
const larga = 'x'.repeat(100);
ok(L.renglones(larga, 42) === 3, 'Línea de 100 letras = 3 renglones de 42 letras');
ok(L.renglones(larga) === 5, 'Línea de 100 letras = 5 renglones de 22 letras (por defecto)');
ok(igual(tam(L.estrofas([larga, larga, larga, larga].join('\n'), 6, { porRenglon: 42 })), [2, 2]), '4 líneas de 100 letras con N=6 y 42 letras → 2+2');
const media = 'y'.repeat(30); // 2 renglones de 22 letras
ok(igual(tam(L.estrofas(Array(6).fill(media).join('\n'), 4)), [2, 2, 2]), '6 líneas de 30 letras con N=4 y 22 letras → 2+2+2');
ok(igual(tam(L.estrofas(Array(6).fill(media).join('\n'), 4, { porRenglon: 36 })), [3, 3]), 'Con 36 letras por renglón las mismas 6 líneas → 3+3');
ok(L.porRenglonValido(undefined) === 22 && L.porRenglonValido(5) === 14 && L.porRenglonValido(99) === 42, 'Letras por renglón: 22 por defecto, entre 14 y 42');
ok(igual(L.estrofas(lineas(5)), L.estrofas(lineas(5), 4)), 'Sin N: 4 líneas por diapositiva por defecto');
ok(L.renglones('Cambiaré mi vergüenza y mi dolor') === 2 && L.renglones('a'.repeat(22)) === 1, 'Los renglones se cuentan cortando por palabras');
const enUna = L.estrofas('Es el autor y consumador de la fe, y es la roca eterna donde nos fundamos hoy, y él venció a la muerte, al sepulcro derrotó aleluya');
const partes = enUna.flatMap((d) => d.split('\n'));
ok(enUna.length > 1 && partes.every((l) => L.renglones(l) <= 4) && partes[0].endsWith(','), 'Una estrofa escrita en una sola línea se parte por comas → ' + JSON.stringify(enUna));
ok(igual(tam(L.estrofas(lineas(8), 4)), [4, 4]) && igual(tam(L.estrofas(lineas(9), 4)), [3, 3, 3]), 'N=4: 8 → 4+4 y 9 → 3+3+3');

const libre = L.estrofas('Visite https://www.facebook.com/ipuc\n  Ofrenda 50 / 100', 6, { limpiar: false });
ok(libre.length === 1 && libre[0] === 'Visite https://www.facebook.com/ipuc\nOfrenda 50 / 100', 'Texto libre (limpiar: false) conserva enlaces y « / » → ' + JSON.stringify(libre));

console.log('\n3) Todos los cancioneros de fábrica (N=4, 22 letras por renglón)');
const dir = path.join(__dirname, '..', 'cancioneros');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
  const c = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8') + ';this.r=jscanciones', c);
  let diapos = 0, pasadas = 0, sucias = 0;
  for (const s of c.r) {
    for (const d of L.estrofas(s.le || '', 4)) {
      diapos++;
      const ls = d.split('\n'); if (ls.length > 1 && L.ES_MARCADOR.test(ls[0].trim())) ls.shift();
      if (ls.reduce((n, l) => n + L.renglones(l), 0) > 4 && ls.length > 1) pasadas++;
      if (d.split('\n').some((l) => l !== l.trim() || l.includes('//') || !l)) sucias++;
    }
  }
  ok(pasadas === 0 && sucias === 0, `${f}: ${c.r.length} canciones → ${diapos} diapositivas · más de 4 renglones: ${pasadas} · con espacios o //: ${sucias}`);
}

console.log(fallos ? `\n✘ ${fallos} prueba(s) fallaron` : '\n✔ Todas las pruebas de letra pasaron');
process.exit(fallos ? 1 : 0);
