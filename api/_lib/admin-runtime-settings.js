/**
 * Server-side admin kill switches. Default ON when the row/table is missing.
 */

const { selectFromTable } = require("./credits-auth");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const KEY_ARABIZI_INSTRUCTION = "arabizi_instruction";
const DEFAULTS = Object.freeze({
  [KEY_ARABIZI_INSTRUCTION]: true,
});
const CACHE_MS = 15_000;

let _cache = { expAt: 0, values: null };

function coerceBool(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1" || value === "true" || value === "on") return true;
  if (value === 0 || value === "0" || value === "false" || value === "off") return false;
  if (value && typeof value === "object" && "enabled" in value) {
    return coerceBool(value.enabled, fallback);
  }
  return fallback;
}

function clearRuntimeSettingsCache() {
  _cache = { expAt: 0, values: null };
}

function parseRows(rows) {
  const values = { ...DEFAULTS };
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || "").trim();
    if (!key || !(key in DEFAULTS)) continue;
    values[key] = coerceBool(row.value, DEFAULTS[key]);
  }
  return values;
}

async function fetchRuntimeSettings() {
  const res = await selectFromTable("admin_runtime_settings?select=key,value,updated_at,updated_by");
  if (!res.ok) return { ...DEFAULTS };
  return parseRows(res.data);
}

async function getRuntimeSettings({ fresh = false } = {}) {
  if (!fresh && _cache.values && _cache.expAt > Date.now()) {
    return { ..._cache.values };
  }
  const values = await fetchRuntimeSettings();
  _cache = { values, expAt: Date.now() + CACHE_MS };
  return { ...values };
}

async function isArabiziInstructionEnabled() {
  const values = await getRuntimeSettings();
  return values[KEY_ARABIZI_INSTRUCTION] !== false;
}

async function setRuntimeSetting(key, enabled, { updatedBy = null } = {}) {
  const k = String(key || "").trim();
  if (!(k in DEFAULTS)) return { ok: false, error: "unknown_key" };
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "not_configured" };
  }
  const on = Boolean(enabled);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_runtime_settings`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        key: k,
        value: on,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy || null,
      }),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) return { ok: false, status: r.status, error: "save_failed", data };
    clearRuntimeSettingsCache();
    return { ok: true, key: k, enabled: on, data };
  } catch {
    return { ok: false, error: "save_failed" };
  }
}

module.exports = {
  KEY_ARABIZI_INSTRUCTION,
  DEFAULTS,
  coerceBool,
  clearRuntimeSettingsCache,
  getRuntimeSettings,
  isArabiziInstructionEnabled,
  setRuntimeSetting,
};
