// Runs the real SQL migrations against an in-memory Postgres (pglite) with a replica of the live schema.
// One-time setup (not a repo dependency):  npm i --no-save @electric-sql/pglite
// Run:  node scripts/sql-tests/gift-credit-lots.pglite.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const SQL = fs.readFileSync(new URL("../../supabase/pro_included_credits.sql", import.meta.url), "utf8");
const SQL2 = fs.readFileSync(new URL("../../supabase/gift_credit_lots.sql", import.meta.url), "utf8");

// --- minimal replica of the live schema (post credits.sql + decimal + gifts + trial_credits) ---
await db.exec(`
  create role service_role; create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create table public.user_credits (
    user_id uuid primary key references auth.users (id) on delete cascade,
    balance numeric(14,4) not null default 0 check (balance >= 0),
    paid_balance numeric(14,4) not null default 0 check (paid_balance >= 0),
    gift_balance numeric(14,4) not null default 0 check (gift_balance >= 0),
    promo_balance numeric(14,4) not null default 0 check (promo_balance >= 0),
    trial_balance numeric(14,4) not null default 0 check (trial_balance >= 0),
    updated_at timestamptz not null default now()
  );
  create table public.credit_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    delta numeric(14,4) not null,
    reason text not null,
    ref text default '',
    created_at timestamptz not null default now()
  );
  create table public.pro_subscriptions (
    user_id uuid primary key references auth.users (id) on delete cascade,
    provider text not null default 'apple',
    plan_id text not null,
    status text not null default 'active',
    current_period_end timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint pro_subscriptions_status_check check (status in ('active','trialing','grace','cancelled','expired'))
  );
  create table public.gift_events (
    id uuid primary key default gen_random_uuid(),
    sender_user_id uuid not null references auth.users (id) on delete cascade,
    recipient_user_id uuid not null references auth.users (id) on delete cascade,
    target_kind text not null check (target_kind in ('song','status')),
    target_id text not null,
    amount numeric(14,4) not null check (amount > 0),
    created_at timestamptz not null default now()
  );
  create table public.tx_log (n serial, delta numeric, before numeric, after numeric, reason text, ref text);
  create function public.log_credit_transaction(
    p_user_id uuid, p_delta numeric(14,4), p_balance_before numeric(14,4), p_balance_after numeric(14,4),
    p_reason text, p_ref text default '', p_ledger_id uuid default null
  ) returns void language plpgsql as $$
  begin insert into public.tx_log (delta, before, after, reason, ref) values (p_delta, p_balance_before, p_balance_after, p_reason, p_ref); end; $$;
`);


