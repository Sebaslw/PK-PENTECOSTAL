// Vuelve a capturar las imágenes del manual, README y página con el programa ACTUAL (logo, barra, textos).
// Uso: node docs/manual/capturas.js . <carpeta de salida> [nombres…]   (requiere Google Chrome o Microsoft Edge)
// Arranca el servidor con una carpeta de datos temporal (sus ajustes no se tocan). Las IP de la red se
// reemplazan por 192.168.1.20 y la consulta del Wi-Fi propio se simula: no se enciende nada en Windows.
// Revise las imágenes y cópielas a docs/manual/img, web/img e Imagenes (bienvenida, cierre).
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const [RAIZ, SALIDA, ...SOLO] = process.argv.slice(2);
fs.mkdirSync(SALIDA, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAV = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

function servidor(puerto, extra = {}) {
  const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-cap-'));
  const ch = spawn(process.execPath, [path.join(RAIZ, 'PK-PENTECOSTAL', 'server.js')], { cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(puerto), PORT_PROYECTOR: String(puerto + 1), PORT_WEB: '0', PK_DATA_ROOT: datos, ...extra } });
  return { ch, datos, url: `http://127.0.0.1:${puerto}` };
}
async function esperar(url) { for (let i = 0; i < 150; i++) { try { if ((await fetch(url + '/api/biblias')).ok) return; } catch (_) {} await sleep(200); } throw new Error('no arrancó ' + url); }

