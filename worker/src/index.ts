/**
 * SwissInv-Beta online sync API (Cloudflare Worker + D1, free plan, no payment method).
 * Photos and documents are not synced: they stay on the capturing phone.
 *
 * Team (needs the X-Team-Key header = the TEAM_KEY secret):
 *   GET    /api/ping                     check the key
 *   POST   /api/sync                     upsert or delete up to 25 projects/elements (newest updatedAt wins)
 * Public (by label code only; there is no endpoint that lists anything):
 *   GET    /api/label/:code              the element(s) with this label code: whitelisted fields,
 *                                        room, project name and address, photo count and document
 *                                        names. No contacts, no timing.
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
        ? env.DB.prepare(`INSERT INTO projects (id, updated_at, deleted, data) VALUES (?1, ?2, 1, NULL)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = 1, data = NULL
            WHERE excluded.updated_at >= projects.updated_at`).bind(r.id, r.updatedAt)
        : env.DB.prepare(`INSERT INTO projects (id, updated_at, deleted, data) VALUES (?1, ?2, 0, ?3)
            ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, deleted = 0, data = excluded.data
            WHERE excluded.updated_at >= projects.updated_at`).bind(r.id, r.updatedAt, JSON.stringify(r.data)));
    } else {
      stmts.push(r.deleted
        ? env.DB.prepare(`INSERT INTO elements (id, project_id, label_code, updated_at, deleted, data) VALUES (?1, '', NULL, ?2, 1, NULL)
            ON CONFLICT(id) DO UPDATE SET label_code = NULL, updated_at = excluded.updated_at, deleted = 1, data = NULL
            WHERE excluded.updated_at >= elements.updated_at`).bind(r.id, r.updatedAt)
        : env.DB.prepare(`INSERT INTO elements (id, project_id, label_code, updated_at, deleted, data) VALUES (?1, ?2, ?3, ?4, 0, ?5)
            ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, label_code = excluded.label_code,
              updated_at = excluded.updated_at, deleted = 0, data = excluded.data
            WHERE excluded.updated_at >= elements.updated_at`)
          .bind(r.id, r.data!.pid as string, (r.data!.labelCode as string | undefined) ?? null, r.updatedAt, JSON.stringify(r.data)));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, n: stmts.length });
}

/* ---------------------------------------------------------------- public: by label code */

interface StoredElement { roomId?: unknown; pid?: unknown; labelCode?: unknown; status?: unknown; entry?: unknown; color?: unknown; updatedAt?: unknown; fields?: unknown; photoIds?: unknown; docs?: unknown }

async function elementsByCode(env: Env, code: string): Promise<StoredElement[]> {
  const rows = await env.DB.prepare("SELECT data FROM elements WHERE label_code = ?1 AND deleted = 0 LIMIT 10").bind(code).all<{ data: string }>();
  return rows.results.map(r => JSON.parse(r.data) as StoredElement);
}

const photoCount = (e: StoredElement): number => (Array.isArray(e.photoIds) ? Math.min(e.photoIds.length, 1000) : 0);
/** Document names only; the files themselves stay on the capturing phone. */
const docsOf = (e: StoredElement) => (Array.isArray(e.docs) ? e.docs.filter(isObj) : []).slice(0, 100)
  .map(d => ({ name: str(d.name, 200) || "Dokument", mime: str(d.mime, 100), size: typeof d.size === "number" ? d.size : 0, kind: str(d.kind, 100) }));

/** Only these leave the Worker publicly: the element's Swiss-Inv fields, photo count, document names, room and project address. */
async function label(env: Env, code: string): Promise<Response> {
  const els = await elementsByCode(env, code);
  if (!els.length) return fail(404, "not found");
  const pids = [...new Set(els.map(e => e.pid).filter((x): x is string => typeof x === "string" && ID.test(x)))];
  const projects = new Map<string, Record<string, unknown>>();
  for (const pid of pids) {
    const row = await env.DB.prepare("SELECT data FROM projects WHERE id = ?1 AND deleted = 0").bind(pid).first<{ data: string }>();
    if (row) projects.set(pid, JSON.parse(row.data) as Record<string, unknown>);
  }
  const items = els.map(e => {
    const p = typeof e.pid === "string" ? projects.get(e.pid) : undefined;
    const rooms = p && Array.isArray(p.rooms) ? p.rooms.filter(isObj) : [];
    const r = rooms.find(x => x.id === e.roomId);
    const b = p && isObj(p.building) ? p.building : {};
    const fields: Record<string, string> = {};
    if (isObj(e.fields)) for (const [k, v] of Object.entries(e.fields)) if (typeof v === "string" && v) fields[k] = v.slice(0, 5000);
    return {
      element: {
        labelCode: code, status: str(e.status, 20), entry: str(e.entry, 20) || undefined, color: str(e.color, 20) || undefined,
        updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : 0, fields, photoCount: photoCount(e), docs: docsOf(e),
      },
      room: r ? { tag: str(r.tag, 60), name: str(r.name, 200), floor: typeof r.floor === "number" ? r.floor : 0, useLabel: str(r.useLabel, 100) } : null,
      project: p ? { name: str(p.name, 200), adresse: str(b.adresse, 200), hausnummer: str(b.hausnummer, 20), plz: str(b.plz, 20), ort: str(b.ort, 100), land: str(b.land, 100) } : null,
    };
  });
  return json({ items });
}

/* ---------------------------------------------------------------- router */

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "api") return fail(404, "not found");
  const [, what, a] = parts;

  if (what === "label" && req.method === "GET") {
    const code = (a ?? "").toUpperCase();
    if (!CODE.test(code)) return fail(400, "bad label code");
    if (parts.length === 3) return label(env, code);
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
