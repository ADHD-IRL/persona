param([Parameter(Mandatory=$true)][string]$RepositoryPath)
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path -LiteralPath $RepositoryPath).Path
if ((Split-Path -Leaf $repository) -ne 'AgentDebate-local') { throw 'Expected AgentDebate-local repository.' }
$runtime = Join-Path $env:LOCALAPPDATA 'AgentDebate-local'
$binaries = Join-Path $runtime 'postgres'
$archive = Join-Path $runtime 'postgresql-17.11.zip'
$data = Join-Path $runtime 'postgres-data'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $binaries 'pgsql/bin/pg_ctl.exe'))) {
  if (-not (Test-Path -LiteralPath $archive)) {
    Write-Output 'Downloading official PostgreSQL 17.11 Windows binaries (about 364 MiB).'
    Invoke-WebRequest -Uri 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616' -OutFile $archive -TimeoutSec 300
  }
  Write-Output 'Extracting PostgreSQL server binaries and resources.'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
  try {
    foreach ($entry in $zip.Entries) {
      if ($entry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or $entry.FullName.EndsWith('/')) { continue }
      $output = [System.IO.Path]::GetFullPath((Join-Path $binaries $entry.FullName))
      if (-not $output.StartsWith([System.IO.Path]::GetFullPath($binaries) + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Archive entry escaped the runtime directory.' }
      New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force | Out-Null
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $output, $true)
    }
  } finally { $zip.Dispose() }
}
$bin = Join-Path $binaries 'pgsql/bin'
& (Join-Path $bin 'pg_ctl.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL binaries could not run.' }
$configuration = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $repository '.env')) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $configuration[$Matches[1]] = $Matches[2] }
}
if (-not $configuration.POSTGRES_PASSWORD) { throw 'Local database password is missing from .env.' }
$passwordFile = Join-Path $runtime 'initdb-password.tmp'
if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
  Set-Content -LiteralPath $passwordFile -Value $configuration.POSTGRES_PASSWORD -Encoding utf8
  try {
    & (Join-Path $bin 'initdb.exe') -D $data -U agentdebate --auth-host=scram-sha-256 --auth-local=scram-sha-256 --encoding=UTF8 --locale=C "--pwfile=$passwordFile"
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
  } finally { Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue }
}
& (Join-Path $bin 'pg_ctl.exe') status -D $data
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $bin 'pg_ctl.exe') start -D $data -l (Join-Path $runtime 'postgres.log') -o '-h 127.0.0.1 -p 55432' -w
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed.' }
}
$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $configuration.POSTGRES_PASSWORD
  $exists = & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p 55432 -U agentdebate -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='agentdebate'"
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL authentication check failed.' }
  if ($exists -ne '1') {
    & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p 55432 -U agentdebate agentdebate
    if ($LASTEXITCODE -ne 0) { throw 'Application database creation failed.' }
  }
} finally { $env:PGPASSWORD = $previousPgPassword }
$health = $null
try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 3 } catch { }
if ($health.status -ne 'ok') {
  $node = (Get-Command node).Source
  $process = Start-Process -FilePath $node -ArgumentList '--use-system-ca','--env-file=.env','server/index.js' -WorkingDirectory $repository -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtime 'app.stdout.log') -RedirectStandardError (Join-Path $runtime 'app.stderr.log') -PassThru
  Set-Content -LiteralPath (Join-Path $runtime 'app.pid') -Value $process.Id
  Write-Output "Started Node process $($process.Id)."
}
for ($attempt=0; $attempt -lt 30; $attempt++) {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
    if ($health.status -eq 'ok') { Write-Output 'Application is running at http://localhost:3000 with PostgreSQL on loopback port 55432.'; exit 0 }
  } catch { }
  Start-Sleep -Seconds 1
}
throw "The app did not become healthy. Inspect logs in $runtime."
