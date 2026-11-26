/**
 * SwissInv-Beta online sync API (Cloudflare Worker + D1, free plan, no payment method).
 * Photos and documents are not synced: they stay on the capturing phone.
 *
 * Team (needs the X-Team-Key header = the TEAM_KEY secret):
 *   GET    /api/ping                     check the key
 *   POST   /api/sync                     upsert or delete up to 25 projects/elements (newest updatedAt wins)
 * Public (by label code only; there is no endpoint that lists projects):
 *   GET    /api/label/:code              the element(s) with this label code: whitelisted fields,
 *                                        room, project name and address, photo count and document
 *                                        names. No contacts, no timing.
 *   GET    /api/label/:code/project/:pid the whole inventory of that element's project (read-only):
 *                                        building data without contacts, rooms, all elements
 *                                        (same whitelist). Only if the code belongs to that project.
 * The whitelisted JSON of each record is stored in the "pub" column at upload time, so a listing
 * only joins stored strings (the free plan allows 10 ms CPU per request).
 */

export interface Env {
  DB: D1Database;
  TEAM_KEY: string;
  ALLOWED_ORIGINS: string;
}

/** Ids made by the app's nid(): base-36 time + random. */
const ID = /^[a-z0-9]{6,24}$/;
/** Label codes: 8 characters from 23456789ABCDEFGHJKMNPQRSTUVWXYZ (see src/lib/labelCode.ts). */
const CODE = /^[2-9A-HJKMNP-Z]{8}$/;
const MAX_BODY = 1024 * 1024;
const MAX_RECORD = 256 * 1024;
const MAX_RECORDS = 25;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;

/* ---------------------------------------------------------------- helpers */

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
  const h: Record<string, string> = { Vary: "Origin" };
  if (origin && (allowed.includes(origin) || LOCAL_ORIGIN.test(origin))) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type, X-Team-Key";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });

const fail = (status: number, error: string) => json({ error }, status);

/** Compares the key with TEAM_KEY in constant time (both hashed first, so lengths do not leak). */
async function authorized(req: Request, env: Env): Promise<boolean> {
  const given = req.headers.get("X-Team-Key") ?? "";
  if (!given || !env.TEAM_KEY) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(env.TEAM_KEY)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.slice(0, max) : "");

/* ---------------------------------------------------------------- team: sync */

interface InRecord { kind: "project" | "element"; id: string; updatedAt: number; deleted: boolean; data?: Record<string, unknown> }

function parseRecord(r: unknown): InRecord | string {
  if (!isObj(r)) return "record is not an object";
  const { kind, id, updatedAt, deleted, data } = r;
  if (kind !== "project" && kind !== "element") return "bad kind";
  if (typeof id !== "string" || !ID.test(id)) return "bad id";
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt <= 0) return "bad updatedAt";
  if (typeof deleted !== "boolean") return "bad deleted";
  if (deleted) return { kind, id, updatedAt, deleted };
  if (!isObj(data) || data.id !== id) return "bad data";
  if (JSON.stringify(data).length > MAX_RECORD) return "record too large";
  if (kind === "element" && (typeof data.pid !== "string" || !ID.test(data.pid))) return "bad project id";
  if (kind === "element" && data.labelCode !== undefined && (typeof data.labelCode !== "string" || !CODE.test(data.labelCode))) return "bad label code";
  return { kind, id, updatedAt, deleted, data };
}

