/**
 * Pro subscriber support email templates + suggestion logic (admin manual send).
 */

const SUPPORT_TEMPLATES = Object.freeze([
  {
    id: "trial_welcome",
    label: "Trial welcome",
    description: "Sent when a user starts a 7-day Pro trial.",
  },
  {
    id: "trial_ending",
    label: "Trial ending soon",
    description: "Reminder 2–3 days before trial ends.",
  },
  {
    id: "first_paid",
    label: "First paid — thank you",
    description: "After trial converts or first paid Pro charge.",
  },
  {
    id: "feedback_checkin",
    label: "Feedback check-in",
    description: "~1 week after becoming a paying Pro member.",
  },
  {
    id: "cancel_confirm",
    label: "Cancel confirm",
    description: "User cancelled — confirms access until period end.",
  },
  {
    id: "refund_confirm",
    label: "Refund confirm",
    description: "After you issue a refund in Stripe — confirm amount and reason.",
  },
]);

const PLAN_PRICES = Object.freeze({
  weekly: { display: "$3.99", cadence: "week", trialDays: 7 },
  monthly: { display: "$9.99", cadence: "month", trialDays: 0 },
});

function templateMeta(id) {
  if (String(id || "").trim() === "custom_compose") {
    return { id: "custom_compose", label: "Custom compose", description: "Freeform support reply" };
  }
  return SUPPORT_TEMPLATES.find((t) => t.id === id) || null;
}

