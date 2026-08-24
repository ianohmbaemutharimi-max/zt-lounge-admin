"""Inspect openhands-agent-server 1.42.1 dependency metadata for libtmux."""
import glob
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

base = r"C:\Users\Fluxtech\AppData\Local\uv\cache\archive-v0\rYUwLAJjCAjP0Qos"
print("dirs:", os.listdir(base))

md_files = glob.glob(os.path.join(base, "**", "METADATA"), recursive=True)
print("metadata files:", md_files)

for p in md_files:
    content = open(p, encoding="utf-8", errors="ignore").read()
    deps = [l for l in content.splitlines() if l.startswith("Requires-Dist")]
    print("")
    print("=== " + p)
    print("total Requires-Dist: %d" % len(deps))
    for d in deps:
        low = d.lower()
        if "tmux" in low or "platform" in low or "sys_platform" in low:
            print("MATCH:", d)

# Where is libtmux imported?
pkg = os.path.join(base, "openhands")
for r, ds, fs in os.walk(pkg):
    for f in fs:
        if f.endswith(".py"):
            p = os.path.join(r, f)
            try:
                content = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for i, line in enumerate(content.splitlines()):
                if "libtmux" in line:
                    rel = os.path.relpath(p, base)
                    print("IMPORT %s:%d: %s" % (rel, i + 1, line.strip()[:140]))