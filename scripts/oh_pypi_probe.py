"""Probe PyPI + GitHub for the OFFICIAL OpenHands ACP implementation.
Prints only package metadata (names, versions, entry points, summaries).
No credentials."""
import json
import urllib.request

PROXIES = {}  # rely on system proxy / direct


def fetch(url, raw=False):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "oh-probe/1.0"})
        r = urllib.request.urlopen(req, timeout=25)
        return r.read().decode("utf-8", "replace") if raw else json.load(r)
    except Exception as e:
        return f"ERR: {type(e).__name__}: {e}"


# --- PyPI candidates ---
candidates = [
    "openhands-acp",
    "acp-openhands",
    "openhands",
    "openhands-ai",
    "openhands-agent-server",
    "openhands-cli",
    "openhands-acp-client",
    "ztg-openhands-acp",
    "openhands-acp-adapter",
]
print("=== PyPI probe ===")
for name in candidates:
    d = fetch(f"https://pypi.org/pypi/{name}/json")
    if isinstance(d, str):
        print(f"{name}: {d}")
        continue
    info = d["info"]
    eps = info.get("entry_points") or {}
    # pick console_scripts
    consoles = {}
    for group, items in (eps.items() if isinstance(eps, dict) else []):
        if "console" in group or "gui" in group:
            consoles[group] = [ (i.get("name"), i.get("value")) for i in items ]
    print(f"{name}: v{info['version']}")
    print(f"   summary: {info.get('summary')}")
    print(f"   requires_dist: {info.get('requires_dist')}")
    if consoles:
        print(f"   entry_points: {consoles}")
    else:
        print(f"   entry_points(raw): {eps}")

# --- GitHub search: OpenHands repos mentioning ACP ---
print("\n=== GitHub search: openhands acp (repos) ===")
g = fetch("https://api.github.com/search/repositories?q=openhands+acp&per_page=10", raw=True)
if isinstance(g, str):
    print(g)
else:
    for it in g.get("items", []):
        print(f"- {it['full_name']}  stars={it['stargazers_count']}  {it['html_url']}")
        print(f"   {it.get('description')}")

print("\n=== GitHub search: openhands acp (code) ===")
g2 = fetch("https://api.github.com/search/code?q=openhands+acp+extension.json&per_page=5", raw=True)
if isinstance(g2, str):
    print(g2)
else:
    for it in g2.get("items", []):
        print(f"- {it['repository']['full_name']} : {it['path']}")
        print(f"   {it['html_url']}")
