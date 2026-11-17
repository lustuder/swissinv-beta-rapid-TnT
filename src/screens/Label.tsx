import { useState } from "react";
import { Icon } from "../components/Icon";
import { TopBar } from "../components/TopBar";
import { floorLabel } from "../domain/fields";
import { t, useLang } from "../i18n";
import { formatLabelCode, normalizeLabelCode, parseLabelText } from "../lib/labelCode";
import { findElementsByLabel, openLabel } from "../lib/labels";
import { home, navigate } from "../lib/nav";
import { useData } from "../lib/store";
import { roomTitle } from "./Floors";

/**
 * Open a label: type a code (or paste a label link). Also shown when a scanned label is not
 * known on this device, has a wrong format, or more than one element carries its code.
 */
export function LabelScreen({ code }: { code?: string }) {
  useLang();
  const { projects } = useData();
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const valid = code ? normalizeLabelCode(code) : null;
  const found = valid ? findElementsByLabel(valid) : [];

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const c = parseLabelText(text);
    if (!c) { setBad(true); return; }
    setBad(false); setText("");
    openLabel(c, false);
  };

  return (
    <>
      <TopBar title={t("lbl.title")} onBack={() => home()} onHome={() => home()} />
      <main className="wrap">
        {code !== undefined && !valid && !bad && <p className="small" style={{ color: "var(--warn)" }}>{t("lbl.invalid")}</p>}
        {valid && found.length === 0 && (
          <div className="card stack" style={{ gap: 6 }}>
            <span className="eyebrow">{t("lbl.code")} {formatLabelCode(valid)}</span>
            <b>{t("lbl.unknown")}</b>
            <p className="small muted" style={{ margin: 0 }}>{t("lbl.unknownText")}</p>
          </div>
        )}
        {found.length > 0 && (
          <>
            <div className="section-title"><h3>{t("lbl.code")} {formatLabelCode(valid!)}</h3></div>
            {found.length > 1 && <p className="small muted">{t("lbl.several")}</p>}
            <div className="list">
              {found.map(e => {
                const p = projects[e.pid], r = p?.rooms.find(x => x.id === e.roomId);
                return (
                  <button key={e.id} className="li" onClick={() => navigate({ name: "element", pid: e.pid, elementId: e.id, step: 0 })}>
                    <span className="swatch" style={{ background: e.color }} />
                    <div className="grow"><div className="t">{[e.fields.bauteilId, e.fields.bezeichnung].filter(Boolean).join(" · ") || t("rm.unnamed")}</div>
                      <div className="s">{[p?.name, r && roomTitle(r), r && floorLabel(r.floor)].filter(Boolean).join(" · ")}</div></div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <form className="stack" style={{ gap: 10 }} onSubmit={submit}>
          <div className="field">
            <label htmlFor="labelcode">{t("lbl.enter")}</label>
            <input id="labelcode" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={200}
              placeholder="K7M2-X9PA" value={text} onChange={ev => { setText(ev.target.value); setBad(false); }} />
          </div>
          {bad && <p className="small" style={{ color: "var(--warn)", margin: 0 }}>{t("lbl.invalid")}</p>}
          <button type="submit" className="btn primary" disabled={!text.trim()}><Icon name="qr" /> {t("lbl.open")}</button>
        </form>
      </main>
    </>
  );
}
