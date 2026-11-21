// Prueba del traductor sin internet (se ejecuta una vez para descargar el modelo).
'use strict';
const path = require('path');
(async () => {
  const { MODELOS, transformers } = require('./rutas');
  const { pipeline, env } = await transformers();
  env.cacheDir = MODELOS;
  env.allowRemoteModels = process.argv.includes('--sin-internet') ? false : true;
  const t0 = Date.now();
  const traducir = await pipeline('translation', 'Xenova/opus-mt-es-en', { dtype: 'q8' });
  console.log('modelo listo en', ((Date.now() - t0) / 1000).toFixed(1), 's');
  const lineas = [
    'Alabaré, alabaré, alabaré a mi Señor',
    'Juan vio el número de los redimidos',
    'Y todos alababan al Señor.',
    'Espíritu Santo, manda tu fuego,',
    'Cuando el pueblo alaba a Dios suceden cosas maravillosas',
    'Me gozaré en tu presencia Jehová',
  ];
  const t1 = Date.now();
  const r = await traducir(lineas);
  r.forEach((x, i) => console.log(lineas[i], ' → ', x.translation_text));
  console.log('traducción en', ((Date.now() - t1) / 1000).toFixed(2), 's');
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
