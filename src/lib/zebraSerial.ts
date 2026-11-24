/**
 * Print to a Zebra printer over a Bluetooth serial port (classic Bluetooth, SPP), with Web Serial
 * (Chrome and Edge on Windows, macOS, Linux). For PCs where printing over Bluetooth LE (zebra.ts)
 * does not work: the ZQ511 accepts print data over LE only on a paired, encrypted link. Android
 * pairs by itself, Windows does not. Over the serial port this question does not arise.
 *
 * Setup on Windows, once: pair the printer in Settings → Bluetooth. Windows then makes a port such
 * as "Standard Serial over Bluetooth link (COM6)". The first print shows Chrome's port list; the
 * port is remembered. Each job opens the port, sends, and closes it again, so the printer is free
 * for phones in between. Never offered on Android: there zebra.ts prints exactly as before.
 */
import { PrintError } from "./zebra";

let port: SerialPort | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(f => f());

/** Web Serial on a desktop browser. Android always uses Bluetooth LE (zebra.ts). */
export const serialAvailable = (): boolean =>
  window.isSecureContext && !!navigator.serial && !/Android/i.test(navigator.userAgent);

/** True once a port is chosen (this session, or remembered by Chrome). */
export const serialChosen = (): boolean => port !== null;

/** Calls f when the chosen port changes. Returns the function that stops it. */
export function onSerialChange(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** Finds a port this site may already use, without a chooser. Call when the print window opens. */
export async function restoreSerial(): Promise<void> {
  if (port || !navigator.serial) return;
  try {
    const known = await navigator.serial.getPorts();
    if (known[0] && !port) { port = known[0]; changed(); }
  } catch { /* not allowed: the list shows on the first print */ }
}

/** Forgets the port: the next print shows the port list again. */
export async function forgetSerial(): Promise<void> {
  const p = port;
  if (!p) return;
  port = null;
  changed();
  try { await p.close(); } catch { /* not open */ }
  try { await p.forget?.(); } catch { /* older Chrome */ }
}

const wait = (ms: number) => new Promise(res => setTimeout(res, ms));

function toPrintError(err: unknown): PrintError {
  if (err instanceof PrintError) return err;
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotFoundError") return new PrintError("cancelled", err); // no port chosen in the list
  if (name === "NetworkError" || name === "InvalidStateError" || name === "BufferOverrunError" || name === "BreakError") return new PrintError("notFound", err);
  return new PrintError("failed", err);
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends a print job (ZPL) over the serial port. The first call shows Chrome's port list: call it
 * from a tap, before any other await. Switches the printer to ZPL first (as zebra.ts does), in
 * case it is set to "line print". Jobs run one after the other.
 */
export function printZplSerial(zpl: string): Promise<void> {
  const serial = navigator.serial;
  // the port list must open now, inside the tap; only the sending waits for an earlier job
  const chosen: Promise<SerialPort> = port ? Promise.resolve(port)
    : serial ? serial.requestPort() : Promise.reject(new PrintError("failed"));
  chosen.catch(() => undefined); // handled below
  const enc = new TextEncoder();
  const job = queue.then(async () => {
    let p: SerialPort | null = null;
    try {
      p = await chosen;
      if (p !== port) { port = p; changed(); }
      try { await p.open({ baudRate: 9600 }); } // the baud rate does not matter on a Bluetooth port
      catch (err) { if (!(err instanceof DOMException && err.name === "InvalidStateError" && p.writable)) throw err; } // already open
      const w = p.writable!.getWriter();
      try {
        await w.write(enc.encode('! U1 setvar "device.languages" "zpl"\r\n'));
        await w.write(enc.encode(zpl));
        await w.close(); // waits until the data has gone to Windows
      } finally { w.releaseLock(); }
      await wait(500); // let the last bytes leave the radio before the port closes
    } catch (err) {
      throw toPrintError(err);
    } finally {
      try { await p?.close(); } catch { /* already closed */ }
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
