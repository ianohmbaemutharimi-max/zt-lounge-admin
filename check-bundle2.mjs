import { execSync } from "child_process";
const cwd = "D:/zt lounge/zt-lounge-demo/zt-lounge-admin";
const p = cwd + "/ZT_PHASE_0B_SECURITY_BACKUP_90f4636.bundle";
const commit = execSync("git bundle list-heads " + JSON.stringify(p), { cwd }).toString().split("\n")[0].split(" ")[0];
console.log("commit:", commit);
const files = execSync("git ls-tree -r --name-only " + commit + " " + JSON.stringify(p.replace(".bundle", "")), { cwd }).toString();
// git ls-tree with bundle: need --repository? Actually use git --git-dir? Simpler: git archive or git show.
// Try git cat-file via bundle
const envFiles = files.split("\n").filter((f) => f.includes(".env"));
console.log("ALL .env* IN BUNDLE:", envFiles.join("\n") || "(none)");
// Also check for any file containing env.local
const allEnv = files.split("\n").filter((f) => /env/i.test(f));
console.log("ANY env-ish files:", allEnv.join("\n") || "(none)");
