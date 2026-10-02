param([ValidateSet('Start','Stop','Status')][string]$Action = 'Start', [string]$DataRoot = $env:XITOLINOS_DATA_DIR)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = if ($DataRoot) { [System.IO.Path]::GetFullPath($DataRoot) } else { $projectRoot }
$baseDir = 'C:\Program Files\MySQL\MySQL Server 8.4'
$bin = Join-Path $baseDir 'bin'
$mysqld = Join-Path $bin 'mysqld.exe'
$mysql = Join-Path $bin 'mysql.exe'
$mysqladmin = Join-Path $bin 'mysqladmin.exe'
$port = 3307
$dataDir = Join-Path $runtimeRoot 'data\mysql'
$configPath = Join-Path $dataDir 'my.ini'
$pidPath = Join-Path $dataDir 'xitolinos-mysql.pid'
$errorLog = Join-Path $dataDir 'mysql.err'
$readyPath = Join-Path $dataDir 'xitolinos-initialized'
$envPath = Join-Path $runtimeRoot 'backend\.env'

function Set-PrivateAccess([string]$Path, [bool]$Directory = $false) {
  $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $rights = if ($Directory) { @("*$($userSid):(OI)(CI)F", '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F') } else { @("*$($userSid):F", '*S-1-5-18:F', '*S-1-5-32-544:F') }
  $ErrorActionPreference = 'Continue'
  & icacls.exe $Path /inheritance:r /grant:r @rights 2>$null | Out-Null
  $permissionResult = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($permissionResult -ne 0) { throw 'Não foi possível restringir as permissões dos dados locais do Xitolinos.' }
}

if (Test-Path -LiteralPath $dataDir) {
  Set-PrivateAccess $dataDir $true
  foreach ($entry in Get-ChildItem -LiteralPath $dataDir -Force -ErrorAction SilentlyContinue) {
    if ($entry.PSIsContainer) { Set-PrivateAccess $entry.FullName $true }
    else { Set-PrivateAccess $entry.FullName }
  }
}

if (-not (Test-Path -LiteralPath $mysqld)) { throw "MySQL 8.4 não encontrado em $baseDir. Instale o MySQL Community Server 8.4 ou use Docker Compose." }
if ($Action -eq 'Status') {
  if (-not (Test-Path -LiteralPath $pidPath)) { 'MySQL local ainda não foi iniciado; os dados ficarão em data\mysql.'; exit 0 }
  $savedPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
  if ($savedProcess -and $savedProcess.ExecutablePath -ieq $mysqld -and $savedProcess.CommandLine.Contains($configPath)) { "MySQL do Xitolinos ativo em 127.0.0.1:$port." }
  else { 'MySQL do Xitolinos não está ativo; os dados persistentes continuam em data\mysql.' }
  exit 0
}

if (-not (Test-Path -LiteralPath $envPath)) {
  if ($Action -eq 'Stop') { 'O MySQL do projeto ainda não foi configurado; nenhum processo foi encerrado.'; exit 0 }
  New-Item -ItemType Directory -Force -Path $dataDir, (Split-Path -Parent $envPath) | Out-Null
  Set-PrivateAccess $dataDir $true
  $databasePassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $rootPassword = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $jwtSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $apiSalt = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $adminSecret = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $transferSalt = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $encryptionKey = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
  $appKeys = 1..4 | ForEach-Object { [guid]::NewGuid().ToString('N') }
  @(
    'HOST=127.0.0.1', 'PORT=1337', "APP_KEYS=$($appKeys -join ',')", "API_TOKEN_SALT=$apiSalt",
    "ADMIN_JWT_SECRET=$adminSecret", "TRANSFER_TOKEN_SALT=$transferSalt", "ENCRYPTION_KEY=$encryptionKey",
    "JWT_SECRET=$jwtSecret", 'DATABASE_CLIENT=mysql', 'DATABASE_HOST=127.0.0.1', "DATABASE_PORT=$port",
    'DATABASE_NAME=xitolinos_financas', 'DATABASE_USERNAME=xitolinos', "DATABASE_PASSWORD=$databasePassword", "MYSQL_ROOT_PASSWORD=$rootPassword",
    'DATABASE_SSL=false', 'DEMO_USER_PASSWORD=Xitolinos-Demo-2026!', 'BILLING_ENABLED=false',
    'STRIPE_SECRET_KEY=', 'STRIPE_WEBHOOK_SECRET=', 'STRIPE_PRICE_ID='
  ) | Set-Content -LiteralPath $envPath -Encoding utf8
  if (-not $DataRoot) { @("DATABASE_PASSWORD=$databasePassword", "MYSQL_ROOT_PASSWORD=$rootPassword") | Set-Content -LiteralPath (Join-Path $projectRoot '.env') -Encoding utf8 }
}
$environment = @{}
foreach ($line in Get-Content -LiteralPath $envPath) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') { $environment[$matches[1]] = $matches[2] }
}
$databasePassword = $environment['DATABASE_PASSWORD']
$rootPassword = $environment['MYSQL_ROOT_PASSWORD']
if ($databasePassword -notmatch '^[a-f0-9]{64}$' -or $rootPassword -notmatch '^[a-f0-9]{64}$') { throw 'As senhas MySQL em backend\.env estão incompletas. Preserve o arquivo e corrija apenas as chaves DATABASE_PASSWORD e MYSQL_ROOT_PASSWORD.' }
$permissionMarker = Join-Path $dataDir 'xitolinos-private-permissions'
if (-not (Test-Path -LiteralPath $permissionMarker)) {
  Set-Content -LiteralPath $permissionMarker -Value 'private' -Encoding ascii
  Set-PrivateAccess $permissionMarker
}
$secretFiles = @($envPath)
if (-not $DataRoot) { $secretFiles += Join-Path $projectRoot '.env' }
foreach ($secretFile in $secretFiles) {
  if (Test-Path -LiteralPath $secretFile) {
    Set-PrivateAccess $secretFile
  }
}
$clientOptionsPath = Join-Path $dataDir 'root-client.ini'
if (Test-Path -LiteralPath $clientOptionsPath) {
  Set-PrivateAccess $clientOptionsPath
}
@('[client]', 'user=root', "password=$rootPassword", 'protocol=memory', 'shared-memory-base-name=XITOLINOS') | Set-Content -LiteralPath $clientOptionsPath -Encoding ascii
Set-PrivateAccess $clientOptionsPath
$secureArgs = @("--defaults-extra-file=$clientOptionsPath", 'ping')
$initialArgs = @('--no-defaults', '--protocol=memory', '--shared-memory-base-name=XITOLINOS', '--user=root', 'ping')

