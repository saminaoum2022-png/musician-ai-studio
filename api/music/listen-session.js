/**
 * Live Listen — host-owned one-song session.
 *
 * GET  /api/music/listen-session?sessionId=...
 * POST /api/music/listen-session  { action: create | join | heartbeat | end | leave, ... }
 *
 * Provider-neutral path. Mutual-fan gated. Hidden behind NABAD_LIVE_LISTEN_ENABLED
 * (default on for Vercel Preview).
 */

const { applyCors } = require("../_lib/cors");
const {
  verifyUser,
  sendJson,
  readJsonBody,
  callRpc,
} = require("../_lib/credits-auth");
const { sendPrivacySafePush } = require("../_lib/onesignal-push");
const { nabadLiveListenEnabled } = require("../_lib/nabad-live-listen-lib");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TTL_MS = 8 * 60 * 1000;
const EXTRA_TTL_MS = 2 * 60 * 1000;
const MIN_TTL_MS = 90 * 1000;

function cleanUserId(v) {
  const s = String(v || "").trim().toLowerCase();
  return UUID_RE.test(s) ? s : "";
}

function svcHeaders(extra) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(extra || {}),
  };
}

function isTableMissing(result) {
  const text = String(result?.text || result?.error || "");
  const data = result?.data;
  const msg = typeof data === "object" && data
    ? String(data.message || data.hint || data.details || "")
    : "";
  return (
    result?.status === 404
    || /listen_sessions/i.test(text)
    || /listen_sessions/i.test(msg)
    || /does not exist/i.test(text)
    || /does not exist/i.test(msg)
    || /schema cache/i.test(text)
    || /schema cache/i.test(msg)
  );
}

async function svcFetch(path, opts = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, data: null, text: "Missing Supabase service role" };
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: svcHeaders(opts.headers),
    });
    const text = await r.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: r.ok, status: r.status, data, text };
  } catch (e) {
    return { ok: false, status: 500, data: null, text: String(e?.message || e) };
  }
}

async function isMutualFollow(userA, userB) {
  const a = cleanUserId(userA);
  const b = cleanUserId(userB);
  if (!a || !b || a === b) return false;
  const rpc = await callRpc("social_profile_stats", {
    p_user_id: b,
    p_viewer_id: a,
  });
  if (rpc.ok && rpc.data && typeof rpc.data === "object") {
    return Boolean(rpc.data.is_following) && Boolean(rpc.data.follows_viewer);
  }
  const [f1, f2] = await Promise.all([
    svcFetch(
      `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(a)}&following_user_id=eq.${encodeURIComponent(b)}&limit=1`,
    ),
    svcFetch(
      `social_follows?select=follower_user_id&follower_user_id=eq.${encodeURIComponent(b)}&following_user_id=eq.${encodeURIComponent(a)}&limit=1`,
    ),
  ]);
  return (
    f1.ok && f2.ok
    && Array.isArray(f1.data) && f1.data.length > 0
    && Array.isArray(f2.data) && f2.data.length > 0
  );
}

async function profilesByUserIds(userIds) {
  const ids = [...new Set((userIds || []).map(cleanUserId).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const inClause = ids.map(encodeURIComponent).join(",");
  const r = await svcFetch(
    `profiles?user_id=in.(${inClause})&select=user_id,username,display_name,avatar`,
  );
  for (const row of Array.isArray(r.data) ? r.data : []) {
    const uid = String(row.user_id || "");
    if (!uid) continue;
    map.set(uid, {
      userId: uid,
      username: String(row.username || "").replace(/^@/, "").trim(),
      displayName: String(row.display_name || row.username || "").replace(/^@/, "").trim(),
      avatar: String(row.avatar || "").trim(),
    });
  }
  return map;
}

function computeExpiresAt({ durationMs, positionMs }) {
  const dur = Math.max(0, Number(durationMs) || 0);
  const pos = Math.max(0, Number(positionMs) || 0);
  const remaining = dur > 0 ? Math.max(0, dur - pos) : MAX_TTL_MS - EXTRA_TTL_MS;
  const ttl = Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, remaining + EXTRA_TTL_MS));
  return new Date(Date.now() + ttl).toISOString();
}

function isSessionExpired(row) {
  const exp = row?.expires_at ? Date.parse(row.expires_at) : 0;
  return Boolean(exp && exp <= Date.now());
}

function isSessionLive(row) {
  if (!row || String(row.status || "") !== "live") return false;
  return !isSessionExpired(row);
}

