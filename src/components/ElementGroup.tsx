import type { ReactNode } from "react";
import type { Element, Project } from "../domain/types";
import { getLang, opt, t } from "../i18n";
import { displayName, sameCount, sameElements } from "../lib/elements";
import { searchElements } from "../lib/search";
import { Icon } from "./Icon";

/**
 * Same elements (linked by "Prefill from an existing element" or by the same GTIN) as one bar.
 * The bar opens with a small arrow and lists every entry of that element in the whole building.
 */

/** The group of e when it is one of two or more linked entries, else null. */
export const groupKey = (e: Element): string | null => (e.groupId && sameCount(e).n >= 2 ? e.groupId : null);

export type ListItem = { kind: "one"; e: Element } | { kind: "group"; id: string; first: Element; hits: Element[] };

/** Single elements stay single; linked ones become one bar, at the place of the first of them in the list. */
export function groupItems(els: Element[]): ListItem[] {
  const out: ListItem[] = [];
  const seen = new Map<string, Extract<ListItem, { kind: "group" }>>();
  for (const e of els) {
    const g = groupKey(e);
    if (!g) { out.push({ kind: "one", e }); continue; }
    const it = seen.get(g);
    if (it) it.hits.push(e);
    else { const n = { kind: "group" as const, id: g, first: e, hits: [e] }; seen.set(g, n); out.push(n); }
  }
  return out;
}

/** All entries of the group in the building, top floor first, then room order. */
export const groupMembers = (e: Element, p: Project) => searchElements(sameElements(e), p, "");

/** Open/closed groups of one screen. */
export function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function GroupBar({ id, first, open, onToggle, badges, children }: {
  id: string; first: Element; open: boolean; onToggle: () => void;
  /** e.g. the photo numbers of the entries in this room */
  badges?: ReactNode;
  /** the entries, shown when open */
  children: ReactNode;
}) {
  const sc = sameCount(first);
  const qty = sc.qty !== undefined ? ` · ${getLang() === "de" ? String(sc.qty).replace(".", ",") : sc.qty} ${opt(sc.unit ?? "")}` : "";
  const kids = "grp-" + id;
  return (
    <div className="group">
      <button type="button" className="li group-head" aria-expanded={open} aria-controls={kids} title={open ? t("grp.close") : t("grp.open")} onClick={onToggle}>
        <span className={"chev" + (open ? " open" : "")} aria-hidden="true"><Icon name="next" size={18} /></span>
        {badges}
        <div className="grow"><div className="t">{displayName(first)}</div><div className="s">{t("same.pill", { n: sc.n })}{qty}</div></div>
        <span className="group-count">{sc.n}</span>
      </button>
      {open && <div id={kids} className="group-kids">{children}</div>}
    </div>
  );
}
