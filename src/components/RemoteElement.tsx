import { floorLabel } from "../domain/fields";
import { ELEMENT_FIELD, STUFE1_KEYS, STUFE2_SECTIONS, type FieldDef } from "../domain/swissinv";
import { getLang, label, opt, t, useLang } from "../i18n";
import { shown } from "../lib/export";
import type { RemoteItem } from "../lib/sync";
import { fileSize } from "./DocUpload";
import { Icon } from "./Icon";

/**
 * Read-only copy of one element from the online database, for a phone that scanned a label but
 * does not hold the element. Shows the Swiss-Inv fields (labels from swissinv.ts, as on the
 * element pages), and how many photos and which documents the capturing phone holds (the files
 * themselves are not online). Nothing is imported or editable here.
 */
export function RemoteElement({ item }: { item: RemoteItem }) {
  const L = useLang();
  const e = item.element, f = e.fields, r = item.room, p = item.project;
  const title = f.bezeichnung || (e.entry === "gtin" && f.bauteilId ? `GTIN ${f.bauteilId}` : t("rm.unnamed"));
  const address = p ? [[p.adresse, p.hausnummer].filter(Boolean).join(" "), [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const when = new Date(e.updatedAt).toLocaleString(getLang() === "en" ? "en-GB" : "de-CH", { dateStyle: "medium", timeStyle: "short" });
  const rows = (defs: FieldDef[]) => defs.map(d => ({ d, v: shown(d, f[d.key]) })).filter(x => x.v);
  const sections = [
    { title: L === "en" ? "Element" : "Bauteil", rows: rows(STUFE1_KEYS.map(k => ELEMENT_FIELD[k]).filter(d => d.key !== "bezeichnung")) },
    ...STUFE2_SECTIONS.map(s => ({ title: L === "en" ? s.titleEn : s.title, rows: rows(s.fields) })),
  ].filter(s => s.rows.length);
  // photos and documents stay on the capturing phone: only how many, and the document names
  const nPhotos = e.photoCount ?? 0, nDocs = e.docs.length;
  const files = [
    nPhotos === 1 ? t("rem.photos1") : nPhotos > 1 ? t("rem.photosN", { n: nPhotos }) : "",
    nDocs === 1 ? t("rem.docs1") : nDocs > 1 ? t("rem.docsN", { n: nDocs }) : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="card remote-note" role="note">
        <b>{t("rem.title")}</b>
        <p className="small muted" style={{ margin: 0 }}>{t("rem.note", { date: when })}</p>
      </div>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <div className="row">
        {f.bauteilId && <span className="tag pill">{f.bauteilId}</span>}
        {r && <span className="small muted">{[r.tag, floorLabel(r.floor), r.name].filter(Boolean).join(" · ")}</span>}
      </div>
      {p && <p className="small" style={{ margin: 0 }}><b>{p.name}</b>{address ? ` · ${address}` : ""}</p>}

      {sections.map(s => (
        <section key={s.title} className="stack" style={{ gap: 6 }}>
          <h3 className="section-h">{s.title}</h3>
          <dl className="remote-fields">
            {s.rows.map(({ d, v }) => <div key={d.key}><dt>{label(d)}</dt><dd>{v}</dd></div>)}
          </dl>
        </section>
      ))}

      {files && (
        <section className="stack" style={{ gap: 6 }}>
          <h3 className="section-h">{t("rem.files")}</h3>
          <p className="small muted" style={{ margin: 0 }}>{t("rem.filesLocal", { what: files })}</p>
          {e.docs.length > 0 && (
            <div className="list">
              {e.docs.map((d, i) => (
                <div key={i} className="li">
                  <Icon name="file" size={22} />
                  <div className="grow"><div className="t" style={{ overflowWrap: "anywhere" }}>{d.name}</div><div className="s">{[d.kind && opt(d.kind), d.size ? fileSize(d.size) : ""].filter(Boolean).join(" · ")}</div></div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
