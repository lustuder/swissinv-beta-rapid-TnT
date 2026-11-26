import { useEffect, useMemo, useState } from "react";
import { GroupBar, toggleIn } from "../components/ElementGroup";
import { SearchBar } from "../components/ElementSearch";
import { Tick } from "../components/Icon";
import { RemoteElement } from "../components/RemoteElement";
import { TopBar } from "../components/TopBar";
import { floorLabel } from "../domain/fields";
import { BUILDING_SECTIONS } from "../domain/swissinv";
import { getLang, label, t, useLang } from "../i18n";
import { countSame, displayName, type SameCount } from "../lib/elements";
import { shown } from "../lib/export";
import { back, home, navigate } from "../lib/nav";
import { searchElements } from "../lib/search";
import { fetchInventory, type InventoryResult, type RemoteListElement, type RemoteRoom } from "../lib/sync";
import { roomTitle } from "./Floors";

type RE = RemoteListElement;
type Item = { kind: "one"; e: RE } | { kind: "group"; id: string; first: RE };

/**
 * The whole inventory of a scanned element's project, from the online copy: read-only, nothing is
 * imported into this device. Opened from the label screen («Ganzes Inventar ansehen»); the label
 * code is the key. Floors → rooms → elements, a search, building data without contacts, and every
 * element opens the same read-only view as a scanned label. Linked elements are one bar, as in the app.
 */