async function sync(req: Request, env: Env): Promise<Response> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > MAX_BODY) return fail(413, "body too large");
  const text = await req.text();
  if (text.length > MAX_BODY) return fail(413, "body too large");
  let body: unknown;
  try { body = JSON.parse(text); } catch { return fail(400, "not JSON"); }
  if (!isObj(body) || !Array.isArray(body.records)) return fail(400, "records missing");
  if (body.records.length > MAX_RECORDS) return fail(413, "too many records");

  const stmts: D1PreparedStatement[] = [];
  for (const raw of body.records) {
    const r = parseRecord(raw);
    if (typeof r === "string") return fail(400, r);
    if (r.kind === "project") {
      stmts.push(r.deleted
        ? env.DB.prepare(`INSERT INTO projects (id, updated_at, deleted, data, pub) VALUES (?1, ?2, 1, NULL, NULL)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = 1, data = NULL, pub = NULL
            WHERE excluded.updated_at >= projects.updated_at`).bind(r.id, r.updatedAt)
        : env.DB.prepare(`INSERT INTO projects (id, updated_at, deleted, data, pub) VALUES (?1, ?2, 0, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = 0, data = excluded.data, pub = excluded.pub
            WHERE excluded.updated_at >= projects.updated_at`).bind(r.id, r.updatedAt, JSON.stringify(r.data), JSON.stringify(pubProject(r.data!))));
    } else {
      stmts.push(r.deleted
        ? env.DB.prepare(`INSERT INTO elements (id, project_id, label_code, updated_at, deleted, data, pub) VALUES (?1, '', NULL, ?2, 1, NULL, NULL)
            ON CONFLICT(id) DO UPDATE SET label_code = NULL, updated_at = excluded.updated_at, deleted = 1, data = NULL, pub = NULL
            WHERE excluded.updated_at >= elements.updated_at`).bind(r.id, r.updatedAt)
        : env.DB.prepare(`INSERT INTO elements (id, project_id, label_code, updated_at, deleted, data, pub) VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, label_code = excluded.label_code,
              updated_at = excluded.updated_at, deleted = 0, data = excluded.data, pub = excluded.pub
            WHERE excluded.updated_at >= elements.updated_at`)
          .bind(r.id, r.data!.pid as string, (r.data!.labelCode as string | undefined) ?? null, r.updatedAt, JSON.stringify(r.data), JSON.stringify(pubElement(r.data!))));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, n: stmts.length });
}

/* ---------------------------------------------------------------- public: by label code */

/** Building data that may be public: Swiss-Inv building fields without the contacts section. */
const PUBLIC_BUILDING = ["egrid", "egid", "adresse", "hausnummer", "plz", "ort", "land", "bauwerksart", "bauweise", "hauptmaterial",
  "baujahr", "gebaeudevolumen", "geschossflaeche", "vollgeschosse", "jahrUmbau", "umbauInfo", "erschliessung", "ereignisse", "weitereInfo"];

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const strings = (o: unknown, keys?: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  if (!isObj(o)) return out;
  for (const k of keys ?? Object.keys(o)) { const v = o[k]; if (typeof v === "string" && v) out[k] = v.slice(0, 5000); }
  return out;
};
const photoCount = (e: Record<string, unknown>): number => (Array.isArray(e.photoIds) ? Math.min(e.photoIds.length, 1000) : 0);
/** Document names only; the files themselves stay on the capturing phone. */
const docsOf = (e: Record<string, unknown>) => (Array.isArray(e.docs) ? e.docs.filter(isObj) : []).slice(0, 100)
  .map(d => ({ name: str(d.name, 200) || "Dokument", mime: str(d.mime, 100), size: num(d.size), kind: str(d.kind, 100) }));

/** The only element data that leaves the Worker publicly: no timing, no suggestions, no photo ids. */
function pubElement(e: Record<string, unknown>) {
  const code = str(e.labelCode, 8);
  return {
    id: str(e.id, 24), roomId: str(e.roomId, 24), groupId: str(e.groupId, 40) || undefined, labelCode: CODE.test(code) ? code : undefined,
    status: str(e.status, 20), entry: str(e.entry, 20) || undefined, color: str(e.color, 20) || undefined,
    createdAt: num(e.createdAt), updatedAt: num(e.updatedAt), fields: strings(e.fields), photoCount: photoCount(e), docs: docsOf(e),
  };
}
type PubElement = ReturnType<typeof pubElement>;

/** The only project data that leaves the Worker publicly: name, building data without contacts, rooms. */
function pubProject(p: Record<string, unknown>) {
  const rooms = Array.isArray(p.rooms) ? p.rooms.filter(isObj).slice(0, 2000) : [];
  return {
    id: str(p.id, 24), name: str(p.name, 200), building: strings(p.building, PUBLIC_BUILDING),
    rooms: rooms.map(r => ({ id: str(r.id, 24), floor: num(r.floor), name: str(r.name, 200), tag: str(r.tag, 60), useCode: str(r.useCode, 20), useLabel: str(r.useLabel, 100), createdAt: num(r.createdAt) })),
  };
}
type PubProject = ReturnType<typeof pubProject>;

