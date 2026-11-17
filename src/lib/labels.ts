/**
 * QR labels and the store. An element gets its permanent label code at the first label
 * export (or, later, when a printed label is attached). createElement does not assign one.
 */
import type { Element } from "../domain/types";
import { newLabelCode } from "./labelCode";
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
