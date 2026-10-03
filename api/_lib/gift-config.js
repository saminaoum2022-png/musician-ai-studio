/**
 * Gifting limits — keep in sync with supabase/gift_credit_lots.sql (the DB enforces them).
 * Shown to the client so the UI can explain the rules.
 */
const GIFT_DAILY_LIMIT = 25;
const GIFT_RECIPIENT_DAILY_LIMIT = 10;
const GIFT_EXPIRY_DAYS = 30;

module.exports = { GIFT_DAILY_LIMIT, GIFT_RECIPIENT_DAILY_LIMIT, GIFT_EXPIRY_DAYS };