function rowGuestJoined(row) {
  const v = row?.guest_joined;
  if (v === true || v === "t" || v === "true") return true;
  if (v === false || v === "f" || v === "false") return false;
  return null;
}

function isGuestJoinedColumnMissing(result) {
  const text = String(result?.text || result?.error || "");
  const data = result?.data;
  const msg = typeof data === "object" && data
    ? String(data.message || data.hint || data.details || "")
    : "";
  return /guest_joined/i.test(text + msg) && /column|schema cache/i.test(text + msg);
}

function publicUser(map, userId) {
  return map.get(cleanUserId(userId)) || {
    userId: cleanUserId(userId),
    username: "",
    displayName: "",
    avatar: "",
  };
}

function serializeSession(row, { viewerId, profiles } = {}) {
  const hideTitles = row.hide_titles === true;
  const viewer = cleanUserId(viewerId);
  const hostId = cleanUserId(row.host_user_id);
  const guestId = cleanUserId(row.guest_user_id);
  const live = isSessionLive(row);
  const joined = rowGuestJoined(row);
  const title = hideTitles && viewer && viewer !== hostId
    ? ""
    : String(row.song_title || "");
  let role = null;
  if (viewer && viewer === hostId) role = "host";
  else if (viewer && viewer === guestId) role = "guest";
  let status = "ended";
  if (live) status = joined === false ? "pending" : "live";
  return {
    id: String(row.id),
    hostUserId: hostId,
    guestUserId: guestId,
    songId: String(row.song_id || ""),
    songTitle: title,
    songCover: String(row.song_cover || ""),
    songUrl: String(row.song_url || ""),
    songOwnerId: String(row.song_owner_id || ""),
    playing: live ? row.playing !== false : false,
    positionMs: Math.max(0, Number(row.position_ms) || 0),
    hostSentAt: Number(row.host_sent_at) || Date.parse(row.updated_at || row.started_at) || Date.now(),
    startedAt: row.started_at || null,
    expiresAt: row.expires_at || null,
    status,
    guestJoined: joined,
    hideTitles,
    durationMs: Math.max(0, Number(row.duration_ms) || 0),
    host: publicUser(profiles || new Map(), hostId),
    guest: publicUser(profiles || new Map(), guestId),
    role,
  };
}

