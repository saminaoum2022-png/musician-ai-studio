#!/usr/bin/env node
/**
 * Mirror shipped web assets into www/ before Capacitor copies them to ios/App/App/public.
 * iOS loads www/, not repo-root index.html or src/ directly.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const copies = [
  ["index.html", "index.html"],
  ["styles.css", "styles.css"],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dest = path.join(root, "www", to);
  if (!fs.existsSync(src)) {
    console.error(`sync-www: missing ${from}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log(`sync-www: ${from} → www/${to}`);
}

execSync("rsync -a src/ www/src/", { cwd: root, stdio: "inherit" });
console.log("sync-www: src/ → www/src/");