async function navegador() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-cap-nav-'));
  const ch = spawn(NAV, ['--headless=new', '--remote-debugging-port=9338', '--user-data-dir=' + perfil, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
  let lista;
  for (let i = 0; i < 60; i++) { try { lista = await (await fetch('http://127.0.0.1:9338/json')).json(); if (lista.find((t) => t.type === 'page')) break; } catch (_) {} await sleep(200); }
  const ws = new WebSocket(lista.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  return { send, ev, cerrar: () => { try { ws.close(); } catch (_) {} try { execSync('taskkill /T /F /PID ' + ch.pid, { stdio: 'ignore' }); } catch (_) {} } };
}

(async () => {
  const S = servidor(18970), R = servidor(18980, { PK_TEST_REMOTO: '1' });
  const nav = await navegador();
  const hechas = [];
  try {
    await esperar(S.url); await esperar(R.url);
    let sinBienvenida = null;
    async function abrir(url, w, h, escala = 1, movil = false, bienvenida = false) {
      await nav.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: escala, mobile: movil });
      if (sinBienvenida) await nav.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: sinBienvenida });
      sinBienvenida = bienvenida ? null : (await nav.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{sessionStorage.setItem('pk-bienvenida','1')}catch(e){}" })).result.identifier;
      await nav.send('Page.navigate', { url });
      await sleep(2500);
      await nav.ev('document.fonts.ready.then(()=>true)');
    }
    const clic = (sel, texto) => nav.ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(sel)})];const el=${texto ? `els.find(e=>e.textContent.includes(${JSON.stringify(texto)}))` : 'els[0]'};if(!el)throw new Error('no hay ${sel} ${texto || ''}');el.scrollIntoView({block:'nearest'});el.click();return true})()`);
    const tab = async (t) => { await clic(`#tabs button[data-tab="${t}"]`); await sleep(700); };
    const escribir = (sel, v) => nav.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    // Espera a que la lista de Biblias tenga esa versión (al cambiar de idioma se vuelve a llenar)
    const version = (sigla) => nav.ev(`(async()=>{const s=document.querySelector('#bibVersion');let o;for(let i=0;i<40&&!o;i++){o=[...s.options].find(o=>o.textContent.trim().endsWith(${JSON.stringify(sigla)}));if(!o)await new Promise(r=>setTimeout(r,200))}if(!o)throw new Error('No aparece la Biblia ${sigla}: '+[...s.options].map(o=>o.textContent).join(' | '));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return o.textContent})()`);
    async function versiculo(ref, n) {
      await escribir('#refInput', ref); await nav.ev(`document.querySelector('#refForm').requestSubmit()`); await sleep(1200);
      await nav.ev(`(()=>{const v=[...document.querySelectorAll('#items .verse')].find(v=>v.querySelector('.n').textContent.trim()==='${n}');v.click();v.scrollIntoView({block:'center'});return true})()`);
      await sleep(1500);
    }
    async function cancion(titulo, slide = 0, buscar) {
      // Si los cancioneros aún cargan, la búsqueda sale vacía: se repite hasta que aparezca (máx. ~16 s)
      for (let i = 0; i < 8; i++) {
        await escribir('#canBuscar', buscar || titulo); await sleep(2000);
        if (await nav.ev(`[...document.querySelectorAll('#listaCanciones .list-item')].some(e=>e.textContent.includes(${JSON.stringify(titulo)}))`)) break;
      }
      await clic('#listaCanciones .list-item', titulo); await sleep(900);
      if (slide != null) { await clic(`#items .slide[data-i="${slide}"]`); await sleep(1500); }
    }
    async function foto(nombre, clipSel) {
      if (SOLO.length && !SOLO.includes(nombre)) return;
      let clip;
      if (clipSel) {
        const r = await nav.ev(`(()=>{const r=document.querySelector(${JSON.stringify(clipSel)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
        clip = { ...r, scale: 1 };
      }
      const s = await nav.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) });
      fs.writeFileSync(path.join(SALIDA, nombre + '.png'), Buffer.from(s.result.data, 'base64'));
      hechas.push(nombre); console.log('  ✔', nombre);
    }
    const quiere = (...n) => !SOLO.length || n.some((x) => SOLO.includes(x));

    // ---------- Pantallas de bienvenida y cierre, como en Imagenes/
    if (quiere('bienvenida')) { await abrir(S.url + '/', 1902, 984, 1, false, true); await sleep(400); await foto('bienvenida'); }
    if (quiere('cierre')) {
      const cierre = fs.readFileSync(path.join(RAIZ, 'PK-PENTECOSTAL', 'public', 'control.js'), 'utf8').match(/document\.body\.innerHTML = ('<div class="pk-pantalla"[^\n]*?');\n/)[1];
      await abrir(S.url + '/', 1902, 984);
      await nav.ev(`document.body.innerHTML = ${cierre}; true`); await sleep(1500); await foto('cierre');
    }

    // ---------- Panel 1600x900
    if (quiere('01-panel-biblia', '02-canciones', '03-texto', '05-estilo', '06-obs-overlay', '07-obs-banner', '08-obs-urls', '11-editor-cancion', '04-fondos')) {
      await abrir(S.url + '/', 1600, 900);
      await tab('biblia'); await version('RV1960'); await sleep(800); await versiculo('Juan 3:16', 16); await foto('01-panel-biblia');
      await tab('texto'); await escribir('#txtTitulo', 'Anuncios'); await escribir('#txtCuerpo', 'Bienvenidos a la casa de Dios\n\nCulto de jovenes: sabado 6:00 p. m.\n\nVigilia: viernes 9:00 p. m.');
      await clic('#btnTxtCargar'); await sleep(900);
      await tab('canciones'); await cancion('A La Escuela Bíblica', 0, 'escuela bíblica'); await escribir('#canBuscar', ''); await sleep(700);
      await nav.ev(`document.querySelector('#listaCanciones .list-item.active')?.scrollIntoView({block:'start'}); true`);
      await foto('02-canciones');
      await tab('texto'); await clic('#btnTxtCargar'); await sleep(900); await foto('03-texto');
      await tab('canciones'); await cancion('A La Escuela Bíblica', null, 'escuela bíblica'); await escribir('#canBuscar', ''); await sleep(500);
      await tab('estilo'); await foto('05-estilo');
      await tab('fondos'); await sleep(2500); await foto('04-fondos');
      await tab('canciones'); await sleep(300);
      await clic('#cActions button', 'Editar'); await sleep(1200); await foto('11-editor-cancion');
      await nav.ev(`document.querySelector('#dlgCancion').close(); true`); await sleep(400);
      await tab('obs');
      await clic('[data-view="overlay"]'); await sleep(1500); await foto('06-obs-overlay');
      await clic('[data-view="banner"]'); await sleep(2500); await foto('07-obs-banner');
      await clic('[data-view="urls"]'); await sleep(1000);
      // Sin las IP reales de este computador ni el puerto de prueba: dirección de ejemplo
      await nav.ev(`(()=>{const P=/(\\d{1,3}\\.){3}\\d{1,3}:18970/g, Q=/pkipuc\\.localhost:18970/g;
        const n=document.querySelector('#urlNotaRed'); if(n){const c=[...n.querySelectorAll('code')]; c.slice(1).forEach(x=>{const s=x.previousSibling; if(s&&s.nodeType===3&&!s.textContent.trim()) s.remove(); x.remove();});}
        const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT); let t; while((t=w.nextNode())) t.textContent=t.textContent.replace(P,'192.168.1.20:8888').replace(Q,'pkipuc.localhost');
        document.querySelectorAll('input').forEach(i=>{i.value=i.value.replace(P,'192.168.1.20:8888').replace(Q,'pkipuc.localhost')}); return true})()`);
      await foto('08-obs-urls');
    }

    // ---------- Ventana del QR (Misma red y Wi-Fi propio). La consulta del Wi-Fi se simula: no se toca Windows.
    const wifiFalso = (activo) => nav.ev(`(()=>{const f=window.fetch;window.fetch=(u,o)=>String(u).startsWith('/api/movil/wifi')?Promise.resolve(new Response(JSON.stringify(${activo
      ? "{ok:true,soportado:true,activo:true,ip:'192.168.137.1',wifi:{ssid:'PK-PENTECOSTAL',clave:'ejemplo2026'},clientes:0,max:8}"
      : '{ok:true,soportado:true,activo:false}'}),{headers:{'Content-Type':'application/json'}}))
      : String(u)==='/api/movil' ? f(u,o).then(r=>r.json()).then(d=>new Response(JSON.stringify({...d,ips:['192.168.1.20'],redes:[{ip:'192.168.1.20',nombre:'Wi-Fi'}],puerto:8888}),{headers:{'Content-Type':'application/json'}}))
      : f(u,o);return true})()`);
    if (quiere('13-ventana-qr')) {
      await abrir(S.url + '/', 1600, 900, 2); await wifiFalso(false);
      await clic('#btnMovil'); await sleep(1500); await foto('13-ventana-qr', '#dlgMovil');
    }
    if (quiere('18-wifi-propio')) {
      await abrir(S.url + '/', 1600, 900, 2); await wifiFalso(true);
      await clic('#btnMovil'); await sleep(1500); await foto('18-wifi-propio', '#dlgMovil');
    }

    // ---------- Idiomas (tarjeta) y panel en inglés 1536x864 @2
    if (quiere('19-idiomas')) { await abrir(S.url + '/', 1600, 900, 2); await tab('idiomas'); await sleep(800);
      // Como en un computador con el traductor instalado (la carpeta de prueba no lo trae)
      await nav.ev(`(()=>{const c=document.querySelector('#tradCard'); [...c.querySelectorAll('p,div,span')].filter(e=>/no está instalado/i.test(e.textContent)&&!e.querySelector('button')).forEach(e=>e.style.display='none'); const b=document.querySelector('#btnTraducirTodo'); b.disabled=false; b.classList.remove('disabled'); return true})()`);
      await sleep(300); await foto('19-idiomas', '.panel.lib'); }
    if (quiere('20-ingles-biblia', '21-ingles-canciones')) {
      await abrir(S.url + '/', 1536, 864, 2);
      await tab('idiomas'); await clic('#idiomas button, #idiomas [data-idioma], #idiomas .idioma', 'English (UK)'); await sleep(2500);
      await tab('biblia'); await version('BBE'); await sleep(1200); await versiculo('john 3:16', 16); await foto('20-ingles-biblia');
      await tab('canciones');
      await nav.ev(`(()=>{const s=document.querySelector('#cancionero');const o=[...s.options].find(o=>/Lluvias/i.test(o.textContent));s.value=o.value;s.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
      await sleep(1200);
      await clic('#listaCanciones .list-item', 'The Kingdom of God'); await sleep(1200);
      await nav.ev(`(()=>{const l=document.querySelector('#listaCanciones');const a=l.querySelector('.list-item.active');l.scrollTop=a.offsetTop-l.offsetTop-2*a.offsetHeight;return true})()`);
      await foto('21-ingles-canciones');
      await tab('idiomas'); await clic('#idiomas button, #idiomas [data-idioma], #idiomas .idioma', 'Español latino'); await sleep(2000);
    }

    // ---------- Celular 390x844 @2
    if (quiere('14-movil-vincular')) { await abrir(R.url + '/', 390, 844, 2, true); await sleep(800); await foto('14-movil-vincular'); }
    if (quiere('15-movil-elegir', '16-movil-diapositivas', '17-movil-monitor')) {
      await abrir(S.url + '/', 390, 844, 2, true);
      await tab('biblia'); await version('DHH'); await sleep(800);
      await clic('.mv-nav button[data-mv="lib"]'); await sleep(500); await foto('15-movil-elegir');
      await tab('canciones'); await cancion('A La Escuela Bíblica', 0, 'escuela bíblica');
      await clic('.mv-nav button[data-mv="content"]'); await sleep(800); await foto('16-movil-diapositivas');
      await clic('.mv-nav button[data-mv="monitors"]'); await sleep(3000); await foto('17-movil-monitor');
    }
  } catch (e) { console.error('ERROR', e.message); process.exitCode = 1; }
  finally {
    nav.cerrar(); for (const s of [S, R]) { try { s.ch.kill(); } catch (_) {} }
    await sleep(500); for (const s of [S, R]) { try { fs.rmSync(s.datos, { recursive: true, force: true }); } catch (_) {} }
    console.log(`${hechas.length} capturas en ${SALIDA}`);
  }
})();
