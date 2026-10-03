/**
 * Credits screen rows that always add up to the total.
 *
 * `balance` is the source of truth (it is what gates spending). The stored buckets can drift from it on
 * older accounts (old spend code and refunds only touched `balance`), so for DISPLAY we fill the rows in
 * spend order and give "saved credits" whatever is left. Display only: nothing is written to the database
 * and gifting still uses the real stored buckets.
 *
 * Spend order: included → gifts → promo → trial → saved.
 */
function displayCreditBuckets({ balance, included = 0, gift = 0, promo = 0, trial = 0 } = {}) {
  let left = Math.max(0, Number(balance) || 0);
  const take = (n) => {
    const v = Math.min(left, Math.max(0, Number(n) || 0));
    left -= v;
    return v;
  };
  const out = {
    proIncludedBalance: take(included),
    giftBalance: take(gift),
    promoBalance: take(promo),
    trialBalance: take(trial),
  };
  out.paidBalance = left; // shown as "Saved credits"
  return out;
}

module.exports = { displayCreditBuckets };
