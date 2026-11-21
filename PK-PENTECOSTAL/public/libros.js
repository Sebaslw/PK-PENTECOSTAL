// PK-PENTECOSTAL · Hecho por Sebastian Lopez · IPUC Natania 6° Etapa · Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
// Libros de la Biblia (orden protestante, 66 libros) con abreviaturas para búsqueda rápida
window.LIBROS = [
  ['Génesis', 'gn gen ge'], ['Éxodo', 'ex exo exod'], ['Levítico', 'lv lev'], ['Números', 'nm num nu'],
  ['Deuteronomio', 'dt deut deu'], ['Josué', 'jos js'], ['Jueces', 'jue jc juec'], ['Rut', 'rt rut'],
  ['1 Samuel', '1s 1sa 1sam 1 sam'], ['2 Samuel', '2s 2sa 2sam 2 sam'], ['1 Reyes', '1r 1re 1rey 1 re'], ['2 Reyes', '2r 2re 2rey 2 re'],
  ['1 Crónicas', '1cr 1cro 1 cr'], ['2 Crónicas', '2cr 2cro 2 cr'], ['Esdras', 'esd'], ['Nehemías', 'neh ne'],
  ['Ester', 'est'], ['Job', 'job jb'], ['Salmos', 'sal sl salmo slm ps'], ['Proverbios', 'pr prov pro'],
  ['Eclesiastés', 'ec ecl ecle'], ['Cantares', 'cnt cant can'], ['Isaías', 'is isa'], ['Jeremías', 'jer jr'],
  ['Lamentaciones', 'lm lam'], ['Ezequiel', 'ez eze'], ['Daniel', 'dn dan'], ['Oseas', 'os ose'],
  ['Joel', 'jl joel'], ['Amós', 'am amos'], ['Abdías', 'abd ab'], ['Jonás', 'jon'],
  ['Miqueas', 'mi miq'], ['Nahúm', 'nah na'], ['Habacuc', 'hab'], ['Sofonías', 'sof'],
  ['Hageo', 'hag hg'], ['Zacarías', 'zac za'], ['Malaquías', 'mal ml'],
  ['Mateo', 'mt mat'], ['Marcos', 'mr mc mar'], ['Lucas', 'lc luc lu'], ['Juan', 'jn jua'],
  ['Hechos', 'hch hech hec'], ['Romanos', 'ro rom rm'], ['1 Corintios', '1co 1cor 1 co'], ['2 Corintios', '2co 2cor 2 co'],
  ['Gálatas', 'ga gal'], ['Efesios', 'ef efe'], ['Filipenses', 'fil flp'], ['Colosenses', 'col'],
  ['1 Tesalonicenses', '1ts 1tes 1 tes'], ['2 Tesalonicenses', '2ts 2tes 2 tes'], ['1 Timoteo', '1ti 1tim 1 tim'], ['2 Timoteo', '2ti 2tim 2 tim'],
  ['Tito', 'tit tt'], ['Filemón', 'flm filem'], ['Hebreos', 'he heb'], ['Santiago', 'stg sant san'],
  ['1 Pedro', '1p 1pe 1ped 1 pe'], ['2 Pedro', '2p 2pe 2ped 2 pe'], ['1 Juan', '1jn 1jua 1 jn'], ['2 Juan', '2jn 2jua 2 jn'],
  ['3 Juan', '3jn 3jua 3 jn'], ['Judas', 'jud'], ['Apocalipsis', 'ap apoc apo'],
];

// Book names in English (same order) with abbreviations for quick search
window.LIBROS_EN = [
  ['Genesis', 'gn gen ge'], ['Exodus', 'ex exo exod'], ['Leviticus', 'lv lev le'], ['Numbers', 'nm num nu'],
  ['Deuteronomy', 'dt deut deu'], ['Joshua', 'josh jsh'], ['Judges', 'jdg judg jg'], ['Ruth', 'ru rth'],
  ['1 Samuel', '1sa 1sam 1 sam 1sm'], ['2 Samuel', '2sa 2sam 2 sam 2sm'], ['1 Kings', '1ki 1kgs 1 kgs 1kin'], ['2 Kings', '2ki 2kgs 2 kgs 2kin'],
  ['1 Chronicles', '1ch 1chr 1 chr'], ['2 Chronicles', '2ch 2chr 2 chr'], ['Ezra', 'ezr'], ['Nehemiah', 'ne neh'],
  ['Esther', 'est esth'], ['Job', 'jb'], ['Psalms', 'ps psa psalm pss'], ['Proverbs', 'pr prov prv'],
  ['Ecclesiastes', 'ec ecc eccl qoh'], ['Song of Songs', 'so song sos ss canticles songofsolomon'], ['Isaiah', 'isa'], ['Jeremiah', 'je jer jr'],
  ['Lamentations', 'la lam'], ['Ezekiel', 'eze ezek ezk'], ['Daniel', 'da dan dn'], ['Hosea', 'ho hos'],
  ['Joel', 'jl'], ['Amos', 'am'], ['Obadiah', 'ob obad'], ['Jonah', 'jnh jon'],
  ['Micah', 'mi mic'], ['Nahum', 'na nah'], ['Habakkuk', 'hab hb'], ['Zephaniah', 'zep zeph zp'],
  ['Haggai', 'hag hg'], ['Zechariah', 'zec zech zc'], ['Malachi', 'mal ml'],
  ['Matthew', 'mt mat matt'], ['Mark', 'mk mrk mr'], ['Luke', 'lk luk'], ['John', 'jn jhn joh'],
  ['Acts', 'ac act'], ['Romans', 'ro rom rm'], ['1 Corinthians', '1co 1cor 1 co'], ['2 Corinthians', '2co 2cor 2 co'],
  ['Galatians', 'ga gal'], ['Ephesians', 'eph ephes'], ['Philippians', 'php phil pp'], ['Colossians', 'col'],
  ['1 Thessalonians', '1th 1thes 1thess 1 th'], ['2 Thessalonians', '2th 2thes 2thess 2 th'], ['1 Timothy', '1ti 1tim 1 tim'], ['2 Timothy', '2ti 2tim 2 tim'],
  ['Titus', 'tit ti'], ['Philemon', 'phm phlm philem'], ['Hebrews', 'heb he'], ['James', 'jas jm jam'],
  ['1 Peter', '1pe 1pet 1pt 1 pe'], ['2 Peter', '2pe 2pet 2pt 2 pe'], ['1 John', '1jn 1jo 1jhn 1 jn'], ['2 John', '2jn 2jo 2jhn 2 jn'],
  ['3 John', '3jn 3jo 3jhn 3 jn'], ['Jude', 'jud jd'], ['Revelation', 're rev rv apocalypse'],
];
// ¿Esta Biblia está en inglés? (por la sigla de la versión: "King James Version - KJV")
window.esBibliaIngles = (nombre) => {
  const sigla = String(nombre || '').split(' - ').pop().trim().toUpperCase();
  return ['KJV', 'WEB', 'WEBBE', 'NIV', 'NLT', 'ESV', 'NKJV', 'GNT', 'CEV', 'ASV', 'BBE', 'NASB', 'AMP', 'MSG', 'CSB', 'NRSV', 'YLT', 'DRB', 'ERV', 'NCV', 'TLB']
    .includes(sigla) || /\b(english|king james)\b/i.test(String(nombre));
};
