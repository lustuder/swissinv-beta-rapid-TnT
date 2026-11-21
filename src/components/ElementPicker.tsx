import { useEffect, useRef, useState } from "react";
import type { Element, Project } from "../domain/types";
import { t } from "../i18n";
import { searchElements } from "../lib/search";
import { elementsOf } from "../lib/store";
import { ElementResults, SearchBar } from "./ElementSearch";

/**
 * Choose an element of this building to prefill from. Lists every other element of the project,
 * saved ones first, with the same search as the inventory.
 */
export function ElementPicker({ p, exclude, onPick, onClose }: { p: Project; exclude: string; onPick: (src: Element) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);

  const others = elementsOf(p.id).filter(e => e.id !== exclude);
  const found = searchElements(others, p, q).sort((a, b) => (a.status === b.status ? 0 : a.status === "saved" ? -1 : 1));

  return (
    <dialog ref={dialog} className="label-dialog" onClose={onClose} aria-labelledby="picker-h">
      <h3 id="picker-h" style={{ margin: 0 }}>{t("pf.title")}</h3>
      <SearchBar id="search-prefill" label={t("sr.building")} value={q} onChange={setQ} />
      <div className="picker-list">
        <ElementResults els={found} p={p} onPick={e => { onPick(e); dialog.current?.close(); }} />
      </div>
      <button type="button" className="btn ghost block" onClick={() => dialog.current?.close()}>{t("pf.cancel")}</button>
    </dialog>
  );
}
