#!/usr/bin/env bash
# Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
# Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
# PK-PENTECOSTAL para Linux.  Uso:  ./iniciar-linux.sh          (abre el programa)
#                                   ./iniciar-linux.sh --instalar (crea el ícono en el menú de aplicaciones)
cd "$(dirname "$(readlink -f "$0")")/PK-PENTECOSTAL" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  PK-PENTECOSTAL necesita Node.js 16 o superior."
  echo "  Ubuntu/Debian/Mint:  sudo apt install nodejs"
  echo "  Fedora:              sudo dnf install nodejs"
  echo "  O descárguelo de:    https://nodejs.org"
  echo
  read -r -p "Presione Enter para salir" _
  exit 1
fi
if [ "$1" = "--instalar" ]; then
  mkdir -p "$HOME/.local/share/applications"
  cat > "$HOME/.local/share/applications/pk-pentecostal.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=PK-PENTECOSTAL
Comment=Biblia, canciones y rótulos para OBS y proyector - Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
Exec="$(readlink -f ../iniciar-linux.sh)"
Icon=$(pwd)/public/icono-512.png
Terminal=true
Categories=AudioVideo;Video;
DESK
  echo "Listo: PK-PENTECOSTAL aparece en el menú de aplicaciones."
  exit 0
fi
echo "  PK-PENTECOSTAL - Hecho por Sebastian Lopez · IPUC Natania 6° Etapa"
echo "  Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina"
echo "  «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4"
exec node server.js --abrir
