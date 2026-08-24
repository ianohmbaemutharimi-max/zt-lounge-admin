"""Discover kimi-related models from the live OpenHands /api/llm/models endpoint."""
import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

key = None
env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
with open(env_file) as f:
    for line in f:
        if line.strip().startswith("OPENHANDS_SESSION_API_KEY="):
            key = line.split("=", 1)[1].strip()

req = urllib.request.Request(
    "http://127.0.0.1:18000/api/llm/models",
    headers={"X-Session-API-Key": key},
)
data = json.load(urllib.request.urlopen(req, timeout=30))
models = data.get("models", [])
print("total models:", len(models))

kimi = [m for m in models if "kimi" in m.lower()]
print("kimi matches (%d):" % len(kimi))
for m in kimi:
    print(" ", m)

# also show openhands-proxy style models
proxy = [m for m in models if m.lower().startswith("litellm_proxy")]
print("litellm_proxy models (%d):" % len(proxy))
for m in proxy[:20]:
    print(" ", m)