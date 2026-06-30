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
      return m;
    }
  } catch {}
  return { projects: [], recordings: [] };
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

export function nextProjectName() {
  return `New Project ${readMeta().projects.length + 1}`;
}
