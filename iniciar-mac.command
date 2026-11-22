#!/bin/bash
# Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
# Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
# PK-PENTECOSTAL para macOS: doble clic en Finder.
# Si macOS no lo deja abrir: clic derecho > Abrir. Si dice "sin permisos", en Terminal:
#   chmod +x iniciar-mac.command
cd "$(dirname "$0")/PK-PENTECOSTAL" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  PK-PENTECOSTAL necesita Node.js 16 o superior."
  PKG=$(ls ../NODEJS/node-*.pkg 2>/dev/null | head -1)
  if [ -n "$PKG" ]; then
    # El .zip trae el instalador oficial en la carpeta NODEJS: no hace falta internet
    echo "  Se abrirá el instalador incluido en la carpeta NODEJS."
    echo "  Siga los pasos y vuelva a abrir iniciar-mac.command."
    echo
    open "$PKG"
  else
    echo "  Descárguelo (instalador .pkg) de: https://nodejs.org"
    echo
    open "https://nodejs.org/es/download"
  fi
  read -r -p "Presione Enter para salir" _
  exit 1
fi
echo "  PK-PENTECOSTAL - Hecho por Sebastian Lopez · IPUC Natania 6° Etapa"
echo "  Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina"
echo "  «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4"
exec node server.js --abrir
