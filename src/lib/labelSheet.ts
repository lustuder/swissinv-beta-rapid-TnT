/**
 * PDF sheets of QR labels: A4 with 3 × 8 labels of 70 × 37 mm (common label sheets), or one
 * label on a 70 × 37 mm page (label printer, or print and cut).
 * Each label: the QR code on the left (vector rectangles, sharp at any printer resolution),
 * a text column on the right. jspdf and qrcode load on demand.
 */
import { formatLabelCode } from "./labelCode";

export interface SheetSpec {
  /** page size in mm */
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  /** label size in mm */
  labelW: number;
  labelH: number;
  /** offset of the first label from the page edge, in mm */
  left: number;
  top: number;
  /** white space inside each label, in mm */
  pad: number;
  /** QR code width, gap to the text and text column width, in mm */
  qr: number;
  gap: number;
  textW: number;
}

/** A4, 3 × 8 labels of 70 × 37 mm, no side margin, 0.5 mm top offset. */
export const SHEET_70x37: SheetSpec = { pageW: 210, pageH: 297, cols: 3, rows: 8, labelW: 70, labelH: 37, left: 0, top: 0.5, pad: 5, qr: 27, gap: 4, textW: 29 };
/** One label on a page of 70 × 37 mm, same layout as on the sheet. */
export const LABEL_70x37: SheetSpec = { pageW: 70, pageH: 37, cols: 1, rows: 1, labelW: 70, labelH: 37, left: 0, top: 0, pad: 5, qr: 27, gap: 4, textW: 29 };

export const perSheet = (s: SheetSpec) => s.cols * s.rows;

/** Page (0-based) and top-left corner in mm of label i. Labels fill each row from left to right. */
export function labelPosition(i: number, s: SheetSpec): { page: number; x: number; y: number } {
  const per = perSheet(s), k = i % per;
  return { page: Math.floor(i / per), x: s.left + (k % s.cols) * s.labelW, y: s.top + Math.floor(k / s.cols) * s.labelH };
}

export interface Run { row: number; col: number; len: number }
/** Dark modules of a QR matrix as horizontal runs, so one rectangle draws many modules. */
export function qrRuns(size: number, dark: (row: number, col: number) => boolean): Run[] {
  const runs: Run[] = [];
  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!dark(row, col)) { col++; continue; }
      const start = col;
      while (col < size && dark(row, col)) col++;
      runs.push({ row, col: start, len: col - start });
    }
  }
  return runs;
}

/** Word-wraps text into at most maxLines lines of width maxW. If the text is longer, the last line ends with "…". */
export function fitText(text: string, maxW: number, measure: (s: string) => number, maxLines = 1): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let w of words) {
    while (w && lines.length <= maxLines) {
      const next = cur ? `${cur} ${w}` : w;
      if (measure(next) <= maxW) { cur = next; w = ""; }
      else if (cur) { lines.push(cur); cur = ""; }
      else {
        // one word is wider than the line: split it
        let k = w.length;
        while (k > 1 && measure(w.slice(0, k)) > maxW) k--;
        lines.push(w.slice(0, k));
        w = w.slice(k);
      }
    }
    if (lines.length > maxLines) break;
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1];
  while (last && measure(last + "…") > maxW) last = last.slice(0, -1).trimEnd();
  out[maxLines - 1] = last + "…";
  return out;
}

const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
/** The standard PDF fonts can print Windows-1252 only. Other characters become "?", control characters a space. */
export function pdfText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20) out += " ";
    else if (c < 0x7f || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)) out += ch;
    else out += "?";
  }
  return out;
}

export interface LabelItem {
  code: string;
  /** the link in the QR code */
  url: string;
  /** bold first line, e.g. the Bauteil ID */
  title: string;
  /** e.g. Bezeichnung and Verortung (up to two lines each) */
  lines: string[];
  /** small last line, e.g. the project name */
  foot: string;
}

const PT = 0.3528; // mm per point

/** One PDF with all labels; a new page after each full sheet. */
export async function renderLabelSheet(items: LabelItem[], spec: SheetSpec = SHEET_70x37): Promise<Blob> {
  const [{ jsPDF }, { default: QR }] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ orientation: spec.pageW > spec.pageH ? "landscape" : "portrait", unit: "mm", format: [spec.pageW, spec.pageH] });
  const measure = (s: string) => doc.getTextWidth(s);

  items.forEach((it, i) => {
    const pos = labelPosition(i, spec);
    if (i > 0 && i % perSheet(spec) === 0) doc.addPage();
    const x0 = pos.x + spec.pad, y0 = pos.y + spec.pad;

    // QR code, error correction level M (as in Rapid T&T); the label padding is the quiet zone
    const qr = QR.create(it.url, { errorCorrectionLevel: "M" });
    const n = qr.modules.size, m = spec.qr / n;
    doc.setFillColor(0, 0, 0);
    // +0.02 mm height closes hairline gaps between rows in some PDF viewers
    for (const r of qrRuns(n, (row, col) => !!qr.modules.get(row, col))) doc.rect(x0 + r.col * m, y0 + r.row * m, r.len * m, m + 0.02, "F");

    // text column
    const tx = x0 + spec.qr + spec.gap;
    let y = y0 + 3.2;
    doc.setTextColor(0);
    doc.setFont("courier", "bold"); doc.setFontSize(11);
    doc.text(formatLabelCode(it.code), tx, y);
    y += 4.6;
    const write = (s: string, style: "bold" | "normal", size: number, maxLines: number, gray: number) => {
      doc.setFont("helvetica", style); doc.setFontSize(size); doc.setTextColor(gray);
      for (const l of fitText(pdfText(s), spec.textW, measure, maxLines)) { doc.text(l, tx, y); y += size * PT * 1.2; }
    };
    write(it.title, "bold", 8.5, 1, 0);
    write(it.lines[0] ?? "", "normal", 8, 2, 0);
    for (const l of it.lines.slice(1)) write(l, "normal", 7, 2, 70);
    y = Math.max(y, y0 + spec.qr - 0.3);
    write(it.foot, "normal", 6.5, 1, 110);
  });

  return doc.output("blob");
}
