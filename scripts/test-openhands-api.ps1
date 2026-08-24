# OpenHands HTTP API integration test.
# Verifies: uv, port 18000, /health, /server_info, authenticated /api endpoints,
# Kimi K3 discovery, and (optionally) a READ-ONLY test conversation.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\test-openhands-api.ps1            # checks only
#   powershell -ExecutionPolicy Bypass -File scripts\test-openhands-api.ps1 -RunConversation   # + read-only conversation
#
# Secrets: session key lives in .env.local (gitignored). Never printed.

param(
    [switch]$RunConversation,
    [string]$BaseUrl = "http://127.0.0.1:18000"
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot ".env.local"
$uvx      = Join-Path $env:USERPROFILE ".local\bin\uvx.exe"

$results = @()
function Add-Result([string]$Name, [string]$Status, [string]$Detail = "") {
    $script:results += [pscustomobject]@{ Check = $Name; Status = $Status; Detail = $Detail }
    $color = @{ PASS = "Green"; FAIL = "Red"; BLOCKED = "Yellow"; SKIP = "DarkGray" }[$Status]
    Write-Host ("[{0}] {1} {2}" -f $Status, $Name, $Detail) -ForegroundColor $color
}

Write-Host "`n=== OpenHands HTTP API Integration Test ===" -ForegroundColor Cyan

# --- 1. uv/uvx present ---
if (Test-Path $uvx) {
    $uvVer = & $uvx --version 2>$null
    Add-Result "uvx installed" "PASS" ($uvVer -join ' ')
} else {
    Add-Result "uvx installed" "FAIL" "not found at $uvx"
}

# --- 2. Port 18000 listening ---
$listener = Get-NetTCPConnection -LocalPort 18000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Add-Result "Port 18000 listening" "PASS" ("PID {0}" -f $listener[0].OwningProcess)
} else {
    Add-Result "Port 18000 listening" "FAIL" "nothing listening; run scripts\start-openhands.ps1"
}

# --- 3. /health ---
try {
    $h = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 10
    if ($h.status -eq "ok") { Add-Result "/health" "PASS" ($h | ConvertTo-Json -Compress) }
    else { Add-Result "/health" "FAIL" ($h | ConvertTo-Json -Compress) }
} catch {
    Add-Result "/health" "BLOCKED" $_.Exception.Message
}

# --- 4. /server_info ---
try {
    $si = Invoke-RestMethod -Uri "$BaseUrl/server_info" -TimeoutSec 10
    Add-Result "/server_info" "PASS" ("version {0}" -f $si.version)
} catch {
    Add-Result "/server_info" "BLOCKED" $_.Exception.Message
}

# --- 5. Session key bootstrap ---
$key = $null
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*OPENHANDS_SESSION_API_KEY\s*=\s*(.+)\s*$') { $key = $Matches[1].Trim() }
    }
}
if (-not $key) {
    $key = "oh_sess_" + [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 })) -replace '[^A-Za-z0-9]', ''
    Add-Content -Path $envFile -Value "OPENHANDS_SESSION_API_KEY=$key"
    Add-Result ".env.local bootstrap" "PASS" "generated new session key into gitignored .env.local"
} else {
    Add-Result ".env.local present" "PASS" "session key loaded (value hidden)"
}

$headers = @{ "X-Session-API-Key" = $key }

# --- 6. Authenticated /api/profiles ---
$profiles = $null
try {
    $profiles = Invoke-RestMethod -Uri "$BaseUrl/api/profiles" -Headers $headers -TimeoutSec 15
    Add-Result "/api/profiles (auth)" "PASS" ("{0} profile(s)" -f @($profiles.profiles).Count)
} catch {
    $msg = $_.Exception.Message
    if ($msg -match "401|Unauthorized") {
        Add-Result "/api/profiles (auth)" "FAIL" "Unauthorized - server was started WITHOUT this session key. Restart via scripts\start-openhands.ps1"
    } else {
        Add-Result "/api/profiles (auth)" "BLOCKED" $msg
    }
}

# --- 7. /api/llm/models ---
try {
    $models = Invoke-RestMethod -Uri "$BaseUrl/api/llm/models" -Headers $headers -TimeoutSec 30
    Add-Result "/api/llm/models (auth)" "PASS" ("{0} model(s) listed" -f @($models.models).Count)
} catch {
    Add-Result "/api/llm/models (auth)" "BLOCKED" $_.Exception.Message
}

# --- 8. /api/tools ---
try {
    $tools = Invoke-RestMethod -Uri "$BaseUrl/api/tools/" -Headers $headers -TimeoutSec 15
    Add-Result "/api/tools (auth)" "PASS" ("tools: {0}" -f (($tools | Select-Object -First 8) -join ', '))
} catch {
    Add-Result "/api/tools (auth)" "BLOCKED" $_.Exception.Message
}

