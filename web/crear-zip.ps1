# PK-PENTECOSTAL · Prepara las descargas de la página web.
# Uso:  primero  npm run dist  (crea el instalador y el portable en dist\)
#       luego    powershell -ExecutionPolicy Bypass -File web\crear-zip.ps1
#
# 1. Crea el .zip del código fuente (macOS / Linux / quien use Node.js). Respeta .gitignore:
#    NO incluye BSPK/ (ajustes, claves y respaldos privados), .git/, dist/ ni la carpeta web/.
# 2. Escribe web\descargas\info.js con nombre, tamaño y SHA-256 del instalador, el portable y el .zip.
# Los tres archivos se suben como Release v<versión> en GitHub (pesan más de 100 MB).

$ErrorActionPreference = 'Stop'
$web  = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $web
$version = (Get-Content -Raw (Join-Path $raiz 'package.json') | ConvertFrom-Json).version
$repoGitHub = 'Sebaslw/PK-PENTECOSTAL'
$urlRelease = "https://github.com/$repoGitHub/releases/download/v$version"
$destDir = Join-Path $web 'descargas'
New-Item -ItemType Directory -Force $destDir | Out-Null

# ---------- .zip del código fuente
$nombreZip = "PK-PENTECOSTAL-$version-codigo-fuente.zip"
$dest = Join-Path $destDir $nombreZip
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
$lista = git -C $raiz -c core.quotepath=false ls-files -co --exclude-standard -z
$archivos = ($lista -join '') -split "`0" | Where-Object {
  $_ -and $_ -notmatch '^(web/|BSPK/|dist/|node_modules/|\.git/)' -and $_ -notmatch '(^|/)\.claude/'
}
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($dest, 'Create')
$carpeta = "PK-PENTECOSTAL $version"
$n = 0
try {
  foreach ($a in $archivos) {
    $origen = Join-Path $raiz ($a -replace '/', '\')
    if (-not [System.IO.File]::Exists($origen)) { continue }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $origen, "$carpeta/$a", 'Optimal') | Out-Null
    $n++
  }
} finally { $zip.Dispose() }

function Datos($ruta, $nombre) {
  if (-not (Test-Path -LiteralPath $ruta)) { return 'null' }
  $mb = [math]::Round((Get-Item -LiteralPath $ruta).Length / 1MB, 1).ToString([Globalization.CultureInfo]::InvariantCulture)
  $hash = (Get-FileHash -LiteralPath $ruta -Algorithm SHA256).Hash.ToLower()
  return "{ nombre: '$nombre', url: '$urlRelease/$nombre', tamanoMB: $mb, sha256: '$hash' }"
}
$inst = "PK-PENTECOSTAL-Instalador-$version.exe"
$port = "PK-PENTECOSTAL-Portable-$version.exe"
$dist = Join-Path $raiz 'dist'
$fecha = Get-Date -Format 'yyyy-MM-dd'

# Datos que muestra la página (archivo .js para que funcione también abriendo index.html sin servidor)
$info = @"
window.PK_DESCARGA = {
  version: '$version',
  fecha: '$fecha',
  instalador: $(Datos (Join-Path $dist $inst) $inst),
  portable: $(Datos (Join-Path $dist $port) $port),
  zip: $(Datos $dest $nombreZip),
  archivosZip: $n
};
"@
[System.IO.File]::WriteAllText((Join-Path $destDir 'info.js'), $info, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "  Listo: $destDir\info.js"
Write-Host "  .zip: $n archivos"
Write-Host "  Suba a la Release v$version : dist\$inst, dist\$port y web\descargas\$nombreZip"
