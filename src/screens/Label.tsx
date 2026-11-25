import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { RemoteElement } from "../components/RemoteElement";
import { TopBar } from "../components/TopBar";
import { floorLabel } from "../domain/fields";
import { t, useLang } from "../i18n";
import { formatLabelCode, normalizeLabelCode, parseLabelText } from "../lib/labelCode";
import { findElementsByLabel, openLabel } from "../lib/labels";
import { home, navigate } from "../lib/nav";
import { useData } from "../lib/store";
import { fetchLabel, type LabelResult } from "../lib/sync";
import { roomTitle } from "./Floors";

/**
 * Open a label: type a code (or paste a label link). Also shown when a scanned label is not
 * known on this device, has a wrong format, or more than one element carries its code.
 * Not on this device: with online sync, the element is fetched by its label code and shown as a
 * read-only copy (nothing is imported into this device's projects).
 */
export function LabelScreen({ code }: { code?: string }) {
  useLang();
  const { projects } = useData();
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const valid = code ? normalizeLabelCode(code) : null;
  const found = valid ? findElementsByLabel(valid) : [];
  const local = found.length > 0;
  const [remote, setRemote] = useState<LabelResult | "loading" | null>(null);
  const [pick, setPick] = useState(0);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!valid || local) { setRemote(null); return; }
    let live = true;
    setRemote("loading"); setPick(0);
    void fetchLabel(valid).then(res => { if (live) setRemote(res); });
    return () => { live = false; };
  }, [valid, local, attempt]);
  const remoteItems = remote && remote !== "loading" && remote.ok ? remote.items : [];
  const reason = remote && remote !== "loading" && !remote.ok ? remote.reason : null;

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
        {valid && !local && remote === "loading" && <div className="status busy">{t("rem.loading")}</div>}
        {valid && !local && remoteItems.length > 1 && (
          <>
            <p className="small muted" style={{ margin: 0 }}>{t("lbl.several")}</p>
            <div className="chips" role="group" aria-label={t("lbl.several")}>
              {remoteItems.map((it, i) => (
                <button type="button" key={i} className="chip" aria-pressed={pick === i} onClick={() => setPick(i)}>
                  {[it.element.fields.bauteilId, it.project?.name].filter(Boolean).join(" · ") || String(i + 1)}
                </button>
              ))}
            </div>
          </>
        )}
        {valid && !local && remoteItems.length > 0 && <RemoteElement item={remoteItems[Math.min(pick, remoteItems.length - 1)]} />}
        {valid && !local && reason && (
          <div className="card stack" style={{ gap: 6 }}>
            <span className="eyebrow">{t("lbl.code")} {formatLabelCode(valid)}</span>
            <b>{t("lbl.unknown")}</b>
            <p className="small muted" style={{ margin: 0 }}>{t("lbl.unknownText")}</p>
            <p className="small" style={{ margin: 0 }}>{t(reason === "off" ? "rem.off" : reason === "offline" ? "rem.offline" : reason === "notFound" ? "rem.notFound" : "rem.error")}</p>
            {(reason === "offline" || reason === "error") && <button type="button" className="btn" onClick={() => setAttempt(a => a + 1)}>{t("rem.retry")}</button>}
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
