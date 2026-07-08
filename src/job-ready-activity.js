/**
 * Local Activity rows + optional push when a background job finishes.
 */

const JOB_ACTIVITY_KEY = "nabad_job_ready_activity_v1";

export function persistJobReadyActivity(n) {
  if (!n?.id) return;
  try {
    const raw = localStorage.getItem(JOB_ACTIVITY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const arr = Array.isArray(list) ? list : [];
    arr.unshift(n);
    localStorage.setItem(JOB_ACTIVITY_KEY, JSON.stringify(arr.slice(0, 40)));
  } catch {}
}

export function loadPersistedJobReadyActivities() {
  try {
    const raw = localStorage.getItem(JOB_ACTIVITY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function buildJobReadyActivity({ type, title, metadata = {} } = {}) {
  const t = String(type || "").trim();
  const jobTitle = String(title || "Your creation").trim() || "Your creation";
  if (!t) return null;
  return {
    id: `local-job-${t}-${Date.now()}`,
    type: t,
    created_at: new Date().toISOString(),
    read_at: null,
    local: true,
    metadata: {
      job_title: jobTitle,
      ...metadata,
    },
  };
}

const GENERATION_FAILED_ACTIVITY_KEY = "nabad_generation_failed_activity_v1";
const GENERATION_FAILED_ACTIVITY_MAX = 48;

export function buildGenerationFailedActivity({
  title = "Your song",
  taskId = "",
  failureKind = "generic",
  isRemix = false,
} = {}) {
  const jobTitle = String(title || "Your song").trim() || "Your song";
  const tid = String(taskId || "").trim();
  return {
    id: `local-gen-fail-${tid || Date.now()}-${failureKind}`,
    type: "generation_failed",
    created_at: new Date().toISOString(),
    read_at: null,
    local: true,
    metadata: {
      song_title: jobTitle,
      task_id: tid,
      failure_kind: String(failureKind || "generic"),
      is_remix: Boolean(isRemix),
    },
  };
}

export function loadPersistedGenerationFailedActivities() {
  try {
    const raw = localStorage.getItem(GENERATION_FAILED_ACTIVITY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((n) => String(n?.type || "") === "generation_failed") : [];
  } catch {
    return [];
  }
}

export function persistGenerationFailedActivity(n) {
  if (!n?.id) return;
  try {
    const list = loadPersistedGenerationFailedActivities().filter((item) => String(item?.id || "") !== n.id);
    list.unshift({ ...n, local: true, pinned: true });
    localStorage.setItem(
      GENERATION_FAILED_ACTIVITY_KEY,
      JSON.stringify(list.slice(0, GENERATION_FAILED_ACTIVITY_MAX)),
    );
  } catch {}
}

/** Ask server to send a push if the user left the app (deduped with Suno callback). */
export async function maybeNotifyJobReadyPush({ kind, title, taskId } = {}) {
  const k = String(kind || "").trim();
  const tid = String(taskId || "").trim();
  if (!k || !tid) return;
  const token = globalThis.__nabadGetAuthToken?.() || "";
  if (!token) return;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const bypass = globalThis.__VERCEL_PROTECTION_BYPASS__;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const base = String(globalThis.__nabadApiBase || "").replace(/\/$/, "");
  const url = base ? `${base}/api/push/job-ready` : "/api/push/job-ready";
  try {
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        kind: k,
        title: String(title || "").trim().slice(0, 120),
        taskId: tid,
      }),
    });
  } catch {}
}
