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
        "musician-ai-studio",
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
  until.setUTCHours(23, 59, 59, 999);
  const since = new Date(Date.now() - (dayCount - 1) * 86400000);
  since.setUTCHours(0, 0, 0, 0);
  return {
    days: dayCount,
    sinceMs: since.getTime(),
    untilMs: until.getTime(),
    since: since.toISOString(),
    until: until.toISOString(),
    sinceDate: since.toISOString().slice(0, 10),
    untilDate: until.toISOString().slice(0, 10),
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
    if (k === "by") {
      const dims = Array.isArray(v) ? v : [v];
      for (const dim of dims) qs.append("by", String(dim));
      continue;
    }
    qs.set(k, String(v));
  }
  return qs;
}

async function query(path, params = {}) {
  if (!isConfigured()) {
    return { ok: false, reason: "not_configured", data: null };
  }
  const qs = buildQuery(params);
  try {
    const r = await fetch(`${VERCEL_API}/v1/query/web-analytics/${path}?${qs}`, {
      headers: { Authorization: `Bearer ${cfg().token}` },
      cache: "no-store",
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = body?.error?.message || body?.error || body?.message || r.statusText;
      return {
        ok: false,
        reason: `http_${r.status}`,
        error: String(msg).slice(0, 320),
        data: null,
      };
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

function rowMetrics(row) {
  return {
    pageviews: Number(row?.pageviews ?? row?.pageViews ?? row?.count ?? 0),
    visitors: Number(row?.visitors ?? row?.uniqueVisitors ?? row?.count ?? 0),
  };
}

let _countryDisplay;
function countryDisplayNames() {
  if (!_countryDisplay) {
    try {
      _countryDisplay = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      _countryDisplay = null;
    }
  }
  return _countryDisplay;
}

function formatCountryLabel(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!c || c === "(DIRECT / UNKNOWN)") return "(unknown)";
  if (c.length === 2) {
    try {
      const dn = countryDisplayNames();
      const name = dn?.of(c);
      if (name && name !== c) return `${name} (${c})`;
    } catch {}
  }
  return code;
}

function formatDimLabel(label, dimKind) {
  const raw = String(label || "").trim();
  if (!raw || raw === "(direct / unknown)") return "(unknown)";
  if (dimKind === "country") return formatCountryLabel(raw);
  if (dimKind === "device") {
    const lower = raw.toLowerCase();
    if (lower === "mobile") return "Mobile";
    if (lower === "desktop") return "Desktop";
    if (lower === "tablet") return "Tablet";
  }
  return raw;
}

function normalizeDimRows(rows, dimKeys = [], dimKind = "") {
  const keys = Array.isArray(dimKeys) ? dimKeys : [dimKeys];
  return rows.map((row) => {
    let label = "";
    for (const key of keys) {
      const v = row?.[key];
      if (v != null && String(v).trim() !== "") {
        label = String(v).trim();
        break;
      }
    }
    if (!label) label = "(direct / unknown)";
    const metrics = rowMetrics(row);
    const formatted = formatDimLabel(label, dimKind);
    return {
      label: formatted,
      rawLabel: label,
      pageviews: metrics.pageviews,
      visitors: metrics.visitors,
      count: metrics.pageviews || metrics.visitors,
    };
  }).filter((r) => r.pageviews > 0 || r.visitors > 0);
}

function normalizeDailyRows(rows) {
  return rows.map((row) => {
    const ts = String(row?.timestamp || row?.day || "");
    const day = ts.slice(0, 10);
    const metrics = rowMetrics(row);
    return {
      day,
      pageviews: metrics.pageviews,
      visitors: metrics.visitors,
    };
  });
}

function normalizeEventRows(rows) {
  return rows.map((row) => {
    const name = String(row?.eventName || row?.name || "—").trim() || "—";
    const metrics = rowMetrics(row);
    return {
      name,
      count: metrics.pageviews || metrics.visitors || Number(row?.count || 0),
      visitors: metrics.visitors,
    };
  }).filter((r) => r.count > 0 || r.visitors > 0);
}

function sumDailyTotals(daily) {
  return (Array.isArray(daily) ? daily : []).reduce(
    (acc, row) => ({
      pageviews: acc.pageviews + Number(row?.pageviews || 0),
      visitors: acc.visitors + Number(row?.visitors || 0),
    }),
    { pageviews: 0, visitors: 0 },
  );
}

function collectQueryErrors(results, labels) {
  const errors = [];
  for (const [label, res] of Object.entries(labels)) {
    if (!res?.ok && res?.error) {
      errors.push(`${label}: ${res.error}`);
    }
  }
  return errors.length ? errors : undefined;
}

const ONLINE_NOW_WINDOW_MINUTES = 5;

async function fetchVercelOnlineNow() {
  const untilMs = Date.now();
  const sinceMs = untilMs - ONLINE_NOW_WINDOW_MINUTES * 60 * 1000;
  const res = await query("visits/count", {
    since: String(sinceMs),
    until: String(untilMs),
  });
  if (!res.ok || !res.data) {
    return {
      onlineNow: null,
      onlineNowWindowMinutes: ONLINE_NOW_WINDOW_MINUTES,
      onlineNowNote: res.error ? String(res.error).slice(0, 120) : undefined,
    };
  }
  const visitors = Number(res.data.visitors ?? 0);
  return {
    onlineNow: Number.isFinite(visitors) ? visitors : null,
    onlineNowWindowMinutes: ONLINE_NOW_WINDOW_MINUTES,
  };
}

/**
 * Fetch web traffic + custom events from Vercel Web Analytics API.
 * @param {{ days?: number }} opts
 */
async function fetchVercelWebAnalyticsSummary({ days = 28 } = {}) {
  const range = utcDateRange(days);
  const teamSlug = cfg().teamSlug || "nabadais-projects";

  if (!isConfigured()) {
    return {
      configured: false,
      days: range.days,
      since: range.sinceDate,
      until: range.untilDate,
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
      onlineNow: null,
      onlineNowWindowMinutes: ONLINE_NOW_WINDOW_MINUTES,
      bounceRate: null,
      bounceRateNote: "Bounce rate is only shown in the Vercel Analytics dashboard — not exposed on the public API.",
      dashboardUrl: `https://vercel.com/${teamSlug}/musician-ai-studio/analytics`,
    };
  }

  const base = {
    since: String(range.sinceMs),
    until: String(range.untilMs),
    limit: "12",
  };

  const [
    dailyRes,
    pagesRes,
    countriesRes,
    devicesRes,
    osRes,
    browsersRes,
    referrersRes,
    eventsRes,
    onlineNowRes,
  ] = await Promise.all([
    query("visits/aggregate", { ...base, by: "day", limit: "90" }),
    query("visits/aggregate", { ...base, by: "requestPath" }),
    query("visits/aggregate", { ...base, by: "country" }),
    query("visits/aggregate", { ...base, by: "deviceType" }),
    query("visits/aggregate", { ...base, by: "osName" }),
    query("visits/aggregate", { ...base, by: "browserName" }),
    query("visits/aggregate", { ...base, by: "referrerHostname" }),
    query("events/aggregate", { ...base, by: "eventName", limit: "25" }),
    fetchVercelOnlineNow(),
  ]);

  const daily = normalizeDailyRows(rowsFromAggregate(dailyRes));
  const totalsFromDaily = sumDailyTotals(daily);

  const queryErrors = collectQueryErrors(
    {},
    {
      daily: dailyRes,
      pages: pagesRes,
      countries: countriesRes,
      devices: devicesRes,
      os: osRes,
      browsers: browsersRes,
      referrers: referrersRes,
      events: eventsRes,
    },
  );

  const pagesPerVisitor = totalsFromDaily.visitors > 0
    ? Math.round((totalsFromDaily.pageviews / totalsFromDaily.visitors) * 100) / 100
    : null;

  return {
    configured: true,
    source: "vercel_api",
    days: range.days,
    since: range.sinceDate,
    until: range.untilDate,
    totals: totalsFromDaily,
    daily,
    pages: normalizeDimRows(rowsFromAggregate(pagesRes), ["requestPath", "route"]),
    countries: normalizeDimRows(rowsFromAggregate(countriesRes), ["country", "clientIpCountry"], "country"),
    devices: normalizeDimRows(rowsFromAggregate(devicesRes), ["deviceType"], "device"),
    operatingSystems: normalizeDimRows(rowsFromAggregate(osRes), ["osName"]),
    browsers: normalizeDimRows(rowsFromAggregate(browsersRes), ["browserName"]),
    referrers: normalizeDimRows(rowsFromAggregate(referrersRes), ["referrerHostname"]),
    customEvents: normalizeEventRows(rowsFromAggregate(eventsRes)),
    onlineNow: onlineNowRes.onlineNow,
    onlineNowWindowMinutes: onlineNowRes.onlineNowWindowMinutes || ONLINE_NOW_WINDOW_MINUTES,
    onlineNowNote: onlineNowRes.onlineNowNote,
    pagesPerVisitor,
    bounceRate: null,
    bounceRateNote: "Exact bounce rate is dashboard-only on Vercel. Approximation: single-page sessions ÷ total sessions — not available via API.",
    dashboardUrl: `https://vercel.com/${teamSlug}/musician-ai-studio/analytics`,
    errors: queryErrors,
  };
}

module.exports = {
  fetchVercelWebAnalyticsSummary,
  isVercelWebAnalyticsConfigured: isConfigured,
};
