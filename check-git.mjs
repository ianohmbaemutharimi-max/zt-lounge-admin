import { execSync } from "child_process";
const cwd = "D:/zt lounge/zt-lounge-demo/zt-lounge-admin";
try {
  const out = execSync("git log --oneline --all -- .env.local", { cwd }).toString();
  console.log("GIT HISTORY .env.local:\n" + out);
} catch (e) {
  console.log("no git history for .env.local:", e.message);
}
try {
  const st = execSync("git status --short", { cwd }).toString();
  console.log("GIT STATUS:\n" + st);
} catch (e) {
  console.log("git status err:", e.message);
}
try {
  const ig = execSync("git check-ignore .env.local", { cwd }).toString();
  console.log(".env.local is gitignored?:", ig.trim());
} catch (e) {
  console.log(".env.local NOT gitignored (or error)");
}
