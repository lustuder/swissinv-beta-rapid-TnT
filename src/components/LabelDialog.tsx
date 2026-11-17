import { useEffect, useRef, useState } from "react";
import type { Element, Project } from "../domain/types";
import { t } from "../i18n";
import { baseName, download } from "../lib/export";
import { formatLabelCode, isLocalUrl, labelUrl } from "../lib/labelCode";
import { elementLabelPDF, labelBase } from "../lib/labels";
import { Icon } from "./Icon";

/**
 * The QR label of one element: preview, Print and Download PDF (one 70 × 37 mm page).
 * The caller gives the element its code before it opens this window (assignLabelCodes).
 * Print: on a PC the PDF prints from a hidden frame; on a phone it opens in the PDF viewer,
 * which has Print or Share. If that does not work, the PDF downloads.
 */
export function LabelDialog({ e, p, onClose }: { e: Element; p: Project; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null);
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const code = e.labelCode ?? "";
  const base = labelBase();
  const pc = window.matchMedia("(pointer: fine)").matches;

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    let live = true, url = "";
    void (async () => {
      try {
        const [blob, QR] = await Promise.all([elementLabelPDF(e, p), import("qrcode")]);
        const s = await QR.default.toString(labelUrl(e.labelCode!, base), { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#000000", light: "#ffffff" } });
        if (!live) return;
        url = URL.createObjectURL(blob);
        setPdf({ blob, url });
        setSvg("data:image/svg+xml," + encodeURIComponent(s));
      } catch (err) { console.warn(err); if (live) setFailed(true); }
    })();
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [e.id]);

  const save = () => { if (pdf) download(`${baseName(p)}_${code}_Etikette.pdf`, pdf.blob); };
  const print = () => {
    if (!pdf) return;
    if (pc) {
      try { const w = frame.current?.contentWindow; if (!w) throw new Error("no frame"); w.focus(); w.print(); }
      catch { save(); }
      return;
    }
    const w = window.open(pdf.url, "_blank");
    if (!w) save();
  };

  return (
    <dialog ref={dialog} className="label-dialog" onClose={onClose} aria-labelledby="label-dialog-h">
      <h3 id="label-dialog-h" style={{ margin: 0 }}>{t("lbl.title")} {formatLabelCode(code)}</h3>
      <div className="label-preview">
        {svg ? <img src={svg} alt="" /> : <span className="label-qr-wait" />}
        <div className="label-text">
          <b className="label-code">{formatLabelCode(code)}</b>
          <b>{e.fields.bauteilId}</b>
          <span>{e.fields.bezeichnung}</span>
          <span className="muted">{e.fields.verortung}</span>
          <span className="muted label-foot">{p.name}</span>
        </div>
      </div>
      <p className="small muted" style={{ margin: 0, overflowWrap: "anywhere" }}>{t("lbl.singleNote", { url: base })}</p>
      {isLocalUrl(base) && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>{t("ex.labelsLocal")}</p>}
      {failed && <p className="small" style={{ color: "var(--danger)", margin: 0 }}>{t("ex.labelsFailed")}</p>}
      <div className="row">
        <button type="button" className="btn primary grow" disabled={!pdf || (pc && !frameReady)} onClick={print}><Icon name="print" /> {t("lbl.print")}</button>
        <button type="button" className="btn grow" disabled={!pdf} onClick={save}><Icon name="download" /> {t("lbl.download")}</button>
      </div>
      <button type="button" className="btn ghost block" onClick={() => dialog.current?.close()}>{t("lbl.close")}</button>
      {pc && pdf && <iframe ref={frame} className="label-print-frame" src={pdf.url} title={t("lbl.print")} tabIndex={-1} aria-hidden="true" onLoad={() => setFrameReady(true)} />}
    </dialog>
  );
}
