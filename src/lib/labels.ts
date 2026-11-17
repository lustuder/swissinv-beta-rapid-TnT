/**
 * QR labels and the store. An element gets its permanent label code at the first label
 * export or when its label window opens (Room screen). createElement does not assign one.
 * A scanned label link `<address>?e=<CODE>` opens the element on this device.
 */
import type { Element, Project } from "../domain/types";
import { labelUrl, newLabelCode, normalizeLabelCode } from "./labelCode";
import { LABEL_70x37, renderLabelSheet, type LabelItem } from "./labelSheet";
import { navigate } from "./nav";
import { getData, saveElement } from "./store";

/**
 * Address that printed labels link to. Set VITE_QR_BASE_URL to the permanent published address;
 * without it, the address this app runs on is used.
 */
export function labelBase(): string {
  const env = (import.meta.env.VITE_QR_BASE_URL as string | undefined)?.trim();
  return env || location.origin + import.meta.env.BASE_URL;
}

/** All elements on this device with this label code (normally one). */
export const findElementsByLabel = (code: string): Element[] =>
  Object.values(getData().elements).filter(e => e.labelCode === code);

/** Gives each element without a label a new code that no element on this device has. Returns how many got one. */
export function assignLabelCodes(els: Element[]): number {
  const used = new Set(Object.values(getData().elements).map(e => e.labelCode).filter(Boolean));
  let n = 0;
  for (const e of els) {
    if (e.labelCode) continue;
    let c = newLabelCode();
    while (used.has(c)) c = newLabelCode();
    used.add(c);
    e.labelCode = c;
    saveElement(e);
    n++;
  }
  return n;
}

/** Opens the element with this code. If no element or more than one has it, opens the label screen. */
export function openLabel(code: string, replace = true) {
  const found = findElementsByLabel(code);
  if (found.length === 1) navigate({ name: "element", pid: found[0].pid, elementId: found[0].id, step: 0 }, replace);
  else navigate({ name: "label", code }, replace);
}

/**
 * Call after loadAll(): if the page was opened from a label link (?e=<CODE>), remove `e` from
 * the address (a reload must not open the link again) and open the element. The scanned text
 * is data: only the code is read, nothing is opened or fetched.
 */
export function openLabelLink() {
  const u = new URL(location.href);
  const raw = u.searchParams.get("e");
  if (raw === null) return;
  u.searchParams.delete("e");
  history.replaceState(history.state, "", u.pathname + u.search + u.hash);
  const code = normalizeLabelCode(raw);
  if (code) openLabel(code);
  else navigate({ name: "label", code: raw.slice(0, 40) }, true);
}

/** What one label shows: QR link, code, Bauteil ID, Bezeichnung, Verortung, project name. */
export const labelItemFor = (e: Element, p: Project, base: string): LabelItem => ({
  code: e.labelCode!,
  url: labelUrl(e.labelCode!, base),
  title: e.fields.bauteilId ?? "",
  lines: [e.fields.bezeichnung ?? "", e.fields.verortung ?? ""],
  foot: p.name,
});

/** PDF with one label on a 70 × 37 mm page. Gives the element a code first if it has none. */
export async function elementLabelPDF(e: Element, p: Project): Promise<Blob> {
  if (!e.labelCode) assignLabelCodes([e]);
  return renderLabelSheet([labelItemFor(e, p, labelBase())], LABEL_70x37);
}
