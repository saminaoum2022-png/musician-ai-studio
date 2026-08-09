#!/usr/bin/env node
/**
 * Browser bundle of @supabase/supabase-js for DM Realtime (Capacitor + web).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const entry = path.join(root, "node_modules/@supabase/supabase-js/dist/index.mjs");
const outRoot = path.join(root, "vendor/supabase/bundle.mjs");
const outWww = path.join(root, "www/vendor/supabase/bundle.mjs");

if (!fs.existsSync(entry)) {
  console.warn("bundle-supabase: @supabase/supabase-js missing — run npm install");
  process.exit(0);
}

fs.mkdirSync(path.dirname(outRoot), { recursive: true });
fs.mkdirSync(path.dirname(outWww), { recursive: true });

execSync(
  `npx esbuild "${entry}" --bundle --format=esm --platform=browser --outfile="${outRoot}"`,
  { cwd: root, stdio: "inherit" },
);
fs.copyFileSync(outRoot, outWww);
console.log(`bundle-supabase: ${outRoot} (+ www mirror)`);
