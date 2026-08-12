/**
 * Resolve NabadAi users by email or @username for admin team flows.
 */

const { selectFromTable } = require("./credits-auth");
const { resolveUserIdByEmail } = require("./admin-auth");

function normalizeLookup(input) {
  let s = String(input || "").trim();
  if (!s) return { type: "empty", value: "" };
  if (s.startsWith("@")) s = s.slice(1);
  if (s.includes("@")) {
    return { type: "email", value: s.toLowerCase() };
  }
  return { type: "username", value: s.toLowerCase() };
}

async function resolveUserByUsername(username) {
  const handle = String(username || "").trim().toLowerCase().replace(/^@/, "");
  if (!handle) return null;
  const res = await selectFromTable(
    `profiles?select=user_id,username,email,display_name,role&username=eq.${encodeURIComponent(handle)}&limit=1`,
  );
  const row = Array.isArray(res.data) ? res.data[0] : null;
  if (!row?.user_id) return null;
  return {
    userId: String(row.user_id),
    username: String(row.username || "").trim(),
    email: String(row.email || "").trim().toLowerCase(),
    name: String(row.display_name || "").trim(),
    role: String(row.role || "user").trim().toLowerCase(),
  };
}

async function resolveUserLookup(input) {
  const lookup = normalizeLookup(input);
  if (!lookup.value) return null;

  if (lookup.type === "email") {
    const userId = await resolveUserIdByEmail(lookup.value);
    if (!userId) return null;
    const prof = await selectFromTable(
      `profiles?select=user_id,username,email,display_name,role&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    );
    const row = Array.isArray(prof.data) ? prof.data[0] : null;
    return {
      userId,
      email: lookup.value,
      username: String(row?.username || "").trim(),
      name: String(row?.display_name || "").trim(),
      role: String(row?.role || "user").trim().toLowerCase(),
    };
  }

  return resolveUserByUsername(lookup.value);
}

function escapeLike(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function searchNeedle(input) {
  return String(input || "").trim().toLowerCase().replace(/^@/, "");
}

function ilikeContainsParam(column, needle) {
  const n = escapeLike(searchNeedle(needle));
  if (!n) return null;
  return `${column}=ilike.*${encodeURIComponent(n)}*`;
}

async function adminSearchUserIds(query, { authMap = null, limit = 100 } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];

  const idSet = new Set();
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const lookup = normalizeLookup(q);

  if (lookup.type === "email") {
    const exact = await resolveUserLookup(q);
    if (exact?.userId) idSet.add(String(exact.userId));
  }

  const exactUsername = await resolveUserByUsername(lookup.value);
  if (exactUsername?.userId) idSet.add(String(exactUsername.userId));

  const filters = [
    ilikeContainsParam("username", q),
    ilikeContainsParam("display_name", q),
    ilikeContainsParam("email", q),
  ].filter(Boolean);

  for (const filter of filters) {
    const res = await selectFromTable(
      `profiles?select=user_id&${filter}&limit=${lim}`,
    );
    if (!res.ok) continue;
    for (const row of Array.isArray(res.data) ? res.data : []) {
      if (row?.user_id) idSet.add(String(row.user_id));
    }
  }

  const hits = await searchUsers(q, { limit: 20 });
  for (const hit of hits) {
    if (hit?.userId) idSet.add(String(hit.userId));
  }

  const needle = searchNeedle(q);
  if (authMap && needle) {
    for (const [userId, auth] of authMap) {
      if (auth.email && auth.email.includes(needle)) idSet.add(String(userId));
    }
  }

  return [...idSet].slice(0, lim);
}

async function searchUsers(query, { limit = 8 } = {}) {
  const lookup = normalizeLookup(query);
  if (!lookup.value || lookup.value.length < 2) return [];

  const lim = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const hits = [];

  if (lookup.type === "email") {
    const user = await resolveUserLookup(lookup.value);
    if (user) hits.push(user);
    return hits;
  }

  const prefix = encodeURIComponent(escapeLike(lookup.value));
  const res = await selectFromTable(
    `profiles?select=user_id,username,email,display_name,role&username=ilike.${prefix}*&order=username.asc&limit=${lim}`,
  );
  for (const row of Array.isArray(res.data) ? res.data : []) {
    hits.push({
      userId: String(row.user_id),
      username: String(row.username || "").trim(),
      email: String(row.email || "").trim().toLowerCase(),
      name: String(row.display_name || "").trim(),
      role: String(row.role || "user").trim().toLowerCase(),
    });
  }
  return hits;
}

module.exports = {
  normalizeLookup,
  resolveUserLookup,
  resolveUserByUsername,
  searchUsers,
  adminSearchUserIds,
  escapeLike,
  searchNeedle,
};
