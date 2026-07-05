#!/usr/bin/env node
/** Ensures prompt.js loads the same way cover-art.js does on Vercel. */
import path from "path";
import { pathToFileURL } from "url";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(pathToFileURL(path.join(root, "src/cover-art/prompt.js")).href);
if (!mod.buildAbstractCoverPrompt || !mod.buildPollinationsUrl) {
  console.error("✗ prompt.js missing exports");
  process.exit(1);
}
console.log("✓ prompt.js loads for server cover-art");