function fmtDate(iso) {
  const ms = Date.parse(String(iso || ""));
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function planCopy(planId) {
  const id = String(planId || "weekly").trim().toLowerCase();
  return PLAN_PRICES[id] || PLAN_PRICES.weekly;
}

function plainToHtml(text) {
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return String(text || "")
    .split(/\n\n+/)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function buildTemplateVars({ subscription, billingEvents } = {}) {
  const sub = subscription || {};
  const planId = String(sub.planId || sub.plan_id || "weekly").toLowerCase();
  const plan = planCopy(planId);
  const periodEnd = sub.currentPeriodEnd || sub.current_period_end || null;
  const periodEndLabel = fmtDate(periodEnd);
  return {
    planName: planId === "monthly" ? "Pro monthly" : "Pro weekly",
    planPrice: plan.display,
    planCadence: plan.cadence,
    trialEndDate: periodEndLabel,
    renewalDate: periodEndLabel,
    accessUntilDate: periodEndLabel,
    managePath:
      "Profile → Settings → Credits & plan → NabadAi Pro → Manage subscription",
    iosManagePath: "Settings → Apple ID → Subscriptions → NabadAi",
    supportEmail: "support@nabadai.com",
    hasBillingEvents: Array.isArray(billingEvents) && billingEvents.length > 0,
    refundAmount: "[refund amount]",
    refundReason: "[reason — edit before send]",
  };
}

function renderTemplate(templateId, vars) {
  const v = vars || {};
  const trialEnd = v.trialEndDate || "[trial end date]";
  const renewal = v.renewalDate || "[renewal date]";
  const accessUntil = v.accessUntilDate || "[access until date]";
  const price = v.planPrice || "$3.99";
  const cadence = v.planCadence || "week";
  const manage = v.managePath;
  const ios = v.iosManagePath;
  const support = v.supportEmail || "support@nabadai.com";
  const refundAmount = v.refundAmount || "[refund amount]";
  const refundReason = v.refundReason || "[reason]";

  const bodies = {
    trial_welcome: {
      subject: "Welcome to NabadAi Pro — your 7-day trial",
      text: `Hi,

Thanks for starting NabadAi Pro on NabadAi.

You're on a 7-day free trial with full Pro access — Studio, cover refresh, Coach, weekly credits, and more.

Trial ends: ${trialEnd}
After that, your plan renews at ${price}/${cadence} unless you cancel before the trial ends.

Manage or cancel anytime:
Sign in with your subscription email → ${manage}

iPhone (App Store billing):
${ios}

Questions? Reply to this email or write ${support}.

— NabadAi`,
    },
    trial_ending: {
      subject: `Your NabadAi Pro trial ends on ${trialEnd}`,
      text: `Hi,

Quick reminder: your free trial ends on ${trialEnd}.

Want to keep Pro? No action needed — your plan continues at ${price}/${cadence}.

Don't want to continue? Cancel before ${trialEnd} to avoid being charged:

Web: ${manage}
iPhone: ${ios}

Need help? Reply here or email ${support}.

— NabadAi Support`,
    },
    first_paid: {
      subject: "You're now a NabadAi Pro member — thank you",
      text: `Hi,

Thank you for subscribing to NabadAi Pro — your membership is now active.

Plan: ${v.planName || "Pro"} · ${price}/${cadence}
Next renewal: ${renewal}

You have full access to Pro features and your renewal credits. We hope you enjoy creating with NabadAi.

Manage your subscription anytime:
${manage}

Canceling stops future renewals only — you keep Pro until the end of your current billing period.

Happy creating,
— Sami
NabadAi`,
    },
    feedback_checkin: {
      subject: "How's NabadAi Pro going?",
      text: `Hi,

You've been on NabadAi Pro for about a week — thank you again for being with us.

We'd love a quick note if you have time:
- What do you use most?
- Anything confusing or missing?
- Anything we could improve?

Reply to this email — even one sentence helps a small team like ours.

Thanks for supporting NabadAi.

— Sami
NabadAi

P.S. Manage or cancel: ${manage}`,
    },
    cancel_confirm: {
      subject: "Your NabadAi Pro subscription has been updated",
      text: `Hi,

This confirms your NabadAi Pro subscription is set to cancel at the end of your current billing period.

Pro access until: ${accessUntil}
You won't be charged again after that unless you resubscribe.

Changed your mind? Open Manage subscription in the app and you can turn renewal back on before ${accessUntil}.

Web: ${manage}
iPhone: ${ios}

Thanks for trying NabadAi Pro. We'd love to have you back anytime.

— NabadAi Support`,
    },
    refund_confirm: {
      subject: "Your NabadAi refund has been processed",
      text: `Hi,

We've processed a refund of ${refundAmount} to your original payment method for NabadAi Pro.

Reason: ${refundReason}

Depending on your bank or card issuer, it may take 5–10 business days to appear on your statement.

Your Pro subscription has been updated accordingly. If you cancelled, you won't be charged again unless you resubscribe.

If anything looks wrong, reply to this email and we'll help.

Web: ${manage}
iPhone: ${ios}

Thank you,
— NabadAi Support`,
    },
  };

  const pack = bodies[String(templateId || "").trim()];
  if (!pack) return null;
  return {
    templateId,
    subject: pack.subject,
    text: pack.text,
    html: plainToHtml(pack.text),
  };
}

function sentTemplateIds(emailLogs) {
  return new Set(
    (Array.isArray(emailLogs) ? emailLogs : []).map((row) =>
      String(row.templateId || row.template_id || "").trim(),
    ).filter(Boolean),
  );
}

function daysBetween(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return (toMs - fromMs) / 86400000;
}

function firstPaidAt(subscription, billingEvents) {
  const events = Array.isArray(billingEvents) ? billingEvents : [];
  const renewals = events
    .filter((e) => {
      const t = String(e.eventType || e.event_type || "").toUpperCase();
      return t === "RENEWAL" || t === "INITIAL_PURCHASE";
    })
    .map((e) => Date.parse(String(e.createdAt || e.created_at || "")))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (renewals.length) {
    const subCreated = Date.parse(String(subscription?.createdAt || subscription?.created_at || ""));
    const planId = String(subscription?.planId || subscription?.plan_id || "").toLowerCase();
    const trialMs = planId === "weekly" ? 7 * 86400000 : 0;
    if (Number.isFinite(subCreated) && trialMs > 0) {
      const afterTrial = renewals.find((ms) => ms >= subCreated + trialMs - 86400000);
      if (afterTrial) return afterTrial;
    }
    if (String(subscription?.status || "").toLowerCase() === "active") {
      return renewals[renewals.length - 1];
    }
  }

  const status = String(subscription?.status || "").toLowerCase();
  if (status !== "active") return null;
  const planId = String(subscription?.planId || subscription?.plan_id || "").toLowerCase();
  const createdMs = Date.parse(String(subscription?.createdAt || subscription?.created_at || ""));
  if (!Number.isFinite(createdMs)) return null;
  const trialDays = planId === "weekly" ? 7 : 0;
  return createdMs + trialDays * 86400000;
}

function isPendingCancel(subscription) {
  const sub = subscription || {};
  const status = String(sub.status || sub.statusLabel || "").toLowerCase();
  const cancelAtPeriodEnd = Boolean(sub.cancelAtPeriodEnd ?? sub.cancel_at_period_end);
  const endMs = Date.parse(String(sub.currentPeriodEnd || sub.current_period_end || ""));
  const inPeriod = Number.isFinite(endMs) && endMs > Date.now();
  return inPeriod && (cancelAtPeriodEnd || status === "cancelled");
}

/**
 * Pick the best template to suggest for manual send (never auto-sends).
 */
function suggestSupportEmailTemplate({ subscription, emailLogs, billingEvents } = {}) {
  const sub = subscription || {};
  if (!sub.planId && !sub.plan_id) return null;

  const sent = sentTemplateIds(emailLogs);
  const now = Date.now();
  const status = String(sub.status || "").toLowerCase();
  const endMs = Date.parse(String(sub.currentPeriodEnd || sub.current_period_end || ""));
  const createdMs = Date.parse(String(sub.createdAt || sub.created_at || ""));

  if (isPendingCancel(sub) && !sent.has("cancel_confirm")) {
    return "cancel_confirm";
  }

  if (status === "trialing") {
    const daysUntilEnd = daysBetween(now, endMs);
    if (daysUntilEnd != null && daysUntilEnd <= 3 && daysUntilEnd > 0 && !sent.has("trial_ending")) {
      return "trial_ending";
    }
    const daysSinceStart = daysBetween(createdMs, now);
    if (daysSinceStart != null && daysSinceStart <= 2 && !sent.has("trial_welcome")) {
      return "trial_welcome";
    }
    if (!sent.has("trial_ending") && daysUntilEnd != null && daysUntilEnd <= 3) return "trial_ending";
    if (!sent.has("trial_welcome")) return "trial_welcome";
    return null;
  }

  if (status === "active" || status === "grace") {
    const paidAt = firstPaidAt(sub, billingEvents);
    const daysSincePaid = paidAt != null ? daysBetween(paidAt, now) : null;

    if (daysSincePaid != null && daysSincePaid <= 4 && !sent.has("first_paid")) {
      return "first_paid";
    }
    if (daysSincePaid != null && daysSincePaid >= 7 && daysSincePaid <= 30 && !sent.has("feedback_checkin")) {
      return "feedback_checkin";
    }
    if (!sent.has("first_paid") && status === "active") {
      const daysSinceStart = daysBetween(createdMs, now);
      const planId = String(sub.planId || sub.plan_id || "").toLowerCase();
      if (planId === "monthly" && daysSinceStart != null && daysSinceStart <= 4) return "first_paid";
      if (planId === "weekly" && daysSinceStart != null && daysSinceStart >= 7 && daysSinceStart <= 11) {
        return "first_paid";
      }
    }
  }

  return null;
}

function buildSupportEmailPreview({ templateId, subscription, billingEvents }) {
  const id = String(templateId || "").trim();
  if (!templateMeta(id)) return null;
  const vars = buildTemplateVars({ subscription, billingEvents });
  const rendered = renderTemplate(id, vars);
  if (!rendered) return null;
  return {
    ...rendered,
    meta: templateMeta(id),
    vars,
  };
}

module.exports = {
  SUPPORT_TEMPLATES,
  templateMeta,
  buildTemplateVars,
  renderTemplate,
  plainToHtml,
  suggestSupportEmailTemplate,
  buildSupportEmailPreview,
  isPendingCancel,
  sentTemplateIds,
};
