"""Check which variable NAMES exist in .env.local (values never printed)."""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
names = []
for line in open(path, encoding="utf-8-sig"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        names.append(line.split("=", 1)[0].strip())
print("variables present:", names)
print("OPENHANDS_SESSION_API_KEY present:", "OPENHANDS_SESSION_API_KEY" in names)
print("OPENHANDS_API_KEY present:", "OPENHANDS_API_KEY" in names)
ms = "MOONSHOT_API_KEY" in names
ms_set = ms and any(l.startswith("MOONSHOT_API_KEY=") and l.split("=",1)[1].strip() for l in open(path, encoding="utf-8-sig"))
print("MOONSHOT_API_KEY present:", ms)
print("MOONSHOT_API_KEY value filled:", bool(ms_set))
