// PK-PENTECOSTAL · Archivos .zip sin dependencias: leer las Biblias (.bi) y crear / leer el respaldo completo.
'use strict';
const fs = require('fs');
const zlib = require('zlib');

// Primer archivo de un .zip (las Biblias .bi son un zip con un solo texto). Si no es zip, devuelve el mismo buffer.
function primerArchivo(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return buf; // texto plano
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP sin directorio central');
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOff = buf.readUInt32LE(cdOffset + 42);
  const nameLen = buf.readUInt16LE(localOff + 26);
  const extraLen = buf.readUInt16LE(localOff + 28);
  const start = localOff + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error('Compresión ZIP no soportada: ' + method);
}

const CRC_TABLA = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }

// lista = [[nombre dentro del zip, ruta del archivo], …]  →  Buffer con el .zip
function crearZip(lista) {
  const partes = [], central = [];
  let offset = 0;
  const d = new Date();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [nombre, archivo] of lista) {
    const datos = fs.readFileSync(archivo);
    const comprimir = /\.(json|js|txt|svg|css|html|md|bi)$/i.test(nombre);
    const cuerpo = comprimir ? zlib.deflateRawSync(datos) : datos;
    const n = Buffer.from(nombre, 'utf8'), crc = crc32(datos);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x0800, 6); loc.writeUInt16LE(comprimir ? 8 : 0, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(fecha, 12); loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(cuerpo.length, 18);
    loc.writeUInt32LE(datos.length, 22); loc.writeUInt16LE(n.length, 26); loc.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(comprimir ? 8 : 0, 10);
    cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(fecha, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(cuerpo.length, 20); cen.writeUInt32LE(datos.length, 24);
    cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    partes.push(loc, n, cuerpo); central.push(cen, n);
    offset += 30 + n.length + cuerpo.length;
  }
  const cd = Buffer.concat(central), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(lista.length, 8); fin.writeUInt16LE(lista.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, cd, fin]);
}

// Buffer con un .zip  →  [[nombre, datos], …] (sin las carpetas)
function leerZip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('El archivo no es un .zip válido');
  const total = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let i = 0; i < total; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('El .zip está dañado');
    const metodo = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42), nombre = buf.slice(p + 46, p + 46 + nl).toString('utf8');
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const datos = buf.slice(ini, ini + csize);
    if (!nombre.endsWith('/')) out.push([nombre, metodo === 8 ? zlib.inflateRawSync(datos) : datos]);
    p += 46 + nl + xl + cl;
  }
  return out;
}

module.exports = { primerArchivo, crc32, crearZip, leerZip };
