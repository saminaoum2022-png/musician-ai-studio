#!/usr/bin/env node
/**
 * Print recent Pro cancellations/expirations and new subs.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/investigate-subscription-churn.mjs
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Accept: "application/json",
    },
  });
  const data = await r.json().catch(() => []);
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function authUsers() {
  const map = new Map();
  for (let page = 1; page <= 20; page += 1) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const data = await r.json().catch(() => ({}));
    const users = Array.isArray(data?.users) ? data.users : [];
    for (const u of users) {
      if (u?.id) map.set(u.id, String(u.email || "").toLowerCase());
    }
    if (users.length < 200) break;
  }
  return map;
}

function fmt(iso) {
  return iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 19) : "—";
}

const days30 = new Date(Date.now() - 30 * 86400000).toISOString();

const [active, churned, recent, newSubs, orphans, authMap] = await Promise.all([
  rest("pro_subscriptions?select=user_id&status=in.(active,trialing,grace)&limit=2000"),
  rest(`pro_subscriptions?select=user_id,plan_id,status,provider,updated_at&status=in.(cancelled,expired)&updated_at=gte.${encodeURIComponent(days30)}&order=updated_at.desc&limit=30`),
  rest(`pro_subscriptions?select=user_id,plan_id,status,updated_at&updated_at=gte.${encodeURIComponent(new Date(Date.now() - 7 * 86400000).toISOString())}&order=updated_at.desc&limit=40`),
  rest(`pro_subscriptions?select=user_id,plan_id,status,created_at&status=in.(active,trialing,grace)&created_at=gte.${encodeURIComponent(days30)}&order=created_at.desc&limit=20`),
  rest(`billing_events?select=id,event_type,plan_id,product_id,created_at&user_id=is.null&created_at=gte.${encodeURIComponent(days30)}&order=created_at.desc&limit=20`),
  authUsers(),
]);

console.log(`\nActive Pro subscribers: ${active.length}\n`);

console.log("=== Cancelled / expired (last 30d) ===");
if (!churned.length) console.log("(none)");
for (const row of churned) {
  const email = authMap.get(row.user_id) || "(no auth user — deleted?)";
  console.log(`${fmt(row.updated_at)}  ${row.status.padEnd(10)}  ${String(row.plan_id || "").padEnd(8)}  ${email}  ${row.user_id}`);
}

console.log("\n=== New Pro subscribers (last 30d) ===");
if (!newSubs.length) console.log("(none)");
for (const row of newSubs) {
  const email = authMap.get(row.user_id) || "(deleted?)";
  console.log(`${fmt(row.created_at)}  ${String(row.plan_id || "").padEnd(8)}  ${email}`);
}

console.log("\n=== Any subscription row updated (last 7d) ===");
for (const row of recent) {
  const email = authMap.get(row.user_id) || "(deleted?)";
  console.log(`${fmt(row.updated_at)}  ${String(row.status || "").padEnd(10)}  ${email}`);
}

const proOrphans = orphans.filter((row) => {
  const plan = String(row.plan_id || "");
  const product = String(row.product_id || "");
  return plan === "weekly" || plan === "monthly" || /pro\.(weekly|monthly)/i.test(product);
});
if (proOrphans.length) {
  console.log("\n=== Orphaned Pro billing (user deleted?) ===");
  for (const row of proOrphans) {
    console.log(`${fmt(row.created_at)}  ${row.event_type}  ${row.plan_id || row.product_id}  id=${row.id}`);
  }
}

console.log("");
