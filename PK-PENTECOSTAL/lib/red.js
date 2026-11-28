// PK-PENTECOSTAL · Red local: direcciones de este equipo para los celulares y abrir el navegador.
'use strict';
const os = require('os');

// IPs de este equipo en la red. Primero el Wi-Fi / cable real; al final adaptadores virtuales
// (VirtualBox, VMware, Hyper-V, WSL, VPN), que un celular no puede alcanzar.
function redesLocales() {
  const VIRTUAL_MAC = /^(0a:00:27|08:00:27|00:50:56|00:0c:29|00:05:69|00:1c:14|00:15:5d|00:03:ff)/i;
  const VIRTUAL_NOM = /virtual|vbox|vmware|vethernet|hyper-v|wsl|docker|vpn|tailscale|zerotier|hamachi|bluetooth/i;
  const lista = [];
  for (const [nombre, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || i.address.startsWith('169.254.')) continue;
      let puntos = 0;
      if (/wi-?fi|wlan|wireless|inal/i.test(nombre)) puntos += 2;
      if (VIRTUAL_MAC.test(i.mac || '') || VIRTUAL_NOM.test(nombre) || i.address.startsWith('192.168.56.')) puntos -= 5;
      lista.push({ ip: i.address, nombre, puntos });
    }
  }
  return lista.sort((a, b) => b.puntos - a.puntos).map(({ ip, nombre }) => ({ ip, nombre }));
}
function localIPs() { return redesLocales().map((r) => r.ip); }

function abrirNavegador(url) {
  const { spawn } = require('child_process');
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  try {
    const ch = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsVerbatimArguments: process.platform === 'win32' });
    ch.on('error', () => console.log(`   Abra manualmente en su navegador: ${url}`));
    ch.unref();
  } catch (_) { console.log(`   Abra manualmente en su navegador: ${url}`); }
}

module.exports = { redesLocales, localIPs, abrirNavegador };