export function RemoteInventory({ code, pid, floor, elementId }: { code: string; pid: string; floor?: number; elementId?: string }) {
  const L = useLang();
  const [res, setRes] = useState<InventoryResult | "loading">("loading");
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    setRes("loading");
    void fetchInventory(code, pid, attempt > 0).then(r => { if (live) setRes(r); });
    return () => { live = false; };
  }, [code, pid, attempt]);

  const data = res !== "loading" && res.ok ? res.data : null;
  const p = data?.project;
  const els = useMemo(() => (data && p ? searchElements(data.elements, p, "") : []), [data, p]);
  const roomById = useMemo(() => new Map((p?.rooms ?? []).map(r => [r.id, r])), [p]);
  /** Entries per link group, in building order (top floor first). */
  const groups = useMemo(() => {
    const m = new Map<string, RE[]>();
    for (const e of els) if (e.groupId) m.set(e.groupId, [...(m.get(e.groupId) ?? []), e]);
    return m;
  }, [els]);

  const title = p?.name || t("inv.title");
  // home: from an element back to this inventory's overview; from the overview to the main menu
  const bar = elementId
    ? <TopBar title={title} onBack={back} onHome={() => navigate({ name: "inventory", code, pid, floor })} homeLabel={t("ri.home")} />
    : <TopBar title={title} onBack={back} onHome={() => home()} homeLabel={t("c.mainMenu")} />;

  if (!data || !p) {
    const reason = res !== "loading" && !res.ok ? res.reason : null;
    return (
      <>
        {bar}
        <main className="wrap">
          {!reason && <div className="status busy">{t("rem.loading")}</div>}
          {reason && (
            <div className="card stack" style={{ gap: 6 }}>
              <p className="small" style={{ margin: 0 }}>{t(reason === "off" ? "rem.off" : reason === "offline" ? "rem.offline" : reason === "notFound" ? "ri.notFound" : "rem.error")}</p>
              {(reason === "offline" || reason === "error") && <button type="button" className="btn" onClick={() => setAttempt(a => a + 1)}>{t("rem.retry")}</button>}
            </div>
          )}
        </main>
      </>
    );
  }

  const roomOf = (e: RE): RemoteRoom | undefined => roomById.get(e.roomId);
  const where = (e: RE) => { const r = roomOf(e); return r ? `${roomTitle(r)} · ${floorLabel(r.floor)}` : t("ri.noRoom"); };
  const sameOf = (e: RE): SameCount | null => {
    const g = e.groupId ? groups.get(e.groupId) : undefined;
    return g && g.length >= 2 ? countSame(g) : null;
  };
  const openEl = (e: RE) => navigate({ name: "inventory", code, pid, floor, elementId: e.id });

  /* ---------- one element (read-only, like a scanned label) ---------- */
  const current = elementId ? els.find(e => e.id === elementId) : undefined;
  if (elementId) {
    const r = current && roomOf(current), b = p.building;
    return (
      <>
        {bar}
        <main className="wrap">
          {current ? (
            <RemoteElement item={{
              element: { ...current, labelCode: current.labelCode ?? "" },
              room: r ? { tag: r.tag, name: r.name, floor: r.floor, useLabel: r.useLabel } : null,
              project: { id: p.id, name: p.name, adresse: b.adresse ?? "", hausnummer: b.hausnummer ?? "", plz: b.plz ?? "", ort: b.ort ?? "", land: b.land ?? "" },
            }} />
          ) : <div className="card small">{t("ri.gone")}</div>}
        </main>
      </>
    );
  }

  /* ---------- the list ---------- */
  const rowOf = (e: RE, opts: { child?: boolean; showRoom?: boolean } = {}) => {
    const sc = opts.child ? null : sameOf(e);
    return (
      <button key={e.id} type="button" className={"li" + (opts.child ? " child" : "")} onClick={() => openEl(e)}>
        <span className="swatch" style={{ background: e.color }} />
        {opts.child
          ? <div className="grow"><div className="t">{e.fields.bauteilId || displayName(e)}</div><div className="s">{where(e)}</div></div>
          : <div className="grow"><div className="t">{displayName(e)}</div><div className="s">{[e.fields.bauteilId, opts.showRoom ? where(e) : ""].filter(Boolean).join(" · ")}</div></div>}
        {e.labelCode === code && <span className="pill same">{t("ri.scanned")}</span>}
        {sc && <span className="pill same">{t("same.pill", { n: sc.n })}</span>}
        {e.status === "saved" ? <Tick /> : <span className="pill">{t("rm.open")}</span>}
      </button>
    );
  };
  /** Linked entries become one bar at the place of the first of them; the bar opens to all entries in the building. */
  const itemsOf = (list: RE[]): Item[] => {
    const out: Item[] = [], seen = new Set<string>();
    for (const e of list) {
      if (!sameOf(e)) { out.push({ kind: "one", e }); continue; }
      if (seen.has(e.groupId!)) continue;
      seen.add(e.groupId!);
      out.push({ kind: "group", id: e.groupId!, first: e });
    }
    return out;
  };
  const listOf = (list: RE[], showRoom: boolean) => (
    <div className="list">
      {list.length === 0 ? <div className="empty">{t("ri.emptyRoom")}</div> : itemsOf(list).map(it => it.kind === "one" ? rowOf(it.e, { showRoom }) : (
        <GroupBar key={it.id} id={it.id} first={null} name={displayName(it.first)} count={sameOf(it.first) ?? undefined}
          open={open.has(it.id)} onToggle={() => setOpen(s => toggleIn(s, it.id))}>
          {(groups.get(it.id) ?? []).map(m => rowOf(m, { child: true }))}
        </GroupBar>
      ))}
    </div>
  );

  const searching = q.trim() !== "";
  const found = searching ? searchElements(els, p, q) : [];
  // floors that have rooms, top first; default: the floor of the scanned element
  const floors = [...new Set(p.rooms.map(r => r.floor))].sort((a, b) => b - a);
  const scannedFloor = (() => { const e = els.find(x => x.labelCode === code); return e ? roomOf(e)?.floor : undefined; })();
  const fl = floor !== undefined && floors.includes(floor) ? floor : scannedFloor !== undefined ? scannedFloor : floors[0];
  const rooms = p.rooms.filter(r => r.floor === fl);
  const noRoom = els.filter(e => !roomById.has(e.roomId));
  const newest = els.reduce((m, e) => Math.max(m, e.updatedAt), 0);
  const when = newest ? new Date(newest).toLocaleString(getLang() === "en" ? "en-GB" : "de-CH", { dateStyle: "medium", timeStyle: "short" }) : "";
  const sections = BUILDING_SECTIONS.filter(s => s.id !== "kontakte")
    .map(s => ({ title: L === "en" ? s.titleEn : s.title, rows: s.fields.map(d => ({ d, v: shown(d, p.building[d.key]) })).filter(x => x.v) }))
    .filter(s => s.rows.length);

  return (
    <>
      {bar}
      <main className="wrap">
        <div className="card remote-note" role="note">
          <b>{t("rem.title")}</b>
          <p className="small muted" style={{ margin: 0 }}>{when ? t("rem.note", { date: when }) : t("ri.readOnly")}</p>
          <p className="small" style={{ margin: 0 }}>{els.length === 1 ? t("ri.count1") : t("ri.countN", { n: els.length })} · {p.rooms.length === 1 ? t("fl.rooms1") : t("fl.roomsN", { n: p.rooms.length })}</p>
          <button type="button" className="btn ghost sm" onClick={() => setAttempt(a => a + 1)}>{t("ri.refresh")}</button>
        </div>

        {sections.length > 0 && (
          <details className="multi ri-building">
            <summary>{t("ri.building")}</summary>
            <div className="stack" style={{ gap: 8, padding: 12 }}>
              {sections.map(s => (
                <section key={s.title} className="stack" style={{ gap: 6 }}>
                  <h3 className="section-h sub">{s.title}</h3>
                  <dl className="remote-fields">
                    {s.rows.map(({ d, v }) => <div key={d.key}><dt>{label(d)}</dt><dd>{v}</dd></div>)}
                  </dl>
                </section>
              ))}
            </div>
          </details>
        )}

        <SearchBar id="search-inventory" label={t("ri.search")} value={q} onChange={setQ} />
        {searching ? (
          <>
            <div className="section-title"><h3>{found.length === 1 ? t("sr.found1") : t("sr.foundN", { n: found.length })}</h3></div>
            {found.length === 0 ? <div className="list"><div className="empty">{t("sr.none")}</div></div> : listOf(found, true)}
          </>
        ) : (
          <>
            {floors.length > 0 && (
              <div className="chips ri-floors" role="group" aria-label={t("ri.floors")}>
                {floors.map(f => {
                  const n = els.filter(e => roomOf(e)?.floor === f).length;
                  return (
                    <button type="button" key={f} className="chip" aria-pressed={f === fl}
                      onClick={() => navigate({ name: "inventory", code, pid, floor: f }, true)}>
                      {floorLabel(f)} <b>{n}</b>
                    </button>
                  );
                })}
              </div>
            )}
            {floors.length === 0 && noRoom.length === 0 && <div className="list"><div className="empty">{t("ri.empty")}</div></div>}
            {rooms.map(r => {
              const inRoom = els.filter(e => e.roomId === r.id);
              return (
                <section key={r.id} className="stack" style={{ gap: 6 }}>
                  <div className="section-title"><h3>{roomTitle(r) || r.tag}</h3><span className="tag muted">{r.tag}</span></div>
                  {listOf(inRoom, false)}
                </section>
              );
            })}
            {noRoom.length > 0 && (
              <section className="stack" style={{ gap: 6 }}>
                <div className="section-title"><h3>{t("ri.noRoom")}</h3></div>
                {listOf(noRoom, false)}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
