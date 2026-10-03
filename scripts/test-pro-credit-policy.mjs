#!/usr/bin/env node
/**
 * Included Pro credits — policy + grant routing (no network, no DB). Run: node scripts/test-pro-credit-policy.mjs
 * Real SQL behaviour is covered separately by running supabase/pro_included_credits.sql against Postgres.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
delete process.env.NABAD_PRO_REFRESH_EXISTING_FROM;

const require = createRequire(import.meta.url);
const { resolveProCreditPolicy } = require("../api/_lib/billing-config");

const NOV1 = Date.parse("2026-11-01T00:00:00.000Z");
const OCT10 = Date.parse("2026-10-10T00:00:00.000Z");
const uid = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------- pure policy
const P = resolveProCreditPolicy;
assert.equal(P({ storedPolicy: "refresh", nowMs: OCT10 }), "refresh");
assert.equal(P({ storedPolicy: "", nowMs: OCT10 }), "refresh", "no row yet = new subscriber");
assert.equal(P({ storedPolicy: "stack", incomingStatus: "active", nowMs: OCT10 }), "stack", "grandfathered renewal in Oct still stacks");
assert.equal(P({ storedPolicy: "stack", incomingStatus: "active", nowMs: NOV1 - 1 }), "stack", "last ms before 1 Nov");
assert.equal(P({ storedPolicy: "stack", incomingStatus: "active", nowMs: NOV1 }), "refresh", "first renewal on/after 1 Nov refreshes");
assert.equal(P({ storedPolicy: "stack", previousStatus: "expired", incomingStatus: "active", nowMs: OCT10 }), "refresh", "lapse + resubscribe = new start");
assert.equal(P({ storedPolicy: "stack", previousStatus: "cancelled", incomingStatus: "active", nowMs: OCT10 }), "stack", "un-cancel before period end is NOT a new start");
assert.equal(P({ storedPolicy: "stack", previousStatus: "active", incomingStatus: "expired", nowMs: OCT10 }), "stack");
console.log("ok policy table");

// ---------------------------------------------------------------- fake backend
let db;
let rpcCalls;
let writes;
function resetDb(over = {}) {
  db = {
    sub: { status: "active", credit_policy: "refresh" },
    columnSupported: true,
    missingRpcs: new Set(),
    ...over,
  };
  rpcCalls = [];
  writes = [];
}
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = opts.method || "GET";
  const json = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  });
  if (u.includes("/rest/v1/rpc/")) {
    const name = u.split("/rpc/")[1];
    const body = JSON.parse(opts.body || "{}");
    if (db.missingRpcs.has(name)) return json(404, { message: "not found" });
    rpcCalls.push({ name, body });
    if (name === "claim_billing_event") return json(200, { ok: true, claimed: true });
    if (name === "convert_trial_credits_to_paid") return json(200, { ok: true, converted: 0 });
    return json(200, { ok: true, balance: 100, granted: body.p_amount });
  }
  if (u.includes("/rest/v1/pro_subscriptions") && method === "GET") {
    if (u.includes("credit_policy") && !db.columnSupported) return json(400, { message: "column does not exist" });
    return json(200, db.sub ? [db.sub] : []);
  }
  if (u.includes("/rest/v1/billing_events") && method === "GET") return json(200, []);
  writes.push({ url: u, method, body: opts.body ? JSON.parse(opts.body) : null });
  return json(200, []);
};

const billing = require("../api/_lib/billing-subscription");
const { expireProIncludedCredits } = require("../api/_lib/pro-included-credits");
const names = () => rpcCalls.map((c) => c.name).filter((n) => /^grant_/.test(n));
let evN = 0;
const sub = (over = {}) => ({
  eventId: `ev-${++evN}`,
  userId: uid,
  amount: 400,
  ref: `pro:weekly:${evN}`,
  provider: "revenuecat",
  eventType: "RENEWAL",
  planId: "weekly",
  productId: "com.nabadai.music.pro.weekly",
  bucket: "paid",
  convertTrial: true,
  ...over,
});

// refresh member → RESET rpc, never the additive one
resetDb();
let r = await billing.grantCreditsOnce(sub());
assert.deepEqual(names(), ["grant_pro_period_credits"]);
assert.equal(r.granted, 400);
console.log("ok refresh member -> grant_pro_period_credits");

// grandfathered, before 1 Nov → old additive grant (stacks, nothing wiped)
resetDb({ sub: { status: "active", credit_policy: "stack" } });
r = await billing.grantCreditsOnce(sub());
assert.deepEqual(names(), ["grant_paid_credits"]);
console.log("ok grandfathered before 1 Nov -> grant_paid_credits (still stacks)");

// grandfathered after the effective date → refresh + policy persisted
resetDb({ sub: { status: "active", credit_policy: "stack" } });
process.env.NABAD_PRO_REFRESH_EXISTING_FROM = "2026-01-01T00:00:00Z"; // simulate "today is after 1 Nov"
r = await billing.grantCreditsOnce(sub());
assert.deepEqual(names(), ["grant_pro_period_credits"]);
const patch = writes.find((w) => w.method === "PATCH" && w.url.includes("pro_subscriptions"));
assert.equal(patch?.body?.credit_policy, "refresh", "policy persisted as refresh");
delete process.env.NABAD_PRO_REFRESH_EXISTING_FROM;
console.log("ok grandfathered after effective date -> grant_pro_period_credits + persisted");

// credit packs / adjustments (no planId) are never reset
resetDb();
r = await billing.grantCreditsOnce(sub({ planId: null, eventType: "NON_RENEWING_PURCHASE", bucket: "paid", convertTrial: false }));
assert.deepEqual(names(), ["grant_paid_credits"]);
console.log("ok credit pack -> grant_paid_credits");

// trial grant stays in the trial bucket
resetDb({ sub: { status: "trialing", credit_policy: "refresh" } });
r = await billing.grantCreditsOnce(sub({ bucket: "trial", amount: 90, convertTrial: false, eventType: "INITIAL_PURCHASE" }));
assert.deepEqual(names(), ["grant_trial_credits"]);
console.log("ok trial start -> grant_trial_credits");

// upsert: lapse + resubscribe flips stack -> refresh; plain renewal does not
resetDb({ sub: { status: "expired", credit_policy: "stack" } });
await billing.upsertProSubscription({ userId: uid, provider: "revenuecat", planId: "weekly", status: "active", periodEndIso: null });
let up = writes.find((w) => w.method === "POST" && w.url.includes("pro_subscriptions"));
assert.equal(up.body.credit_policy, "refresh");
resetDb({ sub: { status: "active", credit_policy: "stack" } });
await billing.upsertProSubscription({ userId: uid, provider: "revenuecat", planId: "weekly", status: "active", periodEndIso: null });
up = writes.find((w) => w.method === "POST" && w.url.includes("pro_subscriptions"));
assert.equal("credit_policy" in up.body, false, "grandfathered renewal leaves policy untouched");
resetDb({ sub: null });
await billing.upsertProSubscription({ userId: uid, provider: "revenuecat", planId: "weekly", status: "trialing", periodEndIso: null });
up = writes.find((w) => w.method === "POST" && w.url.includes("pro_subscriptions"));
assert.equal("credit_policy" in up.body, false, "new row: DB default (refresh) applies");
console.log("ok upsert policy transitions");

// expiry
resetDb();
await expireProIncludedCredits(uid, "rc:x");
assert.equal(rpcCalls.at(-1).name, "expire_pro_included_credits");
console.log("ok expiry calls expire_pro_included_credits");

// SQL not applied yet (column missing) → old behaviour, nothing breaks
resetDb({ columnSupported: false });
r = await billing.grantCreditsOnce(sub());
assert.deepEqual(names(), ["grant_paid_credits"]);
await billing.upsertProSubscription({ userId: uid, provider: "revenuecat", planId: "weekly", status: "active", periodEndIso: null });
assert.ok(writes.some((w) => w.method === "POST" && w.url.includes("pro_subscriptions")), "upsert still writes");
console.log("ok column missing -> falls back to additive grant");

// RPC missing (SQL partially applied) → fall back to additive, never lose the grant (keep LAST: caches the 404)
resetDb({ missingRpcs: new Set(["grant_pro_period_credits"]) });
r = await billing.grantCreditsOnce(sub());
assert.deepEqual(names(), ["grant_paid_credits"]);
assert.equal(r.granted, 400);
console.log("ok RPC missing -> falls back to additive grant");

console.log("\nALL POLICY TESTS PASSED");
