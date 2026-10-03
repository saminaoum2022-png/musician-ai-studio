import { createRequire } from "module";
import assert from "assert";
const { displayCreditBuckets: d } = createRequire(import.meta.url)("../api/_lib/credit-display.js");
const sum = (r) => r.proIncludedBalance + r.giftBalance + r.promoBalance + r.trialBalance + r.paidBalance;
let r;
r = d({ balance: 79, trial: 76 }); assert.equal(r.trialBalance, 76); assert.equal(r.paidBalance, 3);                 // test account
r = d({ balance: 550 }); assert.equal(r.paidBalance, 550);                                                           // buckets were higher
r = d({ balance: 84, trial: 9 }); assert.equal(r.paidBalance, 75);                                                   // refunded to total only
r = d({ balance: 100, included: 40, gift: 10, promo: 5, trial: 5 }); assert.equal(r.paidBalance, 40);
r = d({ balance: 20, included: 15, gift: 10, promo: 10, trial: 10 }); assert.equal(r.proIncludedBalance, 15); assert.equal(r.giftBalance, 5); assert.equal(r.paidBalance, 0);
for (const x of [d({ balance: 0 }), d({ balance: -3, trial: 5 }), d({})]) assert.equal(sum(x), 0);
for (const b of [0, 7, 79, 550, 1820]) for (const t of [0, 9, 76, 2000]) assert.equal(sum(d({ balance: b, trial: t, promo: 24, gift: 3, included: 5 })), b);
console.log("ALL CREDIT DISPLAY TESTS PASSED");
