/**
 * Creating elements and computing suggested values ("auto-fill").
 *
 * Both modes: values that are derived, not guessed – Bauteil ID, Verortung im Gebäude,
 * the building-wide defaults (Verfügbarkeit, Status, Dokumente), and from the element type
 * (CRB rule set) the eBKP number, eBKP name, eBKP-H element and IFC entity + type (and the eBKP name from a chosen
 * eBKP number).
 * Assisted mode only: from the element type also unit, quantity, exposure and a default
 * name, plus Einbaujahr from the building's history. Manual mode is the baseline.
 */
import { MASK_COLORS, verortungText } from "../domain/fields";
import { RULE_BY_ID, ebkpName, isOutdoor, unitFor } from "../domain/crb";
import { EXPOSITION, PROJECT_DEFAULT_KEYS } from "../domain/swissinv";
import type { Box, Element, Mode, Project, Room } from "../domain/types";
import { getLang, t } from "../i18n";
import { elementsOf, nid, saveElement } from "./store";

export interface FromBox { box: Box; taps: number; segStart: number }

const INDOOR = EXPOSITION[0], OUTDOOR = EXPOSITION[3];

function nextBauteilId(p: Project, r: Room) {
  const prefix = r.tag + "-";
  let max = 0;
  for (const e of elementsOf(p.id)) {
    const id = e.fields.bauteilId ?? "";
    if (id.startsWith(prefix)) max = Math.max(max, parseInt(id.slice(prefix.length), 10) || 0);
  }
  return prefix + String(max + 1).padStart(2, "0");
}

/** Creates a draft element (one inventory row). With `seg` it comes from a box on the room photo. */
export function createElement(p: Project, r: Room, seg?: FromBox): Element {
  const now = Date.now();
  const derived: Record<string, string> = {
    bauteilId: nextBauteilId(p, r),
    verortung: verortungText(r.name, r.tag, r.floor),
  };
  for (const k of PROJECT_DEFAULT_KEYS) if (p.defaults[k]) derived[k] = p.defaults[k];
  if (p.mode === "assisted") {
    const year = p.building.jahrUmbau || p.building.baujahr;
    if (year) derived.einbaujahr = year;
  }
  const e: Element = {
    id: nid(), pid: p.id, roomId: r.id, color: MASK_COLORS[elementsOf(p.id, r.id).length % MASK_COLORS.length],
    status: "draft", photoIds: [], fields: { ...derived }, suggested: { ...derived }, createdAt: now, updatedAt: now,
    box: seg?.box,
    timing: { mode: p.mode, activeMs: seg ? now - seg.segStart : 0, segTaps: seg?.taps ?? 0 },
  };
  saveElement(e);
  return e;
}

/**
 * Values to propose after a field changed. Only fills fields that are empty or still hold an
 * earlier suggestion – never overwrites what the person typed.
 */
export function suggestionsAfterChange(key: string, value: string, mode: Mode): Record<string, string> {
  const out: Record<string, string> = {};
  if (key === "ebkp" && ebkpName(value, "de")) out.ebkpText = ebkpName(value, "de");
  if (key === "bauteiltyp") {
    const c = RULE_BY_ID[value];
    if (c) {
      out.ebkp = c.code; out.ebkpText = ebkpName(c.code, "de"); out.ifc = c.ifc; out.ifcTyp = c.ifcType;
      if (mode === "assisted") { out.bezeichnung = getLang() === "en" ? c.en : c.de; out.einheit = unitFor(c.ifc); out.menge = "1"; out.exposition = isOutdoor(c) ? OUTDOOR : INDOOR; }
    }
  }
  return out;
}

/** Applies suggestions to fields that are empty or still unchanged suggestions. Returns the keys that changed. */
export function applySuggestions(fields: Record<string, string>, suggested: Record<string, string>, add: Record<string, string>) {
  const changed: string[] = [];
  for (const [k, v] of Object.entries(add)) {
    const cur = fields[k] ?? "";
    const untouched = cur === "" || (suggested[k] !== undefined && suggested[k] === cur);
    if (untouched && cur !== v) { fields[k] = v; changed.push(k); }
    if (untouched) suggested[k] = v;
  }
  return changed;
}

/* ---------- prefill from an existing element, and linked copies ---------- */

/** Location values: they belong to the new element's own room and are never copied. */
export const PREFILL_SKIP = ["bauteilId", "verortung", "koordinaten"];

/** The values a prefill proposes: the source's filled fields, without the location. Photos, box, label code and timing are not fields. */
export function prefillValues(src: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src.fields)) if (v && !PREFILL_SKIP.includes(k)) out[k] = v;
  return out;
}

