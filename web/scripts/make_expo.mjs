// After `vite build --outDir expo-build/site`: keep only the current data build, add the local
// server and start scripts, and write VERSION.txt. Result: web/expo-build/ (copy it to a USB stick).
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const OUT = "expo-build";
const site = join(OUT, "site");
const { build } = JSON.parse(readFileSync(join(site, "data", "current.json"), "utf8"));
for (const d of readdirSync(join(site, "data"))) {
  const p = join(site, "data", d);
  if (statSync(p).isDirectory() && d !== build) rmSync(p, { recursive: true });
}
for (const f of readdirSync("scripts/expo")) cpSync(join("scripts/expo", f), join(OUT, f));
for (const f of ["start-expo.command", "start-expo.sh"]) chmodSync(join(OUT, f), 0o755);
let sha = "unknown";
try {
  sha = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}
const size = (p) => (statSync(p).isDirectory() ? readdirSync(p).reduce((a, f) => a + size(join(p, f)), 0) : statSync(p).size);
writeFileSync(join(OUT, "VERSION.txt"), `STRATUM expo build\ncode ${sha}\ndata ${build}\nbuilt ${new Date().toISOString()}\n`);
console.log(`expo build ready: ${OUT}/ (data ${build}, ${(size(OUT) / 1e6).toFixed(1)} MB)`);
