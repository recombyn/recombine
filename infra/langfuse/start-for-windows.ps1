# Bring Langfuse up for Windows browsers (WSL Docker).
# CRITICAL: keep a Windows-side `wsl ... sleep infinity` process running.
# Without it, WSL runs `systemctl poweroff` on the distro ~every minute,
# which kills Postgres and causes: Can't reach database server at postgres:5432
$ErrorActionPreference = "Stop"
$Distro = "Ubuntu-24.04"

function Ensure-WslKeepalive {
  $alive = Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'sleep infinity' }
  if ($alive) {
    Write-Host "WSL keepalive already running (pid $($alive[0].ProcessId))"
    return
  }
  # Minimized console holds the distro open (do not close that window).
  Start-Process -FilePath "wsl.exe" -ArgumentList @(
    "-d", $Distro, "-u", "root", "--", "sleep", "infinity"
  ) -WindowStyle Minimized
  Write-Host "WSL keepalive started (minimized wsl sleep infinity — leave it open)"
  Start-Sleep -Seconds 2
}

Ensure-WslKeepalive

Write-Host "Starting Langfuse in WSL ($Distro)..."
wsl -d $Distro -u root -- bash /mnt/e/Tianmeng/resume-creation-web/infra/langfuse/ensure-up-wsl.sh
if ($LASTEXITCODE -ne 0) { throw "ensure-up-wsl.sh failed" }

Ensure-WslKeepalive

$deadline = (Get-Date).AddSeconds(45)
$ok = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:3100/api/public/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (-not $ok) { throw "http://127.0.0.1:3100 health failed" }

Write-Host "OK http://127.0.0.1:3100/"
Write-Host "Login: admin@recombyn.local / (LANGFUSE_INIT_USER_PASSWORD in .env)"
Write-Host "Keep the minimized 'wsl sleep infinity' window open while using Langfuse."
Start-Process "http://127.0.0.1:3100/"