/** Links e to src as the same building element and records the prefill for the time study. Saves both. */
export function linkPrefill(e: Element, src: Element) {
  if (!src.groupId) { src.groupId = src.id; saveElement(src); }
  e.groupId = src.groupId;
  e.timing.prefilledFrom = src.id;
  saveElement(e);
}

/** "Not the same element": removes e from its group. The prefilled values stay. */
export function unlinkElement(e: Element) {
  e.groupId = undefined;
  saveElement(e);
}

/** All elements of the project that are the same building element as e (e included). */
export function sameElements(e: Element): Element[] {
  return e.groupId ? elementsOf(e.pid).filter(x => x.groupId === e.groupId) : [e];
}

const num = (s?: string) => { const n = parseFloat((s ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

/**
 * How many entries of this building element exist in the building, and their total Menge.
 * qty is given only when every entry with a Menge uses the same Einheit.
 */
export function sameCount(e: Element): SameCount {
  return countSame(sameElements(e));
}

export interface SameCount { n: number; qty?: number; unit?: string }
/** Count and total Menge of the given entries of one building element (also used for the online inventory). */
export function countSame(all: { fields: Record<string, string> }[]): SameCount {
  const withQty = all.filter(x => num(x.fields.menge) !== null);
  const units = new Set(withQty.map(x => x.fields.einheit ?? ""));
  if (!withQty.length || units.size !== 1 || units.has("")) return { n: all.length };
  const qty = withQty.reduce((s, x) => s + num(x.fields.menge)!, 0);
  return { n: all.length, qty: Math.round(qty * 1000) / 1000, unit: [...units][0] };
}

/* ---------- element added with an existing ID (GTIN) ---------- */

/**
 * Creates a draft added with an existing ID: only Bauteil ID (the GTIN) and a comment are asked.
 * Verortung is still filled from the room; building defaults and catalogue suggestions are not applied.
 */
export function createGtinElement(p: Project, r: Room): Element {
  const now = Date.now();
  const e: Element = {
    id: nid(), pid: p.id, roomId: r.id, color: MASK_COLORS[elementsOf(p.id, r.id).length % MASK_COLORS.length],
    status: "draft", photoIds: [], fields: { bauteilId: "", verortung: verortungText(r.name, r.tag, r.floor) }, suggested: {},
    createdAt: now, updatedAt: now, entry: "gtin",
    timing: { mode: p.mode, activeMs: 0, segTaps: 0 },
  };
  saveElement(e);
  return e;
}

/** GTIN without spaces, and whether it has 8, 12, 13 or 14 digits with a correct GS1 check digit. Only a warning. */
export function gtinCheck(s: string): { digits: string; valid: boolean } {
  const digits = s.replace(/\s+/g, "");
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return { digits, valid: false };
  // GS1: from the right, without the check digit, weights 3, 1, 3, 1, …
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += +digits[i] * w;
  return { digits, valid: (10 - (sum % 10)) % 10 === +digits[digits.length - 1] };
}

/** Other elements of the project whose Bauteil ID is this GTIN. */
export function sameGtin(e: Element, gtin: string): Element[] {
  const g = gtin.replace(/\s+/g, "");
  return g ? elementsOf(e.pid).filter(x => x.id !== e.id && (x.fields.bauteilId ?? "").replace(/\s+/g, "") === g) : [];
}

/** At save: elements with the same GTIN become the same element (one groupId); with no match the link is removed. */
export function linkByGtin(e: Element) {
  const others = sameGtin(e, e.fields.bauteilId ?? "");
  if (!others.length) { if (e.groupId) { e.groupId = undefined; saveElement(e); } return; }
  const group = others.find(o => o.groupId)?.groupId ?? others[0].id;
  for (const o of others) if (o.groupId !== group) { o.groupId = group; saveElement(o); }
  e.groupId = group;
  saveElement(e);
}

/** Name for lists: Bezeichnung; for an element added with an existing ID without a name "GTIN 7612345678901"; else the type. */
export function displayName(e: { entry?: string; fields: Record<string, string> }): string {
  if (e.entry === "gtin") return e.fields.bezeichnung || (e.fields.bauteilId ? `GTIN ${e.fields.bauteilId}` : t("gt.title"));
  return e.fields.bezeichnung || e.fields.bauteiltyp || t("rm.unnamed");
}

/** Web addresses in a text, as links that can be opened: only http(s); "www." gets "https://". */
export function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi) ?? [];
  const urls = found.map(u => u.replace(/[.,;:!?)\]]+$/, "")).map(u => (/^https?:/i.test(u) ? u : "https://" + u));
  return [...new Set(urls)].filter(u => { try { return /^https?:$/.test(new URL(u).protocol); } catch { return false; } });
}
