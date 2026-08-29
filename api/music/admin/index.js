/**
 * GET /api/music/admin?view=overview|users|user|...
 *
 * Admin-only analytics for admin.nabadai.com.
 * Auth: Authorization: Bearer <supabase access_token>
 *
 * Query params:
 *   view       — section (default overview)
 *   limit      — pagination (default 50, max 200)
 *   offset     — pagination offset
 *   search     — users / billing / publications: email, @username, song title, or song UUID
 */

const {
  verifyAdmin,
  adminForbidden,
  adminUnauthorized,
  sendJson,
  setCors,
} = require("../../_lib/admin-auth");
const {
  verifyUser,
  selectFromTable,
  callRpc,
  isAdminEmail,
} = require("../../_lib/credits-auth");
const { SUNO_USD_PER_CREDIT } = require("../../_lib/music-generation-log");
const { creditsForSubscriptionGrant } = require("../../_lib/billing-config");
const { ensureProfileRow } = require("../../_lib/ensure-profile-row");
const {
  listAssignableRoles,
} = require("../../_lib/admin-permissions");
const { adminSearchUserIds, resolveUserLookup, escapeLike, searchNeedle } = require("../../_lib/admin-user-resolve");
const { getProviderHealth } = require("../../_lib/provider-health");
const {
  fetchProviderSpendData,
  mergeProviderSpend,
  rollupGeminiLyriaSpendData,
  roundUsd,
} = require("../../_lib/provider-spend");
const { computeGeminiSharedWalletBalance } = require("../../_lib/gemini-wallet");
const {
  isCloudflareFluxConfigured,
  resolveDefaultCoverImageProvider,
} = require("../../_lib/cloudflare-flux-upstream");
const { resolveCoverRegenImageProvider } = require("../../_lib/gemini-cover-image");

const COVER_PROVIDER_LABELS = Object.freeze({
  cloudflare: "Cloudflare Flux",
  pollinations: "Pollinations",
  gemini: "Gemini",
});

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const PRO_PRICES = { weekly: 3.99, monthly: 9.99 };

/** Suno liability vs master bucket — how much to buy upstream. */
function sunoCoverageMetrics(masterBalance, guaranteedCredits) {
  const master = masterBalance != null ? Number(masterBalance) : null;
  const guaranteed = Number(guaranteedCredits || 0);
  const headroom = master != null ? master - guaranteed : null;
  const shortfallCredits = master != null && guaranteed > 0
    ? Math.max(0, Math.ceil(guaranteed - master))
    : 0;
  const shortfallUsd = shortfallCredits > 0
    ? Math.round(shortfallCredits * SUNO_USD_PER_CREDIT * 100) / 100
    : 0;
  const coveragePct = master != null && guaranteed > 0
    ? Math.round((master / guaranteed) * 1000) / 10
    : master != null && guaranteed === 0
      ? 100
      : null;
  return {
    guaranteedCredits: guaranteed,
    reservedCredits: guaranteed,
    masterBalance: master,
    headroomEstimate: headroom,
    shortfallCredits,
    shortfallUsd,
    creditsToBuy: shortfallCredits,
    coveragePct,
    usdPerCredit: SUNO_USD_PER_CREDIT,
  };
}

function periodCreditsForProSub(planId, status) {
  const productId = String(planId || "").trim() === "monthly"
    ? "com.nabadai.music.pro.monthly"
    : "com.nabadai.music.pro.weekly";
  return creditsForSubscriptionGrant({
    productId,
    periodType: String(status || "").toLowerCase() === "trialing" ? "TRIAL" : "NORMAL",
    eventType: "INITIAL_PURCHASE",
    subscriptionStatus: status,
  });
}

/** Liability from active Pro rows only — excludes promo/test balances from non‑subs. */
async function fetchProSubscriberLiability() {
  const subsRes = await serviceFetch(
    "pro_subscriptions?select=user_id,plan_id,status,provider&status=in.(active,trialing,grace)&limit=500",
  );
  const subs = Array.isArray(subsRes.data) ? subsRes.data : [];
  if (!subs.length) {
    return {
      guaranteedCredits: 0,
      remainingCredits: 0,
      reservedCredits: 0,
      subscriberCount: 0,
      subscribers: [],
    };
  }

  const userIds = [...new Set(subs.map((s) => String(s.user_id || "").trim()).filter(Boolean))];
  const inClause = userIds.map((id) => encodeURIComponent(id)).join(",");

  const [creditsRes, profilesRes, authMap] = await Promise.all([
    serviceFetch(`user_credits?select=user_id,balance&user_id=in.(${inClause})`),
    serviceFetch(`profiles?select=user_id,role,username&user_id=in.(${inClause})`),
    fetchAuthUsersMap(),
  ]);

  const creditsMap = new Map();
  for (const row of creditsRes.data || []) {
    creditsMap.set(String(row.user_id), Number(row.balance || 0));
  }
  const roleMap = new Map();
  const usernameMap = new Map();
  for (const row of profilesRes.data || []) {
    roleMap.set(String(row.user_id), String(row.role || "user").toLowerCase());
    usernameMap.set(String(row.user_id), String(row.username || "").trim());
  }

  let guaranteedTotal = 0;
  let remainingTotal = 0;
  const subscribers = subs.map((sub) => {
    const uid = String(sub.user_id || "").trim();
    const planId = String(sub.plan_id || "").trim();
    const status = String(sub.status || "active").trim();
    const balance = creditsMap.get(uid) || 0;
    const periodCap = periodCreditsForProSub(planId, status);
    const auth = authMap.get(uid) || {};
    const isAdmin = roleMap.get(uid) === "admin" || isAdminEmail(auth.email || "");
    const guaranteed = isAdmin ? 0 : periodCap;
    const remaining = isAdmin ? 0 : Math.min(balance, periodCap > 0 ? periodCap : balance);
    guaranteedTotal += guaranteed;
    remainingTotal += remaining;
    return {
      userId: uid,
      email: auth.email || "",
      username: usernameMap.get(uid) || "",
      planId,
      status,
      provider: String(sub.provider || "").trim(),
      balance,
      periodCap,
      guaranteed,
      remaining,
      isAdmin,
    };
  });

  return {
    guaranteedCredits: guaranteedTotal,
    remainingCredits: Math.round(remainingTotal * 10) / 10,
    reservedCredits: guaranteedTotal,
    subscriberCount: subs.length,
    subscribers,
  };
}

function startOfTodayUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

function startOfMonthUtc() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function serviceFetch(path, { method = "GET", body } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return { ok: false, data: null };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json", Prefer: "count=exact" } : { Prefer: "count=exact" }),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    const range = r.headers.get("content-range") || "";
    const countMatch = range.match(/\/(\d+|\*)$/);
    const total = countMatch && countMatch[1] !== "*" ? Number(countMatch[1]) : null;
    return { ok: r.ok, status: r.status, data, total };
  } catch {
    return { ok: false, data: null };
  }
}

async function fetchSunoMasterBalance() {
  const apiKey = process.env.SUNO_API_KEY;
  if (!apiKey) return null;
  try {
    const r = await fetch("https://api.sunoapi.org/api/v1/generate/credit", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await r.json().catch(() => null);
    if (r.ok && data && Number.isFinite(Number(data.data))) return Number(data.data);
  } catch {}
  return null;
}

async function fetchAuthUsersMap() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Map();
  const map = new Map();
  let page = 1;
  const perPage = 200;
  for (let guard = 0; guard < 20; guard += 1) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        },
      );
      if (!r.ok) break;
      const data = await r.json().catch(() => null);
      const users = Array.isArray(data?.users) ? data.users : [];
      for (const u of users) {
        if (u?.id) {
          const meta = u.user_metadata || u.raw_user_meta_data || {};
          map.set(String(u.id), {
            email: String(u.email || "").toLowerCase(),
            signupAt: u.created_at || null,
            signupPlatform: String(meta.signup_platform || "").trim().toLowerCase() || null,
          });
        }
      }
      if (users.length < perPage) break;
      page += 1;
    } catch {
      break;
    }
  }
  return map;
}

const COACH_USD_PER_MESSAGE = Number(process.env.GEMINI_USD_COACH || process.env.GEMINI_USD_PER_REQUEST || "0.002");

function emptyCoachUsageSummary(source = "unknown") {
  return {
    messagesToday: 0,
    messages7d: 0,
    messages30d: 0,
    messagesAll: 0,
    uniqueUsersToday: 0,
    uniqueUsers7d: 0,
    uniqueUsers30d: 0,
    uniqueUsersAll: 0,
    estCostUsd30d: 0,
    daily: [],
    source,
    privacyNote: "Counts only — Coach message content is never stored.",
  };
}

function normalizeCoachUsageSummary(raw, source = "rpc") {
  if (!raw || typeof raw !== "object") return emptyCoachUsageSummary(source);
  const daily = Array.isArray(raw.daily)
    ? raw.daily.map((row) => ({
      day: String(row?.day || "").slice(0, 10),
      messages: Number(row?.messages || 0),
      users: Number(row?.users || 0),
    })).filter((row) => row.day)
    : [];
  return {
    messagesToday: Number(raw.messagesToday || 0),
    messages7d: Number(raw.messages7d || 0),
    messages30d: Number(raw.messages30d || 0),
    messagesAll: Number(raw.messagesAll || 0),
    uniqueUsersToday: Number(raw.uniqueUsersToday || 0),
    uniqueUsers7d: Number(raw.uniqueUsers7d || 0),
    uniqueUsers30d: Number(raw.uniqueUsers30d || 0),
    uniqueUsersAll: Number(raw.uniqueUsersAll || 0),
    estCostUsd30d: roundUsd(Number(raw.estCostUsd30d || 0)),
    daily,
    source: String(raw.source || source),
    privacyNote: String(raw.privacyNote || emptyCoachUsageSummary().privacyNote),
  };
}

async function countCoachMessagesSince(iso) {
  let path = "provider_usage_events?select=id&kind=eq.coach&status=eq.completed&limit=1";
  if (iso) path += `&created_at=gte.${encodeURIComponent(iso)}`;
  const res = await serviceFetch(path);
  return Number.isFinite(res.total) ? res.total : 0;
}