interface PubRow { pub: string | null; data: string | null }
/** Stored pub JSON, or (rows uploaded before the pub column existed) computed from the full record. */
const pubText = (row: PubRow, make: (d: Record<string, unknown>) => unknown): string =>
  row.pub ?? JSON.stringify(make(JSON.parse(row.data ?? "{}") as Record<string, unknown>));
/** Selects pub, and the full record only where pub is missing. */
const PUB_COLS = "pub, CASE WHEN pub IS NULL THEN data END AS data";

async function label(env: Env, code: string): Promise<Response> {
  const rows = await env.DB.prepare(`SELECT project_id AS pid, ${PUB_COLS} FROM elements WHERE label_code = ?1 AND deleted = 0 LIMIT 10`)
    .bind(code).all<PubRow & { pid: string }>();
  if (!rows.results.length) return fail(404, "not found");
  const projects = new Map<string, PubProject>();
  for (const pid of new Set(rows.results.map(r => r.pid))) {
    const row = await env.DB.prepare(`SELECT ${PUB_COLS} FROM projects WHERE id = ?1 AND deleted = 0`).bind(pid).first<PubRow>();
    if (row) projects.set(pid, JSON.parse(pubText(row, pubProject)) as PubProject);
  }
  const items = rows.results.map(row => {
    const e = JSON.parse(pubText(row, pubElement)) as PubElement;
    const p = projects.get(row.pid);
    const r = p?.rooms.find(x => x.id === e.roomId);
    const b = p?.building ?? {};
    return {
      element: { labelCode: code, status: e.status, entry: e.entry, color: e.color, updatedAt: e.updatedAt, fields: e.fields, photoCount: e.photoCount, docs: e.docs },
      room: r ? { tag: r.tag, name: r.name, floor: r.floor, useLabel: r.useLabel } : null,
      project: p ? { id: p.id, name: p.name, adresse: b.adresse ?? "", hausnummer: b.hausnummer ?? "", plz: b.plz ?? "", ort: b.ort ?? "", land: b.land ?? "" } : null,
    };
  });
  return json({ items });
}

/** The whole inventory of a project, read-only. The label code is the key: it must belong to that project. */
async function inventory(env: Env, code: string, pid: string): Promise<Response> {
  const hit = await env.DB.prepare("SELECT 1 AS ok FROM elements WHERE label_code = ?1 AND project_id = ?2 AND deleted = 0 LIMIT 1").bind(code, pid).first();
  if (!hit) return fail(404, "not found");
  const prow = await env.DB.prepare(`SELECT ${PUB_COLS} FROM projects WHERE id = ?1 AND deleted = 0`).bind(pid).first<PubRow>();
  if (!prow) return fail(404, "not found");
  const rows = await env.DB.prepare(`SELECT ${PUB_COLS} FROM elements WHERE project_id = ?1 AND deleted = 0 LIMIT 5000`).bind(pid).all<PubRow>();
  // joined as text, so stored rows are not parsed again
  const body = `{"project":${pubText(prow, pubProject)},"elements":[${rows.results.map(r => pubText(r, pubElement)).join(",")}]}`;
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

/* ---------------------------------------------------------------- router */

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "api") return fail(404, "not found");
  const [, what, a, b, c] = parts;

  if (what === "label" && req.method === "GET") {
    const code = (a ?? "").toUpperCase();
    if (!CODE.test(code)) return fail(400, "bad label code");
    if (parts.length === 3) return label(env, code);
    if (parts.length === 5 && b === "project" && ID.test(c ?? "")) return inventory(env, code, c!);
    return fail(404, "not found");
  }

  if (!(await authorized(req, env))) return fail(401, "team key required");
  if (what === "ping" && req.method === "GET" && parts.length === 2) return json({ ok: true });
  if (what === "sync" && req.method === "POST" && parts.length === 2) return sync(req, env);
  return fail(404, "not found");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try { res = await route(req, env); }
    catch (err) { console.error(err); res = fail(500, "server error"); }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
} satisfies ExportedHandler<Env>;
