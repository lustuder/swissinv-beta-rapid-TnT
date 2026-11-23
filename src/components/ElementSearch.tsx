import { useState } from "react";
import { floorLabel } from "../domain/fields";
import type { Element, Project } from "../domain/types";
import { t } from "../i18n";
import { displayName, sameCount } from "../lib/elements";
import { roomTitle } from "../screens/Floors";
import { GroupBar, groupItems, groupMembers, toggleIn, type ListItem } from "./ElementGroup";
import { Tick } from "./Icon";

/** Search field for elements, with a clear button (type="search" has none on every phone). */
export function SearchBar({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field search">
      <label htmlFor={id}>{label}</label>
      <div className="search-row">
        <input id={id} type="search" autoComplete="off" enterKeyHint="search" value={value} placeholder={t("sr.placeholder")} onChange={ev => onChange(ev.target.value)} />
        {value && <button type="button" className="btn ghost search-clear" aria-label={t("sr.clear")} title={t("sr.clear")} onClick={() => onChange("")}>×</button>}
      </div>
    </div>
  );
}

/** "×3 in building" when the element is one of several linked entries, else nothing. */
export function SamePill({ e }: { e: Element }) {
  if (!e.groupId) return null;
  const { n } = sameCount(e);
  return n >= 2 ? <span className="pill same">{t("same.pill", { n })}</span> : null;
}

/**
 * Elements as a list: name, Bauteil ID, room and floor (optional), linked count, saved tick.
 * grouped: same elements become one bar that opens to all their entries in the building.
 */
export function ElementResults({ els, p, onPick, showRoom = true, grouped = false }: { els: Element[]; p: Project; onPick: (e: Element) => void; showRoom?: boolean; grouped?: boolean }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  if (els.length === 0) return <div className="list"><div className="empty">{t("sr.none")}</div></div>;
  const where = (e: Element) => { const r = p.rooms.find(x => x.id === e.roomId); return r ? `${roomTitle(r)} · ${floorLabel(r.floor)}` : ""; };
  const rowOf = (e: Element, child = false) => (
    <button key={e.id} type="button" className={"li" + (child ? " child" : "")} onClick={() => onPick(e)}>
      <span className="swatch" style={{ background: e.color }} />
      {child
        ? <div className="grow"><div className="t">{e.fields.bauteilId || displayName(e)}</div><div className="s">{where(e)}</div></div>
        : <div className="grow"><div className="t">{displayName(e)}</div><div className="s">{[e.fields.bauteilId, showRoom ? where(e) : ""].filter(Boolean).join(" · ")}</div></div>}
      {!child && <SamePill e={e} />}
      {e.status === "saved" ? <Tick /> : <span className="pill">{t("rm.open")}</span>}
    </button>
  );
  const items: ListItem[] = grouped ? groupItems(els) : els.map(e => ({ kind: "one", e }));
  return (
    <div className="list">
      {items.map(it => it.kind === "one" ? rowOf(it.e) : (
        <GroupBar key={it.id} id={it.id} first={it.first} open={open.has(it.id)} onToggle={() => setOpen(s => toggleIn(s, it.id))}>
          {groupMembers(it.first, p).map(m => rowOf(m, true))}
        </GroupBar>
      ))}
    </div>
  );
}
