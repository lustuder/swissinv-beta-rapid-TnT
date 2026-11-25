/**
 * Optional online sync to the team's Cloudflare Worker (worker/ in this repo). Off when
 * VITE_SYNC_URL is not set: then the app behaves exactly as without it.
 *
 * Offline first: IndexedDB stays the main store. store.ts calls the queue functions here after
 * each local write; nothing else in the app talks to the Worker except the label scan
 * (fetchLabel). Changes go into a persistent outbox (its own IndexedDB store), one entry per
 * record, so only the newest state is kept. They are uploaded 3 s after the last change,
 * on app start and when the device comes online, with backoff on errors. Uploads are safe to
 * repeat: the Worker upserts by id and keeps the newest updatedAt; deletes are tombstones.
 * Only the writing tab syncs (the stale-tab guard in store.ts).
 * Projects and elements only: photos and documents stay on the device (no file storage online,
 * so the free plan needs no payment method). The online copy lists photo count and document names.
 */
import { useSyncExternalStore } from "react";
import { createStore, del, entries, set } from "idb-keyval";
import type { Element, Project } from "../domain/types";

const BASE = ((import.meta.env.VITE_SYNC_URL as string | undefined) ?? "").trim().replace(/\/+$/, "");
export const syncEnabled = (): boolean => BASE !== "";

const KEY_LS = "swissinv:teamKey";
const SEEDED_LS = "swissinv:sync:seeded:" + BASE;
const BATCH = 25;
const DEBOUNCE = 3000;

const outboxDb = createStore("swissinv-sync", "outbox");

type Kind = "project" | "element";
type Entry =
  | { t: "rec"; op: "put"; kind: Kind; id: string; updatedAt: number; data: unknown; at: number }
  | { t: "rec"; op: "del"; kind: Kind; id: string; at: number };

/* ---------- status ---------- */
export type SyncState = "off" | "nokey" | "badkey" | "offline" | "pending" | "busy" | "error" | "ok";
export interface SyncStatus { state: SyncState; pending: number }

/** Newest `at` per outbox key, mirrored in memory: an entry is removed after upload only if unchanged. */
const latest = new Map<string, number>();
let state: SyncState = syncEnabled() ? "pending" : "off";
let status: SyncStatus = { state, pending: 0 };
const listeners = new Set<() => void>();
function update(next?: SyncState) {
  if (next) state = next;
  status = { state, pending: latest.size };
  listeners.forEach(f => f());
}
export const useSyncStatus = () => useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f); }; }, () => status);

/* ---------- team key (per device) ---------- */
export const teamKey = (): string => { try { return localStorage.getItem(KEY_LS) ?? ""; } catch { return ""; } };
export function setTeamKey(k: string) {
  try { if (k) localStorage.setItem(KEY_LS, k); else localStorage.removeItem(KEY_LS); } catch { /* storage blocked */ }
  backoff = 0;
  schedule(0);
}

/* ---------- hooks given by store.ts (no import of store.ts here) ---------- */
interface Hooks {
  isStale: () => boolean;
  all: () => { projects: Project[]; elements: Element[] };
}
let hooks: Hooks | null = null;

/** Called by store.ts once the local data is loaded. Starts the uploader and, the first time, queues everything. */
export async function initSync(h: Hooks) {
  if (!syncEnabled()) return;
  hooks = h;
  try {
    for (const [k, e] of await entries<string, Entry | { t: "file" }>(outboxDb)) {
      if (e.t === "rec") latest.set(k, e.at);
      else await del(k, outboxDb); // file entries from an earlier test version: files are not synced
    }
  } catch (err) { console.warn("Sync outbox not readable", err); }
  if (!localStorage.getItem(SEEDED_LS)) {
    seed();
    try { localStorage.setItem(SEEDED_LS, String(Date.now())); } catch { /* storage blocked */ }
  }
  window.addEventListener("online", () => schedule(0));
  window.addEventListener("offline", () => update("offline"));
  update();
  schedule(0);
}

/** First sync: everything already on the device. */
function seed() {
  if (!hooks) return;
  const { projects, elements } = hooks.all();
  for (const p of projects) queueRecord("p:" + p.id, JSON.parse(JSON.stringify(p)));
  for (const e of elements) queueRecord("e:" + e.id, JSON.parse(JSON.stringify(e)));
}

/* ---------- queue (called by store.ts after a local write, writing tab only) ---------- */
function put(key: string, entry: Entry) {
  if (!syncEnabled() || hooks?.isStale()) return;
  latest.set(key, entry.at);
  update();
  void set(key, entry, outboxDb).catch(err => console.warn("Sync outbox write failed", err));
  schedule(DEBOUNCE);
}
const kindOf = (key: string): Kind | null => (key.startsWith("p:") ? "project" : key.startsWith("e:") ? "element" : null);
let tick = 0;
/** A strictly increasing time, so two changes in the same millisecond still differ. */
const now = () => (tick = Math.max(Date.now(), tick + 1));

