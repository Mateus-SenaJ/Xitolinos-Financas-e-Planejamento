param([string]$DataRoot = $env:XITOLINOS_DATA_DIR)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = if ($DataRoot) { [System.IO.Path]::GetFullPath($DataRoot) } else { $projectRoot }
$dataDir = Join-Path $runtimeRoot 'data\mysql'
$environmentPath = Join-Path $runtimeRoot 'backend\.env'
$clientPath = Join-Path $dataDir 'root-client.ini'
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe'
$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value

function Set-PrivateAccess([string]$Path) {
  $ErrorActionPreference = 'Continue'
  & icacls.exe $Path /inheritance:r /grant:r "*$($userSid):F" '*S-1-5-18:F' '*S-1-5-32-544:F' 2>$null | Out-Null
  $permissionResult = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($permissionResult -ne 0) { throw 'Não foi possível restringir o acesso ao arquivo de credenciais local.' }
}

if (-not (Test-Path -LiteralPath $mysql) -or -not (Test-Path -LiteralPath $environmentPath) -or -not (Test-Path -LiteralPath $clientPath)) {
  throw 'O banco local não está configurado; inicie-o antes de rotacionar as credenciais.'
}
Set-PrivateAccess $clientPath
$environment = @{}
foreach ($line in Get-Content -LiteralPath $environmentPath) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') { $environment[$matches[1]] = $matches[2] }
}
$previousRoot = $environment['MYSQL_ROOT_PASSWORD']
$previousDatabase = $environment['DATABASE_PASSWORD']
if ($previousRoot -notmatch '^[a-f0-9]{64}$' -or $previousDatabase -notmatch '^[a-f0-9]{64}$') { throw 'As credenciais locais não estão no formato esperado; nada foi alterado.' }

$nextRoot = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$nextDatabase = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$sqlPath = Join-Path $dataDir 'rotate-local-credentials.sql'
$outputPath = Join-Path $dataDir 'rotate-local-credentials.out'
$errorPath = Join-Path $dataDir 'rotate-local-credentials.err'
$clientLines = @('[client]', 'user=root', "password=$previousRoot", 'protocol=memory', 'shared-memory-base-name=XITOLINOS')
try {
  $clientLines | Set-Content -LiteralPath $clientPath -Encoding ascii
  Set-PrivateAccess $clientPath
  @("ALTER USER 'root'@'localhost' IDENTIFIED BY '$nextRoot';", "ALTER USER 'xitolinos'@'127.0.0.1' IDENTIFIED BY '$nextDatabase';", 'FLUSH PRIVILEGES;') | Set-Content -LiteralPath $sqlPath -Encoding ascii
  Set-PrivateAccess $sqlPath
  Remove-Item -LiteralPath $outputPath, $errorPath -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $mysql -ArgumentList @("`"--defaults-extra-file=$clientPath`"", '--batch', '--skip-column-names') -PassThru -Wait -WindowStyle Hidden -RedirectStandardInput $sqlPath -RedirectStandardOutput $outputPath -RedirectStandardError $errorPath
  if ($process.ExitCode -ne 0) { throw 'O servidor MySQL recusou a rotação das credenciais locais; confira o estado do serviço.' }

  $clientLines = @('[client]', 'user=root', "password=$nextRoot", 'protocol=memory', 'shared-memory-base-name=XITOLINOS')
  $clientLines | Set-Content -LiteralPath $clientPath -Encoding ascii
  Set-PrivateAccess $clientPath
  foreach ($path in @($environmentPath, $(if (-not $DataRoot) { Join-Path $projectRoot '.env' }))) {
    if (-not $path -or -not (Test-Path -LiteralPath $path)) { continue }
    $lines = @(Get-Content -LiteralPath $path)
    $seenRoot = $false
    $seenDatabase = $false
    $lines = @($lines | ForEach-Object {
      if ($_ -match '^MYSQL_ROOT_PASSWORD=') { $seenRoot = $true; "MYSQL_ROOT_PASSWORD=$nextRoot" }
      elseif ($_ -match '^DATABASE_PASSWORD=') { $seenDatabase = $true; "DATABASE_PASSWORD=$nextDatabase" }
      else { $_ }
    })
    if (-not $seenRoot) { $lines += "MYSQL_ROOT_PASSWORD=$nextRoot" }
    if (-not $seenDatabase) { $lines += "DATABASE_PASSWORD=$nextDatabase" }
    $lines | Set-Content -LiteralPath $path -Encoding utf8
    Set-PrivateAccess $path
  }
  'As credenciais do banco local foram rotacionadas. Os dados financeiros foram preservados.'
}
finally {
  Remove-Item -LiteralPath $sqlPath, $outputPath, $errorPath -Force -ErrorAction SilentlyContinue
}