if ($Action -eq 'Stop') {
  if (-not (Test-Path -LiteralPath $pidPath)) { 'A instância local não tem PID registrado; nenhum processo foi encerrado.'; exit 0 }
  $pidValue = [int](Get-Content -LiteralPath $pidPath -Raw)
  $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
  if (-not $processInfo) { Remove-Item -LiteralPath $pidPath -Force; 'A instância local já estava parada. Nenhum outro processo foi encerrado.'; exit 0 }
  if ($processInfo.ExecutablePath -ine $mysqld -or -not $processInfo.CommandLine.Contains($configPath)) { throw 'O PID salvo não corresponde ao MySQL isolado deste projeto; nada foi encerrado.' }
  $ErrorActionPreference = 'Continue'
  if (Test-Path -LiteralPath $readyPath) { & $mysqladmin "--defaults-extra-file=$clientOptionsPath" shutdown 2>$null }
  else { & $mysqladmin --no-defaults --protocol=memory --shared-memory-base-name=XITOLINOS --user=root shutdown 2>$null }
  $shutdownExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($shutdownExitCode -ne 0) {
    $unconfiguredProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $pidValue" -ErrorAction SilentlyContinue
    if (-not $unconfiguredProcess -or $unconfiguredProcess.ExecutablePath -ine $mysqld -or -not $unconfiguredProcess.CommandLine.Contains($configPath)) { throw 'O PID salvo não corresponde ao MySQL isolado deste projeto; nada foi encerrado.' }
    Stop-Process -Id $pidValue -Force
    Wait-Process -Id $pidValue -Timeout 10 -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    'A instância MySQL ainda não concluiu a configuração e foi encerrada após conferir o PID e o caminho exclusivos do projeto. Os dados foram preservados para recuperação.'
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  'MySQL do Xitolinos encerrado. Os dados persistentes foram mantidos.'
  exit 0
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
if (Test-Path -LiteralPath $pidPath) {
  $savedPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
  if ($savedProcess -and ($savedProcess.ExecutablePath -ine $mysqld -or -not $savedProcess.CommandLine.Contains($configPath))) { throw 'A porta local pertence a outra instância. O projeto não alterou nem encerrou esse processo.' }
  if (-not $savedProcess) { Remove-Item -LiteralPath $pidPath -Force }
}
if (-not (Test-Path -LiteralPath $pidPath) -and (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { throw "A porta $port já está em uso por outro processo. Escolha uma porta livre antes de iniciar o MySQL local." }

if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'mysql'))) {
  & $mysqld --no-defaults --initialize-insecure "--basedir=$baseDir" "--datadir=$dataDir" --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci
  if ($LASTEXITCODE -ne 0) { throw 'A inicialização do diretório MySQL falhou.' }
}
$configLines = @(
  '[mysqld]', "basedir=$($baseDir.Replace('\','/'))", "datadir=$($dataDir.Replace('\','/'))",
  "port=$port", 'bind-address=127.0.0.1', 'mysqlx=0', 'skip_name_resolve=ON',
  'shared-memory=ON', 'shared-memory-base-name=XITOLINOS',
  'character-set-server=utf8mb4', 'collation-server=utf8mb4_0900_ai_ci',
  "log-error=$($errorLog.Replace('\','/'))", "pid-file=$($pidPath.Replace('\','/'))"
)
$configLines | Set-Content -LiteralPath $configPath -Encoding ascii
Set-PrivateAccess $configPath

$server = $null
if (-not (Test-Path -LiteralPath $pidPath)) {
  $server = Start-Process -FilePath $mysqld -ArgumentList "`"--defaults-file=$configPath`"" -PassThru -WindowStyle Hidden
  Set-Content -LiteralPath $pidPath -Value $server.Id -Encoding ascii
  Set-PrivateAccess $pidPath
}
$deadline = (Get-Date).AddSeconds(60)
$rootAuthenticated = $false
$mysqlAuthArgs = @("--defaults-extra-file=$clientOptionsPath", '--batch', '--skip-column-names', '--execute=SELECT 1')
$mysqlInitialArgs = @('--no-defaults', '--protocol=memory', '--shared-memory-base-name=XITOLINOS', '--user=root', '--batch', '--skip-column-names', '--execute=SELECT 1')
$ErrorActionPreference = 'Continue'
do {
  Start-Sleep -Milliseconds 500
  $null = & $mysql @mysqlAuthArgs 2>$null
  if ($LASTEXITCODE -eq 0) { $rootAuthenticated = $true; break }
  $null = & $mysql @mysqlInitialArgs 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  if ($server -and $server.HasExited) { Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue; throw "MySQL encerrou na inicialização. $(Get-Content -LiteralPath $errorLog -Raw -ErrorAction SilentlyContinue)" }
} while ((Get-Date) -lt $deadline)
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) { throw "Tempo excedido ao iniciar MySQL. Consulte $errorLog" }

$rootMysqlArgs = if ($rootAuthenticated) { @("--defaults-extra-file=$clientOptionsPath") } else { @('--no-defaults', '--protocol=memory', '--shared-memory-base-name=XITOLINOS', '--user=root') }
$databaseSetupSql = "ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword'; CREATE DATABASE IF NOT EXISTS xitolinos_financas CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'xitolinos'@'127.0.0.1' IDENTIFIED BY '$databasePassword'; ALTER USER 'xitolinos'@'127.0.0.1' IDENTIFIED BY '$databasePassword'; GRANT ALL PRIVILEGES ON xitolinos_financas.* TO 'xitolinos'@'127.0.0.1'; FLUSH PRIVILEGES;"
$mysqlSetupSqlPath = Join-Path $dataDir 'setup.sql'
$mysqlSetupOutputPath = Join-Path $dataDir 'setup.out'
$mysqlSetupErrorPath = Join-Path $dataDir 'setup.err'
Set-Content -LiteralPath $mysqlSetupSqlPath -Value $databaseSetupSql -Encoding ascii
Set-PrivateAccess $mysqlSetupSqlPath
Remove-Item -LiteralPath $mysqlSetupOutputPath, $mysqlSetupErrorPath -Force -ErrorAction SilentlyContinue
$mysqlSetupArguments = if ($rootAuthenticated) { @("`"--defaults-extra-file=$clientOptionsPath`"", '--batch', '--skip-column-names') } else { @('--no-defaults', '--protocol=memory', '--shared-memory-base-name=XITOLINOS', '--user=root', '--batch', '--skip-column-names') }
$mysqlSetupProcess = Start-Process -FilePath $mysql -ArgumentList $mysqlSetupArguments -PassThru -Wait -WindowStyle Hidden -RedirectStandardInput $mysqlSetupSqlPath -RedirectStandardOutput $mysqlSetupOutputPath -RedirectStandardError $mysqlSetupErrorPath
$mysqlExitCode = $mysqlSetupProcess.ExitCode
$mysqlDiagnostic = [string](Get-Content -LiteralPath $mysqlSetupErrorPath -Raw -ErrorAction SilentlyContinue)
if ($mysqlDiagnostic) { $mysqlDiagnostic = $mysqlDiagnostic.Replace($rootPassword, '[redigido]').Replace($databasePassword, '[redigido]').Trim() }
Remove-Item -LiteralPath $mysqlSetupSqlPath, $mysqlSetupOutputPath, $mysqlSetupErrorPath -Force -ErrorAction SilentlyContinue
if ($mysqlExitCode -ne 0) {
  throw "Não foi possível preparar o banco isolado do Xitolinos. Código $mysqlExitCode. $mysqlDiagnostic"
}
Set-Content -LiteralPath $readyPath -Value 'initialized' -Encoding ascii
"MySQL 8.4 do Xitolinos está ativo em 127.0.0.1:$port. Os dados persistentes ficam em data\mysql."
