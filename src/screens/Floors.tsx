import { useState } from "react";
import { ElementResults, SearchBar } from "../components/ElementSearch";
import { Icon } from "../components/Icon";
import { ModeChip } from "../components/ModeChip";
import { Progress } from "../components/Progress";
import { TopBar } from "../components/TopBar";
import { USES, floorLabel, floorsOf } from "../domain/fields";
import type { Room } from "../domain/types";
import { getLang, t, useLang } from "../i18n";
import { home, navigate } from "../lib/nav";
import { searchElements } from "../lib/search";
import { deleteRoom, elementsOf, saveProject, useData } from "../lib/store";
import { toast } from "../lib/toast";

/** Room name for display: the room's own name, else its use in the UI language. */
export const roomTitle = (r: Pick<Room, "name" | "useCode" | "useLabel">) => r.name || (USES.find(u => u.code === r.useCode)?.[getLang()] ?? r.useLabel);
export const useName = (r: Room) => USES.find(u => u.code === r.useCode)?.[getLang()] ?? r.useLabel;

export function Floors({ pid }: { pid: string }) {
  useLang();
  const p = useData().projects[pid];
  const floors = p ? floorsOf(p.info) : [0];
  const [floor, setFloorState] = useState(() => (p && floors.includes(p.lastFloor ?? 0) ? p.lastFloor ?? 0 : 0));
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  if (!p) return null;
  const setFloor = (f: number) => { setFloorState(f); p.lastFloor = f; saveProject(p); };

  const n = floors.length, show = Math.min(n, 8);
  const idx = floors.indexOf(floor);
  const start = Math.max(0, Math.min(idx - Math.floor(show / 2), n - show));
  const vis = floors.slice(start, start + show);
  const gap = 34, h = 40 + gap * (vis.length - 1) + 40;
  const rooms = p.rooms.filter(r => r.floor === floor);
  const els = elementsOf(p.id), saved = els.filter(e => e.status === "saved").length;
  const searching = q.trim() !== "";
  const found = searching ? searchElements(els, p, q) : [];

  return (
    <>
      <TopBar title={p.name} onBack={() => home(pid)} onHome={() => home(pid)}>
        <ModeChip project={p} back={{ name: "floors", pid }} />
      </TopBar>
      <Progress value={saved} max={Math.max(1, els.length)} label={t("inv.progress", { saved, total: els.length })} />
      <main className="wrap">
        <SearchBar id="search-building" label={t("sr.building")} value={q} onChange={setQ} />
        {searching ? (
          <>
            <div className="section-title"><h3>{found.length === 1 ? t("sr.found1") : t("sr.foundN", { n: found.length })}</h3></div>
            <ElementResults grouped els={found} p={p} onPick={e => navigate({ name: "element", pid, elementId: e.id, step: 0 })} />
          </>
        ) : <>
        <div className="row">
          <div className="grow"><span className="eyebrow">{t("fl.select")}</span></div>
          <button className="btn sm ghost" onClick={() => navigate({ name: "defaults", pid })}>{t("fl.defaults")}</button>
        </div>
        <div className="floors">
          {n > show && <button className="btn sm ghost" disabled={start === 0} onClick={() => setFloor(floors[Math.max(0, idx - 4)])}>{t("fl.higher")}</button>}
          <svg viewBox={`0 0 340 ${h}`} role="group" aria-label="Floors">
            {/* painted bottom-up, so the highest floor sits in front and basements at the back */}
            {vis.map((f, k) => ({ f, k })).reverse().map(({ f, k }) => {
              const y = 14 + k * gap, sel = f === floor, count = p.rooms.filter(r => r.floor === f).length;
              const fill = sel ? "var(--primary)" : f < 0 ? "var(--sage-deep)" : "var(--sage)";
              return (
                <g key={f} className="floor-shape" tabIndex={0} role="button" aria-label={`${floorLabel(f)}, ${count}`}
                  onClick={() => setFloor(f)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFloor(f); } }}>
                  <polygon points={`70,${y + 40} 110,${y} 330,${y} 290,${y + 40}`} fill={fill} stroke="var(--sage-deep)" strokeWidth={1.5} />
                  <text x={56} y={y + 26} textAnchor="end" style={{ fontFamily: "var(--f-mono)", fontSize: 12, fill: "var(--fg)" }}>{floorLabel(f)}</text>
                  {count > 0 && <text x={200} y={y + 25} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: sel ? "var(--on-primary)" : "#1B1F10" }}>{count === 1 ? t("fl.rooms1") : t("fl.roomsN", { n: count })}</text>}
                </g>
              );
            })}
          </svg>
          {n > show && <button className="btn sm ghost" disabled={start + show >= n} onClick={() => setFloor(floors[Math.min(n - 1, idx + 4)])}>{t("fl.lower")}</button>}
        </div>
        <div className="section-title"><h3>{t("fl.rooms", { floor: floorLabel(floor) })}</h3></div>
        <div className="list">
          {rooms.length === 0 ? <div className="empty">{t("fl.noRooms")}</div> : rooms.map(r => {
            const rc = elementsOf(p.id, r.id), sv = rc.filter(e => e.status === "saved").length;
            const name = roomTitle(r) || r.tag;
            return confirmDel === r.id ? (
              <div key={r.id} className="li-row row-confirm">
                <div className="confirm-inline"><span>{t("fl.deleteRoomQ", { name, n: rc.length })}</span>
                  <button type="button" className="btn sm danger" onClick={() => { setConfirmDel(null); deleteRoom(p, r.id); toast(t("fl.roomDeleted")); }}>{t("c.delete")}</button>
                  <button type="button" className="btn sm ghost" onClick={() => setConfirmDel(null)}>{t("c.keep")}</button></div>
              </div>
            ) : (
              <div key={r.id} className="li-row">
                <button className="li" onClick={() => navigate({ name: "room", pid, roomId: r.id })}>
                  <div className="grow"><div className="t">{roomTitle(r)}</div><div className="s tag">{r.tag}</div></div>
                  <span className={"pill" + (sv && sv === rc.length ? " ok" : "")}>{sv}/{rc.length}</span>
                </button>
                <button type="button" className="li-del" aria-label={t("fl.deleteRoom", { name })} title={t("fl.deleteRoom", { name })}
                  onClick={() => setConfirmDel(r.id)}><Icon name="trash" /></button>
              </div>
            );
          })}
        </div>
        <button className="btn block" onClick={() => navigate({ name: "addRoom", pid, floor })}><Icon name="plus" /> {t("fl.addRoom")}</button>
        </>}
        <button className="btn ghost block" onClick={() => navigate({ name: "export", pid })}><Icon name="save" /> {t("fl.export")}</button>
      </main>
    </>
  );
}
