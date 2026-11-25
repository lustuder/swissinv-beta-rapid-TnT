import { useState } from "react";
import { t, useLang, type UIKey } from "../i18n";
import { checkTeamKey, setTeamKey, syncEnabled, teamKey, useSyncStatus, type SyncStatus as Status } from "../lib/sync";

function statusText(s: Status): string {
  switch (s.state) {
    case "off": return t("sync.off");
    case "nokey": return t("sync.nokey");
    case "badkey": return t("sync.badkey");
    case "offline": return s.pending ? t("sync.offlineN", { n: s.pending }) : t("sync.offline");
    case "error": return t("sync.error");
    case "ok": return t("sync.ok");
    default: return s.pending === 0 ? t("sync.ok") : s.pending === 1 ? t("sync.pending1") : t("sync.pendingN", { n: s.pending });
  }
}

/**
 * Online sync status ("All saved online" / "3 changes waiting to upload" / "Sync off").
 * withKey: also the team key field (main menu). The key is stored on this device only.
 */
export function SyncStatus({ withKey = false }: { withKey?: boolean }) {
  useLang();
  const s = useSyncStatus();
  const [key, setKey] = useState(teamKey);
  const [check, setCheck] = useState<"" | "checking" | "ok" | "bad" | "offline" | "error">("");
  const tone = s.state === "ok" || (s.state === "pending" && s.pending === 0) ? "ok" : s.state === "off" ? "off" : s.state === "badkey" || s.state === "error" || s.state === "nokey" ? "warn" : "wait";

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const k = key.trim();
    setTeamKey(k);
    if (!k) { setCheck(""); return; }
    setCheck("checking");
    setCheck(await checkTeamKey(k));
  };
  const checkKey: Record<string, UIKey> = { checking: "sync.checking", ok: "sync.keyOk", bad: "sync.keyBad", offline: "sync.keyOffline", error: "sync.error" };

  return (
    <div className="card stack sync-card" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8 }}>
        <span className={"sync-dot " + tone} aria-hidden="true" />
        <span className="small"><b>{t("sync.title")}:</b> {statusText(s)}</span>
      </div>
      {withKey && syncEnabled() && (
        <form className="stack" style={{ gap: 6 }} onSubmit={ev => void save(ev)}>
          <label htmlFor="teamkey" className="flabel">{t("sync.key")}</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input id="teamkey" className="grow" type="password" autoComplete="off" spellCheck={false} value={key} onChange={ev => { setKey(ev.target.value); setCheck(""); }} />
            <button type="submit" className="btn">{t("sync.keySave")}</button>
          </div>
          {check && <p className="small" role="status" style={{ margin: 0, color: check === "ok" ? "var(--ok)" : check === "checking" ? "var(--muted)" : "var(--warn)" }}>{t(checkKey[check])}</p>}
          <p className="small muted" style={{ margin: 0 }}>{t("sync.keyHint")}</p>
        </form>
      )}
    </div>
  );
}
