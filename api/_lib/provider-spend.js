/**
 * Admin provider spend — consumption from generation logs + manual top-up ledger.
 */

const { SUNO_USD_PER_CREDIT } = require("./music-generation-log");

const PROVIDER_SPEND_IDS = Object.freeze([
  "suno",
  "lyria",
  "elevenlabs",
  "gemini",
  "pollinations",
]);

/** Map music_generation_logs provider values onto catalog ids. */
const LOG_PROVIDER_ALIASES = Object.freeze({
  minimax: "other",
});

function emptySpendRow() {
  return {
    consumedUsdToday: 0,
    consumedUsd7d: 0,
    consumedUsd30d: 0,
    consumedUsdAll: 0,
    generations30d: 0,
  };
}

function emptyTopUpRow() {
  return {
    toppedUpUsd: 0,
    toppedUpCredits: 0,
    topUpCount: 0,
  };
}

function roundUsd(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function normalizeLogProvider(provider) {
  const p = String(provider || "other").trim().toLowerCase();
  return LOG_PROVIDER_ALIASES[p] || p;
}

function aggregateSpendFromLogs(rows = []) {
  const byProvider = {};
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const d30 = new Date(now - 30 * 86400000).toISOString();

  for (const row of rows) {
    if (String(row.status || "").toLowerCase() === "refunded") continue;
    const p = normalizeLogProvider(row.provider);
    if (!byProvider[p]) byProvider[p] = emptySpendRow();

    let usd = row.provider_cost_usd != null ? Number(row.provider_cost_usd) : NaN;
    if (!Number.isFinite(usd)) {
      if (p === "suno") {
        usd = Number(row.credits_used || 0) * SUNO_USD_PER_CREDIT;
      } else {
        usd = 0;
      }
    }
    if (!Number.isFinite(usd)) continue;

    const s = byProvider[p];
    s.consumedUsdAll += usd;
    if (row.created_at >= d30) {
      s.consumedUsd30d += usd;
      s.generations30d += 1;
    }
    if (row.created_at >= d7) s.consumedUsd7d += usd;
    if (row.created_at >= dayStartIso) s.consumedUsdToday += usd;
  }

  for (const key of Object.keys(byProvider)) {
    const s = byProvider[key];
    s.consumedUsdToday = roundUsd(s.consumedUsdToday);
    s.consumedUsd7d = roundUsd(s.consumedUsd7d);
    s.consumedUsd30d = roundUsd(s.consumedUsd30d);
    s.consumedUsdAll = roundUsd(s.consumedUsdAll);
  }
  return byProvider;
}

function mergeUsageIntoSpend(spendByProvider, usageRows = []) {
  for (const row of usageRows) {
    const p = String(row.provider || "").trim().toLowerCase();
    if (!p) continue;
    if (!spendByProvider[p]) spendByProvider[p] = emptySpendRow();
    const usd = Number(row.amount_usd || 0);
    if (!Number.isFinite(usd)) continue;
    const createdAt = row.created_at;
    const s = spendByProvider[p];
    s.consumedUsdAll += usd;
    const now = Date.now();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const d7 = new Date(now - 7 * 86400000).toISOString();
    const d30 = new Date(now - 30 * 86400000).toISOString();
    if (createdAt >= d30) s.consumedUsd30d += usd;
    if (createdAt >= d7) s.consumedUsd7d += usd;
    if (createdAt >= dayStart.toISOString()) s.consumedUsdToday += usd;
  }
  for (const key of Object.keys(spendByProvider)) {
    const s = spendByProvider[key];
    s.consumedUsdToday = roundUsd(s.consumedUsdToday);
    s.consumedUsd7d = roundUsd(s.consumedUsd7d);
    s.consumedUsd30d = roundUsd(s.consumedUsd30d);
    s.consumedUsdAll = roundUsd(s.consumedUsdAll);
  }
  return spendByProvider;
}

function mapRpcSpendRows(rows = []) {
  const byProvider = {};
  for (const row of rows) {
    const p = normalizeLogProvider(row.provider);
    byProvider[p] = {
      consumedUsdToday: roundUsd(row.consumed_usd_today),
      consumedUsd7d: roundUsd(row.consumed_usd_7d),
      consumedUsd30d: roundUsd(row.consumed_usd_30d),
      consumedUsdAll: roundUsd(row.consumed_usd_all),
      generations30d: Number(row.generations_30d || 0),
    };
  }
  return byProvider;
}

function mapRpcTopUpRows(rows = []) {
  const byProvider = {};
  for (const row of rows) {
    const p = String(row.provider || "").trim().toLowerCase();
    byProvider[p] = {
      toppedUpUsd: roundUsd(row.topped_up_usd),
      toppedUpCredits: Math.round(Number(row.topped_up_credits || 0) * 10) / 10,
      topUpCount: Number(row.top_up_count || 0),
    };
  }
  return byProvider;
}

function mergeProviderSpend({ catalogIds = PROVIDER_SPEND_IDS, spendByProvider = {}, topUpsByProvider = {}, liveBalances = {} } = {}) {
  return catalogIds.map((id) => {
    const spend = spendByProvider[id] || emptySpendRow();
    const topUps = topUpsByProvider[id] || emptyTopUpRow();
    const live = liveBalances[id] || null;

    let balanceLabel = "—";
    let balanceDetail = "";
    let estimatedRemainingUsd = null;

    if (id === "suno" && live?.credits != null) {
      balanceLabel = `${live.credits} cr`;
      balanceDetail = live.usd != null ? `≈ ${live.usd}` : "";
    } else if (topUps.toppedUpUsd > 0 || topUps.toppedUpCredits > 0) {
      estimatedRemainingUsd = roundUsd(topUps.toppedUpUsd - spend.consumedUsdAll);
      balanceLabel = fmtUsd(estimatedRemainingUsd);
      balanceDetail = "est. (top-ups − usage)";
    }

    const tracksUsage = ["suno", "lyria", "elevenlabs", "gemini", "pollinations"].includes(id);
    const usageNote = tracksUsage
      ? ""
      : "Usage not logged for this vendor yet.";

    return {
      id,
      ...spend,
      ...topUps,
      balanceLabel,
      balanceDetail,
      estimatedRemainingUsd,
      usageNote,
      tracksUsage,
    };
  });
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

async function fetchProviderSpendData({ callRpc, serviceFetch } = {}) {
  let spendByProvider = {};
  let topUpsByProvider = {};
  let recentTopUps = [];
  let spendSource = "rpc";

  const [spendRpc, topUpRpc, recentRes] = await Promise.all([
    callRpc ? callRpc("get_provider_spend_summary", {}) : { ok: false },
    callRpc ? callRpc("get_provider_top_up_summary", {}) : { ok: false },
    serviceFetch
      ? serviceFetch(
        "provider_wallet_events?select=id,provider,event_type,amount_usd,amount_credits,note,logged_by_email,created_at&order=created_at.desc&limit=20",
      )
      : { ok: false },
  ]);

  if (spendRpc?.ok && Array.isArray(spendRpc.data)) {
    spendByProvider = mapRpcSpendRows(spendRpc.data);
  } else if (serviceFetch) {
    spendSource = "logs";
    const logsRes = await serviceFetch(
      "music_generation_logs?select=provider,provider_cost_usd,credits_used,status,created_at&status=neq.refunded&order=created_at.desc&limit=10000",
    );
    spendByProvider = aggregateSpendFromLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
    const usageRes = await serviceFetch(
      "provider_usage_events?select=provider,amount_usd,created_at&status=eq.completed&order=created_at.desc&limit=10000",
    );
    if (Array.isArray(usageRes.data) && usageRes.data.length) {
      mergeUsageIntoSpend(spendByProvider, usageRes.data);
    }
  }

  if (topUpRpc?.ok && Array.isArray(topUpRpc.data)) {
    topUpsByProvider = mapRpcTopUpRows(topUpRpc.data);
  } else if (serviceFetch) {
    const topRes = await serviceFetch(
      "provider_wallet_events?select=provider,amount_usd,amount_credits,event_type&event_type=in.(top_up,adjustment)&limit=5000",
    );
    const agg = {};
    for (const row of Array.isArray(topRes.data) ? topRes.data : []) {
      const p = String(row.provider || "").trim().toLowerCase();
      if (!agg[p]) agg[p] = emptyTopUpRow();
      agg[p].toppedUpUsd += Number(row.amount_usd || 0);
      agg[p].toppedUpCredits += Number(row.amount_credits || 0);
      agg[p].topUpCount += 1;
    }
    for (const key of Object.keys(agg)) {
      agg[key].toppedUpUsd = roundUsd(agg[key].toppedUpUsd);
      agg[key].toppedUpCredits = Math.round(agg[key].toppedUpCredits * 10) / 10;
    }
    topUpsByProvider = agg;
  }

  if (recentRes?.ok && Array.isArray(recentRes.data)) {
    recentTopUps = recentRes.data.map((row) => ({
      id: row.id,
      provider: row.provider,
      eventType: row.event_type,
      amountUsd: row.amount_usd != null ? roundUsd(row.amount_usd) : null,
      amountCredits: row.amount_credits != null ? Number(row.amount_credits) : null,
      note: row.note || "",
      loggedByEmail: row.logged_by_email || "",
      createdAt: row.created_at,
    }));
  }

  return {
    spendByProvider,
    topUpsByProvider,
    recentTopUps,
    spendSource,
  };
}

module.exports = {
  PROVIDER_SPEND_IDS,
  aggregateSpendFromLogs,
  mergeUsageIntoSpend,
  fetchProviderSpendData,
  mergeProviderSpend,
  roundUsd,
};
