import { execSync } from "child_process";
const cwd = "D:/zt lounge/zt-lounge-demo/zt-lounge-admin";
const bundles = [
  "ZT_PHASE_0B_SECURITY_BACKUP_90f4636.bundle",
  "ZT_LOUNGE_PRE_FILTER_REPO_BACKUP_66928455.bundle",
];
for (const b of bundles) {
  const p = cwd + "/" + b;
  try {
    const heads = execSync("git bundle list-heads " + JSON.stringify(p), { cwd }).toString();
    console.log("=== " + b + " ===");
    console.log(heads.slice(0, 400));
    // try to list files in the bundle tree for .env.local
    const files = execSync("git ls-tree -r --name-only $(git bundle list-heads " + JSON.stringify(p) + " | head -1 | cut -d' ' -f1)", { cwd }).toString();
    const envline = files.split("\n").filter((f) => f.includes(".env"));
    console.log("ENV FILES IN BUNDLE:", envline.join(", ") || "(none)");
  } catch (e) {
    console.log("ERR for " + b + ":", e.message);
  }
}