async function fetchCoachUniqueUsersSince(iso, { maxRows = 8000 } = {}) {
  let path = `provider_usage_events?select=user_id&kind=eq.coach&status=eq.completed&user_id=not.is.null&order=created_at.desc&limit=${maxRows}`;
  if (iso) path += `&created_at=gte.${encodeURIComponent(iso)}`;
  const res = await serviceFetch(path);
  const rows = Array.isArray(res.data) ? res.data : [];
  const ids = new Set();
  for (const row of rows) {
    const uid = cleanUserId(row?.user_id);
    if (uid) ids.add(uid);
  }
  return ids.size;
}

function bucketCoachDailyRows(rows = []) {
  const byDay = new Map();
  for (const row of rows) {
    const day = String(row?.created_at || "").slice(0, 10);
    const uid = cleanUserId(row?.user_id);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, { day, messages: 0, userIds: new Set() });
    const bucket = byDay.get(day);
    bucket.messages += 1;
    if (uid) bucket.userIds.add(uid);
  }
  return [...byDay.values()]
    .map((b) => ({ day: b.day, messages: b.messages, users: b.userIds.size }))
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

const ACTIVITY_LIVE_WINDOW_MIN = 15;

function emptyActivitySummary(source = "unknown") {
  return {
    activeNow: 0,
    activeToday: 0,
    days: 28,
    daily: [],
    source,
    liveWindowMinutes: ACTIVITY_LIVE_WINDOW_MIN,
    note: "Engaged users = distinct accounts with a generation that day.",
  };
}

function normalizeActivitySummary(raw, source = "rpc") {
  if (!raw || typeof raw !== "object") return emptyActivitySummary(source);
  const daily = Array.isArray(raw.daily)
    ? raw.daily.map((row) => ({
      day: String(row?.day || "").slice(0, 10),
      signups: Number(row?.signups || 0),
      generations: Number(row?.generations || 0),
      engagedUsers: Number(row?.engagedUsers ?? row?.engaged_users ?? 0),
      published: Number(row?.published || 0),
    })).filter((row) => row.day)
    : [];
  return {
    activeNow: Number(raw.activeNow ?? raw.active_now ?? 0),
    activeToday: Number(raw.activeToday ?? raw.active_today ?? 0),
    days: Number(raw.days || daily.length || 28),
    daily,
    source: String(raw.source || source),
    liveWindowMinutes: ACTIVITY_LIVE_WINDOW_MIN,
    note: String(raw.note || emptyActivitySummary().note),
  };
}

function buildActivityDaySeries(days = 28) {
  const count = Math.max(7, Math.min(90, Number(days) || 28));
  const out = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function bucketActivityDailyRows({
  daySeries = [],
  profiles = [],
  generations = [],
  publishedSongs = [],
} = {}) {
  const byDay = new Map(daySeries.map((day) => [day, {
    day,
    signups: 0,
    generations: 0,
    engagedUsers: 0,
    published: 0,
    userIds: new Set(),
  }]));

  for (const row of profiles) {
    const day = String(row?.created_at || "").slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.signups += 1;
  }

  for (const row of generations) {
    const day = String(row?.created_at || "").slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.generations += 1;
    const uid = cleanUserId(row?.user_id);
    if (uid) bucket.userIds.add(uid);
  }

  for (const row of publishedSongs) {
    const day = String(row?.published_at || row?.created_at || "").slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.published += 1;
  }

  return [...byDay.values()].map((b) => ({
    day: b.day,
    signups: b.signups,
    generations: b.generations,
    engagedUsers: b.userIds.size,
    published: b.published,
  }));
}

async function fetchActivitySummary({ days = 28 } = {}) {
  const dayCount = Math.max(7, Math.min(90, Number(days) || 28));
  const rpc = await callRpc("get_admin_activity_summary", { p_days: dayCount });
  if (rpc.ok && rpc.data && typeof rpc.data === "object") {
    return normalizeActivitySummary(rpc.data, "rpc");
  }

  const since = new Date(Date.now() - (dayCount - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();
  const liveSince = new Date(Date.now() - ACTIVITY_LIVE_WINDOW_MIN * 60 * 1000).toISOString();
  const today = startOfTodayUtc();
  const daySeries = buildActivityDaySeries(dayCount);
  const rowLimit = 12000;

  const [
    activeNowRes,
    activeTodayRes,
    profilesRes,
    gensRes,
    publishedRes,
  ] = await Promise.all([
    serviceFetch(`profiles?select=user_id&last_active_at=gte.${encodeURIComponent(liveSince)}&limit=1`),
    serviceFetch(`profiles?select=user_id&last_active_at=gte.${encodeURIComponent(today)}&limit=1`),
    serviceFetch(`profiles?select=created_at&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.asc&limit=${rowLimit}`),
    serviceFetch(`music_generation_logs?select=user_id,created_at&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.asc&limit=${rowLimit}`),
    serviceFetch(`user_songs?select=published_at,created_at&public_on_profile=eq.true&published_at=gte.${encodeURIComponent(sinceIso)}&order=published_at.asc&limit=${rowLimit}`),
  ]);

  return normalizeActivitySummary({
    activeNow: activeNowRes.total ?? 0,
    activeToday: activeTodayRes.total ?? 0,
    days: dayCount,
    daily: bucketActivityDailyRows({
      daySeries,
      profiles: Array.isArray(profilesRes.data) ? profilesRes.data : [],
      generations: Array.isArray(gensRes.data) ? gensRes.data : [],
      publishedSongs: Array.isArray(publishedRes.data) ? publishedRes.data : [],
    }),
    source: "fallback",
  }, "fallback");
}

async function fetchCoachUsageSummary() {
  const rpc = await callRpc("get_coach_usage_summary", {});
  if (rpc.ok && rpc.data && typeof rpc.data === "object") {
    return normalizeCoachUsageSummary(rpc.data, "rpc");
  }

  const today = startOfTodayUtc();
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const d14 = new Date(Date.now() - 14 * 86400000).toISOString();

  const [
    messagesToday,
    messages7d,
    messages30d,
    messagesAll,
    uniqueUsersToday,
    uniqueUsers7d,
    uniqueUsers30d,
    uniqueUsersAll,
    dailyRes,
    costRes,
  ] = await Promise.all([
    countCoachMessagesSince(today),
    countCoachMessagesSince(d7),
    countCoachMessagesSince(d30),
    countCoachMessagesSince(null),
    fetchCoachUniqueUsersSince(today),
    fetchCoachUniqueUsersSince(d7),
    fetchCoachUniqueUsersSince(d30),
    fetchCoachUniqueUsersSince(null),
    serviceFetch(
      `provider_usage_events?select=user_id,created_at&kind=eq.coach&status=eq.completed&created_at=gte.${encodeURIComponent(d14)}&order=created_at.desc&limit=8000`,
    ),
    serviceFetch(
      `provider_usage_events?select=amount_usd&kind=eq.coach&status=eq.completed&created_at=gte.${encodeURIComponent(d30)}&limit=8000`,
    ),
  ]);

  let estCostUsd30d = 0;
  if (Array.isArray(costRes.data)) {
    for (const row of costRes.data) {
      const usd = Number(row?.amount_usd || 0);
      if (Number.isFinite(usd)) estCostUsd30d += usd;
    }
  } else {
    estCostUsd30d = messages30d * COACH_USD_PER_MESSAGE;
  }

  return normalizeCoachUsageSummary({
    messagesToday,
    messages7d,
    messages30d,
    messagesAll,
    uniqueUsersToday,
    uniqueUsers7d,
    uniqueUsers30d,
    uniqueUsersAll,
    estCostUsd30d,
    daily: bucketCoachDailyRows(Array.isArray(dailyRes.data) ? dailyRes.data : []),
    source: "fallback",
    privacyNote: "Counts only — Coach message content is never stored.",
  }, "fallback");
}

function emptyGrowthSummary(source = "unknown") {
  return {
    signups: 0,
    proTotal: 0,
    generatedAtLeast1: 0,
    activationPct: 0,
    proConversionPct: 0,
    buckets: [
      { id: "0", label: "0 gens", min: 0, max: 0, users: 0, pro: 0 },
      { id: "1", label: "1 gen", min: 1, max: 1, users: 0, pro: 0 },
      { id: "2-5", label: "2–5 gens", min: 2, max: 5, users: 0, pro: 0 },
      { id: "6-10", label: "6–10 gens", min: 6, max: 10, users: 0, pro: 0 },
      { id: "11+", label: "11+ gens", min: 11, max: null, users: 0, pro: 0 },
    ],
    source,
    note: "Buckets count generation requests (any status) per account. Pro = active / trialing / grace.",
  };
}

function growthBucketId(gens) {
  const n = Math.max(0, Number(gens) || 0);
  if (n <= 0) return "0";
  if (n === 1) return "1";
  if (n <= 5) return "2-5";
  if (n <= 10) return "6-10";
  return "11+";
}

function normalizeGrowthSummary(raw, source = "rpc") {
  const base = emptyGrowthSummary(source);
  if (!raw || typeof raw !== "object") return base;
  const signups = Math.max(0, Number(raw.signups ?? raw.totalUsers ?? 0) || 0);
  const proTotal = Math.max(0, Number(raw.proTotal ?? raw.pro_total ?? 0) || 0);
  let generatedAtLeast1 = Number(raw.generatedAtLeast1 ?? raw.generated_at_least_1);
  if (!Number.isFinite(generatedAtLeast1)) generatedAtLeast1 = 0;
  generatedAtLeast1 = Math.max(0, Math.min(signups, Math.floor(generatedAtLeast1)));

  const byId = new Map(base.buckets.map((b) => [b.id, { ...b }]));
  const incoming = Array.isArray(raw.buckets) ? raw.buckets : [];
  for (const row of incoming) {
    const id = String(row?.id || "").trim();
    if (!byId.has(id)) continue;
    const cur = byId.get(id);
    cur.users = Math.max(0, Number(row?.users ?? 0) || 0);
    cur.pro = Math.max(0, Number(row?.pro ?? 0) || 0);
  }
  const buckets = [...byId.values()];
  if (!Number.isFinite(Number(raw.generatedAtLeast1 ?? raw.generated_at_least_1))) {
    generatedAtLeast1 = buckets
      .filter((b) => b.id !== "0")
      .reduce((sum, b) => sum + Number(b.users || 0), 0);
  }

  const activationPct = signups > 0
    ? Math.round((generatedAtLeast1 / signups) * 1000) / 10
    : 0;
  const proConversionPct = signups > 0
    ? Math.round((proTotal / signups) * 1000) / 10
    : 0;

  return {
    ...base,
    signups,
    proTotal,
    generatedAtLeast1,
    activationPct,
    proConversionPct,
    buckets,
    source,
    note: String(raw.note || base.note),
  };
}

async function fetchAllProfileUserIds() {
  const ids = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const res = await serviceFetch(
      `profiles?select=user_id&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
    );
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const row of rows) {
      const uid = cleanUserId(row?.user_id);
      if (uid) ids.push(uid);
    }
    if (rows.length < pageSize) break;
  }
  return ids;
}

async function fetchGenerationCountsByUser() {
  const counts = new Map();
  const pageSize = 1000;
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const res = await serviceFetch(
      `music_generation_logs?select=user_id&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
    );
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const row of rows) {
      const uid = cleanUserId(row?.user_id);
      if (!uid) continue;
      counts.set(uid, (counts.get(uid) || 0) + 1);
    }
    if (rows.length < pageSize) break;
  }
  return counts;
}

async function fetchProUserIdSet() {
  const set = new Set();
  const res = await serviceFetch(
    "pro_subscriptions?select=user_id&status=in.(active,trialing,grace)&limit=2000",
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  for (const row of rows) {
    const uid = cleanUserId(row?.user_id);
    if (uid) set.add(uid);
  }
  return set;
}

async function fetchGrowthSummaryFallback() {
  const [profileIds, genCounts, proIds] = await Promise.all([
    fetchAllProfileUserIds(),
    fetchGenerationCountsByUser(),
    fetchProUserIdSet(),
  ]);

  const buckets = emptyGrowthSummary("fallback").buckets.map((b) => ({ ...b }));
  const byId = new Map(buckets.map((b) => [b.id, b]));
  let proTotal = 0;
  let generatedAtLeast1 = 0;

  for (const uid of profileIds) {
    const gens = genCounts.get(uid) || 0;
    const isPro = proIds.has(uid);
    if (isPro) proTotal += 1;
    if (gens >= 1) generatedAtLeast1 += 1;
    const bucket = byId.get(growthBucketId(gens));
    if (!bucket) continue;
    bucket.users += 1;
    if (isPro) bucket.pro += 1;
  }

  return normalizeGrowthSummary({
    signups: profileIds.length,
    proTotal,
    generatedAtLeast1,
    buckets,
    note: "Buckets count generation requests (any status) per account. Pro = active / trialing / grace.",
  }, "fallback");
}

async function fetchGrowthSummary() {
  const rpc = await callRpc("get_admin_growth_summary", {});
  if (rpc.ok && rpc.data && typeof rpc.data === "object") {
    return normalizeGrowthSummary(rpc.data, "rpc");
  }
  return fetchGrowthSummaryFallback();
}

async function getOverview() {
  const today = startOfTodayUtc();
  const monthStart = startOfMonthUtc();

  const [
    summaryRpc,
    masterSuno,
    profilesCount,
    activeToday,
    newToday,
    proSubs,
    publishedToday,
    songsToday,
    failedToday,
    creditsToday,
    gensToday,
    revenueSubs,
    coachUsage,
    activitySummary,
    growthSummary,
  ] = await Promise.all([
    callRpc("get_credits_summary", {}),
    fetchSunoMasterBalance(),
    serviceFetch("profiles?select=user_id&limit=1"),
    serviceFetch(`profiles?select=user_id&last_active_at=gte.${encodeURIComponent(today)}&limit=1`),
    serviceFetch(`profiles?select=user_id&created_at=gte.${encodeURIComponent(today)}&limit=1`),
    serviceFetch("pro_subscriptions?select=user_id,plan_id,status&status=in.(active,trialing,grace)&limit=1"),
    serviceFetch(`user_songs?select=id&public_on_profile=eq.true&published_at=gte.${encodeURIComponent(today)}&limit=1`),
    serviceFetch(`user_songs?select=id&created_at=gte.${encodeURIComponent(today)}&limit=1`),
    serviceFetch(`music_generation_logs?select=id&status=eq.failed&created_at=gte.${encodeURIComponent(today)}&limit=1`),
    serviceFetch(`credits_transactions?select=delta&created_at=gte.${encodeURIComponent(today)}&limit=1000`),
    serviceFetch(`music_generation_logs?select=credits_used,provider_cost_usd&created_at=gte.${encodeURIComponent(today)}&limit=1000`),
    serviceFetch(`pro_subscriptions?select=plan_id,status,created_at&status=in.(active,trialing,grace)&created_at=gte.${encodeURIComponent(monthStart)}&limit=500`),
    fetchCoachUsageSummary(),
    fetchActivitySummary({ days: 28 }),
    fetchGrowthSummary(),
  ]);

  const summary = (summaryRpc.ok && summaryRpc.data) || {};
  const outstanding = Number(summary.outstanding || 0);
  const allocated = Number(summary.allocated_total || 0);
  const spent = Number(summary.spent_total || 0);

  let creditsConsumedToday = 0;
  let creditsIssuedToday = 0;
  if (Array.isArray(creditsToday.data)) {
    for (const row of creditsToday.data) {
      const d = Number(row.delta || 0);
      if (d < 0) creditsConsumedToday += -d;
      else creditsIssuedToday += d;
    }
  }

  let apiCostToday = 0;
  if (Array.isArray(gensToday.data)) {
    for (const row of gensToday.data) {
      const cost = row.provider_cost_usd != null
        ? Number(row.provider_cost_usd)
        : Number(row.credits_used || 0) * SUNO_USD_PER_CREDIT;
      if (Number.isFinite(cost)) apiCostToday += cost;
    }
  } else {
    apiCostToday = creditsConsumedToday * SUNO_USD_PER_CREDIT;
  }

  let revenueMtd = 0;
  if (Array.isArray(revenueSubs.data)) {
    for (const row of revenueSubs.data) {
      const plan = String(row.plan_id || "").trim();
      if (plan === "weekly") revenueMtd += PRO_PRICES.weekly;
      else if (plan === "monthly") revenueMtd += PRO_PRICES.monthly;
    }
  }

  const proLiability = await fetchProSubscriberLiability();
  const coverage = sunoCoverageMetrics(masterSuno, proLiability.guaranteedCredits);

  return {
    suno: {
      ...coverage,
      remainingCredits: proLiability.remainingCredits,
      allUserOutstanding: outstanding,
      userOutstanding: outstanding,
      proSubscriberCount: proLiability.subscriberCount,
      proSubscribers: proLiability.subscribers,
      userAllocatedTotal: allocated,
      userSpentTotal: spent,
    },
    users: {
      total: profilesCount.total ?? Number(summary.users || 0),
      activeToday: activeToday.total ?? 0,
      newToday: newToday.total ?? 0,
    },
    subscriptions: {
      premiumActive: proSubs.total ?? 0,
    },
    credits: {
      issuedTotal: allocated,
      usedTotal: spent,
      issuedToday: creditsIssuedToday,
      consumedToday: creditsConsumedToday,
    },
    generations: {
      songsToday: songsToday.total ?? 0,
      publishedToday: publishedToday.total ?? 0,
      failedToday: failedToday.total ?? 0,
      apiCostTodayUsd: Math.round(apiCostToday * 100) / 100,
    },
    revenue: {
      estimatedMtdUsd: Math.round(revenueMtd * 100) / 100,
      note: "Estimate from active Pro subs started this month; updates when Apple IAP webhooks land.",
    },
    coach: coachUsage || emptyCoachUsageSummary(),
    activity: activitySummary || emptyActivitySummary(),
    growth: growthSummary || emptyGrowthSummary(),
  };
}

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f-]{36}$/.test(s) ? s : "";
}

