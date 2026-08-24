import fs from "fs";
const root = "D:/zt lounge/zt-lounge-demo/zt-lounge-admin";
const skip = new Set(["node_modules", ".git", ".next", "test-results", "package-lock.json"]);
function walk(d, acc) {
  let e;
  try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const f of e) {
    if (skip.has(f.name)) continue;
    const fp = d + "/" + f.name;
    if (f.isDirectory()) walk(fp, acc);
    else acc.push(fp);
  }
}
const all = [];
walk(root, all);
let hits = 0;
for (const fp of all) {
  if (!/\.(mjs|js|ts|json|env|local|toml|sql|md|txt|py|ps1|cjs)$/.test(fp)) continue;
  let c;
  try { c = fs.readFileSync(fp, "utf-8"); } catch { continue; }
  if (/6543|pooler\.supabase|SUPABASE_DB_PASSWORD\s*=/.test(c)) {
    console.log("MATCH:", fp);
    const m = c.match(/SUPABASE_DB_PASSWORD\s*=\s*['"]?([^\s'"#]+)/);
    if (m) console.log("   pw assignment:", m[1]);
    const m2 = c.match(/postgres\.[a-z0-9]+:([^\s@]+)@/);
    if (m2) console.log("   embedded pw:", m2[1]);
    hits++;
  }
}
console.log("total matches:", hits);
