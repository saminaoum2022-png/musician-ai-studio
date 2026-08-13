/**
 * Shared Google Gemini API wallet — Lyria + Gemini use the same GEMINI_API_KEY and billing.
 * Google does not expose prepay balance via API; we estimate from AI Studio balance snapshots
 * minus tracked usage since sync.
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

function geminiDashboardOnlyBalance() {
  return {
    source: "dashboard_only",
    kind: "usd",
    label: "Sync from AI Studio",
    detail: "Lyria + Gemini share one Google wallet — Google has no live balance API. Copy your prepay balance from AI Studio Billing and sync below.",
    billingUrl: "https://aistudio.google.com/billing",
    sharedWallet: true,
    walletIds: [GEMINI_WALLET_ID, "lyria"],
  };
}

function geminiSnapshotBalance({ snapshotUsd, syncedAt, usageSince, syncedBy = "" }) {
  const remaining = roundUsd(Math.max(0, snapshotUsd - usageSince));
  const syncLabel = fmtSyncDate(syncedAt);
  const by = syncedBy ? ` · ${syncedBy}` : "";
  return {
    source: "snapshot",
    kind: "usd",
    value: remaining,
    snapshotUsd: roundUsd(snapshotUsd),
    usageSinceUsd: usageSince,
    syncedAt,
    label: fmtUsdLabel(remaining),
    detail: `AI Studio sync ${syncLabel}${by} − ${fmtUsdLabel(usageSince)} tracked since · shared wallet (Lyria + Gemini)`,
    billingUrl: "https://aistudio.google.com/billing",
    sharedWallet: true,
    walletIds: [GEMINI_WALLET_ID, "lyria"],
  };
}

async function computeGeminiSharedWalletBalance({ serviceFetch } = {}) {
  const envUsd = Number(process.env.GEMINI_PREPAY_BALANCE_USD || "");
  const snapshot = await fetchLatestGeminiSnapshot(serviceFetch);

  if (!snapshot && Number.isFinite(envUsd) && envUsd >= 0) {
    const usageAll = await fetchGeminiUsageSince(serviceFetch, "1970-01-01T00:00:00.000Z");
    return geminiSnapshotBalance({
      snapshotUsd: envUsd,
      syncedAt: null,
      usageSince: usageAll,
      syncedBy: "env GEMINI_PREPAY_BALANCE_USD",
    });
  }

  if (!snapshot) {
    return geminiDashboardOnlyBalance();
  }

  const usageSince = await fetchGeminiUsageSince(serviceFetch, snapshot.syncedAt);
  return geminiSnapshotBalance({
    snapshotUsd: snapshot.amountUsd,
    syncedAt: snapshot.syncedAt,
    usageSince,
    syncedBy: snapshot.syncedBy,
  });
}

module.exports = {
  GEMINI_WALLET_ID,
  computeGeminiSharedWalletBalance,
  geminiDashboardOnlyBalance,
  roundUsd,
};
