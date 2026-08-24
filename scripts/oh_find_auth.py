"""Read-only search of uv cache for OpenHands session API key configuration."""
import os
import re

CACHE = r"C:\Users\Fluxtech\AppData\Local\uv\cache\archive-v0"
PATTERNS = [
    re.compile(r"session_api_key", re.IGNORECASE),
    re.compile(r"OH_SESSION", re.IGNORECASE),
    re.compile(r"SESSION_API_KEY", re.IGNORECASE),
    re.compile(r"X-Session-API-Key", re.IGNORECASE),
]

targets = []
for d in os.listdir(CACHE):
    pkg = os.path.join(CACHE, d)
    if not os.path.isdir(pkg):
        continue
    for sub in os.listdir(pkg):
        if "openhands" in sub.lower():
            targets.append(os.path.join(pkg, sub))

print("Package roots found:")
for t in targets:
    print("  ", t)

print("\nMatches:")
for root in targets:
    for r, ds, fs in os.walk(root):
        # skip heavy dirs
        ds[:] = [x for x in ds if x not in ("__pycache__", ".git", "node_modules")]
        for f in fs:
            if not f.endswith(".py"):
                continue
            p = os.path.join(r, f)
            try:
                content = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for i, line in enumerate(content.splitlines()):
                for pat in PATTERNS:
                    if pat.search(line):
                        rel = os.path.relpath(p, root)
                        print(f"{rel}:{i+1}: {line.strip()[:160]}")
                        break