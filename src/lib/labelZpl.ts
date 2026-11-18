/**
 * One QR label as a ZPL print job for a 203 dpi Zebra printer (8 dots per mm), e.g. ZQ511.
 * The label is drawn as a black-and-white picture with the layout of the PDF label (LABEL_70x37)
 * and sent as one ZPL graphic. So every character prints, and text typed by users can never
 * be read as a printer command.
 */
import { formatLabelCode } from "./labelCode";
import { fitText, LABEL_70x37, qrRuns, type LabelItem } from "./labelSheet";

/** Dots per mm at 203 dpi. */
export const DOTS = 8;
/** Print head width of the ZQ511 (72 mm). */
const HEAD_DOTS = 576;
/** Dots per point of font size. */
const DOTS_PER_PT = 0.3528 * DOTS;

export interface Bitmap {
  /** width in dots, a multiple of 8 */
  w: number;
  h: number;
  /** 1 = black, 8 dots per byte, first dot in the highest bit, rows from the top */
  bits: Uint8Array;
}

const HEX = "0123456789ABCDEF";

/** Repeat count in Zebra's ASCII compression: G–Y = 1–19, g–z = 20–400. */
function countChars(n: number): string {
  let s = "";
  while (n > 0) {
    if (n >= 20) { const k = Math.min(20, Math.floor(n / 20)); s += String.fromCharCode(0x66 + k); n -= k * 20; }
    else { s += String.fromCharCode(0x46 + n); n = 0; }
  }
  return s;
}

/**
 * Zebra ASCII-hex compression of a 1-bit picture (^GFA):
 * a row of the same as the row before is ":"; trailing white is ","; trailing black is "!";
 * a hex digit repeated n times is the count in letters, then the digit.
 */
export function zplCompress(bits: Uint8Array, bytesPerRow: number): string {
  let out = "", prev = "";
  for (let r = 0; r * bytesPerRow < bits.length; r++) {
    let hex = "";
    for (let i = r * bytesPerRow; i < (r + 1) * bytesPerRow; i++) hex += HEX[bits[i] >> 4] + HEX[bits[i] & 15];
    if (r > 0 && hex === prev) { out += ":"; continue; }
    prev = hex;
    let end = hex.length;
    let tail = "";
    if (/^0*$/.test(hex)) { out += ","; continue; }
    const m0 = /0+$/.exec(hex), mF = /F+$/.exec(hex);
    if (m0 && m0[0].length > 1) { end = m0.index; tail = ","; }
    else if (mF && mF[0].length > 1) { end = mF.index; tail = "!"; }
    let i = 0;
    while (i < end) {
      let j = i + 1;
      while (j < end && hex[j] === hex[i]) j++;
      const n = j - i;
      out += (n > 1 ? countChars(n) : "") + hex[i];
      i = j;
    }
    out += tail;
  }
  return out;
}

/** The ZPL job for one picture of the label size: centred on the head, 1 copy. */
export function zplJob(b: Bitmap): string {
  const bpr = b.w / 8, total = bpr * b.h;
  const left = Math.max(0, Math.round((HEAD_DOTS - b.w) / 2));
  return `^XA^PW${HEAD_DOTS}^LH${left},0^LL${b.h}^PON^FO0,0^GFA,${total},${total},${bpr},${zplCompress(b.bits, bpr)}^FS^PQ1^XZ\r\n`;
}

const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Draws the label (70 × 37 mm) at 8 dots/mm, black on white, as in the PDF label. */
export async function renderLabelBitmap(it: LabelItem): Promise<Bitmap> {
  const s = LABEL_70x37, w = s.labelW * DOTS, h = s.labelH * DOTS;
  const QR = (await import("qrcode")).default;
  const weights = [500, 700];
  try { await Promise.all(weights.map(wt => document.fonts.load(`${wt} 20px Inter`))); } catch { /* offline: system font */ }

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#000";

  // QR code, level M, whole dots per module so the edges stay sharp; centred in its 27 mm box
  const box = s.qr * DOTS, x0 = s.pad * DOTS, y0 = s.pad * DOTS;
  const qr = QR.create(it.url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size, m = Math.floor(box / n), off = Math.floor((box - n * m) / 2);
  for (const r of qrRuns(n, (row, col) => !!qr.modules.get(row, col))) ctx.fillRect(x0 + off + r.col * m, y0 + off + r.row * m, r.len * m, m);

  // text column; on a thermal printer grey does not exist, so all text is black and a bit heavier
  const tx = x0 + box + s.gap * DOTS, tw = s.textW * DOTS;
  let y = y0 + 3.2 * DOTS;
  ctx.textBaseline = "alphabetic";
  const write = (text: string, weight: number, pt: number, maxLines: number) => {
    ctx.font = `${weight} ${Math.round(pt * DOTS_PER_PT)}px ${FONT}`;
    for (const l of fitText(text, tw, t => ctx.measureText(t).width, maxLines)) { ctx.fillText(l, tx, y); y += pt * DOTS_PER_PT * 1.2; }
  };
  write(formatLabelCode(it.code), 700, 11, 1);
  y = y0 + (3.2 + 4.6) * DOTS;
  write(it.title, 700, 8.5, 1);
  write(it.lines[0] ?? "", 500, 8, 2);
  for (const l of it.lines.slice(1)) write(l, 500, 7, 2);
  y = Math.max(y, y0 + (s.qr - 0.3) * DOTS);
  write(it.foot, 500, 6.5, 1);

  // 1 bit per dot: dark if brightness below 50 %
  const px = ctx.getImageData(0, 0, w, h).data, bits = new Uint8Array((w / 8) * h);
  for (let i = 0, k = 0; k < w * h; k++, i += 4) {
    if (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114 < 128000) bits[k >> 3] |= 0x80 >> (k & 7);
  }
  return { w, h, bits };
}

/** The ZPL print job for one label. */
export async function labelZpl(it: LabelItem): Promise<string> {
  return zplJob(await renderLabelBitmap(it));
}
