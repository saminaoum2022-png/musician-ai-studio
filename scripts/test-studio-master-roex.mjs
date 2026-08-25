#!/usr/bin/env node
/**
 * Quick RoEx Pro Master smoke test (server-side only).
 * Usage: ROEX_API_KEY=... node scripts/test-studio-master-roex.mjs [trackUrl]
 *
 * Without trackUrl, only checks API key + upload URL generation.
 */
import { readFileSync } from "node:fs";

const key = String(process.env.ROEX_API_KEY || process.env.TONN_API_KEY || "").trim();
const trackUrl = String(process.argv[2] || "").trim();
const base = "https://tonn.roexaudio.com";

if (!key) {
  console.error("Set ROEX_API_KEY (or TONN_API_KEY) to run this test.");
  process.exit(1);
}

async function roexJson(path, body) {
  const url = `${base}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": key },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: r.status, ok: r.ok, data };
}

console.log("RoEx key present:", `${key.slice(0, 6)}…`);

const up = await roexJson("/upload", {
  filename: "smoke-test.wav",
  contentType: "audio/wav",
});
console.log("upload:", up.status, up.ok ? "ok" : up.data);

if (!trackUrl) {
  console.log("\nOptional: pass a readable RoEx track URL to run full preview smoke test.");
  process.exit(up.ok ? 0 : 1);
}

console.log("\nCreating preview for track:", trackUrl.slice(0, 80), "…");
const created = await roexJson("/masteringpreview", {
  masteringData: {
    trackData: [{ trackURL: trackUrl }],
    musicalStyle: "POP",
    desiredLoudness: "MEDIUM",
    sampleRate: "44100",
  },
});
console.log("masteringpreview:", created.status, created.data);
const taskId = String(created.data?.mastering_task_id || "").trim();
if (!taskId) process.exit(1);

for (let i = 0; i < 20; i++) {
  const meta = await roexJson("/retrievepreviewmaster", {
    masteringData: { masteringTaskId: taskId },
  });
  const preview = meta.data?.previewMasterTaskResults || {};
  const dlUrl = String(preview.download_url_mastered_preview || "").trim();
  console.log(`poll ${i + 1}:`, meta.status, dlUrl ? "url ready" : meta.data?.message || meta.data?.error || "pending");
  if (dlUrl) {
    const audioUrl = dlUrl.includes("key=") ? dlUrl : `${dlUrl}${dlUrl.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
    const r = await fetch(audioUrl);
    const buf = Buffer.from(await r.arrayBuffer());
    console.log("download:", r.status, "bytes:", buf.length, "type:", r.headers.get("content-type"));
    process.exit(r.ok && buf.length > 512 ? 0 : 1);
  }
  await new Promise((r) => setTimeout(r, 3000));
}
console.error("Timed out waiting for RoEx preview.");
process.exit(1);
