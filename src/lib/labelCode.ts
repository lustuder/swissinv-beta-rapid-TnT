/**
 * QR label codes. Pure functions, no store and no DOM.
 *
 * A code has 8 characters from LABEL_ALPHABET (no 0/O, 1/I/L, so people can read and type it).
 * Seven characters are random; the eighth is a check character:
 *   valid  ⇔  sum((i+1) · value[i]) for i = 0..7  ≡ 0 (mod 31)
 * This finds each single wrong character and each swap of two characters.
 * The check applies only to typed codes. Scanned codes and link codes need only the format,
 * so labels from Rapid T&T (8 random characters) stay usable.
 *
 * The QR code holds a link `<base>?e=<CODE>`. A printed code is permanent: never change this format.
 */

export const LABEL_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const BASE = LABEL_ALPHABET.length; // 31, a prime
const LEN = 8;
const FORMAT = new RegExp(`^[${LABEL_ALPHABET}]{${LEN}}$`);
const MAX_INPUT = 2000;

const value = (c: string) => LABEL_ALPHABET.indexOf(c);

/** Check character for the first seven characters: 27 · sum((i+1) · value[i]) mod 31. */
export function checkChar(first7: string): string {
  let s = 0;
  for (let i = 0; i < LEN - 1; i++) s += (i + 1) * value(first7[i]);
  return LABEL_ALPHABET[(27 * s) % BASE];
}

/** A new code: seven random characters and the check character. */
export function newLabelCode(): string {
  let out = "";
  const buf = new Uint8Array(16);
  while (out.length < LEN - 1) {
    crypto.getRandomValues(buf);
    // 248 = 8 · 31: refuse higher bytes, so each character has the same probability
    for (const b of buf) if (b < 248 && out.length < LEN - 1) out += LABEL_ALPHABET[b % BASE];
  }
  return out + checkChar(out);
}

/** True if the code has the correct format and a correct check character. */
export function hasValidCheck(code: string): boolean {
  if (!FORMAT.test(code)) return false;
  let s = 0;
  for (let i = 0; i < LEN; i++) s += (i + 1) * value(code[i]);
  return s % BASE === 0;
}

/** Typed or scanned code → canonical form (upper case, no spaces or hyphens), or null if the format is wrong. */
export function normalizeLabelCode(text: string): string | null {
  if (text.length > 40) return null;
  const c = text.toUpperCase().replace(/[\s-]/g, "");
  return FORMAT.test(c) ? c : null;
}

/** Display form: K7M2-X9PA. */
export const formatLabelCode = (code: string) => (code.length === LEN ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/** The link in the QR code: `<base>?e=<CODE>`. */
export function labelUrl(code: string, base: string): string {
  const u = new URL(base);
  u.search = "";
  u.hash = "";
  u.searchParams.set("e", code);
  return u.href;
}

/**
 * Reads the label code from scanned or typed text. Accepts only:
 * a bare code, an http(s) URL with an `e` parameter, or a URL path that ends in `/e/<code>`
 * (Rapid T&T). It reads the code only; it never opens or fetches the URL.
 */
export function parseLabelText(text: string): string | null {
  if (text.length > MAX_INPUT) return null;
  const s = text.trim();
  const bare = normalizeLabelCode(s);
  if (bare) return bare;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const e = u.searchParams.get("e");
  if (e !== null) return normalizeLabelCode(e);
  const m = /\/e\/([^/]+)\/?$/.exec(u.pathname);
  return m ? normalizeLabelCode(decodeURIComponent(m[1])) : null;
}

/** True if a phone outside this network cannot open the address (localhost, private IP, .local). */
export function isLocalUrl(url: string): boolean {
  let h: string;
  try { h = new URL(url).hostname.toLowerCase(); } catch { return true; }
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h === "[::1]") return true;
  const ip = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}
