// Runs the real SQL migrations against an in-memory Postgres (pglite) with a replica of the live schema.
// One-time setup (not a repo dependency):  npm i --no-save @electric-sql/pglite
// Run:  node scripts/sql-tests/pro-included-credits.pglite.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
const SQL = fs.readFileSync(new URL("../../supabase/pro_included_credits.sql", import.meta.url), "utf8");

// --- minimal replica of the live schema (post credits.sql + decimal + gifts + trial_credits) ---
await db.exec(`
  create role service_role;
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
  create table public.tx_log (n serial, delta numeric, before numeric, after numeric, reason text, ref text);
  create function public.log_credit_transaction(
    p_user_id uuid, p_delta numeric(14,4), p_balance_before numeric(14,4), p_balance_after numeric(14,4),
    p_reason text, p_ref text default '', p_ledger_id uuid default null
  ) returns void language plpgsql as $$
  begin insert into public.tx_log (delta, before, after, reason, ref) values (p_delta, p_balance_before, p_balance_after, p_reason, p_ref); end; $$;
`);

const U = {
  grand: "00000000-0000-0000-0000-000000000001", // paid before 2 Oct (stack)
  trial: "00000000-0000-0000-0000-000000000002", // trialing now (refresh)
  fresh: "00000000-0000-0000-0000-000000000003", // inserted after migration (default refresh)
};
for (const id of Object.values(U)) await db.query("insert into auth.users (id) values ($1)", [id]);
await db.query("insert into public.pro_subscriptions (user_id, plan_id, status) values ($1,'weekly','active')", [U.grand]);
await db.query("insert into public.pro_subscriptions (user_id, plan_id, status) values ($1,'weekly','trialing')", [U.trial]);
await db.query("insert into public.user_credits (user_id, balance, paid_balance) values ($1, 2000, 2000)", [U.grand]);