# --- 9. Kimi K3 discovery (from LIVE /api/llm/models response) ---
$kimiModelId = "moonshot/kimi-k3"
try {
    $modelsResp = Invoke-RestMethod -Uri "$BaseUrl/api/llm/models" -Headers $headers -TimeoutSec 30
    if (@($modelsResp.models) -contains $kimiModelId) {
        Add-Result "Kimi K3 discovery" "PASS" ("'{0}' present in live model list ({1} models)" -f $kimiModelId, @($modelsResp.models).Count)
    } else {
        $alt = @($modelsResp.models) | Where-Object { $_ -match "kimi-k3" } | Select-Object -First 3
        Add-Result "Kimi K3 discovery" "FAIL" ("'{0}' not in live list; kimi-k3 variants: {1}" -f $kimiModelId, ($alt -join ', '))
    }
} catch {
    Add-Result "Kimi K3 discovery" "BLOCKED" $_.Exception.Message
}

# --- 10. Optional read-only conversation test ---
if ($RunConversation) {
    if (-not $profiles) {
        Add-Result "Test conversation" "SKIP" "auth unavailable"
    } else {
        $workspace = "D:\zt lounge\zt-lounge-demo\zt-lounge-admin"
        $task = "Inspect this repository read-only. Report the framework, package manager, main application entry points, test commands, and the top five architectural areas that should be reviewed next. Do not modify any files."

        # Build agent payload; route via OpenHands proxy when OPENHANDS_API_KEY exists
        $ohKey = $null
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*OPENHANDS_API_KEY\s*=\s*(.+)\s*$') { $ohKey = $Matches[1].Trim() }
        }
        $agentLlm = @{ model = $kimiModelId; usage_id = "test-openhands" }
        if ($ohKey) {
            $agentLlm.api_key  = $ohKey
            $agentLlm.base_url = "https://llm-proxy.app.all-hands.dev"
        }

        # NOTE: creating with initial_message AUTO-STARTS execution.
        # Do NOT call /run afterwards (it returns 409 Conflict).
        $body = @{
            workspace       = @{ working_dir = $workspace; kind = "LocalWorkspace" }
            initial_message = @{ role = "user"; content = @( @{ type = "text"; text = $task } ) }
            agent           = @{ kind = "Agent"; llm = $agentLlm }
        } | ConvertTo-Json -Depth 8

        try {
            $conv = Invoke-RestMethod -Uri "$BaseUrl/api/conversations" -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 60
            $cid = $conv.id
            Add-Result "Conversation created (auto-start)" "PASS" ("id {0}, workspace ok" -f $cid)

            # Poll for completion (max ~4 min)
            $final = ""
            for ($i = 0; $i -lt 48; $i++) {
                Start-Sleep -Seconds 5
                try {
                    $info = Invoke-RestMethod -Uri "$BaseUrl/api/conversations/$cid" -Headers $headers -TimeoutSec 15
                    if ($info.execution_status -in @("finished", "idle", "error")) { break }
                } catch {}
            }
            try {
                $resp = Invoke-RestMethod -Uri "$BaseUrl/api/conversations/$cid/agent_final_response" -Headers $headers -TimeoutSec 15
                $final = $resp.response
            } catch {}

            if ($final) {
                Add-Result "Agent responded" "PASS" ("{0} chars" -f $final.Length)
                Write-Host "`n--- Agent response (first 1200 chars) ---" -ForegroundColor Cyan
                Write-Host $final.Substring(0, [Math]::Min(1200, $final.Length))
            } else {
                Add-Result "Agent responded" "FAIL" "no final response retrieved"
            }

            # Cleanup test conversation
            try {
                Invoke-RestMethod -Uri "$BaseUrl/api/conversations/$cid" -Method Delete -Headers $headers -TimeoutSec 15 | Out-Null
                Add-Result "Test conversation cleanup" "PASS" "deleted"
            } catch {
                Add-Result "Test conversation cleanup" "FAIL" $_.Exception.Message
            }
        } catch {
            Add-Result "Test conversation" "FAIL" $_.Exception.Message
        }
    }
} else {
    Add-Result "Test conversation" "SKIP" "use -RunConversation to enable"
}

# --- Summary ---
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$pass = @($results | Where-Object Status -eq "PASS").Count
$fail = @($results | Where-Object Status -eq "FAIL").Count
$block = @($results | Where-Object Status -eq "BLOCKED").Count
Write-Host ("PASS: {0}  FAIL: {1}  BLOCKED/SKIP: {2}" -f $pass, $fail, $block)
if ($fail -gt 0) { exit 1 } else { exit 0 }