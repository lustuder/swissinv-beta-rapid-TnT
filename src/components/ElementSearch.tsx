import { floorLabel } from "../domain/fields";
import type { Element, Project } from "../domain/types";
import { t } from "../i18n";
import { displayName, sameCount } from "../lib/elements";
import { roomTitle } from "../screens/Floors";
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

/** Elements as a list: name, Bauteil ID, room and floor (optional), linked count, saved tick. */
export function ElementResults({ els, p, onPick, showRoom = true }: { els: Element[]; p: Project; onPick: (e: Element) => void; showRoom?: boolean }) {
  if (els.length === 0) return <div className="list"><div className="empty">{t("sr.none")}</div></div>;
  return (
    <div className="list">
      {els.map(e => {
        const r = p.rooms.find(x => x.id === e.roomId);
        const sub = [e.fields.bauteilId, showRoom && r ? `${roomTitle(r)} · ${floorLabel(r.floor)}` : ""].filter(Boolean).join(" · ");
        return (
          <button key={e.id} type="button" className="li" onClick={() => onPick(e)}>
            <span className="swatch" style={{ background: e.color }} />
            <div className="grow"><div className="t">{displayName(e)}</div><div className="s">{sub}</div></div>
            <SamePill e={e} />
            {e.status === "saved" ? <Tick /> : <span className="pill">{t("rm.open")}</span>}
          </button>
        );
      })}
    </div>
  );
}
