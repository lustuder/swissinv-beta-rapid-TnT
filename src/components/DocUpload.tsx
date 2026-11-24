import { useRef, useState } from "react";
import { DOKUMENTE, DOKUMENTE_KEINE } from "../domain/swissinv";
import type { DocFile } from "../domain/types";
import { opt, t } from "../i18n";
import { download } from "../lib/export";
import { getFile, putFile, releaseFiles } from "../lib/store";
import { toast } from "../lib/toast";
import { Icon } from "./Icon";

/** Document types a file can have: the Swiss-Inv list without "Keine". */
const KINDS = DOKUMENTE.filter(k => k !== DOKUMENTE_KEINE);
const BIG = 50 * 1024 * 1024;

export const fileSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * Upload documents next to "Liste der vorhandenen Dokumente": any file, stored on this device.
 * Each file has a document type; adding a file or changing its type calls onKind, so the screen
 * can tick that type in the list. The owner (element or project) saves in onChange.
 */
export function DocUpload({ docs, ticked, onChange, onKind }: {
  docs: DocFile[];
  /** the types ticked in the list now; the first one becomes the type of new files */
  ticked: string[];
  onChange: (docs: DocFile[]) => void;
  onKind: (kind: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  // the upload awaits; then it must use the newest list and callbacks, not those from when it started
  const latest = useRef({ docs, onChange, onKind });
  latest.current = { docs, onChange, onKind };
  const kindDefault = ticked.find(k => KINDS.includes(k)) ?? "Andere";

  const add = async (list: File[]) => {
    if (!list.length) return;
    const kind = kindDefault, added: DocFile[] = [];
    setBusy(true);
    try {
      for (const f of list) {
        if (f.size > BIG) toast(t("doc.big", { size: fileSize(f.size) }));
        const id = await putFile(f);
        added.push({ id, name: f.name || "Dokument", mime: f.type, size: f.size, kind, addedAt: Date.now() });
      }
    } catch { toast(t("doc.failed")); }
    finally { setBusy(false); }
    if (!added.length) return;
    latest.current.onChange([...latest.current.docs, ...added]);
    latest.current.onKind(kind);
  };

  const setKind = (d: DocFile, kind: string) => {
    onChange(docs.map(x => (x.id === d.id ? { ...x, kind } : x)));
    onKind(kind);
  };

  const remove = (d: DocFile) => {
    setConfirm(null);
    onChange(docs.filter(x => x.id !== d.id));
    releaseFiles([d.id]); // deleted only if no other element still lists it
  };

  /** PDFs and images open in a new tab; other files download. */
  const open = async (d: DocFile) => {
    const b = await getFile(d.id);
    if (!b) { toast(t("doc.missing")); return; }
    if (/^image\/|^application\/pdf$/.test(d.mime)) {
      const url = URL.createObjectURL(b);
      const w = window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (w) return;
    }
    download(d.name, b);
  };

  return (
    <div className="field">
      <span className="flabel">{t("doc.upload")}</span>
      {docs.length > 0 && (
        <div className="list">
          {docs.map(d => confirm === d.id ? (
            <div key={d.id} className="li-row row-confirm">
              <div className="confirm-inline"><span>{t("doc.removeQ", { name: d.name })}</span>
                <button type="button" className="btn sm danger" onClick={() => remove(d)}>{t("c.delete")}</button>
                <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}>{t("c.keep")}</button></div>
            </div>
          ) : (
            <div key={d.id} className="doc-row">
              <button type="button" className="doc-open" title={t("doc.openFor", { name: d.name })} onClick={() => void open(d)}>
                <Icon name="file" size={22} />
                <span className="grow"><span className="t">{d.name}</span><span className="s">{fileSize(d.size)} · {t("doc.open")}</span></span>
              </button>
              <select aria-label={`${t("doc.kind")}: ${d.name}`} value={d.kind} onChange={ev => setKind(d, ev.target.value)}>
                {KINDS.map(k => <option key={k} value={k}>{opt(k)}</option>)}
              </select>
              <button type="button" className="li-del" aria-label={t("doc.remove", { name: d.name })} title={t("doc.remove", { name: d.name })}
                onClick={() => setConfirm(d.id)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      <label className="btn block" style={{ position: "relative" }} aria-disabled={busy}>
        <Icon name="plus" /> {busy ? t("doc.saving") : t("doc.upload")}
        <input type="file" multiple disabled={busy} aria-label={t("doc.upload")} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
          onChange={ev => { const list = Array.from(ev.target.files ?? []); ev.target.value = ""; void add(list); }} />
      </label>
      <p className="small muted" style={{ margin: 0 }}>{t("doc.hint")}</p>
    </div>
  );
}
