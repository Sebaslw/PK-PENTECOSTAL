# PK-PENTECOSTAL · Wi-Fi propio (Zona con cobertura inalámbrica móvil de Windows)
# Uso: zona-wifi.ps1 estado | iniciar <ssid> <clave> | detener
# Responde siempre una línea JSON.
param([string]$accion = 'estado', [string]$ssid = '', [string]$clave = '')
$ErrorActionPreference = 'Stop'

function Responder($obj) { $obj | ConvertTo-Json -Compress; exit 0 }

try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $asTaskAccion = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' })[0]
  function Esperar($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
  function EsperarAccion($op) { $t = $asTaskAccion.Invoke($null, @($op)); $t.Wait(-1) | Out-Null }

  [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime] | Out-Null
  [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null
  [Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration, Windows.Networking.NetworkOperators, ContentType = WindowsRuntime] | Out-Null

  # Perfil de conexión a compartir: el de internet; si no hay internet, cualquier conexión activa.
  $TM = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager]
  $perfil = [Windows.Networking.Connectivity.NetworkInformation]::GetInternetConnectionProfile()
  if (-not $perfil) {
    $perfil = [Windows.Networking.Connectivity.NetworkInformation]::GetConnectionProfiles() |
      Where-Object { $_.GetNetworkConnectivityLevel() -ne 'None' } | Select-Object -First 1
  }
  if (-not $perfil) { Responder @{ ok = $false; soportado = $false; error = 'El computador debe estar conectado a alguna red (Wi-Fi o cable) para crear su propio Wi-Fi.' } }
  $cap = [string]$TM::GetTetheringCapabilityFromConnectionProfile($perfil)
  if ($cap -ne 'Enabled') { Responder @{ ok = $false; soportado = $false; error = "Windows no permite crear la zona Wi-Fi en este equipo ($cap)." } }
  $tm = $TM::CreateFromConnectionProfile($perfil)

  function Estado() {
    $cfg = $tm.GetCurrentAccessPointConfiguration()
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like '192.168.137.*' -and [string]$_.AddressState -eq 'Preferred' } | Select-Object -First 1).IPAddress
    @{ ok = $true; soportado = $true; activo = ([string]$tm.TetheringOperationalState -eq 'On'); ssid = $cfg.Ssid; clientes = $tm.ClientCount; max = $tm.MaxClientCount; ip = $ip }
  }

  switch ($accion) {
    'estado' { Responder (Estado) }
    'iniciar' {
      $prev = $tm.GetCurrentAccessPointConfiguration()
      $anterior = $null
      if ($prev.Ssid -ne $ssid) { $anterior = @{ ssid = $prev.Ssid; clave = $prev.Passphrase } }
      $cfg = New-Object Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration
      $cfg.Ssid = $ssid; $cfg.Passphrase = $clave
      EsperarAccion ($tm.ConfigureAccessPointAsync($cfg))
      if ([string]$tm.TetheringOperationalState -ne 'On') {
        $r = Esperar ($tm.StartTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult])
        if ([string]$r.Status -ne 'Success') { Responder @{ ok = $false; soportado = $true; error = "No se pudo encender el Wi-Fi propio ($($r.Status)). $($r.AdditionalErrorMessage)" } }
      }
      for ($i = 0; $i -lt 40; $i++) { $e = Estado; if ($e.ip) { break }; Start-Sleep -Milliseconds 500 }
      $e.anterior = $anterior
      Responder $e
    }
    'detener' {
      if ([string]$tm.TetheringOperationalState -eq 'On') { Esperar ($tm.StopTetheringAsync()) ([Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]) | Out-Null }
      # Restaurar la zona Wi-Fi que el usuario tenía configurada antes
      if ($ssid -and $clave) {
        $cfg = New-Object Windows.Networking.NetworkOperators.NetworkOperatorTetheringAccessPointConfiguration
        $cfg.Ssid = $ssid; $cfg.Passphrase = $clave
        EsperarAccion ($tm.ConfigureAccessPointAsync($cfg))
      }
      Responder (Estado)
    }
    default { Responder @{ ok = $false; error = "Acción desconocida: $accion" } }
  }
} catch {
  Responder @{ ok = $false; soportado = $false; error = $_.Exception.Message }
}
