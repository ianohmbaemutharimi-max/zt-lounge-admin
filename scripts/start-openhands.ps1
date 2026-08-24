# Starts the OpenHands Agent Server on 127.0.0.1:18000 using a local session key.
# The session key is read from .env.local (gitignored). Never printed or logged.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot ".env.local"
$uvx      = Join-Path $env:USERPROFILE ".local\bin\uvx.exe"

if (-not (Test-Path $uvx)) {
    Write-Error "uvx not found at $uvx"
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Error ".env.local not found. Run scripts/test-openhands-api.ps1 to bootstrap, or add OPENHANDS_SESSION_API_KEY to .env.local"
    exit 1
}

# Load keys from .env.local into process env (values never echoed).
# - SESSION_API_KEY / OH_SESSION_API_KEYS_0 : Agent Server HTTP auth
# - MOONSHOT_API_KEY                        : LLM provider (Moonshot-direct route)
# - OPENHANDS_API_KEY                       : optional, OH Cloud proxy route only
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*OPENHANDS_SESSION_API_KEY\s*=\s*(.+)\s*$') {
        $env:SESSION_API_KEY        = $Matches[1].Trim()
        $env:OH_SESSION_API_KEYS_0  = $Matches[1].Trim()
    }
    elseif ($_ -match '^\s*MOONSHOT_API_KEY\s*=(.+)\s*$') {
        $v = $Matches[1].Trim()
        if ($v) { $env:MOONSHOT_API_KEY = $v }
    }
    elseif ($_ -match '^\s*OPENHANDS_API_KEY\s*=\s*(.+)\s*$') {
        $v = $Matches[1].Trim()
        if ($v) { $env:OPENHANDS_API_KEY = $v }
    }
}

if (-not $env:SESSION_API_KEY) {
    Write-Error "OPENHANDS_SESSION_API_KEY missing in .env.local"
    exit 1
}
if (-not $env:MOONSHOT_API_KEY -and -not $env:OPENHANDS_API_KEY) {
    Write-Warning "No LLM credential set (MOONSHOT_API_KEY or OPENHANDS_API_KEY in .env.local) - Kimi conversations will fail until one is added"
} else {
    Write-Host "[openhands] LLM credential loaded (value hidden)"
}

Write-Host "[openhands] Starting Agent Server v1.42.1 on http://127.0.0.1:18000"
Write-Host "[openhands] Session key loaded from .env.local (value hidden)"

# NOTE: openhands-agent-server==1.42.1 has packaging defects - api.py imports
# libtmux unconditionally but does not declare it, and a fresh resolve pulls
# openhands-sdk 1.43.1 whose layout breaks agent-server 1.42.1 imports
# (No module named 'openhands.tools'). Pinning the exact known-good set:
# agent-server 1.42.1 + sdk 1.42.1 + tools 1.42.1 (+ libtmux).
& $uvx `
    --from openhands-agent-server==1.42.1 `
    --with openhands-sdk==1.42.1 `
    --with openhands-tools==1.42.1 `
    --with libtmux `
    agent-server --host 127.0.0.1 --port 18000
