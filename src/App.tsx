import { Toast } from "./components/Toast";
import { t, useLang } from "./i18n";
import { useRoute } from "./lib/nav";
import { useData, useStaleTab } from "./lib/store";
import { AddRoom } from "./screens/AddRoom";
import { Defaults } from "./screens/Defaults";
import { ElementScreen } from "./screens/ElementScreen";
import { ExportScreen } from "./screens/Export";
import { Floors } from "./screens/Floors";
import { Hub } from "./screens/Hub";
import { Info } from "./screens/Info";
import { LabelScreen } from "./screens/Label";
import { Language } from "./screens/Language";
import { Menu } from "./screens/Menu";
import { ModeSwitch } from "./screens/ModeSwitch";
import { ProjectForm } from "./screens/ProjectForm";
import { RoomScreen } from "./screens/Room";
import { Start } from "./screens/Start";
import { Study } from "./screens/Study";

/**
 * Screen switch. Flow: Start → Language → Menu → Project → Project menu (hub) with
 * Projektinformationen (4 step pages) · Inventar (defaults → floors → rooms → element step pages) · Export.
 */
export function App() {
  useLang();
  const r = useRoute();
  const { ready } = useData();
  const staleTab = useStaleTab();
  // A newer tab writes now (e.g. opened by a scanned label). This tab must not show or save old data.
  if (staleTab) {
    return (
      <main className="wrap">
        <div className="card stack" style={{ gap: 8, marginTop: 24 }}>
          <b>{t("tab.stale")}</b>
          <p className="small muted" style={{ margin: 0 }}>{t("tab.staleText")}</p>
          <button className="btn primary" onClick={() => location.reload()}>{t("tab.useThis")}</button>
        </div>
      </main>
    );
  }
  // Form screens copy the stored data into local state when they mount. After a reload the
  // router restores the last screen before loadAll() is done; such a screen would start
  // empty and save the empty values on the next step. So wait for the data first.
  if (!ready && r.name !== "start" && r.name !== "language" && r.name !== "menu") {
    return <><main className="wrap"><div className="empty status busy">{t("menu.loading")}</div></main><Toast /></>;
  }
  let screen;
  switch (r.name) {
    case "start": screen = <Start />; break;
    case "language": screen = <Language />; break;
    case "menu": screen = <Menu />; break;
    case "project": screen = <ProjectForm key={r.pid ?? "new"} pid={r.pid} />; break;
    case "hub": screen = <Hub pid={r.pid} />; break;
    case "info": screen = <Info key={r.pid + r.step} pid={r.pid} step={r.step} />; break;
    case "defaults": screen = <Defaults pid={r.pid} />; break;
    case "floors": screen = <Floors key={r.pid} pid={r.pid} />; break;
    case "mode": screen = <ModeSwitch pid={r.pid} />; break;
    case "addRoom": screen = <AddRoom pid={r.pid} floor={r.floor} />; break;
    case "room": screen = <RoomScreen key={r.roomId} pid={r.pid} roomId={r.roomId} />; break;
    case "element": screen = <ElementScreen key={r.elementId} pid={r.pid} elementId={r.elementId} step={r.step ?? 0} />; break;
    case "export": screen = <ExportScreen pid={r.pid} />; break;
    case "study": screen = <Study />; break;
    case "label": screen = <LabelScreen key={r.code ?? ""} code={r.code} />; break;
    default: screen = <Menu />;
  }
  return <>{screen}<Toast /></>;
}
