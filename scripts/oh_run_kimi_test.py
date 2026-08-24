"""End-to-end Kimi K3 read-only test against local OpenHands Agent Server.

Lifecycle (verified from OpenHands 1.42.1 API behavior):
  POST /api/conversations WITH initial_message AUTO-STARTS execution.
  Do NOT call /run afterwards (it returns 409 Conflict).

LLM auth routes:
  - OpenHands Cloud key -> base_url https://llm-proxy.app.all-hands.dev
  - Direct Moonshot key -> MOONSHOT_API_KEY env var, no base_url

Reads credentials from gitignored .env.local. Never prints secret values."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://127.0.0.1:18000"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE = REPO
MODEL = "moonshot/kimi-k3"          # verified live in /api/llm/models
OH_PROXY_BASE_URL = "https://llm-proxy.app.all-hands.dev"

session_key = None
oh_api_key = os.environ.get("OPENHANDS_API_KEY")
moonshot_key = os.environ.get("MOONSHOT_API_KEY")
with open(os.path.join(REPO, ".env.local")) as f:
    for line in f:
        line = line.strip()
        if line.startswith("OPENHANDS_SESSION_API_KEY="):
            session_key = line.split("=", 1)[1].strip()
        elif line.startswith("OPENHANDS_API_KEY="):
            oh_api_key = line.split("=", 1)[1].strip()
        elif line.startswith("MOONSHOT_API_KEY="):
            v = line.split("=", 1)[1].strip()
            if v:  # ignore empty placeholder
                moonshot_key = v

assert session_key, "missing OPENHANDS_SESSION_API_KEY"
print("OPENHANDS_SESSION_API_KEY: PRESENT")
print("OPENHANDS_API_KEY:", "PRESENT" if oh_api_key else "ABSENT (not required for Moonshot-direct route)")
print("MOONSHOT_API_KEY:", "PRESENT" if moonshot_key else "EMPTY/NOT SET - fill it in .env.local to enable execution")


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"X-Session-API-Key": session_key, "Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(r, timeout=120)
        raw = resp.read().decode()
        return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]


# --- Discover model live ---
s, models = req("GET", "/api/llm/models")
found = MODEL in models.get("models", [])
print("model %s in live /api/llm/models: %s" % (MODEL, found))
if not found:
    print("CREDENTIAL_OR_MODEL_PROBLEM: model not found in live list")
    sys.exit(2)

# --- Build LLM config for the intended route ---
if oh_api_key:
    # OpenHands Cloud route: OH key is valid only through the OH LLM proxy.
    llm_cfg = {"model": MODEL, "api_key": oh_api_key,
               "base_url": OH_PROXY_BASE_URL, "usage_id": "kimi-k3-test"}
    print("route: OpenHands Cloud LLM proxy")
elif moonshot_key:
    llm_cfg = {"model": MODEL, "usage_id": "kimi-k3-test"}
    print("route: direct Moonshot (via MOONSHOT_API_KEY env)")
else:
    print("")
    print("CREDENTIAL_REQUIRED: OPENHANDS_API_KEY (OpenHands Cloud LLM proxy)")
    print("Add to .env.local:  OPENHANDS_API_KEY=<your OpenHands Cloud API key>")
    print("Or set MOONSHOT_API_KEY for direct Moonshot access.")
    sys.exit(3)

# --- Create READ-ONLY conversation (auto-starts; do NOT call /run) ---
task = ("Inspect this repository only. Do not modify any files.\n\n"
        "Analyze the ZT Lounge project architecture, major modules, current "
        "implementation status, database integration, authentication/security "
        "architecture, booking flow, menu flow, media architecture, and critical "
        "production blockers.\n\n"
        "Return a concise technical audit.\n\n"
        "Do not edit, create, delete, rename, install, migrate, commit, or modify anything.")
status, conv = req("POST", "/api/conversations", {
    "workspace": {"working_dir": WORKSPACE, "kind": "LocalWorkspace"},
    "initial_message": {"role": "user", "content": [{"type": "text", "text": task}]},
    "agent": {"kind": "Agent", "llm": llm_cfg},
})
cid = conv.get("id") if isinstance(conv, dict) else None
print("create conversation:", status, "id=", cid)
if not cid:
    print(json.dumps(conv)[:500])
    sys.exit(2)

# --- Poll (auto-started run) ---
final = ""
for i in range(96):  # up to ~8 min
    time.sleep(5)
    s, info = req("GET", "/api/conversations/%s" % cid)
    st = info.get("execution_status", "?") if isinstance(info, dict) else "?"
    if i % 6 == 0:
        print("poll %d: status=%s" % (i, st))
    if st in ("finished", "idle", "error"):
        break

print("final conversation status:", st)

s, resp = req("GET", "/api/conversations/%s/agent_final_response" % cid)
final = resp.get("response", "") if isinstance(resp, dict) else ""
print("")
print("=== AGENT RESPONSE (%d chars) ===" % len(final))
print(final[:3000])
print("=================================")

# --- Cleanup ---
s, body = req("DELETE", "/api/conversations/%s" % cid)
print("cleanup delete:", s)

sys.exit(0 if final.strip() else 4)