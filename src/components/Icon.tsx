const PATHS: Record<string, string> = {
  home: "M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-6h4v6",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  next: "M9 5l7 7-7 7",
  back: "M15 5l-7 7 7 7",
  save: "M5 4h11l3 3v13H5z M8 4v5h7V4 M8 20v-6h8v6",
  check: "M4 12.5l5 5L20 6.5",
  plus: "M12 5v14M5 12h14",
  cam: "M4 8h3l2-3h6l2 3h3v11H4z M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M12 11v6M12 7.5v.5",
  export: "M12 4v11M7 9l5-5 5 5M5 20h14",
  print: "M7 9V4h10v5 M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2 M7 14h10v6H7z",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5",
  qr:"M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2 M14 18v2h2 M18 18h2v2 M6.5 6.5h1v1h-1z M16.5 6.5h1v1h-1z M6.5 16.5h1v1h-1z",
};
export function Icon({ name, size }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={size ? { stroke: "currentColor", fill: "none", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } : undefined} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
export const Tick = () => (
  <svg className="tick" viewBox="0 0 24 24" aria-label="Inventoried"><path d={PATHS.check} /></svg>
);
