#!/usr/bin/env node
/**
 * Block shipping Nabad Producer to production by accident.
 * Producer code may live on main/staging — it must stay hidden until launch.
 *
 *   npm run verify:no-producer-ship
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const flagsPath = join(root, "src/feature-flags.js");

let text = "";
try {
  text = readFileSync(flagsPath, "utf8");
} catch (e) {
  console.error("verify-no-producer-ship: missing src/feature-flags.js");
  process.exit(2);
}

let failed = false;

if (/export\s+const\s+NABAD_PRODUCER_PUBLIC_SHIPPED\s*=\s*true/.test(text)) {
  console.error(
    "NABAD_PRODUCER_PUBLIC_SHIPPED is true — Producer would go live for users.",
  );
  console.error("Set it back to false in src/feature-flags.js before shipping to main.");
  failed = true;
}

if (/export\s+const\s+NABAD_VIBE_PUBLIC_SHIPPED\s*=\s*true/.test(text)) {
  console.error(
    "NABAD_VIBE_PUBLIC_SHIPPED is true — Vibe would go live for users.",
  );
  console.error("Set it back to false in src/feature-flags.js before shipping to main.");
  failed = true;
}

if (failed) process.exit(1);

console.log("verify-no-producer-ship: OK (Producer + Vibe stay hidden — code in tree is fine)");
