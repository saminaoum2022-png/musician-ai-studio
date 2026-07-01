/**
 * NabadAi Studio — local-first store (V1)
 * ---------------------------------------
 * Projects (draft studio sessions) and Recordings (standalone voice memos /
 * quick takes) live ONLY on the device. Audio blobs go in IndexedDB (localStorage
 * can't hold audio); lightweight metadata goes in localStorage so lists render
 * instantly without opening the DB. Nothing here ever touches the network —
 * uploading only happens when the user explicitly publishes a finished mix.
 */

const DB_NAME = "nabad.studio.v1";
const STORE_BLOBS = "blobs";
const META_KEY = "nabad.studio.meta.v1";

let _dbPromise = null;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE_BLOBS)) d.createObjectStore(STORE_BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function putBlob(id, blob) {
  const d = await openDb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE_BLOBS, "readwrite");
    tx.objectStore(STORE_BLOBS).put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function readBlob(id) {
  const d = await openDb();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE_BLOBS, "readonly");
    const r = tx.objectStore(STORE_BLOBS).get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

async function removeBlob(id) {
  const d = await openDb();
  return new Promise((res) => {
    const tx = d.transaction(STORE_BLOBS, "readwrite");
    tx.objectStore(STORE_BLOBS).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

function readMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || "null");
    if (m && typeof m === "object") {
      m.projects = Array.isArray(m.projects) ? m.projects : [];
      m.recordings = Array.isArray(m.recordings) ? m.recordings : [];
      m.vocals = Array.isArray(m.vocals) ? m.vocals : [];
      return m;
    }
  } catch {}
  return { projects: [], recordings: [], vocals: [] };
}

function writeMeta(m) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch {}
}

/* ---- Recordings (standalone voice memos) ---- */

export function listRecordings() {
  return readMeta().recordings.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveRecording({ name, blob, durationSec }) {
  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (blob) { try { await putBlob(id, blob); } catch {} }
  const m = readMeta();
  m.recordings.push({
    id,
    name: String(name || "").trim() || `Recording ${m.recordings.length + 1}`,
    durationSec: Number(durationSec) || 0,
    createdAt: Date.now(),
  });
  writeMeta(m);
  return id;
}

export async function getRecordingBlob(id) {
  try { return await readBlob(id); } catch { return null; }
}

export async function deleteRecording(id) {
  try { await removeBlob(id); } catch {}
  const m = readMeta();
  m.recordings = m.recordings.filter((r) => r.id !== id);
  writeMeta(m);
}

export function renameRecording(id, name) {
  const m = readMeta();
  const r = m.recordings.find((x) => x.id === id);
  if (r) { r.name = String(name || "").trim() || r.name; writeMeta(m); }
}

/* ---- Vocals (finished Studio mixes, saved on-device only) ----
 * These are the "Save to Songs" results. They live ONLY here until the user
 * explicitly publishes one (which is the only time audio is uploaded). They are
 * deliberately kept out of the cloud-archived Library path. */

export function listVocals() {
  return readMeta().vocals.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export function getVocal(id) {
  return readMeta().vocals.find((v) => v.id === id) || null;
}

export async function saveVocal({ title, blob, durationSec, artUrl, sourceTitle, mime, visibility }) {
  const id = `voc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (blob) { try { await putBlob(id, blob); } catch {} }
  const m = readMeta();
  m.vocals.push({
    id,
    title: String(title || "").trim() || `Studio song ${m.vocals.length + 1}`,
    durationSec: Number(durationSec) || 0,
    artUrl: String(artUrl || ""),
    sourceTitle: String(sourceTitle || ""),
    mime: String(mime || "audio/wav"),
    bytes: Number(blob?.size) || 0,
    visibility: visibility === "public" ? "public" : "private",
    createdAt: Date.now(),
    published: false,
  });
  writeMeta(m);
  return id;
}

export async function getVocalBlob(id) {
  try { return await readBlob(id); } catch { return null; }
}

export async function deleteVocal(id) {
  try { await removeBlob(id); } catch {}
  const m = readMeta();
  m.vocals = m.vocals.filter((v) => v.id !== id);
  writeMeta(m);
}

export function renameVocal(id, title) {
  const m = readMeta();
  const v = m.vocals.find((x) => x.id === id);
  if (v) { v.title = String(title || "").trim() || v.title; writeMeta(m); }
}

export function markVocalPublished(id, on = true) {
  const m = readMeta();
  const v = m.vocals.find((x) => x.id === id);
  if (v) { v.published = !!on; writeMeta(m); }
}

/* ---- Projects (draft studio sessions) ---- */

export function listProjects() {
  return readMeta().projects.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getProject(id) {
  return readMeta().projects.find((p) => p.id === id) || null;
}

export function upsertProject(p) {
  if (!p || !p.id) return;
  const m = readMeta();
  const i = m.projects.findIndex((x) => x.id === p.id);
  if (i >= 0) m.projects[i] = { ...m.projects[i], ...p, updatedAt: Date.now() };
  else m.projects.push({ ...p, createdAt: Date.now(), updatedAt: Date.now() });
  writeMeta(m);
}

export function deleteProject(id) {
  const m = readMeta();
  m.projects = m.projects.filter((p) => p.id !== id);
  writeMeta(m);
}

/** Remove a project and its stored take blobs. */
export async function deleteProjectWithBlobs(id) {
  const p = getProject(id);
  if (p?.takes?.length) {
    for (const t of p.takes) {
      if (t.blobKey) { try { await removeBlob(t.blobKey); } catch {} }
    }
  }
  deleteProject(id);
}

export async function saveProjectTakeBlob(blobKey, blob) {
  if (!blobKey || !blob) return;
  try { await putBlob(blobKey, blob); } catch {}
}

export async function loadProjectTakeBlob(blobKey) {
  try { return await readBlob(blobKey); } catch { return null; }
}

export function nextProjectName() {
  return `New Project ${readMeta().projects.length + 1}`;
}
