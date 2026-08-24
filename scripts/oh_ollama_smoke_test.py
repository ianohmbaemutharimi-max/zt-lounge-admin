"""Isolated $0 smoke test: OpenHands Agent Server -> local Ollama (phi3-lite).

Route (no Moonshot, no OpenHands Cloud credential):
  model    = "ollama/phi3-lite:latest"   (litellm ollama provider)
  api_base = "http://127.0.0.1:11434"     (Ollama native API)
  api_key  = "ollama"                     (dummy; Ollama ignores it)

NOTE: phi3-lite is not a thinking model. OpenHands SDK defaults to
requesting thinking, which Ollama rejects ("does not support thinking").
We explicitly disable thinking to avoid the litellm <-> Ollama 400 error.

Lifecycle: POST /api/conversations WITH initial_message auto-starts execution.
Do NOT call /run afterwards."""
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

MODEL = "phi3-lite:latest"
OLLAMA_BASE_URL = "http://127.0.0.1:11434"

session_key = None
with open(os.path.join(REPO, ".env.local")) as f:
    for line in f:
        line = line.strip()
        if line.startswith("OPENHANDS_SESSION_API_KEY="):
            session_key = line.split("=", 1)[1].strip()
assert session_key, "missing OPENHANDS_SESSION_API_KEY"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={"X-Session-API-Key": session_key, "Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(r, timeout=180)
        raw = resp.read().decode()
        return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:600]


# --- 1. Server health ---
s, h = req("GET", "/health")
print("[1] /health:", s, h.get("status") if isinstance(h, dict) else "")
if s != 200:
    sys.exit(2)

# --- 2. Create conversation with Ollama LLM (auto-starts) ---
task = ("Inspect the workspace root and report the top-level directories you can see. "
        "Do not modify any files. Return a concise report.")
status, conv = req("POST", "/api/conversations", {
    "workspace": {"working_dir": WORKSPACE, "kind": "LocalWorkspace"},
    "initial_message": {"role": "user", "content": [{"type": "text", "text": task}]},
    "agent": {"kind": "Agent", "llm": {
        "model": "ollama/" + MODEL, "api_base": OLLAMA_BASE_URL,
        "api_key": "ollama", "usage_id": "ollama-smoke-test",
        "thinking": False, "thinking_budget": 0,
        "drop_params": True}},
})
cid = conv.get("id") if isinstance(conv, dict) else None
print("[2] create conversation:", status, "id=", cid)
if not cid:
    print(json.dumps(conv)[:500])
    sys.exit(2)

# --- 3-4. Poll until finished/error ---
final = ""
st = "?"
for i in range(120):  # up to ~10 min (CPU inference is slow)
    time.sleep(5)
    s, info = req("GET", "/api/conversations/%s" % cid)
    st = info.get("execution_status", "?") if isinstance(info, dict) else "?"
    if i % 6 == 0:
        print("[3] poll %d: status=%s" % (i, st))
    if st in ("finished", "idle", "error"):
        break
print("[4] final status:", st)

s, resp = req("GET", "/api/conversations/%s/agent_final_response" % cid)
final = resp.get("response", "") if isinstance(resp, dict) else ""
print("")
print("=== AGENT RESPONSE (%d chars) ===" % len(final))
print(final[:3000])
print("=================================")

# --- 7. Cleanup ---
s, body = req("DELETE", "/api/conversations/%s" % cid)
print("[7] cleanup delete:", s)

ok = bool(final.strip()) and st in ("finished", "idle")
print("")
print("RESULT:", "PASS - actual agent response received ($0 local route)" if ok
      else "FAIL - no agent response (status=%s)" % st)
sys.exit(0 if ok else 4)
