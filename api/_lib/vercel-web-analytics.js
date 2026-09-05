/**
 * Vercel Web Analytics REST API — same aggregated data as the Vercel dashboard.
 * @see https://vercel.com/docs/analytics/web-analytics-api
 */

const VERCEL_API = "https://api.vercel.com";

function cfg() {
  return {
    token: String(
      process.env.VERCEL_ANALYTICS_TOKEN ||
        process.env.VERCEL_TOKEN ||
        "",
    ).trim(),
    projectId: String(
      process.env.VERCEL_ANALYTICS_PROJECT_ID ||
        process.env.VERCEL_PROJECT_ID ||
        "",
    ).trim(),
    teamId: String(process.env.VERCEL_ANALYTICS_TEAM_ID || process.env.VERCEL_TEAM_ID || "").trim(),
    teamSlug: String(
      process.env.VERCEL_ANALYTICS_TEAM_SLUG ||
        process.env.VERCEL_TEAM_SLUG ||
        "nabadais-projects",
    ).trim(),
  };
}

function isConfigured() {
  const c = cfg();
  return Boolean(c.token && c.projectId && (c.teamId || c.teamSlug));
}

function utcDateRange(days) {
  const dayCount = Math.max(7, Math.min(90, Number(days) || 28));
  const until = new Date();
  const since = new Date(Date.now() - (dayCount - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  until.setUTCHours(23, 59, 59, 999);
  return {
    days: dayCount,
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

function buildQuery(params = {}) {
  const c = cfg();
  const qs = new URLSearchParams();
  qs.set("projectId", c.projectId);
  if (c.teamId) qs.set("teamId", c.teamId);
  else if (c.teamSlug) qs.set("slug", c.teamSlug);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    qs.set(k, String(v));
  }
  return qs;
}

async function query(path, params = {}) {
  if (!isConfigured()) {
    return { ok: false, reason: "not_configured", data: null };
  }
  const c = cfg();
  const qs = buildQuery(params);
  try {
    const r = await fetch(`${VERCEL_API}/v1/query/web-analytics/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = body?.error?.message || body?.error || body?.message || r.statusText;
      return { ok: false, reason: `http_${r.status}`, error: String(msg).slice(0, 240), data: null };
    }
    return { ok: true, data: body?.data ?? body, query: body?.query || null };
  } catch (e) {
    return { ok: false, reason: "network", error: e?.message || String(e), data: null };
  }
}

function rowsFromAggregate(result) {
  if (!result?.ok) return [];
  const data = result.data;
  return Array.isArray(data) ? data : [];
}

function normalizeDimRows(rows, dimKey) {
  return rows.map((row) => {
    const label = String(row?.[dimKey] ?? row?.value ?? "—").trim() || "—";
    return {
      label,
      pageviews: Number(row?.pageviews || 0),
      visitors: Number(row?.visitors || 0),
      count: Number(row?.count || row?.pageviews || 0),
    };
  });
}

function normalizeDailyRows(rows) {
  return rows.map((row) => {
    const ts = String(row?.timestamp || row?.day || "");
    const day = ts.slice(0, 10);
    return {
      day,
      pageviews: Number(row?.pageviews || 0),
      visitors: Number(row?.visitors || 0),
    };
  });
}

function normalizeEventRows(rows) {
  return rows.map((row) => {
    const name = String(row?.eventName || row?.name || row?.value || "—").trim() || "—";
    return {
      name,
      count: Number(row?.count || 0),
      visitors: Number(row?.visitors || 0),
    };
  });
}

/**
 * Fetch web traffic + custom events from Vercel Web Analytics API.
 * @param {{ days?: number }} opts
 */
async function fetchVercelWebAnalyticsSummary({ days = 28 } = {}) {
  const range = utcDateRange(days);
  if (!isConfigured()) {
    return {
      configured: false,
      days: range.days,
      since: range.since,
      until: range.until,
      note: "Set VERCEL_ANALYTICS_TOKEN (read token) — VERCEL_PROJECT_ID is auto on Vercel. Optional: VERCEL_ANALYTICS_TEAM_SLUG=nabadais-projects.",
      totals: { pageviews: 0, visitors: 0 },
      daily: [],
      pages: [],
      countries: [],
      devices: [],
      operatingSystems: [],
      browsers: [],
      referrers: [],
      customEvents: [],
      dashboardUrl: "https://vercel.com/nabadais-projects/musician-ai-studio/analytics",
    };
  }

  const base = { since: range.since, until: range.until, limit: "12" };
  const [
    totalsRes,
    dailyRes,
    pagesRes,
    countriesRes,
    devicesRes,
    osRes,
    browsersRes,
    referrersRes,
    eventsRes,
  ] = await Promise.all([
    query("visits/count", {}),
    query("visits/aggregate", { ...base, by: "day", limit: "90" }),
    query("visits/aggregate", { ...base, by: "requestPath" }),
    query("visits/aggregate", { ...base, by: "country" }),
    query("visits/aggregate", { ...base, by: "deviceType" }),
    query("visits/aggregate", { ...base, by: "osName" }),
    query("visits/aggregate", { ...base, by: "browserName" }),
    query("visits/aggregate", { ...base, by: "referrerHostname" }),
    query("events/aggregate", { ...base, by: "eventName", limit: "25" }),
  ]);

  const errors = [totalsRes, dailyRes, pagesRes].filter((r) => !r.ok).map((r) => r.error).filter(Boolean);
  const totals = totalsRes.ok && totalsRes.data && typeof totalsRes.data === "object"
    ? {
        pageviews: Number(totalsRes.data.pageviews || 0),
        visitors: Number(totalsRes.data.visitors || 0),
      }
    : { pageviews: 0, visitors: 0 };

  const teamSlug = cfg().teamSlug || "nabadais-projects";
  const projectId = cfg().projectId;

  return {
    configured: true,
    source: "vercel_api",
    days: range.days,
    since: range.since,
    until: range.until,
    totals,
    daily: normalizeDailyRows(rowsFromAggregate(dailyRes)),
    pages: normalizeDimRows(rowsFromAggregate(pagesRes), "requestPath"),
    countries: normalizeDimRows(rowsFromAggregate(countriesRes), "country"),
    devices: normalizeDimRows(rowsFromAggregate(devicesRes), "deviceType"),
    operatingSystems: normalizeDimRows(rowsFromAggregate(osRes), "osName"),
    browsers: normalizeDimRows(rowsFromAggregate(browsersRes), "browserName"),
    referrers: normalizeDimRows(rowsFromAggregate(referrersRes), "referrerHostname"),
    customEvents: normalizeEventRows(rowsFromAggregate(eventsRes)),
    dashboardUrl: `https://vercel.com/${teamSlug}/musician-ai-studio/analytics`,
    errors: errors.length ? errors : undefined,
  };
}

module.exports = {
  fetchVercelWebAnalyticsSummary,
  isVercelWebAnalyticsConfigured: isConfigured,
};