async function loadSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!UUID_RE.test(id)) return { ok: false, status: 400, error: "Invalid session" };
  const r = await svcFetch(
    `listen_sessions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );
  if (isTableMissing(r)) {
    return { ok: false, status: 503, error: "Live listen is not set up yet", code: "table_missing" };
  }
  if (!r.ok) return { ok: false, status: r.status || 500, error: "Could not load session" };
  const row = Array.isArray(r.data) ? r.data[0] : null;
  if (!row) return { ok: false, status: 404, error: "Session not found" };
  return { ok: true, row };
}

async function endHostLiveSessions(hostUserId, { exceptId } = {}) {
  const uid = cleanUserId(hostUserId);
  if (!uid) return;
  let path = `listen_sessions?host_user_id=eq.${encodeURIComponent(uid)}&status=eq.live`;
  if (exceptId && UUID_RE.test(exceptId)) {
    path += `&id=neq.${encodeURIComponent(exceptId)}`;
  }
  await svcFetch(path, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "ended",
      playing: false,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function fetchProfilesForRow(row) {
  return profilesByUserIds([row.host_user_id, row.guest_user_id]);
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  try {
    if (!nabadLiveListenEnabled()) {
      return sendJson(res, 404, { error: "Not found" });
    }
    const user = await verifyUser(req);
    if (!user?.userId) return sendJson(res, 401, { error: "Sign in required" });

    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const incoming = String(url.searchParams.get("incoming") || "").trim() === "1";
      const me = cleanUserId(user.userId);
      if (incoming) {
        const nowIso = encodeURIComponent(new Date().toISOString());
        const r = await svcFetch(
          `listen_sessions?guest_user_id=eq.${encodeURIComponent(me)}` +
            `&status=eq.live&expires_at=gt.${nowIso}` +
            `&select=*&order=started_at.desc&limit=5`,
        );
        if (isTableMissing(r)) {
          return sendJson(res, 503, { error: "Live listen is not set up yet", code: "table_missing" });
        }
        if (!r.ok) return sendJson(res, 500, { error: "Could not load invites" });
        const rows = Array.isArray(r.data) ? r.data : [];
        const liveRows = rows.filter((row) => isSessionLive(row));
        const profiles = await profilesByUserIds(
          liveRows.flatMap((row) => [row.host_user_id, row.guest_user_id]),
        );
        return sendJson(res, 200, {
          ok: true,
          sessions: liveRows.map((row) => serializeSession(row, { viewerId: me, profiles })),
        });
      }
      const sessionId = String(url.searchParams.get("sessionId") || "").trim();
      const loaded = await loadSession(sessionId);
      if (!loaded.ok) {
        return sendJson(res, loaded.status, { error: loaded.error, code: loaded.code });
      }
      const hostId = cleanUserId(loaded.row.host_user_id);
      const guestId = cleanUserId(loaded.row.guest_user_id);
      if (me !== hostId && me !== guestId) {
        return sendJson(res, 403, { error: "Not in this session" });
      }
      const profiles = await fetchProfilesForRow(loaded.row);
      return sendJson(res, 200, {
        ok: true,
        session: serializeSession(loaded.row, { viewerId: me, profiles }),
      });
    }

    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "Method not allowed" });
    }

    const body = await readJsonBody(req);
    const action = String(body?.action || "").trim().toLowerCase();
    const me = cleanUserId(user.userId);

    if (action === "create") {
      const guestUserId = cleanUserId(body.guestUserId);
      const songUrl = String(body.songUrl || "").trim();
      if (!guestUserId) return sendJson(res, 400, { error: "Missing guest" });
      if (guestUserId === me) return sendJson(res, 400, { error: "Invite someone else" });
      if (!/^https?:\/\//i.test(songUrl) || songUrl.length > 2000) {
        return sendJson(res, 400, { error: "Need a playable song URL" });
      }
      const mutual = await isMutualFollow(me, guestUserId);
      if (!mutual) {
        return sendJson(res, 403, { error: "Become mutual fans first" });
      }
      const positionMs = Math.max(0, Math.round(Number(body.positionMs) || 0));
      const durationMs = Math.max(0, Math.round(Number(body.durationMs) || 0));
      const playing = body.playing !== false;
      const hideTitles = body.hideTitles === true;
      const now = Date.now();
      await endHostLiveSessions(me);
      const row = {
        host_user_id: me,
        guest_user_id: guestUserId,
        song_id: String(body.songId || "").trim().slice(0, 80) || null,
        song_title: String(body.songTitle || "").trim().slice(0, 160) || null,
        song_cover: String(body.songCover || "").trim().slice(0, 2000) || null,
        song_url: songUrl,
        song_owner_id: cleanUserId(body.songOwnerId) || null,
        position_ms: positionMs,
        playing,
        host_sent_at: now,
        duration_ms: durationMs || null,
        expires_at: computeExpiresAt({ durationMs, positionMs }),
        status: "live",
        guest_joined: false,
        hide_titles: hideTitles,
        thread_id: UUID_RE.test(String(body.threadId || "")) ? String(body.threadId).trim() : null,
        updated_at: new Date().toISOString(),
      };
      let ins = await svcFetch("listen_sessions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      if (!ins.ok && isGuestJoinedColumnMissing(ins)) {
        const fallback = { ...row };
        delete fallback.guest_joined;
        ins = await svcFetch("listen_sessions", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(fallback),
        });
      }
      if (isTableMissing(ins)) {
        return sendJson(res, 503, { error: "Live listen is not set up yet", code: "table_missing" });
      }
      if (!ins.ok) {
        return sendJson(res, 500, { error: "Could not start live listen" });
      }
      const created = Array.isArray(ins.data) ? ins.data[0] : ins.data;
      if (!created?.id) return sendJson(res, 500, { error: "Could not start live listen" });
      const profiles = await fetchProfilesForRow(created);
      const host = publicUser(profiles, me);
      try {
        await svcFetch("social_notifications", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            user_id: guestUserId,
            type: "live_listen",
            actor_user_id: me,
            entity_id: String(created.id),
            metadata: {
              actor_username: host.username || host.displayName || "",
              actor_avatar: host.avatar || "",
              song_title: String(created.song_title || "").trim(),
              song_cover: String(created.song_cover || "").trim(),
              session_id: String(created.id),
            },
          }),
        });
      } catch (e) {
        console.warn("[live-listen] activity insert failed", e?.message || e);
      }
      try {
        await sendPrivacySafePush({
          userId: guestUserId,
          type: "live_listen",
          entityId: created.id,
          actorDisplayName: host.displayName || host.username || "Someone",
        });
      } catch (e) {
        console.warn("[live-listen] push failed", e?.message || e);
      }
      return sendJson(res, 200, {
        ok: true,
        session: serializeSession(created, { viewerId: me, profiles }),
      });
    }

    if (action === "join" || action === "heartbeat" || action === "end" || action === "leave") {
      const loaded = await loadSession(body.sessionId);
      if (!loaded.ok) {
        return sendJson(res, loaded.status, { error: loaded.error, code: loaded.code });
      }
      const row = loaded.row;
      const hostId = cleanUserId(row.host_user_id);
      const guestId = cleanUserId(row.guest_user_id);
      if (me !== hostId && me !== guestId) {
        return sendJson(res, 403, { error: "Not in this session" });
      }

      if (action === "join") {
        if (me !== guestId) return sendJson(res, 403, { error: "Only the guest can join" });
        if (!isSessionLive(row)) {
          const profiles = await fetchProfilesForRow(row);
          return sendJson(res, 200, {
            ok: true,
            live: false,
            session: serializeSession({ ...row, status: "ended", playing: false }, { viewerId: me, profiles }),
          });
        }
        let next = row;
        if (rowGuestJoined(row) !== true) {
          const upd = await svcFetch(
            `listen_sessions?id=eq.${encodeURIComponent(row.id)}`,
            {
              method: "PATCH",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify({
                guest_joined: true,
                updated_at: new Date().toISOString(),
              }),
            },
          );
          if (upd.ok) {
            next = Array.isArray(upd.data) ? upd.data[0] : (upd.data || { ...row, guest_joined: true });
          } else if (!isGuestJoinedColumnMissing(upd)) {
            next = { ...row, guest_joined: true };
          } else {
            next = { ...row, guest_joined: true };
          }
        }
        const profiles = await fetchProfilesForRow(next);
        return sendJson(res, 200, {
          ok: true,
          session: serializeSession({ ...next, guest_joined: true }, { viewerId: me, profiles }),
          live: true,
        });
      }

      if (action === "heartbeat") {
        if (me !== hostId) return sendJson(res, 403, { error: "Only the host can sync" });
        if (!isSessionLive(row)) {
          const profiles = await fetchProfilesForRow(row);
          return sendJson(res, 200, {
            ok: true,
            session: serializeSession({ ...row, status: "ended", playing: false }, { viewerId: me, profiles }),
          });
        }
        const positionMs = Math.max(0, Math.round(Number(body.positionMs) || 0));
        const playing = body.playing !== false;
        const hostSentAt = Math.max(0, Number(body.hostSentAt) || Date.now());
        const durationMs = Math.max(0, Math.round(Number(body.durationMs) || row.duration_ms || 0));
        const patch = {
          position_ms: positionMs,
          playing,
          host_sent_at: hostSentAt,
          duration_ms: durationMs || row.duration_ms || null,
          updated_at: new Date().toISOString(),
        };
        if (durationMs > 0) {
          patch.expires_at = computeExpiresAt({ durationMs, positionMs });
        }
        const upd = await svcFetch(
          `listen_sessions?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(patch),
          },
        );
        const next = Array.isArray(upd.data) ? upd.data[0] : (upd.data || { ...row, ...patch });
        const profiles = await fetchProfilesForRow(next);
        return sendJson(res, 200, {
          ok: true,
          session: serializeSession(next, { viewerId: me, profiles }),
        });
      }

      if (action === "end") {
        if (me !== hostId) return sendJson(res, 403, { error: "Only the host can end" });
        const upd = await svcFetch(
          `listen_sessions?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              status: "ended",
              playing: false,
              updated_at: new Date().toISOString(),
            }),
          },
        );
        const next = Array.isArray(upd.data) ? upd.data[0] : { ...row, status: "ended", playing: false };
        const profiles = await fetchProfilesForRow(next);
        return sendJson(res, 200, {
          ok: true,
          session: serializeSession(next, { viewerId: me, profiles }),
        });
      }

      if (action === "leave") {
        if (me !== guestId) return sendJson(res, 403, { error: "Only the guest can leave" });
        const upd = await svcFetch(
          `listen_sessions?id=eq.${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              status: "ended",
              playing: false,
              updated_at: new Date().toISOString(),
            }),
          },
        );
        const next = Array.isArray(upd.data) ? upd.data[0] : { ...row, status: "ended", playing: false };
        const profiles = await fetchProfilesForRow(next);
        return sendJson(res, 200, {
          ok: true,
          left: true,
          session: serializeSession(next, { viewerId: me, profiles }),
        });
      }
    }

    return sendJson(res, 400, { error: "Unknown action" });
  } catch (e) {
    return sendJson(res, 500, { error: e?.message || String(e) });
  }
};
