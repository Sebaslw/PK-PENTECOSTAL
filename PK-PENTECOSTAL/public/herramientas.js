/* PK-PENTECOSTAL · Herramientas: respaldo completo (exportar / importar BSPK) y aviso de versión nueva
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
(() => {
  'use strict';
  const PP = window.PP;
  const { api, toast, esc, store, $ } = PP;

  function dialogo(titulo, html, botones, alAbrir) {
    const d = $('#dlgGen');
    $('#dgTitulo').textContent = titulo;
    $('#dgCuerpo').innerHTML = html;
    $('#dgBotones').innerHTML = botones.map(([v, t, c]) => `<button value="${v}" class="${c || ''} ${v === 'cancel' ? '' : 'grow'}">${t}</button>`).join('');
    alAbrir?.($('#dgCuerpo'));
    d.returnValue = '';
    d.showModal();
    return new Promise((res) => d.addEventListener('close', () => res(d.returnValue), { once: true }));
  }

  // ================================================================ Respaldo (carpeta BSPK + stingers)
  $('#btnRespaldo').addEventListener('click', async () => {
    let archivo = null;
    const r = await dialogo('💾 Respaldo de PK-PENTECOSTAL', `
      <p>Guarda en un solo archivo <b>.zip</b> todo lo propio de esta instalación: ajustes, rótulos, historial, claves de los celulares,
      stingers con sus logos y sonidos, banners laterales, respaldos de canciones y fondos subidos.</p>
      <p class="hint">Sirve para pasar PK-PENTECOSTAL a otro computador con todo configurado. El traductor no se incluye (se instala con <code>instalar.js</code>).</p>
      <p class="hint">⚠ El archivo contiene las claves de los celulares y del Wi-Fi propio: guárdelo en un lugar seguro.</p>
      <hr>
      <p><b>Importar un respaldo</b>: reemplaza los ajustes de este computador (antes se guarda una copia de los actuales).</p>
      <label class="btn-file">Elegir archivo .zip…<input type="file" id="rpZip" accept=".zip,application/zip" hidden></label> <span id="rpNombre" class="hint"></span>`,
      [['cancel', 'Cerrar'], ['importar', 'Importar', 'danger'], ['exportar', '⬇ Exportar respaldo', 'primary']],
      (c) => c.querySelector('#rpZip').addEventListener('change', (e) => { archivo = e.target.files[0]; c.querySelector('#rpNombre').textContent = archivo ? archivo.name : ''; }));
    if (r === 'exportar') {
      toast('Preparando el respaldo…');
      const a = document.createElement('a'); a.href = '/api/bspk/exportar'; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
    }
    if (r === 'importar') {
      if (!archivo) return toast('Primero elija el archivo .zip del respaldo');
      if (!confirm(`¿Importar "${archivo.name}"? Se reemplazarán los ajustes de este computador.`)) return;
      try {
        toast('Importando…');
        const res = await fetch('/api/bspk/importar', { method: 'PUT', body: archivo });
        const d = await res.json(); if (!res.ok) throw new Error(d.error);
        await dialogo('✓ Respaldo importado', `<p>Se restauraron <b>${d.archivos}</b> archivos. La configuración anterior quedó guardada en <code>${esc(d.copia)}</code>.</p>
          <p><b>Cierre PK-PENTECOSTAL (botón ⏻) y vuelva a abrirlo</b> para que todo se cargue.</p>`, [['ok', 'Entendido', 'primary']]);
      } catch (e) { toast('Error: ' + e.message); }
    }
  });

  // ================================================================ ¿Hay versión nueva?
  const btnV = $('#btnVersion');
  let info = null;
  function pintarVersion() {
    if (!info) return;
    btnV.textContent = info.hay ? `⬆ Nueva versión ${info.ultima}` : `v${info.actual}`;
    btnV.classList.toggle('nueva', !!info.hay);
  }
  async function revisar(forzar) {
    try { info = await api('/api/actualizacion' + (forzar ? '?forzar=1' : '')); } catch (_) { return null; }
    pintarVersion();
    return info;
  }
  btnV.addEventListener('click', async () => {
    btnV.textContent = 'Buscando…';
    const i = await revisar(true);
    if (!i) return pintarVersion();
    if (i.error) { toast(i.error); return pintarVersion(); }
    // App de escritorio instalada: ella misma descarga e instala la actualización (sin desinstalar)
    if (i.autoActualiza && /(^|\.)localhost$|^127\.0\.0\.1$/.test(location.hostname)) {
      pintarVersion();
      try { await api('/api/actualizacion/buscar', { method: 'POST' }); } catch (_) { /* nada */ }
      return toast(i.hay ? `⬆ Descargando PK-PENTECOSTAL ${i.ultima}… le avisaremos cuando esté lista` : `Tiene la versión más reciente (${i.actual})`);
    }
    if (!i.hay) return toast(`Tiene la versión más reciente (${i.actual})`);
    const r = await dialogo(`⬆ PK-PENTECOSTAL ${i.ultima} disponible`, `<p>Usted tiene la versión <b>${esc(i.actual)}</b>.</p>
      ${i.notas ? `<div class="hint" style="white-space:pre-wrap;max-height:40vh;overflow:auto">${esc(i.notas)}</div>` : ''}
      <p class="hint">Para actualizar: descargue la versión nueva e <b>instálela encima</b>. No hace falta desinstalar: sus canciones, fondos y ajustes se conservan. Si quiere, haga antes un 💾 Respaldo.</p>`,
      [['cancel', 'Después'], ['ok', 'Abrir página de descarga', 'primary']]);
    if (r === 'ok') window.open(i.url, '_blank', 'noopener');
  });
  // Una revisión silenciosa al día (solo en el computador, no en los celulares)
  api('/api/info').then((i) => { btnV.textContent = 'v' + i.version; }).catch(() => {});
  const hoy = new Date().toISOString().slice(0, 10);
  if (store.get('actRevisada') !== hoy && /(^|\.)localhost$|^127\.0\.0\.1$/.test(location.hostname)) {
    store.set('actRevisada', hoy);
    // (en la app instalada el aviso lo da Windows y la descarga empieza sola; aquí solo se marca el botón)
    setTimeout(() => revisar(false).then((i) => { if (i && i.hay && !i.autoActualiza) toast(`⬆ Hay una versión nueva de PK-PENTECOSTAL: ${i.ultima}`); }), 8000);
  }
})();
