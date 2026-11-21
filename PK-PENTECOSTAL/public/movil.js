// PK-PENTECOSTAL · Conectar celular (QR) y vista para teléfono
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ================================================================ Ventana QR (computador)
  const dlg = $('#dlgMovil');
  let info = null;

  // QR con el logo de PK-PENTECOSTAL en el centro (corrección de errores alta: se lee aunque el logo tape el centro)
  const svgQR = (texto, alt) => {
    const qr = qrcode(0, 'H'); qr.addData(texto); qr.make();
    const celda = 6, margen = 4, lado = qr.getModuleCount() * celda + margen * 2;
    const caja = Math.round(lado * 0.24), x = (lado - caja) / 2, borde = Math.round(caja * 0.1);
    const logo = `<rect x="${x - borde}" y="${x - borde}" width="${caja + borde * 2}" height="${caja + borde * 2}" rx="${borde * 2}" fill="#fff"/>`
      + `<image href="/icono-192.png" x="${x}" y="${x}" width="${caja}" height="${caja}" preserveAspectRatio="xMidYMid meet"/>`;
    return qr.createSvgTag({ cellSize: celda, margin: margen, scalable: true, alt }).replace('</svg>', logo + '</svg>');
  };
  const marca = (url) => `<div class="mv-marca"><img src="/icono-64.png" alt="" width="26" height="26"><span>PK-<b>PENTECOSTAL</b></span></div>`
    + `<details class="mv-dir"><summary>¿Sin cámara? Ver dirección</summary><code>${esc(url)}</code></details>`;
  const urlPanel = (ip) => `http://${ip}:${info.puerto}/?vincular=${info.clave}`;
  // Formato estándar de QR de Wi-Fi (lo reconoce la cámara de Android y iPhone)
  const escWifi = (s) => String(s).replace(/([\\;,:"])/g, '\\$1');

  function pintarQR() {
    const ip = $('#mvIp').value;
    if (!ip) return;
    $('#mvQr').innerHTML = svgQR(urlPanel(ip), 'Código QR para conectar el celular');
    $('#mvUrl').innerHTML = marca(`http://${ip}:${info.puerto}/`);
  }

  // ---------- Wi-Fi propio
  let wifi = null, esperaIp = null, intentosIp = 0;
  function verWifi(estado) {
    const ver = (id) => ['#mvWifiNo', '#mvWifiApagado', '#mvWifiOk', '#mvWifiCargando'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
    if (estado === 'cargando') return ver('#mvWifiCargando');
    wifi = estado;
    if (!wifi || (!wifi.ok && wifi.soportado === false)) {
      $('#mvWifiNoTxt').textContent = (wifi && wifi.error) || 'No se pudo consultar el Wi-Fi propio.';
      return ver('#mvWifiNo');
    }
    if (!wifi.ok) { toastMv('⚠️ ' + (wifi.error || 'No se pudo encender el Wi-Fi propio')); }
    clearTimeout(esperaIp);
    if (wifi.activo && !wifi.ip) {
      // Windows ya encendió la red pero aún prepara su dirección: seguir consultando
      $('#mvWifiCargandoTxt').textContent = 'Preparando la red… (puede tardar hasta un minuto)';
      ver('#mvWifiCargando');
      if (++intentosIp <= 30) esperaIp = setTimeout(() => { if (dlg.open) pedirWifi().then(verWifi); }, 2000);
      else { intentosIp = 0; toastMv('⚠️ Windows no terminó de preparar la red. Pulse “Crear Wi-Fi propio” otra vez.'); ver('#mvWifiApagado'); }
      return;
    }
    intentosIp = 0;
    if (!wifi.activo) return ver('#mvWifiApagado');
    const w = wifi.wifi;
    $('#mvQrWifi').innerHTML = svgQR(`WIFI:T:WPA;S:${escWifi(w.ssid)};P:${escWifi(w.clave)};;`, 'Código QR para unirse al Wi-Fi');
    $('#mvQrPanel').innerHTML = svgQR(urlPanel(wifi.ip), 'Código QR para abrir el panel');
    $('#mvSsid').innerHTML = esc(w.ssid).replace('PENTECOSTAL', '<b>PENTECOSTAL</b>');
    $('#mvPass').textContent = w.clave;
    $('#mvUrlWifi').innerHTML = marca(`http://${wifi.ip}:${info.puerto}/`);
    $('#mvClientes').textContent = `Teléfonos conectados a este Wi-Fi: ${wifi.clientes || 0} de ${wifi.max || 8}`;
    ver('#mvWifiOk');
  }
  async function pedirWifi(cuerpo) {
    try {
      const r = await fetch('/api/movil/wifi', cuerpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) } : { cache: 'no-store' });
      return await r.json();
    } catch (_) { return { ok: false, error: 'Sin conexión con el programa' }; }
  }
  function toastMv(msg) { const t = $('#toast'); if (!t) return alert(msg); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 4000); }

  let refresco = null;
  function pestaña(t) {
    $$('#mvTabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    $$('#dlgMovil .mv-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.t !== t));
    dlg.dataset.wifi = t === 'wifi' ? '1' : '';
    clearInterval(refresco);
    if (t === 'wifi') {
      if (!wifi) verWifi('cargando');
      $('#mvWifiCargandoTxt').textContent = 'Consultando el Wi-Fi propio…';
      pedirWifi().then(verWifi);
      // Actualiza el número de teléfonos conectados mientras la ventana está abierta
      refresco = setInterval(() => { if (dlg.open && wifi && wifi.activo) pedirWifi().then((r) => { if (r.ok) verWifi(r); }); }, 5000);
    }
  }
  $('#mvTabs')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pestaña(b.dataset.t); });
  $('#mvIrWifi')?.addEventListener('click', (e) => { e.preventDefault(); pestaña('wifi'); });
  $('#mvWifiOn')?.addEventListener('click', async () => {
    $('#mvWifiCargandoTxt').textContent = 'Encendiendo el Wi-Fi propio… (unos segundos)';
    verWifi('cargando');
    verWifi(await pedirWifi({ encender: true }));
  });
  $('#mvWifiOff')?.addEventListener('click', async () => {
    if (!confirm('¿Apagar el Wi-Fi propio?\n\nLos teléfonos conectados a él dejarán de controlar el programa.')) return;
    $('#mvWifiCargandoTxt').textContent = 'Apagando el Wi-Fi propio…';
    verWifi('cargando');
    verWifi(await pedirWifi({ encender: false }));
  });

  async function abrirQR() {
    try {
      info = await (await fetch('/api/movil', { cache: 'no-store' })).json();
    } catch (_) { info = null; }
    if (!info || !info.clave) { alert('No se pudo obtener la información de conexión.'); return; }
    const sinRed = !info.ips.length;
    $('#mvSinRed').classList.toggle('hidden', !sinRed);
    $('#mvConRed').classList.toggle('hidden', sinRed);
    $('#mvTabs').classList.toggle('hidden', info.sistema !== 'win32');
    if (!sinRed) {
      const previa = $('#mvIp').value;
      const redes = info.redes || info.ips.map((ip) => ({ ip, nombre: ip }));
      $('#mvIp').innerHTML = redes.map((r) => `<option value="${esc(r.ip)}">${esc(r.nombre)}</option>`).join('');
      if (info.ips.includes(previa)) $('#mvIp').value = previa;
      $('#mvIpFila').classList.toggle('hidden', info.ips.length < 2);
      pintarQR();
    }
    if (!dlg.open) dlg.showModal();
    // Si el Wi-Fi propio está encendido (o no hay red), abrir directamente esa pestaña
    const w = info.sistema === 'win32' ? await pedirWifi() : null;
    if (w && w.ok && w.activo) { verWifi(w); pestaña('wifi'); }
    else if (sinRed && info.sistema === 'win32') pestaña('wifi');
    else pestaña('red');
  }

  $('#btnMovil')?.addEventListener('click', abrirQR);
  $('#mvIp')?.addEventListener('change', pintarQR);
  $('#mvCerrar')?.addEventListener('click', () => dlg.close());
  dlg?.addEventListener('close', () => { clearInterval(refresco); clearTimeout(esperaIp); });
  $('#mvRenovar')?.addEventListener('click', async () => {
    if (!confirm('¿Desvincular todos los celulares?\n\nTendrán que volver a escanear el nuevo código QR para controlar el programa.')) return;
    const r = await (await fetch('/api/movil/renovar', { method: 'POST' })).json();
    if (r.clave) { info.clave = r.clave; pintarQR(); if (wifi && wifi.activo) verWifi(wifi); }
  });

  // ================================================================ Vista de teléfono
  const mq = matchMedia('(max-width: 700px)');
  const layout = $('.layout');
  const vistas = { lib: $('.panel.lib'), content: $('.panel.content'), monitors: $('.panel.monitors') };

  // Botones para cambiar de sub-vista (solo visibles en el celular)
  const nav = document.createElement('div');
  nav.className = 'mv-nav';
  nav.innerHTML = `<button data-mv="lib">📚 Elegir</button><button data-mv="content">🖥️ Diapositivas</button><button data-mv="monitors">📺 Monitor</button>`;
  layout.before(nav);

  // Barra fija de abajo
  const barra = document.createElement('div');
  barra.className = 'mv-barra';
  barra.innerHTML = `<div class="mv-vivo"><span class="dot live"></span><span id="mvVivo">Nada al aire</span></div>
    <div class="mv-botones">
      <button data-a="ant" aria-label="Anterior">◀</button>
      <button data-a="negro">Negro</button>
      <button data-a="ocultar">Ocultar</button>
      <button data-a="limpiar" class="danger">Limpiar</button>
      <button data-a="sig" aria-label="Siguiente">▶</button>
    </div>`;
  document.body.appendChild(barra);

  const aviso = document.createElement('div');
  aviso.className = 'mv-offline hidden';
  aviso.textContent = '● Sin conexión con el computador — reintentando…';
  document.body.appendChild(aviso);

  barra.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'ant') window.PK?.mover(-1);
    else if (a === 'sig') window.PK?.mover(1);
    else if (a === 'limpiar') window.PK?.limpiar();
    else if (a === 'negro') $('#btnNegro').click();
    else if (a === 'ocultar') $('#btnOcultar').click();
  });

  // Reflejar estado de Negro / Ocultar / En vivo / conexión
  const espejo = () => {
    $('[data-a="negro"]', barra).classList.toggle('on', $('#btnNegro').classList.contains('on'));
    $('[data-a="ocultar"]', barra).classList.toggle('on', $('#btnOcultar').classList.contains('on'));
    const ref = $('#nowRef').textContent.trim();
    $('#mvVivo').textContent = ref && ref !== '—' ? 'En vivo: ' + ref : 'Nada al aire';
    barra.classList.toggle('al-aire', !!ref && ref !== '—');
    aviso.classList.toggle('hidden', !$('#conn').classList.contains('err'));
  };
  const obs = new MutationObserver(espejo);
  ['#btnNegro', '#btnOcultar', '#conn'].forEach((s) => obs.observe($(s), { attributes: true, attributeFilter: ['class'] }));
  obs.observe($('#nowRef'), { childList: true, characterData: true, subtree: true });
  espejo();

  // Monitores: en el celular solo se cargan cuando se ven (ahorra batería y datos)
  const iframes = $$('.panel.monitors iframe');
  iframes.forEach((f) => (f.dataset.src = f.getAttribute('src')));
  function monitores(activos) {
    iframes.forEach((f) => {
      const quiere = activos ? f.dataset.src : 'about:blank';
      if (f.getAttribute('src') !== quiere) f.setAttribute('src', quiere);
    });
  }

  function verSub(nombre) {
    document.body.dataset.mv = nombre;
    $$('button', nav).forEach((b) => b.classList.toggle('active', b.dataset.mv === nombre));
    Object.entries(vistas).forEach(([k, el]) => el.classList.toggle('mv-activo', k === nombre));
    if (mq.matches) monitores(nombre === 'monitors');
    ajustarAlto();
  }
  nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) verSub(b.dataset.mv); });

  // Al elegir algo en la lista, saltar solo a las diapositivas
  let toqueLista = 0;
  vistas.lib.addEventListener('click', () => { toqueLista = Date.now(); }, true);
  new MutationObserver(() => {
    if (mq.matches && Date.now() - toqueLista < 2500 && document.body.dataset.mv === 'lib') { toqueLista = 0; verSub('content'); }
  }).observe($('#items'), { childList: true });

  // Al cambiar de pestaña, volver a "Elegir"
  $('#tabs').addEventListener('click', (e) => { if (e.target.closest('button') && mq.matches) verSub('lib'); });

  // Alto disponible para el panel visible (para que la lista se desplace por dentro)
  function ajustarAlto() {
    if (!mq.matches) return;
    const arriba = layout.getBoundingClientRect().top + window.scrollY;
    const abajo = barra.offsetHeight;
    document.documentElement.style.setProperty('--mv-alto', Math.max(320, window.innerHeight - arriba - abajo - 16) + 'px');
  }
  addEventListener('resize', ajustarAlto);

  function modo() {
    document.documentElement.classList.toggle('pk-movil', mq.matches);
    if (mq.matches) verSub(document.body.dataset.mv || 'lib');
    else monitores(true);
  }
  mq.addEventListener('change', modo);
  modo();
})();
