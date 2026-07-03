/**
 * Parse @username tokens, resolve to profiles, and notify mutual followers.
 */

const USERNAME_MAX = 24;
const MENTION_MAX_PER_BODY = 5;
const MENTION_HANDLE_RE = new RegExp(
  `@([a-z0-9_](?:[a-z0-9_.]{0,${USERNAME_MAX - 2}}[a-z0-9_])?)`,
  "gi",
);

function cleanUserId(v) {
  const s = String(v || "").trim();
  return /^[0-9a-f-]{36}$/i.test(s) ? s : "";
}

function cleanUsername(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_.]/g, "")
    .slice(0, USERNAME_MAX);
}

function parseMentionHandles(text) {
  const raw = String(text || "");
  const seen = new Set();
  const out = [];
  let m;
  const re = new RegExp(MENTION_HANDLE_RE.source, "gi");
  while ((m = re.exec(raw)) !== null) {
    const handle = cleanUsername(m[1]);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
    if (out.length >= MENTION_MAX_PER_BODY) break;
  }
  return out;
}

async function isMutualFollow(svcFetch, userA, userB) {
  const a = cleanUserId(userA);
  const b = cleanUserId(userB);
  if (!a || !b || a === b) return false;
  const [f1, f2] = await Promise.all([
    svcFetch(
      `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(a)}&following_user_id=eq.${encodeURIComponent(b)}&limit=1`,
    ),
    svcFetch(
      `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(b)}&following_user_id=eq.${encodeURIComponent(a)}&limit=1`,
    ),
  ]);
  return (
    f1.ok && f2.ok &&
    Array.isArray(f1.data) && f1.data.length > 0 &&
    Array.isArray(f2.data) && f2.data.length > 0
  );
}

async function profileByUsername(svcFetch, username) {
  const handle = cleanUsername(username);
  if (!handle) return null;
  const eq = encodeURIComponent(handle);
  const r = await svcFetch(
    `profiles?select=user_id,username,avatar&username=eq.${eq}&limit=1`,
  );
  if (Array.isArray(r.data) && r.data[0]) return r.data[0];
  const ilike = encodeURIComponent(handle.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_"));
  const r2 = await svcFetch(`profiles?select=user_id,username,avatar&username=ilike.${ilike}&limit=1`);
  return Array.isArray(r2.data) && r2.data[0] ? r2.data[0] : null;
}

async function profileByUserId(svcFetch, userId) {
  const uid = cleanUserId(userId);
  if (!uid) return null;
  const r = await svcFetch(
    `profiles?select=user_id,username,avatar&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  return Array.isArray(r.data) && r.data[0] ? r.data[0] : null;
}

async function resolveMutualMentionTargets(svcFetch, actorUserId, text) {
  const actor = cleanUserId(actorUserId);
  if (!actor) return [];
  const handles = parseMentionHandles(text);
  if (!handles.length) return [];
  const profiles = await Promise.all(handles.map((h) => profileByUsername(svcFetch, h)));
  const out = [];
  const seenIds = new Set();
  for (const prof of profiles) {
    const uid = cleanUserId(prof?.user_id);
    if (!uid || uid === actor || seenIds.has(uid)) continue;
    if (!(await isMutualFollow(svcFetch, actor, uid))) continue;
    seenIds.add(uid);
    out.push(prof);
  }
  return out;
}

async function insertMentionRow(svcFetch, { sourceKind, sourceId, actorUserId, mentionedUserId }) {
  const sk = String(sourceKind || "").trim();
  const sid = String(sourceId || "").trim();
  const actor = cleanUserId(actorUserId);
  const mentioned = cleanUserId(mentionedUserId);
  if (!sk || !sid || !actor || !mentioned || actor === mentioned) return false;
  const ins = await svcFetch("social_mentions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      source_kind: sk,
      source_id: sid,
      actor_user_id: actor,
      mentioned_user_id: mentioned,
    }),
  });
  return ins.ok || ins.status === 409;
}

function buildMentionNotificationMetadata({
  actorProfile,
  sourceKind,
  sourceId,
  targetKind,
  targetId,
  preview,
  songTitle,
  songArtUrl,
}) {
  return {
    actor_username: actorProfile?.username || "",
    actor_avatar: actorProfile?.avatar || "",
    source_kind: String(sourceKind || "").trim(),
    source_id: String(sourceId || "").trim(),
    target_kind: String(targetKind || "").trim(),
    target_id: String(targetId || "").trim(),
    mention_preview: String(preview || "").slice(0, 140),
    ...(songTitle ? { song_title: String(songTitle).trim().slice(0, 120) } : {}),
    ...(songArtUrl ? { song_art_url: String(songArtUrl).trim() } : {}),
  };
}

async function processMentions({
  svcFetch,
  insertNotification,
  notificationExists,
  actorUserId,
  sourceKind,
  sourceId,
  body,
  targetKind = "",
  targetId = "",
  songTitle = "",
  songArtUrl = "",
}) {
  const actor = cleanUserId(actorUserId);
  const sid = String(sourceId || "").trim();
  const sk = String(sourceKind || "").trim();
  if (!actor || !sid || !sk) return { notified: 0 };

  const targets = await resolveMutualMentionTargets(svcFetch, actor, body);
  if (!targets.length) return { notified: 0 };

  const actorProfile = await profileByUserId(svcFetch, actor);
  let notified = 0;

  for (const prof of targets) {
    const mentioned = cleanUserId(prof.user_id);
    if (!mentioned) continue;
    const stored = await insertMentionRow(svcFetch, {
      sourceKind: sk,
      sourceId: sid,
      actorUserId: actor,
      mentionedUserId: mentioned,
    });
    if (!stored) continue;

    const entityId = `${sk}:${sid}:mention:${mentioned}`;
    if (await notificationExists({ userId: mentioned, type: "social_mention", entityId })) continue;

    const ok = await insertNotification({
      userId: mentioned,
      type: "social_mention",
      actorUserId: actor,
      entityId,
      metadata: buildMentionNotificationMetadata({
        actorProfile,
        sourceKind: sk,
        sourceId: sid,
        targetKind,
        targetId,
        preview: body,
        songTitle,
        songArtUrl,
      }),
    });
    if (ok) notified += 1;
  }

  return { notified };
}

module.exports = {
  MENTION_MAX_PER_BODY,
  parseMentionHandles,
  isMutualFollow,
  resolveMutualMentionTargets,
  processMentions,
};
