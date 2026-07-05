#!/usr/bin/env node
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = join(root, "assets/marketing/coach-orb-floating.svg");
const pngPath = join(root, "assets/marketing/coach-orb-floating.png");
const png2xPath = join(root, "assets/marketing/coach-orb-floating@2x.png");

const svg = readFileSync(svgPath);

await sharp(svg).png().toFile(pngPath);
await sharp(svg).resize(2048, 2048).png().toFile(png2xPath);

console.log(`export-coach-orb: ${pngPath}`);
console.log(`export-coach-orb: ${png2xPath}`);
