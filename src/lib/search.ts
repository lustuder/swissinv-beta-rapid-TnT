/**
 * Search for elements in an inventory: case and accents do not matter ("tur" finds "Tür"),
 * and every word of the query must appear somewhere (name, Bauteil ID, type, eBKP, IFC,
 * manufacturer, materials, colour, label code, room, floor). Both languages are searched,
 * so an English element type finds a German entry.
 */
import { RULE_BY_ID, ebkpName } from "../domain/crb";
import { USES, floorLabel } from "../domain/fields";
import type { Element, Project, Room } from "../domain/types";
import { formatLabelCode } from "./labelCode";

/** Lower case, without accents (combining marks U+0300–U+036F after NFD), ß → ss. */
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/ß/g, "ss");

const FIELDS = ["bezeichnung", "bauteilId", "ebkp", "ebkpText", "ifc", "ifcTyp", "herstellerin", "materialien", "farbe", "weitereInfo2"];

function roomText(r?: Room): string {
  if (!r) return "";
  const use = USES.find(u => u.code === r.useCode);
  return [r.name, r.tag, r.useLabel, use?.de, use?.en, floorLabel(r.floor)].filter(Boolean).join(" ");
}

function haystack(e: Element, p: Project): string {
  const f = e.fields, type = RULE_BY_ID[f.bauteiltyp ?? ""];
  const parts = FIELDS.map(k => f[k] ?? "");
  parts.push(f.bauteiltyp ?? "", type?.de ?? "", type?.en ?? "", ebkpName(f.ebkp ?? "", "en"));
  if (e.labelCode) parts.push(e.labelCode, formatLabelCode(e.labelCode));
  parts.push(roomText(p.rooms.find(r => r.id === e.roomId)));
  return norm(parts.join(" "));
}

/** True if every word of the query is found in the element. An empty query matches everything. */
export function matchesElement(e: Element, p: Project, q: string): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const h = haystack(e, p);
  return words.every(w => h.includes(w));
}

/** The matching elements, ordered by floor (top first), room, then creation. */
export function searchElements(els: Element[], p: Project, q: string): Element[] {
  const roomIdx = new Map(p.rooms.map((r, i) => [r.id, i]));
  const floorOf = (e: Element) => p.rooms.find(r => r.id === e.roomId)?.floor ?? 0;
  return els.filter(e => matchesElement(e, p, q)).sort((a, b) =>
    floorOf(b) - floorOf(a) || (roomIdx.get(a.roomId) ?? 0) - (roomIdx.get(b.roomId) ?? 0) || a.createdAt - b.createdAt);
}