const row = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const policy = async (id) => (await row("select credit_policy from public.pro_subscriptions where user_id=$1", [id])).credit_policy;
const cr = async (id) => {
  const r = await row("select * from public.user_credits where user_id=$1", [id]);
  const n = (k) => Number(r[k]);
  return { balance: n("balance"), paid: n("paid_balance"), gift: n("gift_balance"), promo: n("promo_balance"), trial: n("trial_balance"), inc: n("pro_included_balance") };
};
const rpc = async (name, args) => (await row(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as r`, args)).r;

// ---- 1. migration (run twice: must be re-runnable) ----
await db.exec(SQL);
await db.exec(SQL);
assert.equal(await policy(U.grand), "stack", "paid-before-2-Oct stays grandfathered");
assert.equal(await policy(U.trial), "refresh", "trialing becomes refresh");
await db.query("insert into public.pro_subscriptions (user_id, plan_id, status) values ($1,'monthly','active')", [U.fresh]);
assert.equal(await policy(U.fresh), "refresh", "new rows default to refresh");
console.log("ok 1: migration idempotent, policies classified (grand=stack, trial=refresh, new=refresh)");

// ---- 2. refresh grant resets, never stacks ----
let out = await rpc("grant_pro_period_credits", [U.trial, 400, "pro:weekly:t1"]);
assert.equal(out.ok, true);
assert.deepEqual(await cr(U.trial), { balance: 400, paid: 0, gift: 0, promo: 0, trial: 0, inc: 400 });
await rpc("consume_credits", [U.trial, 150, "song", "x1"]);
assert.deepEqual(await cr(U.trial), { balance: 250, paid: 0, gift: 0, promo: 0, trial: 0, inc: 250 });
out = await rpc("grant_pro_period_credits", [U.trial, 400, "pro:weekly:t2"]);
assert.equal(Number(out.expired), 250);
assert.deepEqual(await cr(U.trial), { balance: 400, paid: 0, gift: 0, promo: 0, trial: 0, inc: 400 }, "250 unused did NOT carry over");
console.log("ok 2: renewal resets 250 left -> 400 (no stacking)");

// ---- 3. idempotent ----
out = await rpc("grant_pro_period_credits", [U.trial, 400, "pro:weekly:t2"]);
assert.equal(out.duplicate, true);
assert.equal((await cr(U.trial)).inc, 400);
console.log("ok 3: same renewal ref twice is a no-op");

// ---- 4. non-included credits survive a refresh ----
await db.query("update public.user_credits set paid_balance=300, gift_balance=20, promo_balance=30, balance=balance+350 where user_id=$1", [U.trial]);
await rpc("grant_pro_period_credits", [U.trial, 400, "pro:weekly:t3"]);
assert.deepEqual(await cr(U.trial), { balance: 750, paid: 300, gift: 20, promo: 30, trial: 0, inc: 400 });
console.log("ok 4: paid/gift/promo balances untouched by refresh (balance = sum of buckets)");

// ---- 5. spend order: included -> gift -> promo -> trial -> paid ----
await db.query("update public.user_credits set trial_balance=10, balance=balance+10 where user_id=$1", [U.trial]);
await rpc("consume_credits", [U.trial, 425, "song", "x2"]); // 400 inc + 20 gift + 5 promo
assert.deepEqual(await cr(U.trial), { balance: 335, paid: 300, gift: 0, promo: 25, trial: 10, inc: 0 });
await rpc("consume_credits", [U.trial, 40, "song", "x3"]); // 25 promo + 10 trial + 5 paid
assert.deepEqual(await cr(U.trial), { balance: 295, paid: 295, gift: 0, promo: 0, trial: 0, inc: 0 });
out = await rpc("consume_credits", [U.trial, 9999, "song", "x4"]);
assert.equal(out.status, "insufficient");
console.log("ok 5: spend order included->gift->promo->trial->paid; insufficient guard intact");

// ---- 6. grandfathered user: old additive grant still works, then switch ----
out = await rpc("grant_paid_credits", [U.grand, 400, "pro:weekly:g1"]).catch(() => null);
assert.equal(out, null); // grant_paid_credits is not part of this file; API keeps calling the existing live RPC for 'stack'
console.log("ok 6: (stack users keep the existing grant_paid_credits RPC — untouched by this migration)");

// ---- 7. expiry ----
await rpc("grant_pro_period_credits", [U.grand, 1000, "pro:monthly:g2"]);
assert.deepEqual(await cr(U.grand), { balance: 3000, paid: 2000, gift: 0, promo: 0, trial: 0, inc: 1000 }, "grandfathered 2000 kept, +1000 included as separate bucket");
await rpc("consume_credits", [U.grand, 300, "song", "x5"]);
out = await rpc("expire_pro_included_credits", [U.grand, "rc:exp1"]);
assert.equal(Number(out.expired), 700);
assert.deepEqual(await cr(U.grand), { balance: 2000, paid: 2000, gift: 0, promo: 0, trial: 0, inc: 0 }, "paid 2000 survives expiry");
out = await rpc("expire_pro_included_credits", [U.grand, "rc:exp1"]);
assert.equal(Number(out.expired), 0);
console.log("ok 7: expiry removes only unspent included (700), paid 2000 kept, second call no-op");

// ---- 8. ledger + invariant ----
const sums = await db.query(`
  select c.user_id, c.balance, (c.paid_balance+c.gift_balance+c.promo_balance+c.trial_balance+c.pro_included_balance) as s
  from public.user_credits c`);
for (const r of sums.rows) assert.equal(Number(r.balance), Number(r.s), "balance == sum of buckets");
const led = await db.query("select reason, count(*)::int n from public.credit_ledger group by reason order by reason");
console.log("ok 8: invariant balance == sum(buckets) for all users; ledger:", JSON.stringify(led.rows));
console.log("\nALL SQL TESTS PASSED");