function cleanGenerationId(v) {
  return cleanUserId(v);
}

function kindCreditReasons(kind) {
  const k = String(kind || "").toLowerCase();
  const map = {
    song: ["full_song", "refund_full_song"],
    photo: ["full_song", "refund_full_song"],
    hum_track: ["stems_remix", "refund_stems_remix", "full_song", "refund_full_song"],
    instrumental: ["stems_remix", "refund_stems_remix", "full_song", "refund_full_song"],
    cover: ["stems_remix", "refund_stems_remix"],
    remix: ["stems_remix", "refund_stems_remix"],
    extend: ["stems_remix", "refund_stems_remix"],
    music_video: ["full_song", "refund_full_song"],
    studio_guide: ["stems_remix", "refund_stems_remix"],
    stems: ["stems_vocal_removal", "refund_stems_vocal_removal", "stems", "refund_stems"],
    persona: ["persona", "refund_persona"],
    sound: ["sound_generate", "refund_sound_generate"],
    mashup: ["mashup", "refund_mashup"],
  };
  return map[k] || [k, `refund_${k}`];
}

async function fetchProfilesForAdmin(limit, offset) {
  const baseSelect = "user_id,username,display_name,role,last_active_at,created_at";
  const order = `order=created_at.desc&limit=${limit}&offset=${offset}`;
  let profRes = await serviceFetch(
    `profiles?select=${baseSelect},signup_platform&${order}`,
  );
  if (!profRes.ok) {
    profRes = await serviceFetch(`profiles?select=${baseSelect}&${order}`);
  }
  return profRes;
}

async function findUserIdsBySearch(query, authMap) {
  return adminSearchUserIds(query, { authMap, limit: 200 });
}

function buildOrphanUserFromAuth(userId, auth) {
  return {
    userId,
    name: "—",
    username: "",
    email: auth.email || "",
    signupAt: auth.signupAt || null,
    role: "user",
    subscriptionStatus: "none",
    subscriptionPlan: null,
    subscriptionPeriodEnd: null,
    credits: 0,
    paidCredits: 0,
    giftCredits: 0,
    promoCredits: 0,
    songsGenerated: 0,
    lastActiveAt: null,
    signupPlatform: auth.signupPlatform || null,
    profilePending: true,
  };
}

