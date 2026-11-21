# PK-PENTECOSTAL · Crea el .zip que se descarga desde la página web.
# Uso:  clic derecho → "Ejecutar con PowerShell"   (o: powershell -ExecutionPolicy Bypass -File web\crear-zip.ps1)
#
# Incluye exactamente lo que se sube a GitHub (respeta .gitignore):
#   NO incluye BSPK/ (ajustes, claves y respaldos privados), .git/ ni la carpeta web/.

$ErrorActionPreference = 'Stop'
$web  = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = Split-Path -Parent $web
$version = '1.0.2'
$repoGitHub = 'Sebaslw/PK-PENTECOSTAL'   # donde se publica el .zip como Release (v$version)
$nombre  = "PK-PENTECOSTAL-$version.zip"
$destDir = Join-Path $web 'descargas'
$dest    = Join-Path $destDir $nombre
New-Item -ItemType Directory -Force $destDir | Out-Null
if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }

# Lista de archivos (con tildes y ñ correctas)
$lista = git -C $raiz -c core.quotepath=false ls-files -co --exclude-standard -z
$archivos = ($lista -join '') -split "`0" | Where-Object {
  $_ -and $_ -notmatch '^(web/|BSPK/|\.git/)' -and $_ -notmatch '(^|/)\.claude/'
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

$tam  = (Get-Item -LiteralPath $dest).Length
$mb   = [math]::Round($tam / 1MB, 1)
$hash = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLower()
$fecha = Get-Date -Format 'yyyy-MM-dd'

# Datos que muestra la página (archivo .js para que funcione también abriendo index.html sin servidor)
$info = @"
window.PK_DESCARGA = {
  archivo: 'descargas/$nombre',
  urlWeb: 'https://github.com/$repoGitHub/releases/download/v$version/$nombre',
  nombre: '$nombre',
  version: '$version',
  tamanoMB: $($mb.ToString([Globalization.CultureInfo]::InvariantCulture)),
  archivos: $n,
  fecha: '$fecha',
  sha256: '$hash'
};
"@
[System.IO.File]::WriteAllText((Join-Path $destDir 'info.js'), $info, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "  Listo: $dest"
Write-Host "  $n archivos - $mb MB - SHA-256 $hash"
