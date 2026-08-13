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
 *   search     — users / billing views: email, @username, or display name
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
const { adminSearchUserIds, resolveUserLookup } = require("../../_lib/admin-user-resolve");

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
    hum_track: ["full_song", "refund_full_song"],
    instrumental: ["full_song", "refund_full_song"],
    music_video: ["full_song", "refund_full_song"],
    studio_guide: ["full_song", "refund_full_song"],
    stems: ["stems", "refund_stems"],
    persona: ["persona", "refund_persona"],
    sound: ["sound", "refund_sound"],
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

async function getCredits(limit, offset) {
  const res = await serviceFetch(
    `credits_transactions?select=id,user_id,delta,balance_before,balance_after,reason,ref,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
  );
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
  const transactions = rows.map((r) => {
    const p = profileMap.get(r.user_id) || {};
    return {
      ...r,
      delta: Number(r.delta),
      balanceBefore: Number(r.balance_before),
      balanceAfter: Number(r.balance_after),
      userLabel: String(p.display_name || p.username || r.user_id?.slice(0, 8) || "—"),
    };
  });
  return { transactions, total: res.total ?? transactions.length };
}

async function getGenerations(limit, offset) {
  const res = await serviceFetch(
    `music_generation_logs?select=id,user_id,task_id,kind,provider,prompt,status,credits_used,provider_cost_usd,error_message,created_at,completed_at&order=created_at.desc&limit=${limit}&offset=${offset}`,
  );
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
  const generations = rows.map((r) => {
    const p = profileMap.get(r.user_id) || {};
    return {
      id: r.id,
      userId: r.user_id,
      userLabel: String(p.display_name || p.username || "—"),
      taskId: r.task_id || "",
      kind: r.kind,
      provider: r.provider,
      prompt: r.prompt || "",
      status: r.status,
      creditsUsed: Number(r.credits_used || 0),
      providerCostUsd: r.provider_cost_usd != null ? Number(r.provider_cost_usd) : null,
      errorMessage: r.error_message || "",
      createdAt: r.created_at,
      completedAt: r.completed_at,
    };
  });
  return { generations, total: res.total ?? generations.length };
}

async function getPublications(limit, offset) {
  const res = await serviceFetch(
    `user_songs?select=id,user_id,title,art_url,song_url,task_id,audio_id,kind,meta,public_on_profile,published_at,created_at&public_on_profile=eq.true&order=published_at.desc.nullslast,created_at.desc&limit=${limit}&offset=${offset}`,
  );
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

  const [profRes, creditsRes, subRes, billingRes, ledgerRes, gensRes, songsRes] = await Promise.all([
    serviceFetch(`profiles?select=user_id,username,display_name,role,last_active_at,created_at,signup_platform&user_id=eq.${enc}&limit=1`),
    serviceFetch(`user_credits?select=balance,paid_balance,gift_balance,promo_balance,updated_at&user_id=eq.${enc}&limit=1`),
    serviceFetch(`pro_subscriptions?select=provider,plan_id,status,current_period_end,provider_subscription_id,created_at,updated_at&user_id=eq.${enc}&limit=1`),
    serviceFetch(`billing_events?select=id,provider,event_type,plan_id,product_id,credits_granted,created_at&user_id=eq.${enc}&order=created_at.desc&limit=50`),
    serviceFetch(`credits_transactions?select=delta,balance_before,balance_after,reason,ref,created_at&user_id=eq.${enc}&order=created_at.desc&limit=40`),
    serviceFetch(`music_generation_logs?select=id,kind,provider,status,credits_used,error_message,created_at&user_id=eq.${enc}&order=created_at.desc&limit=15`),
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

  const ledger = (Array.isArray(ledgerRes.data) ? ledgerRes.data : []).map((row) => ({
    delta: Number(row.delta || 0),
    balanceBefore: Number(row.balance_before || 0),
    balanceAfter: Number(row.balance_after || 0),
    reason: row.reason || "",
    ref: row.ref || "",
    createdAt: row.created_at,
  }));

  const generations = (Array.isArray(gensRes.data) ? gensRes.data : []).map((row) => ({
    id: row.id,
    kind: row.kind || "",
    provider: row.provider || "",
    status: row.status || "",
    creditsUsed: Number(row.credits_used || 0),
    errorMessage: row.error_message || "",
    createdAt: row.created_at,
  }));

  const songs = (Array.isArray(songsRes.data) ? songsRes.data : []).map((row) => ({
    id: row.id,
    title: row.title || "Untitled",
    createdAt: row.created_at,
    publicOnProfile: Boolean(row.public_on_profile),
  }));

  const name = String(prof?.display_name || prof?.username || "—").trim() || "—";

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
    `music_generation_logs?select=id,user_id,task_id,kind,provider,prompt,status,credits_used,provider_cost_usd,error_message,created_at,completed_at&id=eq.${enc}&limit=1`,
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
          `user_songs?select=id,title,song_url,art_url,task_id,audio_id,kind,public_on_profile,created_at&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.desc&limit=6`,
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

  const songs = (Array.isArray(songsRes.data) ? songsRes.data : []).map((s) => {
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
      kind: row.kind || "",
      provider: row.provider || "",
      prompt: row.prompt || "",
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

  const adminView = view === "user" ? "user" : view === "generation" ? "generation" : view;
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
      payload = { ...payload, ...(await getGenerations(limit, offset)) };
    } else if (view === "subscriptions") {
      payload = { ...payload, ...(await getSubscriptions(limit, offset)) };
    } else if (view === "billing") {
      payload = { ...payload, ...(await getBillingEvents(limit, offset, search)) };
    } else if (view === "user") {
      payload = { ...payload, ...(await getUserDetail(userId, search)) };
    } else if (view === "generation") {
      payload = { ...payload, ...(await getGenerationDetail(generationId)) };
    } else if (view === "publications") {
      payload = { ...payload, ...(await getPublications(limit, offset)) };
    } else if (view === "promos") {
      payload = { ...payload, ...(await getPromos(limit, offset)) };
    } else if (view === "suno") {
      payload.suno = await getSunoPanel();
    } else {
      return sendJson(res, 400, {
        error: "Unknown view",
        allowed: ["session", "settings", "overview", "users", "user", "credits", "promos", "generations", "generation", "subscriptions", "billing", "publications", "suno"],
      });
    }
    return sendJson(res, 200, payload);
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
