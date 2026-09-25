#!/usr/bin/env node
/**
 * Voice-message upload parsing + send guard.
 *
 *   node scripts/test-dm-voice-upload.mjs
 *
 * Regression: web-recorded audio arrives as "data:audio/mp4; codecs=mp4a.40.2;base64,…" (Safari) or
 * "data:audio/webm;codecs=opus;base64,…" (Chrome). The old strict regex missed those and the upload
 * was rejected as "Recording too short" after decoding ~14 bytes.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseBase64DataUrl, voiceDropBodyProblem } = require("../api/_lib/dm-voice.js");

const audio = Buffer.from(Array.from({ length: 12000 }, (_, i) => (i * 31 + 7) & 0xff));
const b64 = audio.toString("base64");
const decode = (raw, fallback = "audio/webm") => {
  const p = parseBase64DataUrl(raw, fallback);
  return { type: p.contentType, buf: Buffer.from(p.base64, "base64") };
};

let n = 0;
const ok = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ok  ${name}`);
};

console.log("parseBase64DataUrl");
ok("clean data URL", () => {
  const r = decode(`data:audio/mp4;base64,${b64}`);
  assert.equal(r.type, "audio/mp4");
  assert.ok(r.buf.equals(audio));
});
ok("Safari: 'audio/mp4; codecs=mp4a.40.2' (space + codecs)", () => {
  const r = decode(`data:audio/mp4; codecs=mp4a.40.2;base64,${b64}`);
  assert.equal(r.type, "audio/mp4");
  assert.ok(r.buf.equals(audio), "bytes must round-trip exactly");
});
ok("Safari as WebKit really emits it (no space)", () => {
  const r = decode(`data:audio/mp4;codecs=mp4a.40.2;base64,${b64}`);
  assert.equal(r.type, "audio/mp4");
  assert.ok(r.buf.equals(audio));
});
ok("Chrome: audio/webm;codecs=opus", () => {
  const r = decode(`data:audio/webm;codecs=opus;base64,${b64}`);
  assert.equal(r.type, "audio/webm");
  assert.ok(r.buf.equals(audio));
});
ok("upper-case scheme / BASE64 keyword", () => {
  const r = decode(`DATA:Audio/MP4;CODECS=x;BASE64,${b64}`);
  assert.equal(r.type, "audio/mp4");
  assert.ok(r.buf.equals(audio));
});
ok("line breaks / spaces inside the base64 are ignored", () => {
  const wrapped = b64.replace(/(.{76})/g, "$1\r\n");
  const r = decode(`data:audio/mp4;base64,${wrapped}`);
  assert.ok(r.buf.equals(audio));
});
ok("bare base64 uses the fallback type", () => {
  const r = decode(b64, "audio/mp4");
  assert.equal(r.type, "audio/mp4");
  assert.ok(r.buf.equals(audio));
});
ok("a data: URL that is not base64 yields nothing (no garbage decode)", () => {
  const p = parseBase64DataUrl("data:audio/mp4,%00%01%02", "audio/mp4");
  assert.equal(p.base64, "");
});
ok("empty input", () => {
  assert.equal(parseBase64DataUrl("", "audio/mp4").base64, "");
});
ok("the OLD regex really failed on the Safari format (documents the bug)", () => {
  const raw = `data:audio/mp4; codecs=mp4a.40.2;base64,${b64}`;
  const old = raw.match(/^data:([^;]+);base64,(.+)$/i);
  assert.equal(old, null);
  assert.ok(Buffer.from(raw, "base64").length < 800, "old code decoded only a few bytes");
});

console.log("voiceDropBodyProblem");
const voice = (o) => JSON.stringify({ nabad_dm: "voice", d: 3, p: [0.2], ...o });
ok("uploaded voice (storage key) is accepted", () => {
  assert.equal(voiceDropBodyProblem(voice({ k: "user/123.m4a", u: "https://x.supabase.co/storage/v1/object/public/dm_voice/user/123.m4a" })), "");
});
ok("uploaded voice (https url only) is accepted", () => {
  assert.equal(voiceDropBodyProblem(voice({ u: "https://x.supabase.co/a.m4a" })), "");
});
ok("device-local blob: URL is refused (the old retry bug)", () => {
  assert.notEqual(voiceDropBodyProblem(voice({ u: "blob:https://site/abc" })), "");
});
ok("data: URL is refused", () => {
  assert.notEqual(voiceDropBodyProblem(voice({ u: "data:audio/mp4;base64,AAAA" })), "");
});
ok("voice with no key and no url is refused", () => {
  assert.notEqual(voiceDropBodyProblem(voice({})), "");
});
ok("plain text and other JSON messages are untouched", () => {
  assert.equal(voiceDropBodyProblem("hello"), "");
  assert.equal(voiceDropBodyProblem('{"nabad_dm":"song","u":"blob:x"}'), "");
  assert.equal(voiceDropBodyProblem("{not json"), "");
  assert.equal(voiceDropBodyProblem(""), "");
});

console.log(`\n${n} checks passed`);
