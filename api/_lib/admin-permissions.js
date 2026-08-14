/**
 * NabadAi admin dashboard roles and view permissions.
 * Supabase stays the source of truth; this module enforces access in Vercel APIs.
 */

const DASHBOARD_ROLES = Object.freeze([
  "admin",
  "operations",
  "support",
  "moderator",
  "finance",
  "viewer",
]);

const ALL_VIEWS = Object.freeze([
  "overview",
  "providers",
  "suno",
  "users",
  "user",
  "credits",
  "promos",
  "singers",
  "generations",
  "generation",
  "publications",
  "subscriptions",
  "billing",
  "settings",
]);

const ROLE_META = Object.freeze({
  admin: {
    label: "Owner / Admin",
    description: "Full dashboard access. Can invite teammates and change roles.",
    views: ["*"],
    grantCredits: true,
    manageTeam: true,
    moderatePublications: true,
  },
  operations: {
    label: "Operations",
    description: "Platform health, Suno bucket, users, and subscription monitoring.",
    views: ["overview", "providers", "users", "user", "generations", "generation", "singers", "subscriptions", "billing"],
    grantCredits: false,
    manageTeam: false,
    moderatePublications: false,
  },
  support: {
    label: "Support",
    description: "Help users with credits, account lookups, and generation issues.",
    views: ["users", "user", "credits", "promos", "singers", "generations", "generation", "subscriptions", "billing"],
    grantCredits: true,
    manageTeam: false,
    moderatePublications: false,
  },
  moderator: {
    label: "Moderator",
    description: "Review public posts and creator activity.",
    views: ["users", "user", "publications", "generations", "generation", "singers"],
    grantCredits: false,
    manageTeam: false,
    moderatePublications: true,
  },
  finance: {
    label: "Finance",
    description: "Revenue, subscriptions, and credit ledger visibility.",
    views: ["overview", "credits", "promos", "subscriptions", "billing", "users", "user"],
    grantCredits: false,
    manageTeam: false,
    moderatePublications: false,
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access across analytics tabs.",
    views: [
      "overview",
      "providers",
      "suno",
      "users",
      "user",
      "credits",
      "promos",
      "generations",
      "generation",
      "publications",
      "subscriptions",
      "billing",
    ],
    grantCredits: false,
    manageTeam: false,
    moderatePublications: false,
  },
});

function normalizeRole(role) {
  const r = String(role || "user").trim().toLowerCase();
  return ROLE_META[r] ? r : "user";
}

function isDashboardRole(role) {
  return DASHBOARD_ROLES.includes(normalizeRole(role));
}

function roleViews(role) {
  const meta = ROLE_META[normalizeRole(role)];
  if (!meta) return [];
  if (meta.views.includes("*")) return [...ALL_VIEWS];
  return meta.views.filter((v) => ALL_VIEWS.includes(v));
}

function canAccessView(role, view, { isOwner = false } = {}) {
  const v = String(view || "").trim().toLowerCase();
  if (!v) return false;
  if (isOwner) return true;
  const allowed = roleViews(role);
  return allowed.includes(v);
}

function canGrantCredits(role, { isOwner = false } = {}) {
  if (isOwner) return true;
  const meta = ROLE_META[normalizeRole(role)];
  return Boolean(meta?.grantCredits);
}

function canManageTeam(role, { isOwner = false } = {}) {
  if (isOwner) return true;
  return normalizeRole(role) === "admin";
}

function canModeratePublications(role, { isOwner = false } = {}) {
  if (isOwner) return true;
  const meta = ROLE_META[normalizeRole(role)];
  return Boolean(meta?.moderatePublications);
}

function listAssignableRoles() {
  return DASHBOARD_ROLES.map((id) => ({
    id,
    label: ROLE_META[id].label,
    description: ROLE_META[id].description,
    views: roleViews(id),
    grantCredits: ROLE_META[id].grantCredits,
    manageTeam: ROLE_META[id].manageTeam,
    moderatePublications: ROLE_META[id].moderatePublications,
  }));
}

function buildAdminContext(user, profileRole, { isOwner = false } = {}) {
  const effectiveRole = isOwner ? "admin" : normalizeRole(profileRole);
  if (!isOwner && !isDashboardRole(effectiveRole)) return null;
  const meta = ROLE_META[effectiveRole] || ROLE_META.admin;
  const allowedViews = isOwner ? [...ALL_VIEWS] : roleViews(effectiveRole);
  return {
    userId: user.userId,
    email: user.email,
    role: effectiveRole,
    profileRole: normalizeRole(profileRole),
    roleLabel: meta.label,
    isOwner,
    allowedViews,
    canManageTeam: canManageTeam(effectiveRole, { isOwner }),
    canGrantCredits: canGrantCredits(effectiveRole, { isOwner }),
    canModeratePublications: canModeratePublications(effectiveRole, { isOwner }),
  };
}

module.exports = {
  DASHBOARD_ROLES,
  ALL_VIEWS,
  ROLE_META,
  normalizeRole,
  isDashboardRole,
  roleViews,
  canAccessView,
  canGrantCredits,
  canManageTeam,
  canModeratePublications,
  listAssignableRoles,
  buildAdminContext,
};