async function hydrateUsersFromProfiles(profiles, authMap, orphanAuthUsers = [], totalOverride) {
  const ids = profiles.map((p) => p.user_id).filter(Boolean);
  if (!ids.length && !orphanAuthUsers.length) {
    return { users: [], total: totalOverride ?? 0 };
  }

  const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
  const [creditsRes, subsRes, songsRes] = ids.length
    ? await Promise.all([
        serviceFetch(`user_credits?select=user_id,balance,paid_balance,gift_balance,promo_balance,updated_at&user_id=in.(${inClause})`),
        serviceFetch(`pro_subscriptions?select=user_id,plan_id,status,current_period_end&user_id=in.(${inClause})`),
        serviceFetch(`user_songs?select=user_id&user_id=in.(${inClause})&limit=5000`),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const creditsByUser = new Map();
  for (const row of Array.isArray(creditsRes.data) ? creditsRes.data : []) {
    creditsByUser.set(row.user_id, row);
  }
  const subsByUser = new Map();
  for (const row of Array.isArray(subsRes.data) ? subsRes.data : []) {
    subsByUser.set(row.user_id, row);
  }
  const songCounts = new Map();
  for (const row of Array.isArray(songsRes.data) ? songsRes.data : []) {
    songCounts.set(row.user_id, (songCounts.get(row.user_id) || 0) + 1);
  }

  const users = profiles.map((p) => {
    const auth = authMap.get(p.user_id) || {};
    const cr = creditsByUser.get(p.user_id) || {};
    const sub = subsByUser.get(p.user_id);
    const name = String(p.display_name || p.username || "—").trim() || "—";
    return {
      userId: p.user_id,
      name,
      username: p.username || "",
      email: auth.email || "",
      signupAt: auth.signupAt || p.created_at || null,
      role: p.role || "user",
      subscriptionStatus: sub?.status || "none",
      subscriptionPlan: sub?.plan_id || null,
      subscriptionPeriodEnd: sub?.current_period_end || null,
      credits: Number(cr.balance || 0),
      paidCredits: Number(cr.paid_balance || 0),
      giftCredits: Number(cr.gift_balance || 0),
      promoCredits: Number(cr.promo_balance || 0),
      songsGenerated: songCounts.get(p.user_id) || 0,
      lastActiveAt: p.last_active_at || cr.updated_at || null,
      signupPlatform: auth.signupPlatform || String(p.signup_platform || "").trim().toLowerCase() || null,
    };
  });

  return {
    users: [...orphanAuthUsers, ...users],
    total: totalOverride ?? users.length + orphanAuthUsers.length,
  };
}

async function getUsers(limit, offset, search = "") {
  const authMap = await fetchAuthUsersMap();
  const searchQ = String(search || "").trim();

  if (searchQ.length >= 2) {
    const allIds = await findUserIdsBySearch(searchQ, authMap);
    const total = allIds.length;
    const pageIds = allIds.slice(offset, offset + limit);
    if (!pageIds.length) {
      return { users: [], total, search: searchQ };
    }
    const inClause = pageIds.map((id) => encodeURIComponent(id)).join(",");
    const profRes = await serviceFetch(
      `profiles?select=user_id,username,display_name,role,last_active_at,created_at,signup_platform&user_id=in.(${inClause})`,
    );
    const profileById = new Map();
    for (const row of Array.isArray(profRes.data) ? profRes.data : []) {
      if (row?.user_id) profileById.set(String(row.user_id), row);
    }
    const profiles = pageIds.map((id) => profileById.get(String(id))).filter(Boolean);
    const orphanFromSearch = pageIds
      .filter((id) => !profileById.has(String(id)))
      .map((userId) => {
        const auth = authMap.get(userId) || authMap.get(String(userId)) || {};
        return buildOrphanUserFromAuth(userId, auth);
      });
    const payload = await hydrateUsersFromProfiles(profiles, authMap, orphanFromSearch, total);
    return { ...payload, search: searchQ };
  }

  let profRes = await fetchProfilesForAdmin(limit, offset);
  let profiles = Array.isArray(profRes.data) ? profRes.data : [];
  if (!profRes.ok && !profiles.length) {
    return { users: [], total: 0, error: "profiles_fetch_failed" };
  }
  let ids = profiles.map((p) => p.user_id).filter(Boolean);

  const allProfRes = await serviceFetch("profiles?select=user_id&limit=10000");
  let profileIdSet = new Set(
    (Array.isArray(allProfRes.data) ? allProfRes.data : []).map((p) => p.user_id).filter(Boolean),
  );
  const orphanAuthUsers = [];
  if (offset === 0) {
    const orphanEntries = [];
    for (const [userId, auth] of authMap) {
      if (profileIdSet.has(userId)) continue;
      orphanEntries.push({ userId, auth });
    }
    orphanEntries.sort((a, b) =>
      String(b.auth.signupAt || "").localeCompare(String(a.auth.signupAt || "")),
    );
    for (const { userId, auth } of orphanEntries) {
      await ensureProfileRow({
        userId,
        email: auth.email,
        signupPlatform: auth.signupPlatform,
      }).catch(() => null);
    }
    if (orphanEntries.length) {
      profRes = await fetchProfilesForAdmin(limit, offset);
      profiles = Array.isArray(profRes.data) ? profRes.data : profiles;
      ids = profiles.map((p) => p.user_id).filter(Boolean);
      const refreshed = await serviceFetch("profiles?select=user_id&limit=10000");
      profileIdSet = new Set(
        (Array.isArray(refreshed.data) ? refreshed.data : []).map((p) => p.user_id).filter(Boolean),
      );
    }
    for (const { userId, auth } of orphanEntries) {
      if (profileIdSet.has(userId)) continue;
      orphanAuthUsers.push(buildOrphanUserFromAuth(userId, auth));
    }
  }

  if (!ids.length && !orphanAuthUsers.length) {
    return { users: [], total: profRes.total ?? 0 };
  }

  return hydrateUsersFromProfiles(profiles, authMap, orphanAuthUsers, (profRes.total ?? profiles.length) + orphanAuthUsers.length);
}

async function getPromos(limit, offset) {
  const res = await serviceFetch(
    `promo_codes?select=code,credits,max_redemptions,redemptions,active,expires_at,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
  );
  const promos = (Array.isArray(res.data) ? res.data : []).map((row) => ({
    code: row.code,
    credits: Number(row.credits || 0),
    maxRedemptions: Number(row.max_redemptions || 0),
    redemptions: Number(row.redemptions || 0),
    active: Boolean(row.active),
    expiresAt: row.expires_at || null,
    createdAt: row.created_at || null,
  }));
  const summaryRpc = await callRpc("get_credits_summary", {});
  const summary = (summaryRpc.ok && summaryRpc.data) || {};
  return {
    promos,
    total: res.total ?? promos.length,
    summary: {
      codesTotal: Number(summary.codes_total || 0),
      codesRedeemed: Number(summary.codes_redeemed || 0),
    },
  };
}

async function getSingers(limit, offset) {
  const appRes = await serviceFetch(
    `singer_applications?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`,
  );
  const reqRes = await serviceFetch(
    `pro_singer_requests?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`,
  );
  const rosterRes = await serviceFetch(
    "pro_singers?select=*&order=featured.desc,sort_order.asc,approved_at.desc&limit=200",
  );

  const applications = Array.isArray(appRes.data) ? appRes.data : [];
  const requests = Array.isArray(reqRes.data) ? reqRes.data : [];
  const roster = Array.isArray(rosterRes.data) ? rosterRes.data : [];

  const userIds = new Set();
  applications.forEach((a) => a.user_id && userIds.add(a.user_id));
  requests.forEach((r) => {
    if (r.requester_id) userIds.add(r.requester_id);
    if (r.singer_id) userIds.add(r.singer_id);
  });
  roster.forEach((s) => s.user_id && userIds.add(s.user_id));

  let profileMap = new Map();
  const ids = [...userIds];
  if (ids.length) {
    const inList = ids.map((id) => encodeURIComponent(id)).join(",");
    const profRes = await serviceFetch(
      `profiles?select=user_id,username,display_name,email,avatar&user_id=in.(${inList})`,
    );
    (Array.isArray(profRes.data) ? profRes.data : []).forEach((p) => {
      profileMap.set(p.user_id, p);
    });
  }

  const labelFor = (uid) => {
    const p = profileMap.get(uid) || {};
    return String(p.display_name || p.username || p.email || uid?.slice(0, 8) || "—");
  };

  return {
    applications: applications.map((a) => ({
      id: a.id,
      userId: a.user_id,
      userLabel: labelFor(a.user_id),
      displayName: a.display_name || "",
      instagram: a.instagram || "",
      languages: a.languages || "",
      genres: a.genres || "",
      demoUrl: a.demo_url || "",
      bio: a.bio || "",
      status: a.status,
      adminNotes: a.admin_notes || "",
      createdAt: a.created_at || null,
      reviewedAt: a.reviewed_at || null,
    })),
    applicationsTotal: appRes.total ?? applications.length,
    roster: roster.map((s) => ({
      userId: s.user_id,
      userLabel: labelFor(s.user_id),
      displayName: s.display_name || "",
      instagram: s.instagram || "",
      languages: s.languages || "",
      genres: s.genres || "",
      active: Boolean(s.active),
      featured: Boolean(s.featured),
      approvedAt: s.approved_at || null,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      requesterId: r.requester_id,
      requesterLabel: labelFor(r.requester_id),
      requestType: r.request_type,
      packageTier: r.package_tier,
      priceUsd: Number(r.price_usd || 0),
      songTitle: r.song_title || "",
      occasion: r.occasion || "",
      brief: r.brief || "",
      singerId: r.singer_id || null,
      singerLabel: r.singer_id ? labelFor(r.singer_id) : "Best match",
      singerAssignmentStatus: r.singer_assignment_status || "",
      status: r.status,
      paymentStatus: r.payment_status,
      contactEmail: r.contact_email || "",
      contactInstagram: r.contact_instagram || "",
      adminNotes: r.admin_notes || "",
      deliveredSongId: r.delivered_song_id || "",
      createdAt: r.created_at || null,
    })),
    requestsTotal: reqRes.total ?? requests.length,
  };
}

async function fetchOrphanCreditLedgerRows({ userId = "", scanLimit = 300 } = {}) {
  let path = `credit_ledger?select=id,user_id,delta,reason,ref,created_at&order=created_at.desc&limit=${scanLimit}`;
  if (userId) {
    path += `&user_id=eq.${encodeURIComponent(userId)}`;
  }
  const ledgerRes = await serviceFetch(path);
  const rows = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];
  if (!rows.length) return [];

  const ledgerIds = rows.map((r) => r.id).filter(Boolean);
  const inClause = ledgerIds.map((id) => encodeURIComponent(id)).join(",");
  const linkedRes = inClause
    ? await serviceFetch(`credits_transactions?select=ledger_id&ledger_id=in.(${inClause})`)
    : { data: [] };
  const linked = new Set(
    (Array.isArray(linkedRes.data) ? linkedRes.data : []).map((t) => t.ledger_id),
  );

  return rows
    .filter((r) => !linked.has(r.id))
    .map((r) => ({
      id: r.id,
      user_id: r.user_id,
      delta: Number(r.delta || 0),
      balance_before: null,
      balance_after: null,
      reason: r.reason || "",
      ref: r.ref || "",
      created_at: r.created_at,
      ledger_id: r.id,
    }));
}

function hydrateCreditRows(rows, profileMap) {
  return rows.map((r) => {
    const p = profileMap.get(r.user_id) || {};
    return {
      ...r,
      delta: Number(r.delta),
      balanceBefore: r.balance_before != null ? Number(r.balance_before) : null,
      balanceAfter: r.balance_after != null ? Number(r.balance_after) : null,
      userLabel: String(p.display_name || p.username || r.user_id?.slice(0, 8) || "—"),
    };
  });
}

async function fetchMergedCreditRows({ userId = "", limit = 50, offset = 0 } = {}) {
  const scanSize = Math.min(Math.max(offset + limit + 100, limit), 500);
  const txPath = userId
    ? `credits_transactions?select=id,user_id,delta,balance_before,balance_after,reason,ref,created_at,ledger_id&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=${scanSize}&offset=0`
    : `credits_transactions?select=id,user_id,delta,balance_before,balance_after,reason,ref,created_at,ledger_id&order=created_at.desc&limit=${scanSize}&offset=0`;

  const [txRes, orphans] = await Promise.all([
    serviceFetch(txPath),
    fetchOrphanCreditLedgerRows({ userId, scanLimit: userId ? 120 : 300 }),
  ]);

  const txRows = Array.isArray(txRes.data) ? txRes.data : [];
  const seenLedger = new Set(txRows.map((r) => r.ledger_id).filter(Boolean));
  const merged = [...txRows];
  for (const row of orphans) {
    if (!seenLedger.has(row.ledger_id)) merged.push(row);
  }
  merged.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));

  const page = merged.slice(offset, offset + limit);
  const orphanCount = orphans.length;
  const txTotal = txRes.total ?? txRows.length;
  const total = userId ? merged.length : txTotal + orphanCount;

  return { rows: page, total, txTotal, orphanCount };
}

async function getCredits(limit, offset) {
  const { rows, total } = await fetchMergedCreditRows({ limit, offset });
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profileMap = new Map();
  if (ids.length) {
    const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
    const prof = await serviceFetch(
      `profiles?select=user_id,username,display_name&user_id=in.(${inClause})`,
    );
    for (const p of Array.isArray(prof.data) ? prof.data : []) {
      profileMap.set(p.user_id, p);
    }
  }
  const transactions = hydrateCreditRows(rows, profileMap);
  return { transactions, total };
}

function inferGenerationKind(kind, requestDetail = "", prompt = "") {
  const k = String(kind || "").trim().toLowerCase();
  if (k && k !== "song" && k !== "other") return k;
  const blob = `${requestDetail}\n${prompt}`.toLowerCase();
  // Remix before cover: older hub remixes sometimes logged as vocal_full / bare song.
  if (
    /\bsong_remix\b/.test(blob) ||
    /\bremix-source\b/.test(blob) ||
    /"referencemode"\s*:\s*"song_remix"/.test(blob) ||
    (/upload-cover/.test(blob) && /\bsourceaudiourl\b/.test(blob)) ||
    (/upload-cover/.test(blob) && /\bremix\b/.test(String(prompt || "").toLowerCase()))
  ) {
    return "remix";
  }
  if (/\b(vocal_cover|song_cover|vocal_full|vocal_instrumental)\b/.test(blob)) return "cover";
  if (/\b(vocal_extend|song_extend)\b/.test(blob)) return "extend";
  if (/\b(split_stem|vocal.?remov|stem)\b/.test(blob) || /\/api\/v1\/vocal-removal\b/.test(blob)) {
    return "stems";
  }
  if (/\b(humming_music|humming_backing|underpainting|add.?instrumental)\b/.test(blob)) {
    return "instrumental";
  }
  return k || "song";
}

/** Hub remixes stamp meta.remixOf on the saved song — use that to relabel older logs. */
function songMetaLooksLikeRemix(meta) {
  if (!meta || typeof meta !== "object") return false;
  const remixOf = meta.remixOf || meta.remix_of;
  if (!remixOf || typeof remixOf !== "object") return false;
  return Boolean(
    String(remixOf.songId || remixOf.id || remixOf.title || remixOf.audioUrl || remixOf.creatorUsername || "").trim(),
  );
}

async function remixTaskIdSet(taskIds) {
  const ids = [...new Set((taskIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = new Set();
  if (!ids.length) return out;
  // Cap to keep the admin list query cheap.
  const batch = ids.slice(0, 80);
  const inClause = batch.map((id) => encodeURIComponent(id)).join(",");
  const res = await serviceFetch(
    `user_songs?select=task_id,meta&task_id=in.(${inClause})&limit=200`,
  );
  for (const row of Array.isArray(res.data) ? res.data : []) {
    const tid = String(row?.task_id || "").trim();
    if (tid && songMetaLooksLikeRemix(row.meta)) out.add(tid);
  }
  return out;
}

/**
 * Stems remix often debited credits but the generation log never landed
 * (fire-and-forget before Vercel froze). Surface those ledger rows so admin
 * can still see the remix happened.
 */
function mergeOrphanStemsRemixFromLedger(generations, ledgerRows, { userId = "", userLabel = "" } = {}) {
  const gens = Array.isArray(generations) ? [...generations] : [];
  const ledger = Array.isArray(ledgerRows) ? ledgerRows : [];
  const genTimes = gens
    .map((g) => Date.parse(String(g.createdAt || "")))
    .filter((t) => Number.isFinite(t));
  const orphans = [];
  for (const tx of ledger) {
    const reason = String(tx.reason || tx.p_reason || "").toLowerCase();
    if (reason !== "stems_remix") continue;
    const txMs = Date.parse(String(tx.createdAt || tx.created_at || ""));
    if (!Number.isFinite(txMs)) continue;
    const hasNearby = genTimes.some((t) => Math.abs(t - txMs) <= 3 * 60 * 1000);
    if (hasNearby) continue;
    const credits = Math.abs(Number(tx.delta || tx.creditsUsed || 0));
    orphans.push({
      id: `ledger-stems-remix-${txMs}`,
      userId: userId || tx.userId || "",
      userLabel: userLabel || "",
      taskId: "",
      kind: "remix",
      storedKind: "ledger",
      provider: "suno",
      prompt: "Hub / reference remix (recovered from credit ledger — generation log missing)",
      requestDetail: "",
      status: "completed",
      creditsUsed: credits || 12,
      providerCostUsd: null,
      errorMessage: "",
      createdAt: tx.createdAt || tx.created_at,
      completedAt: tx.createdAt || tx.created_at,
    });
    genTimes.push(txMs);
  }
  if (!orphans.length) return gens;
  return [...gens, ...orphans].sort(
    (a, b) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || "")),
  );
}

async function getGenerations(limit, offset, filters = {}) {
  const parts = [
    "music_generation_logs?select=id,user_id,task_id,kind,provider,prompt,request_detail,status,credits_used,provider_cost_usd,error_message,created_at,completed_at",
  ];
  const dateFrom = String(filters.dateFrom || "").trim();
  const dateTo = String(filters.dateTo || "").trim();
  const kind = String(filters.kind || "").trim().toLowerCase();
  const provider = String(filters.provider || "").trim().toLowerCase();
  const status = String(filters.status || "").trim().toLowerCase();
  if (dateFrom) parts.push(`created_at=gte.${encodeURIComponent(`${dateFrom}T00:00:00.000Z`)}`);
  if (dateTo) parts.push(`created_at=lte.${encodeURIComponent(`${dateTo}T23:59:59.999Z`)}`);
  // Kind filter uses stored kind; older cover/remix rows may still be "song".
  if (kind) parts.push(`kind=eq.${encodeURIComponent(kind)}`);
  if (provider) parts.push(`provider=eq.${encodeURIComponent(provider)}`);
  if (status && ["pending", "completed", "failed", "refunded"].includes(status)) {
    parts.push(`status=eq.${encodeURIComponent(status)}`);
  }
  parts.push(`order=created_at.desc&limit=${limit}&offset=${offset}`);
  const res = await serviceFetch(parts.join("&"));
  const rows = Array.isArray(res.data) ? res.data : [];
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profileMap = new Map();
  if (ids.length) {
    const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
    const prof = await serviceFetch(
      `profiles?select=user_id,username,display_name&user_id=in.(${inClause})`,
    );
    for (const p of Array.isArray(prof.data) ? prof.data : []) {
      profileMap.set(p.user_id, p);
    }
  }
  const generations = await (async () => {
    const mapped = rows.map((r) => {
      const p = profileMap.get(r.user_id) || {};
      return {
        id: r.id,
        userId: r.user_id,
        userLabel: String(p.display_name || p.username || "—"),
        taskId: r.task_id || "",
        kind: inferGenerationKind(r.kind, r.request_detail, r.prompt),
        storedKind: r.kind,
        provider: r.provider,
        prompt: r.prompt || "",
        requestDetail: r.request_detail || "",
        status: r.status,
        creditsUsed: Number(r.credits_used || 0),
        providerCostUsd: r.provider_cost_usd != null ? Number(r.provider_cost_usd) : null,
        errorMessage: r.error_message || "",
        createdAt: r.created_at,
        completedAt: r.completed_at,
      };
    });
    const needsSongLookup = mapped.filter((g) => g.kind === "song" || g.kind === "cover" || g.kind === "other");
    let withSongMeta = mapped;
    if (needsSongLookup.length) {
      const remixTasks = await remixTaskIdSet(needsSongLookup.map((g) => g.taskId));
      if (remixTasks.size) {
        withSongMeta = mapped.map((g) => {
          const tid = String(g.taskId || "").trim();
          if (tid && remixTasks.has(tid) && (g.kind === "song" || g.kind === "cover" || g.kind === "other")) {
            return { ...g, kind: "remix" };
          }
          return g;
        });
      }
    }

    // Recover remixes that charged stems_remix but never wrote a generation log.
    if (!provider || provider === "suno") {
      if (!kind || kind === "remix") {
        const ledgerParts = [
          "credits_transactions?select=id,user_id,delta,reason,created_at",
          "reason=eq.stems_remix",
          "order=created_at.desc",
          "limit=120",
        ];
        if (dateFrom) ledgerParts.push(`created_at=gte.${encodeURIComponent(`${dateFrom}T00:00:00.000Z`)}`);
        if (dateTo) ledgerParts.push(`created_at=lte.${encodeURIComponent(`${dateTo}T23:59:59.999Z`)}`);
        const ledgerRes = await serviceFetch(ledgerParts.join("&"));
        const ledgerRows = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];
        if (ledgerRows.length) {
          const orphanUserIds = [...new Set(ledgerRows.map((r) => r.user_id).filter(Boolean))];
          const missingProfileIds = orphanUserIds.filter((id) => !profileMap.has(id));
          if (missingProfileIds.length) {
            const inClause = missingProfileIds.map((id) => encodeURIComponent(id)).join(",");
            const prof = await serviceFetch(
              `profiles?select=user_id,username,display_name&user_id=in.(${inClause})`,
            );
            for (const p of Array.isArray(prof.data) ? prof.data : []) {
              profileMap.set(p.user_id, p);
            }
          }
          // Merge per user so "nearby log" checks stay accurate.
          const byUser = new Map();
          for (const g of withSongMeta) {
            const uid = String(g.userId || "");
            if (!byUser.has(uid)) byUser.set(uid, []);
            byUser.get(uid).push(g);
          }
          const merged = [];
          const seenUsers = new Set();
          for (const tx of ledgerRows) {
            const uid = String(tx.user_id || "");
            if (!seenUsers.has(uid)) {
              seenUsers.add(uid);
              const userGens = byUser.get(uid) || [];
              const userLedger = ledgerRows.filter((r) => String(r.user_id || "") === uid);
              const p = profileMap.get(uid) || {};
              const combined = mergeOrphanStemsRemixFromLedger(userGens, userLedger, {
                userId: uid,
                userLabel: String(p.display_name || p.username || "—"),
              });
              merged.push(...combined);
            }
          }
          for (const [uid, userGens] of byUser) {
            if (!seenUsers.has(uid)) merged.push(...userGens);
          }
          withSongMeta = merged.sort(
            (a, b) => Date.parse(String(b.createdAt || "")) - Date.parse(String(a.createdAt || "")),
          );
        }
      }
    }

    if (kind) {
      return withSongMeta.filter((g) => String(g.kind || "") === kind);
    }
    if (status) {
      return withSongMeta.filter((g) => String(g.status || "") === status);
    }
    return withSongMeta;
  })();
  return { generations, total: res.total ?? generations.length, filters: { dateFrom, dateTo, kind, provider, status } };
}

async function getPublications(limit, offset, search = "") {
  const q = String(search || "").trim();
  let queryPath =
    "user_songs?select=id,user_id,title,art_url,song_url,task_id,audio_id,kind,meta,public_on_profile,published_at,created_at&public_on_profile=eq.true";

  if (q.length >= 2) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRe.test(q)) {
      queryPath += `&id=eq.${encodeURIComponent(q)}`;
    } else {
      const needle = escapeLike(searchNeedle(q));
      const orParts = [];
      if (needle.length >= 2) orParts.push(`title.ilike.*${needle}*`);
      const userIds = await adminSearchUserIds(q, { limit: 40 });
      if (userIds.length) {
        const inClause = userIds.map((id) => encodeURIComponent(id)).join(",");
        orParts.push(`user_id.in.(${inClause})`);
      }
      if (!orParts.length) return { publications: [], total: 0 };
      queryPath += `&or=(${orParts.join(",")})`;
    }
  }

  queryPath += `&order=published_at.desc.nullslast,created_at.desc&limit=${limit}&offset=${offset}`;
  const res = await serviceFetch(queryPath);
  const rows = Array.isArray(res.data) ? res.data : [];
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  let profileMap = new Map();
  const authMap = await fetchAuthUsersMap();
  if (ids.length) {
    const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
    const prof = await serviceFetch(
      `profiles?select=user_id,username,display_name&user_id=in.(${inClause})`,
    );
    for (const p of Array.isArray(prof.data) ? prof.data : []) {
      profileMap.set(p.user_id, p);
    }
  }

  const publications = rows.map((r) => {
    const p = profileMap.get(r.user_id) || {};
    const auth = authMap.get(r.user_id) || {};
    const username = String(p.username || "").trim();
    const meta = r.meta && typeof r.meta === "object" ? r.meta : {};
    const releaseCaption = String(meta.releaseCaption || "").trim();
    const profileUrl = username ? `https://www.nabadai.com/#/u/${encodeURIComponent(username)}` : "";
    const shareUrl = r.id ? `https://www.nabadai.com/s/${encodeURIComponent(r.id)}` : "";
    return {
      id: r.id,
      userId: r.user_id,
      userLabel: String(p.display_name || p.username || "—"),
      username,
      email: auth.email || "",
      title: String(r.title || "Untitled").trim() || "Untitled",
      releaseCaption,
      kind: String(r.kind || "full").trim(),
      taskId: String(r.task_id || "").trim(),
      audioId: String(r.audio_id || "").trim(),
      artUrl: String(r.art_url || "").trim(),
      songUrl: String(r.song_url || "").trim(),
      publishedAt: r.published_at || null,
      createdAt: r.created_at || null,
      profileUrl,
      shareUrl,
    };
  });

  return { publications, total: res.total ?? publications.length };
}

async function getSubscriptions(limit, offset) {
  const res = await serviceFetch(
    `pro_subscriptions?select=user_id,provider,plan_id,status,current_period_end,provider_subscription_id,created_at,updated_at&order=updated_at.desc&limit=${limit}&offset=${offset}`,
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  const ids = rows.map((r) => r.user_id).filter(Boolean);
  const authMap = await fetchAuthUsersMap();
  let profileMap = new Map();
  if (ids.length) {
    const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
    const prof = await serviceFetch(
      `profiles?select=user_id,username,display_name&user_id=in.(${inClause})`,
    );
    for (const p of Array.isArray(prof.data) ? prof.data : []) {
      profileMap.set(p.user_id, p);
    }
  }
  const subscriptions = rows.map((r) => {
    const p = profileMap.get(r.user_id) || {};
    const auth = authMap.get(r.user_id) || {};
    return {
      userId: r.user_id,
      userLabel: String(p.display_name || p.username || "—"),
      email: auth.email || "",
      provider: r.provider,
      planId: r.plan_id,
      status: r.status,
      statusLabel: r.status === "grace" ? "billing_retry" : r.status,
      currentPeriodEnd: r.current_period_end,
      providerSubscriptionId: r.provider_subscription_id || "",
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
  return { subscriptions, total: res.total ?? subscriptions.length };
}

function billingEventTypeLabel(eventType) {
  const t = String(eventType || "").trim().toUpperCase();
  const map = {
    INITIAL_PURCHASE: "Initial purchase",
    RENEWAL: "Renewal",
    PRODUCT_CHANGE: "Plan change",
    UNCANCELLATION: "Reactivated",
  };
  return map[t] || (t || "—");
}

async function getBillingSummary() {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const res = await serviceFetch(
    `billing_events?select=credits_granted,event_type,created_at&created_at=gte.${encodeURIComponent(weekAgo)}&order=created_at.desc&limit=1000`,
  );
  const rows = Array.isArray(res.data) ? res.data : [];
  let creditsGranted = 0;
  let eventCount = rows.length;
  let renewalCount = 0;
  for (const row of rows) {
    creditsGranted += Number(row.credits_granted || 0);
    if (String(row.event_type || "").toUpperCase() === "RENEWAL") renewalCount += 1;
  }
  return {
    windowDays: 7,
    eventCount,
    renewalCount,
    creditsGranted: Math.round(creditsGranted * 10) / 10,
  };
}

async function getBillingEvents(limit, offset, search) {
  const authMap = await fetchAuthUsersMap();
  const summary = await getBillingSummary();
  const q = String(search || "").trim();
  let path = `billing_events?select=id,user_id,provider,event_type,plan_id,product_id,credits_granted,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`;

  if (q.length >= 2) {
    const ids = await adminSearchUserIds(q, { authMap, limit: 100 });
    if (!ids.length) {
      return { billingEvents: [], total: 0, search: q, summary };
    }
    const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
    path = `billing_events?select=id,user_id,provider,event_type,plan_id,product_id,credits_granted,created_at&user_id=in.(${inClause})&order=created_at.desc&limit=${limit}&offset=${offset}`;
  }

  const res = await serviceFetch(path);
  const rows = Array.isArray(res.data) ? res.data : [];
  const ids = rows.map((r) => r.user_id).filter(Boolean);
  let profileMap = new Map();
  if (ids.length) {
    const inClause = ids.map((id) => encodeURIComponent(id)).join(",");
    const prof = await serviceFetch(
      `profiles?select=user_id,username,display_name&user_id=in.(${inClause})`,
    );
    for (const p of Array.isArray(prof.data) ? prof.data : []) {
      profileMap.set(p.user_id, p);
    }
  }

  const billingEvents = rows.map((r) => {
    const p = profileMap.get(r.user_id) || {};
    const auth = authMap.get(r.user_id) || {};
    const eventType = String(r.event_type || "").trim();
    return {
      id: r.id,
      userId: r.user_id,
      userLabel: String(p.display_name || p.username || "—"),
      email: auth.email || "",
      provider: r.provider || "—",
      eventType,
      eventTypeLabel: billingEventTypeLabel(eventType),
      planId: r.plan_id || "",
      productId: r.product_id || "",
      creditsGranted: Number(r.credits_granted || 0),
      createdAt: r.created_at,
    };
  });

  return {
    billingEvents,
    total: res.total ?? billingEvents.length,
    search: q.length >= 2 ? q : "",
    summary,
  };
}

async function getUserDetail(userIdInput, search = "") {
  let uid = cleanUserId(userIdInput);
  if (!uid && String(search || "").trim().length >= 2) {
    const resolved = await resolveUserLookup(search);
    uid = cleanUserId(resolved?.userId || "");
  }
  if (!uid) {
    return { user: null, error: "user_not_found" };
  }

  const enc = encodeURIComponent(uid);
  const authMap = await fetchAuthUsersMap();
  const auth = authMap.get(uid) || {};

  const [profRes, creditsRes, subRes, billingRes, ledgerMerged, gensRes, songsRes] = await Promise.all([
    serviceFetch(`profiles?select=user_id,username,display_name,role,last_active_at,created_at,signup_platform&user_id=eq.${enc}&limit=1`),
    serviceFetch(`user_credits?select=balance,paid_balance,gift_balance,promo_balance,updated_at&user_id=eq.${enc}&limit=1`),
    serviceFetch(`pro_subscriptions?select=provider,plan_id,status,current_period_end,provider_subscription_id,created_at,updated_at&user_id=eq.${enc}&limit=1`),
    serviceFetch(`billing_events?select=id,provider,event_type,plan_id,product_id,credits_granted,created_at&user_id=eq.${enc}&order=created_at.desc&limit=50`),
    fetchMergedCreditRows({ userId: uid, limit: 40, offset: 0 }),
    serviceFetch(`music_generation_logs?select=id,kind,provider,status,credits_used,error_message,prompt,request_detail,created_at&user_id=eq.${enc}&order=created_at.desc&limit=15`),
    serviceFetch(`user_songs?select=id,title,created_at,public_on_profile&user_id=eq.${enc}&order=created_at.desc&limit=12`),
  ]);

  const prof = Array.isArray(profRes.data) && profRes.data[0] ? profRes.data[0] : null;
  const cr = Array.isArray(creditsRes.data) && creditsRes.data[0] ? creditsRes.data[0] : null;
  const sub = Array.isArray(subRes.data) && subRes.data[0] ? subRes.data[0] : null;
  const billingRows = Array.isArray(billingRes.data) ? billingRes.data : [];

  const weekAgoMs = Date.now() - 7 * 86400000;
  const renewalsLast7d = billingRows.filter((row) => {
    if (String(row.event_type || "").toUpperCase() !== "RENEWAL") return false;
    const t = Date.parse(String(row.created_at || ""));
    return Number.isFinite(t) && t >= weekAgoMs;
  }).length;

  const billingEvents = billingRows.map((row) => ({
    id: row.id,
    provider: row.provider || "—",
    eventType: row.event_type || "",
    eventTypeLabel: billingEventTypeLabel(row.event_type),
    planId: row.plan_id || "",
    productId: row.product_id || "",
    creditsGranted: Number(row.credits_granted || 0),
    createdAt: row.created_at,
  }));

  const ledger = (ledgerMerged.rows || []).map((row) => ({
    delta: Number(row.delta || 0),
    balanceBefore: row.balance_before != null ? Number(row.balance_before) : null,
    balanceAfter: row.balance_after != null ? Number(row.balance_after) : null,
    reason: row.reason || "",
    ref: row.ref || "",
    createdAt: row.created_at,
  }));

  const generationsBase = (Array.isArray(gensRes.data) ? gensRes.data : []).map((row) => ({
    id: row.id,
    kind: inferGenerationKind(row.kind, row.request_detail, row.prompt),
    provider: row.provider || "",
    status: row.status || "",
    creditsUsed: Number(row.credits_used || 0),
    errorMessage: row.error_message || "",
    createdAt: row.created_at,
  }));
  const name = String(prof?.display_name || prof?.username || "—").trim() || "—";
  const generations = mergeOrphanStemsRemixFromLedger(generationsBase, ledger, {
    userId: uid,
    userLabel: name,
  });

  const songs = (Array.isArray(songsRes.data) ? songsRes.data : []).map((row) => ({
    id: row.id,
    title: row.title || "Untitled",
    createdAt: row.created_at,
    publicOnProfile: Boolean(row.public_on_profile),
  }));

  return {
    user: {
      userId: uid,
      name,
      username: prof?.username || "",
      email: auth.email || "",
      signupAt: auth.signupAt || prof?.created_at || null,
      role: prof?.role || "user",
      lastActiveAt: prof?.last_active_at || cr?.updated_at || null,
      signupPlatform: auth.signupPlatform || String(prof?.signup_platform || "").trim().toLowerCase() || null,
      profilePending: !prof,
    },
    credits: {
      balance: Number(cr?.balance || 0),
      paid: Number(cr?.paid_balance || 0),
      gift: Number(cr?.gift_balance || 0),
      promo: Number(cr?.promo_balance || 0),
      updatedAt: cr?.updated_at || null,
    },
    subscription: sub
      ? {
          provider: sub.provider || "—",
          planId: sub.plan_id || "",
          status: sub.status || "none",
          statusLabel: sub.status === "grace" ? "billing_retry" : (sub.status || "none"),
          currentPeriodEnd: sub.current_period_end || null,
          providerSubscriptionId: sub.provider_subscription_id || "",
          createdAt: sub.created_at || null,
          updatedAt: sub.updated_at || null,
        }
      : null,
    billingEvents,
    ledger,
    generations,
    songs,
    insights: {
      renewalsLast7d,
      sandboxLikely: renewalsLast7d >= 3 && String(sub?.plan_id || "") === "weekly",
      billingEventCount: billingEvents.length,
      songsSaved: songs.length,
    },
  };
}

async function getGenerationDetail(generationIdInput) {
  const gid = cleanGenerationId(generationIdInput);
  if (!gid) {
    return { generation: null, error: "generation_not_found" };
  }

  const enc = encodeURIComponent(gid);
  const logRes = await serviceFetch(
    `music_generation_logs?select=id,user_id,task_id,kind,provider,prompt,request_detail,status,credits_used,provider_cost_usd,error_message,created_at,completed_at&id=eq.${enc}&limit=1`,
  );
  const row = Array.isArray(logRes.data) && logRes.data[0] ? logRes.data[0] : null;
  if (!row) {
    return { generation: null, error: "generation_not_found" };
  }

  const uid = row.user_id;
  const taskId = String(row.task_id || "").trim();
  const createdMs = Date.parse(String(row.created_at || ""));
  const completedMs = Date.parse(String(row.completed_at || ""));
  const anchorMs = Number.isFinite(completedMs) ? completedMs : (Number.isFinite(createdMs) ? createdMs : Date.now());
  const windowStart = new Date(anchorMs - 15 * 60000).toISOString();
  const windowEnd = new Date(anchorMs + 15 * 60000).toISOString();
  const uidEnc = encodeURIComponent(uid);
  const allowedReasons = new Set(kindCreditReasons(row.kind));

  const [authMap, profRes, ledgerRes, songsRes] = await Promise.all([
    fetchAuthUsersMap(),
    serviceFetch(`profiles?select=user_id,username,display_name&user_id=eq.${uidEnc}&limit=1`),
    serviceFetch(
      `credits_transactions?select=delta,balance_before,balance_after,reason,ref,created_at&user_id=eq.${uidEnc}&created_at=gte.${encodeURIComponent(windowStart)}&created_at=lte.${encodeURIComponent(windowEnd)}&order=created_at.desc&limit=30`,
    ),
    taskId
      ? serviceFetch(
          `user_songs?select=id,title,song_url,art_url,task_id,audio_id,kind,meta,public_on_profile,created_at&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.desc&limit=6`,
        )
      : Promise.resolve({ data: [] }),
  ]);

  const prof = Array.isArray(profRes.data) && profRes.data[0] ? profRes.data[0] : null;
  const auth = authMap.get(uid) || {};
  const name = String(prof?.display_name || prof?.username || "—").trim() || "—";

  const ledgerAll = (Array.isArray(ledgerRes.data) ? ledgerRes.data : []).map((tx) => ({
    delta: Number(tx.delta || 0),
    balanceBefore: Number(tx.balance_before || 0),
    balanceAfter: Number(tx.balance_after || 0),
    reason: tx.reason || "",
    ref: tx.ref || "",
    createdAt: tx.created_at,
  }));

  const ledger = ledgerAll.filter((tx) => {
    if (allowedReasons.has(tx.reason)) return true;
    if (taskId && tx.ref && String(tx.ref).includes(taskId)) return true;
    return false;
  });

  const songRows = Array.isArray(songsRes.data) ? songsRes.data : [];
  const songs = songRows.map((s) => {
    const songId = s.id;
    return {
      id: songId,
      title: String(s.title || "Untitled").trim() || "Untitled",
      songUrl: String(s.song_url || "").trim(),
      artUrl: String(s.art_url || "").trim(),
      taskId: String(s.task_id || "").trim(),
      audioId: String(s.audio_id || "").trim(),
      kind: String(s.kind || "").trim(),
      publicOnProfile: Boolean(s.public_on_profile),
      createdAt: s.created_at,
      shareUrl: songId ? `https://www.nabadai.com/s/${encodeURIComponent(songId)}` : "",
    };
  });
  let inferredKind = inferGenerationKind(row.kind, row.request_detail, row.prompt);
  if (
    (inferredKind === "song" || inferredKind === "cover" || inferredKind === "other") &&
    songRows.some((s) => songMetaLooksLikeRemix(s.meta))
  ) {
    inferredKind = "remix";
  }

  const durationMs = Number.isFinite(completedMs) && Number.isFinite(createdMs)
    ? completedMs - createdMs
    : null;

  return {
    generation: {
      id: row.id,
      userId: uid,
      userLabel: name,
      username: prof?.username || "",
      email: auth.email || "",
      taskId,
      kind: inferredKind,
      provider: row.provider || "",
      prompt: row.prompt || "",
      requestDetail: row.request_detail || "",
      status: row.status || "",
      creditsUsed: Number(row.credits_used || 0),
      providerCostUsd: row.provider_cost_usd != null ? Number(row.provider_cost_usd) : null,
      errorMessage: row.error_message || "",
      createdAt: row.created_at,
      completedAt: row.completed_at,
      durationMs,
    },
    ledger,
    songs,
  };
}

async function getSunoPanel() {
  const [masterSuno, summaryRpc, recentGens] = await Promise.all([
    fetchSunoMasterBalance(),
    callRpc("get_credits_summary", {}),
    serviceFetch("music_generation_logs?select=credits_used,status,created_at&order=created_at.desc&limit=500"),
  ]);
  const summary = (summaryRpc.ok && summaryRpc.data) || {};
  const outstanding = Number(summary.outstanding || 0);
  const spent = Number(summary.spent_total || 0);

  let spentLast7d = 0;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  if (Array.isArray(recentGens.data)) {
    for (const row of recentGens.data) {
      if (row.created_at >= weekAgo && row.status !== "refunded") {
        spentLast7d += Number(row.credits_used || 0);
      }
    }
  }

  const dailyBurn = spentLast7d / 7;
  const proLiability = await fetchProSubscriberLiability();
  const coverage = sunoCoverageMetrics(masterSuno, proLiability.guaranteedCredits);
  const runwayDays = masterSuno != null && dailyBurn > 0
    ? Math.floor((masterSuno - proLiability.guaranteedCredits) / dailyBurn)
    : null;

  return {
    ...coverage,
    remainingCredits: proLiability.remainingCredits,
    allUserOutstanding: outstanding,
    userOutstanding: outstanding,
    proSubscriberCount: proLiability.subscriberCount,
    proSubscribers: proLiability.subscribers,
    userSpentAllTime: spent,
    burnLast7d: Math.round(spentLast7d * 10) / 10,
    avgDailyBurn: Math.round(dailyBurn * 10) / 10,
    runwayDaysEstimate: runwayDays,
    note: "Guaranteed = full plan credits you owe each active Pro subscriber the moment they subscribe (400 weekly trial / 1,200 monthly). Buy from Suno when bucket is below guaranteed — don't wait until zero.",
  };
}

async function fetchCoverArtAdminLog({ limit = 50 } = {}) {
  const lim = clampInt(limit, 1, 100, 50);
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();

  const [recentRes, statsRes] = await Promise.all([
    serviceFetch(
      `provider_usage_events?select=id,provider,kind,amount_usd,user_id,status,ref,created_at&kind=in.(cover_image,cover_scene)&order=created_at.desc&limit=${lim}`,
    ),
    serviceFetch(
      `provider_usage_events?select=provider,created_at&kind=eq.cover_image&status=eq.completed&created_at=gte.${encodeURIComponent(d30)}&order=created_at.desc&limit=5000`,
    ),
  ]);

  const rows = Array.isArray(recentRes.data) ? recentRes.data : [];
  const statsRows = Array.isArray(statsRes.data) ? statsRes.data : [];

  const emptyCounts = () => ({ cloudflare: 0, pollinations: 0, gemini: 0, other: 0 });
  const stats = { last7d: emptyCounts(), last30d: emptyCounts() };

  for (const row of statsRows) {
    const p = String(row.provider || "other").toLowerCase();
    const bucket = stats.last30d[p] != null ? p : "other";
    stats.last30d[bucket] += 1;
    if (row.created_at >= d7) {
      const b7 = stats.last7d[p] != null ? p : "other";
      stats.last7d[b7] += 1;
    }
  }

  const userIds = [...new Set(rows.map((r) => cleanUserId(r.user_id)).filter(Boolean))];
  const emailByUser = {};
  if (userIds.length) {
    const profRes = await serviceFetch(
      `profiles?select=user_id,email,username&user_id=in.(${userIds.join(",")})`,
    );
    for (const p of Array.isArray(profRes.data) ? profRes.data : []) {
      const uid = cleanUserId(p.user_id);
      if (!uid) continue;
      emailByUser[uid] = String(p.email || p.username || "").trim();
    }
  }

  return {
    config: {
      defaultCoverProvider: resolveDefaultCoverImageProvider(),
      regenImageProvider: resolveCoverRegenImageProvider(),
      cloudflareConfigured: isCloudflareFluxConfigured(),
      coverImageProviderEnv: String(process.env.COVER_IMAGE_PROVIDER || "").trim() || "(auto)",
      regenProviderEnv: String(process.env.COVER_REGEN_IMAGE_PROVIDER || "").trim() || "(auto)",
    },
    stats,
    rows: rows.map((row) => {
      const provider = String(row.provider || "").toLowerCase();
      const uid = cleanUserId(row.user_id);
      return {
        id: row.id,
        provider,
        providerLabel: COVER_PROVIDER_LABELS[provider] || provider || "—",
        kind: row.kind,
        kindLabel: row.kind === "cover_scene" ? "Scene prompt" : "Cover image",
        amountUsd: row.amount_usd != null ? roundUsd(row.amount_usd) : null,
        userId: uid,
        userEmail: emailByUser[uid] || "",
        songId: String(row.ref || "").trim(),
        status: row.status || "completed",
        failed: String(row.status || "").toLowerCase() === "failed",
        createdAt: row.created_at,
      };
    }),
  };
}

async function getProvidersPanel({ forceHealth = false } = {}) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const [health, failRes, spendData, coverArtLog] = await Promise.all([
    getProviderHealth({ force: forceHealth }),
    serviceFetch(
      `music_generation_logs?select=provider,status&created_at=gte.${encodeURIComponent(since)}&status=eq.failed&limit=1000`,
    ),
    fetchProviderSpendData({ callRpc, serviceFetch }),
    fetchCoverArtAdminLog({ limit: 50 }),
  ]);
  const rolledUp = rollupGeminiLyriaSpendData({
    spendByProvider: spendData.spendByProvider,
    topUpsByProvider: spendData.topUpsByProvider,
  });
  const geminiWallet = await computeGeminiSharedWalletBalance({
    serviceFetch,
    toppedUpUsd: rolledUp.topUpsByProvider?.gemini?.toppedUpUsd || 0,
  });

  const failures24h = {};
  for (const row of Array.isArray(failRes.data) ? failRes.data : []) {
    const p = String(row.provider || "unknown").toLowerCase();
    failures24h[p] = (failures24h[p] || 0) + 1;
  }
  if (failures24h.lyria) {
    failures24h.gemini = (failures24h.gemini || 0) + failures24h.lyria;
    delete failures24h.lyria;
  }

  const liveBalances = {};
  for (const p of health.providers || []) {
    const live = p.liveBalance;
    if (live?.source === "api") {
      liveBalances[p.id] = live;
    }
  }
  if (geminiWallet) {
    liveBalances.gemini = geminiWallet;
  }

  const spendRows = mergeProviderSpend({
    spendByProvider: rolledUp.spendByProvider,
    topUpsByProvider: rolledUp.topUpsByProvider,
    liveBalances,
  });
  const spendById = Object.fromEntries(spendRows.map((r) => [r.id, r]));

  const providers = (health.providers || []).map((p) => ({
    ...p,
    failures24h: Number(failures24h[p.id] || 0),
    spend: spendById[p.id] || {},
  }));

  return {
    health: {
      ...health,
      providers,
    },
    spend: {
      rows: spendRows,
      recentTopUps: spendData.recentTopUps,
      source: spendData.spendSource,
    },
    coverArtLog,
    failures24h,
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" });

  const url = new URL(req.url || "/", "http://localhost");
  const view = String(url.searchParams.get("view") || "overview").trim().toLowerCase();
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);
  const offset = clampInt(url.searchParams.get("offset"), 0, 100000, 0);
  const search = String(url.searchParams.get("search") || "").trim();
  const userId = String(url.searchParams.get("userId") || "").trim();
  const generationId = String(url.searchParams.get("generationId") || "").trim();
  const genDateFrom = String(url.searchParams.get("dateFrom") || "").trim();
  const genDateTo = String(url.searchParams.get("dateTo") || "").trim();
  const genKind = String(url.searchParams.get("kind") || "").trim().toLowerCase();
  const genProvider = String(url.searchParams.get("provider") || "").trim().toLowerCase();
  const genStatus = String(url.searchParams.get("status") || "").trim().toLowerCase();
  const healthRefresh = String(url.searchParams.get("healthRefresh") || "").trim() === "1";

  const adminView = view === "user" ? "user" : view === "generation" ? "generation" : view === "suno" ? "providers" : view;
  const admin = await verifyAdmin(req, { view: adminView === "session" ? null : adminView });
  if (!admin) {
    const user = await verifyUser(req);
    if (!user) return adminUnauthorized(res);
    return adminForbidden(res, view === "settings"
      ? "Only Owner / Admin can open Settings."
      : "You do not have access to this section.");
  }

  try {
    let payload = {
      ok: true,
      view,
      session: {
        email: admin.email,
        userId: admin.userId,
        role: admin.role,
        roleLabel: admin.roleLabel,
        isOwner: admin.isOwner,
        canManageTeam: admin.canManageTeam,
        canGrantCredits: admin.canGrantCredits,
        canModeratePublications: admin.canModeratePublications,
        allowedViews: admin.allowedViews,
      },
    };

    if (view === "session") {
      payload.roles = listAssignableRoles();
      return sendJson(res, 200, payload);
    }

    if (view === "settings") {
      payload.roles = listAssignableRoles();
      return sendJson(res, 200, payload);
    }

    if (view === "overview") {
      payload.overview = await getOverview();
    } else if (view === "users") {
      payload = { ...payload, ...(await getUsers(limit, offset, search)) };
    } else if (view === "credits") {
      payload = { ...payload, ...(await getCredits(limit, offset)) };
    } else if (view === "generations") {
      payload = {
        ...payload,
        ...(await getGenerations(limit, offset, {
          dateFrom: genDateFrom,
          dateTo: genDateTo,
          kind: genKind,
          provider: genProvider,
          status: genStatus,
        })),
      };
    } else if (view === "subscriptions") {
      payload = { ...payload, ...(await getSubscriptions(limit, offset)) };
    } else if (view === "billing") {
      payload = { ...payload, ...(await getBillingEvents(limit, offset, search)) };
    } else if (view === "user") {
      payload = { ...payload, ...(await getUserDetail(userId, search)) };
    } else if (view === "generation") {
      payload = { ...payload, ...(await getGenerationDetail(generationId)) };
    } else if (view === "publications") {
      payload = { ...payload, ...(await getPublications(limit, offset, search)) };
    } else if (view === "promos") {
      payload = { ...payload, ...(await getPromos(limit, offset)) };
    } else if (view === "singers") {
      payload = { ...payload, ...(await getSingers(limit, offset)) };
    } else if (view === "providers" || view === "suno") {
      payload = { ...payload, ...(await getProvidersPanel({ forceHealth: healthRefresh })) };
    } else {
      return sendJson(res, 400, {
        error: "Unknown view",
        allowed: ["session", "settings", "overview", "providers", "users", "user", "credits", "promos", "singers", "generations", "generation", "subscriptions", "billing", "publications", "suno"],
      });
    }
    return sendJson(res, 200, payload);
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
