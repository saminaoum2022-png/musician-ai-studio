/**
 * Shared Google Gemini API wallet — Lyria + Gemini use the same GEMINI_API_KEY and billing.
 * Google has no live balance API. Balance = top-ups (or AI Studio snapshot) − tracked usage.
 */

const GEMINI_WALLET_ID = "gemini";
const LYRIA_LOG_PROVIDER = "lyria";

function roundUsd(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function fmtUsdLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtSyncDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

async function fetchLatestGeminiSnapshot(serviceFetch) {
  if (!serviceFetch) return null;
  const res = await serviceFetch(
    "provider_wallet_events?select=amount_usd,created_at,logged_by_email,note&provider=eq.gemini&event_type=eq.balance_snapshot&order=created_at.desc&limit=1",
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row || row.amount_usd == null) return null;
  const usd = Number(row.amount_usd);
  if (!Number.isFinite(usd) || usd < 0) return null;
  return {
    amountUsd: usd,
    syncedAt: row.created_at,
    syncedBy: row.logged_by_email || "",
    note: row.note || "",
  };
}

async function fetchGeminiUsageSince(serviceFetch, sinceIso) {
  if (!serviceFetch || !sinceIso) return 0;
  let total = 0;

  const [usageRes, lyriaRes] = await Promise.all([
    serviceFetch(
      `provider_usage_events?select=amount_usd&provider=eq.gemini&status=eq.completed&created_at=gte.${encodeURIComponent(sinceIso)}&limit=5000`,
    ),
    serviceFetch(
      `music_generation_logs?select=provider_cost_usd&provider=eq.${LYRIA_LOG_PROVIDER}&status=neq.refunded&created_at=gte.${encodeURIComponent(sinceIso)}&limit=5000`,
    ),
  ]);

  for (const row of Array.isArray(usageRes.data) ? usageRes.data : []) {
    const usd = Number(row.amount_usd || 0);
    if (Number.isFinite(usd)) total += usd;
  }
  for (const row of Array.isArray(lyriaRes.data) ? lyriaRes.data : []) {
    const usd = Number(row.provider_cost_usd || 0);
    if (Number.isFinite(usd)) total += usd;
  }

  return roundUsd(total);
}

function geminiNeedsSetupBalance() {
  return {
    source: "dashboard_only",
    kind: "usd",
    label: "—",
    detail: "Lyria + Gemini share one Google wallet. Log a top-up below, or set exact balance from AI Studio Billing (Google has no live balance API like Suno).",
    billingUrl: "https://aistudio.google.com/billing",
    sharedWallet: true,
    walletIds: [GEMINI_WALLET_ID, "lyria"],
  };
}

function geminiLedgerBalance({ toppedUpUsd, usageAllUsd }) {
  const remaining = roundUsd(Math.max(0, toppedUpUsd - usageAllUsd));
  return {
    source: "ledger",
    kind: "usd",
    value: remaining,
    toppedUpUsd: roundUsd(toppedUpUsd),
    usageAllUsd,
    label: fmtUsdLabel(remaining),
    detail: `${fmtUsdLabel(toppedUpUsd)} topped up − ${fmtUsdLabel(usageAllUsd)} tracked usage · shared wallet`,
    billingUrl: "https://aistudio.google.com/billing",
    sharedWallet: true,
    walletIds: [GEMINI_WALLET_ID, "lyria"],
  };
}

function geminiSnapshotBalance({ snapshotUsd, syncedAt, usageSince, syncedBy = "" }) {
  const remaining = roundUsd(Math.max(0, snapshotUsd - usageSince));
  const syncLabel = syncedAt ? fmtSyncDate(syncedAt) : "baseline";
  const by = syncedBy ? ` · ${syncedBy}` : "";
  return {
    source: "snapshot",
    kind: "usd",
    value: remaining,
    snapshotUsd: roundUsd(snapshotUsd),
    usageSinceUsd: usageSince,
    syncedAt,
    label: fmtUsdLabel(remaining),
    detail: `Set to ${fmtUsdLabel(snapshotUsd)} (${syncLabel}${by}) − ${fmtUsdLabel(usageSince)} since · shared wallet`,
    billingUrl: "https://aistudio.google.com/billing",
    sharedWallet: true,
    walletIds: [GEMINI_WALLET_ID, "lyria"],
  };
}

async function computeGeminiSharedWalletBalance({ serviceFetch, toppedUpUsd = 0 } = {}) {
  const sinceEpoch = "1970-01-01T00:00:00.000Z";
  const [snapshot, usageAll] = await Promise.all([
    fetchLatestGeminiSnapshot(serviceFetch),
    fetchGeminiUsageSince(serviceFetch, sinceEpoch),
  ]);

  const envUsd = Number(process.env.GEMINI_PREPAY_BALANCE_USD || "");
  const toppedUp = roundUsd(Number(toppedUpUsd || 0));

  if (snapshot) {
    const usageSince = await fetchGeminiUsageSince(serviceFetch, snapshot.syncedAt);
    return geminiSnapshotBalance({
      snapshotUsd: snapshot.amountUsd,
      syncedAt: snapshot.syncedAt,
      usageSince,
      syncedBy: snapshot.syncedBy,
    });
  }

  if (toppedUp > 0) {
    return geminiLedgerBalance({ toppedUpUsd: toppedUp, usageAllUsd: usageAll });
  }

  if (Number.isFinite(envUsd) && envUsd >= 0) {
    return geminiSnapshotBalance({
      snapshotUsd: envUsd,
      syncedAt: null,
      usageSince: usageAll,
      syncedBy: "env",
    });
  }

  return geminiNeedsSetupBalance();
}

module.exports = {
  GEMINI_WALLET_ID,
  computeGeminiSharedWalletBalance,
  roundUsd,
};
