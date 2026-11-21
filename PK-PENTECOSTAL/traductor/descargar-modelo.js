// PK-PENTECOSTAL · Descarga (una sola vez) el modelo abierto Helsinki-NLP opus-mt-es-en
// en traductor/modelos. Después el traductor funciona SIN internet.
// Uso:  npm install   (lo ejecuta solo)   o   node descargar-modelo.js
'use strict';
const path = require('path');
const fs = require('fs');

const MODELOS = path.join(__dirname, 'modelos');
const LISTO = path.join(MODELOS, 'Xenova', 'opus-mt-es-en', 'onnx', 'decoder_model_merged_quantized.onnx');

(async () => {
  if (fs.existsSync(LISTO)) { console.log('  Modelo del traductor ya instalado.'); return; }
  console.log('  Descargando el modelo del traductor (~115 MB, solo esta vez)...');
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = MODELOS;
  env.allowRemoteModels = true;
  const t = await pipeline('translation', 'Xenova/opus-mt-es-en', { dtype: 'q8' });
  const [r] = await t('Dios es amor');
  console.log('  Listo. Prueba: "Dios es amor" ->', JSON.stringify(r.translation_text));
})().catch((e) => { console.error('  No se pudo descargar el modelo:', e.message); process.exitCode = 1; });