/** key "p:<id>" or "e:<id>"; value = the record as stored. */
export function queueRecord(key: string, value: unknown) {
  const kind = kindOf(key), v = value as { id?: string; updatedAt?: number };
  if (!kind || !v?.id) return;
  put("rec:" + key, { t: "rec", op: "put", kind, id: v.id, updatedAt: v.updatedAt ?? Date.now(), data: value, at: now() });
}
export function queueRemove(key: string) {
  const kind = kindOf(key);
  if (!kind) return;
  put("rec:" + key, { t: "rec", op: "del", kind, id: key.slice(2), at: now() });
}

/* ---------- uploader ---------- */
class AuthError extends Error {}
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false, again = false, backoff = 0;

function schedule(ms: number) {
  if (!syncEnabled() || !hooks) return;
  clearTimeout(timer);
  timer = setTimeout(() => void run(), ms);
}

async function api(method: string, path: string, key: string, body?: string, type?: string): Promise<Response> {
  const headers: Record<string, string> = { "X-Team-Key": key };
  if (type) headers["Content-Type"] = type;
  const res = await fetch(BASE + path, { method, headers, body });
  if (res.status === 401) throw new AuthError("team key");
  return res;
}

/** Removes an outbox entry after upload, unless it changed meanwhile (then the newer one stays). */
async function done(key: string, at: number) {
  if (latest.get(key) !== at) return;
  latest.delete(key);
  update();
  await del(key, outboxDb);
}

async function run() {
  if (!hooks || hooks.isStale()) return;
  if (running) { again = true; return; }
  const key = teamKey();
  if (!key) { update("nokey"); return; }
  if (!navigator.onLine) { update("offline"); return; }
  running = true;
  update("busy");
  try {
    const all = await entries<string, Entry>(outboxDb);
    const recs = all.filter(([k, e]) => e.t === "rec" && latest.get(k) === e.at);
    for (let i = 0; i < recs.length; i += BATCH) {
      if (hooks.isStale()) break;
      const part = recs.slice(i, i + BATCH);
      const records = part.map(([, e]) => e.op === "put"
        ? { kind: e.kind, id: e.id, updatedAt: e.updatedAt, deleted: false, data: e.data }
        : { kind: e.kind, id: e.id, updatedAt: e.at, deleted: true });
      const res = await api("POST", "/api/sync", key, JSON.stringify({ records }), "application/json");
      if (!res.ok) throw new Error("sync " + res.status);
      for (const [k, e] of part) await done(k, e.at);
    }
    backoff = 0;
    update(latest.size ? "pending" : "ok");
  } catch (err) {
    if (err instanceof AuthError) { update("badkey"); return; } // waits until the key changes
    console.warn("Sync failed", err);
    backoff = Math.min(backoff ? backoff * 2 : 5000, 5 * 60 * 1000);
    update(navigator.onLine ? "error" : "offline");
    schedule(backoff);
  } finally {
    running = false;
    if (again) { again = false; schedule(1000); }
    else if (state === "pending" && latest.size) schedule(DEBOUNCE);
  }
}

/** Checks a team key with the Worker. */
export async function checkTeamKey(k: string): Promise<"ok" | "bad" | "offline" | "error"> {
  if (!navigator.onLine) return "offline";
  try { const res = await api("GET", "/api/ping", k); return res.ok ? "ok" : "error"; }
  catch (err) { return err instanceof AuthError ? "bad" : "error"; }
}

/* ---------- scanning with another phone: read-only copy by label code ---------- */
/** Document names only: the files stay on the capturing phone. */
export interface RemoteDoc { name: string; mime: string; size: number; kind: string }
export interface RemoteElement {
  labelCode: string;
  status: string;
  entry?: string;
  color?: string;
  updatedAt: number;
  fields: Record<string, string>;
  photoCount: number;
  docs: RemoteDoc[];
}
export interface RemoteItem {
  element: RemoteElement;
  room: { tag: string; name: string; floor: number; useLabel: string } | null;
  project: { name: string; adresse: string; hausnummer: string; plz: string; ort: string; land: string } | null;
}
export type LabelResult = { ok: true; items: RemoteItem[] } | { ok: false; reason: "off" | "offline" | "notFound" | "error" };

/** Public read of one label code. No team key needed. */
export async function fetchLabel(code: string): Promise<LabelResult> {
  if (!syncEnabled()) return { ok: false, reason: "off" };
  if (!navigator.onLine) return { ok: false, reason: "offline" };
  try {
    const res = await fetch(`${BASE}/api/label/${encodeURIComponent(code)}`);
    if (res.status === 404) return { ok: false, reason: "notFound" };
    if (!res.ok) return { ok: false, reason: "error" };
    const body = await res.json() as { items?: RemoteItem[] };
    return body.items?.length ? { ok: true, items: body.items } : { ok: false, reason: "notFound" };
  } catch { return { ok: false, reason: navigator.onLine ? "error" : "offline" }; }
}