const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const S = uuid(1), R = uuid(2), R2 = uuid(3), Old = uuid(4);
for (let i = 1; i <= 40; i++) await db.query("insert into auth.users (id) values ($1)", [uuid(i)]);
const row = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const cr = async (id) => {
  const r = await row("select * from public.user_credits where user_id=$1", [id]);
  const n = (k) => Number(r[k]);
  return { balance: n("balance"), paid: n("paid_balance"), gift: n("gift_balance"), promo: n("promo_balance"), trial: n("trial_balance"), inc: n("pro_included_balance") };
};
const rpc = async (name, args) => (await row(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).r;
const gift = (from, to, amt) => rpc("send_gift", [from, to, "song", "song-1", amt]);

await db.exec(SQL); await db.exec(SQL2); await db.exec(SQL2);
console.log("ok 0: both migrations apply cleanly and re-run");

// sender: 400 included, 100 paid, 20 promo
await db.query("insert into public.user_credits (user_id, balance, paid_balance, promo_balance) values ($1,120,100,20)", [S]);
await rpc("grant_pro_period_credits", [S, 400, "p1"]);
let out = await gift(S, R, 5);
assert.equal(out.ok, true);
assert.deepEqual(await cr(S), { balance: 515, paid: 100, gift: 0, promo: 20, trial: 0, inc: 395 }, "gift drawn from included first");
assert.deepEqual(await cr(R), { balance: 5, paid: 0, gift: 5, promo: 0, trial: 0, inc: 0 });
let lot = await row("select amount, remaining, extract(epoch from (expires_at - received_at))/86400 as life from public.gift_credit_lots where user_id=$1", [R]);
assert.equal(Number(lot.remaining), 5);
assert.equal(Math.round(Number(lot.life)), 30, "lot lives 30 days");
console.log("ok 1: gift drawn from included first; recipient gets a 30-day lot");

// ---- caps ----
out = await gift(S, R, 5);                      // R total 10
assert.equal(out.ok, true);
out = await gift(S, R, 1);                      // 11 > 10
assert.equal(out.status, "recipient_limit");
out = await gift(S, R2, 5); assert.equal(out.ok, true);   // sent 15
out = await gift(S, R2, 5); assert.equal(out.ok, true);   // sent 20
out = await gift(S, uuid(10), 5); assert.equal(out.ok, true); // sent 25
out = await gift(S, uuid(11), 1);
assert.equal(out.status, "daily_limit");
assert.match(out.message, /25 credits/);
console.log("ok 2: per-recipient cap (10) and daily cap (25) enforced:", out.message);

// ---- 24h rolling window resets ----
await db.query("update public.gift_events set created_at = now() - interval '25 hours' where sender_user_id=$1", [S]);
out = await gift(S, uuid(11), 1);
assert.equal(out.ok, true);
console.log("ok 3: caps roll off after 24h");

// ---- hourly limit still there (20 gifts/hour) ----
const H = uuid(30);
await db.query("insert into public.user_credits (user_id, balance, paid_balance) values ($1, 900, 900)", [H]);
for (let i = 0; i < 20; i++) { await db.query("insert into public.gift_events (sender_user_id, recipient_user_id, target_kind, target_id, amount) values ($1,$2,'song','x',0.0001)", [H, uuid(12)]); }
out = await gift(H, uuid(13), 1);
assert.equal(out.status, "rate_limited");
console.log("ok 4: hourly 20-gift limit intact");

// ---- received gifts are not giftable; insufficient ----
out = await gift(R, uuid(14), 1);
assert.equal(out.status, "insufficient_giftable");
console.log("ok 5: received gifts cannot be re-gifted");

// ---- draw order paid -> promo when no included ----
const P = uuid(31);
await db.query("insert into public.user_credits (user_id, balance, paid_balance, promo_balance) values ($1, 13, 3, 10)", [P]);
await gift(P, uuid(15), 5);
assert.deepEqual(await cr(P), { balance: 8, paid: 0, gift: 0, promo: 8, trial: 0, inc: 0 });
console.log("ok 6: no included -> paid then promo");

// ---- spend order across lots + grandfathered gift balance ----
const G = uuid(32);
await db.query("insert into public.user_credits (user_id, balance, gift_balance) values ($1, 15, 15)", [G]); // 7 legacy + lots 5 + 3
await db.query("insert into public.gift_credit_lots (user_id, amount, remaining, expires_at) values ($1,5,5, now()+interval '10 days'), ($1,3,3, now()+interval '20 days')", [G]);
await rpc("consume_credits", [G, 9, "song", "s1"]);
const lots = (await db.query("select remaining from public.gift_credit_lots where user_id=$1 order by expires_at", [G])).rows.map(r => Number(r.remaining));
assert.deepEqual(lots, [0, 0], "soonest-expiring lots drained first");
assert.equal((await cr(G)).gift, 6, "then 1 from the grandfathered non-expiring part (7 -> 6)");
console.log("ok 7: spend drains soonest-expiring lots first, then grandfathered balance");

// ---- expiry ----
const E = uuid(33);
await db.query("insert into public.user_credits (user_id, balance, gift_balance, paid_balance) values ($1, 17, 12, 5)", [E]); // 7 legacy + lot 5 expired
await db.query("insert into public.gift_credit_lots (user_id, amount, remaining, received_at, expires_at) values ($1,5,5, now()-interval '31 days', now()-interval '1 day')", [E]);
await db.query("insert into public.gift_credit_lots (user_id, amount, remaining, expires_at) values ($1,5,5, now()+interval '5 days')", [E]);
await db.query("update public.user_credits set gift_balance = 12, balance = 17 where user_id=$1", [E]); // 7 legacy + 5 expired... (lot2 counted below)
await db.query("update public.user_credits set gift_balance = 17, balance = 22 where user_id=$1", [E]); // 7 legacy + 5 expired + 5 live
const exp = await rpc("expire_gift_credit_lots", [E]);
assert.equal(Number(exp), 5);
assert.deepEqual(await cr(E), { balance: 17, paid: 5, gift: 12, promo: 0, trial: 0, inc: 0 });
assert.equal(Number(await rpc("expire_gift_credit_lots", [E])), 0, "second call is a no-op");
console.log("ok 8: expired lot removed (5), live lot + grandfathered balance untouched");

// expired gifts cannot be spent
const X = uuid(34);
await db.query("insert into public.user_credits (user_id, balance, gift_balance) values ($1, 5, 5)", [X]);
await db.query("insert into public.gift_credit_lots (user_id, amount, remaining, received_at, expires_at) values ($1,5,5, now()-interval '31 days', now()-interval '1 day')", [X]);
out = await rpc("consume_credits", [X, 1, "song", "s2"]);
assert.equal(out.status, "insufficient");
assert.equal((await cr(X)).balance, 0);
console.log("ok 9: expired gift credits are not spendable");

// sweep
const Y = uuid(35);
await db.query("insert into public.user_credits (user_id, balance, gift_balance) values ($1, 4, 4)", [Y]);
await db.query("insert into public.gift_credit_lots (user_id, amount, remaining, received_at, expires_at) values ($1,4,4, now()-interval '40 days', now()-interval '10 days')", [Y]);
const sweep = await rpc("expire_all_gift_credit_lots", []);
assert.equal(sweep.ok, true); assert.equal(Number(sweep.credits), 4);
console.log("ok 10: daily sweep", JSON.stringify(sweep));

// admin view
await db.query("update public.gift_events set created_at = now() where sender_user_id=$1", [S]);
const flow = (await db.query("select * from public.gift_pair_flow_7d")).rows;
console.log("ok 11: admin pair view rows:", flow.length);

// invariant
const sums = await db.query(`select user_id, balance, (paid_balance+gift_balance+promo_balance+trial_balance+pro_included_balance) as s from public.user_credits`);
for (const r of sums.rows) assert.equal(Number(r.balance), Number(r.s), `balance == sum buckets for ${r.user_id}`);
console.log("ok 12: balance == sum of buckets for all", sums.rows.length, "users");
console.log("\nALL GIFT SQL TESTS PASSED");
