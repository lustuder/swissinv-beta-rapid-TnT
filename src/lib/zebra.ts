/**
 * Print to a Zebra Link-OS printer (e.g. ZQ511) over Bluetooth Low Energy, with Web Bluetooth
 * (Chrome and Edge on Android, Windows, macOS; not on iPhone).
 * The printer is chosen once per session; it stays in memory while the app is open and
 * reconnects by itself when the printer went to sleep. Where Chrome supports getDevices(),
 * a printer chosen earlier is found again after a reload, with no chooser.
 */

/** Zebra "parser" service: what is written to it is printed (ZPL, SGD). */
const PARSER = "38eb4a80-c570-11e3-9507-0002a5d5c51b";
const TO_PRINTER = "38eb4a82-c570-11e3-9507-0002a5d5c51b";
/** 16-bit UUID registered to Zebra; some printers advertise it instead of the parser service. */
const ZEBRA_16 = 0xfe79;

let device: BluetoothDevice | null = null;
let channel: BluetoothRemoteGATTCharacteristic | null = null;
/** Chunk size that worked last; 20 bytes always fits one Bluetooth LE packet. */
let chunk = 180;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(f => f());

export type PrintErrorKind = "cancelled" | "off" | "notFound" | "failed";
export class PrintError extends Error {
  constructor(public kind: PrintErrorKind, public reason?: unknown) {
    super(kind);
  }
}

export const bluetoothAvailable = (): boolean => window.isSecureContext && !!navigator.bluetooth;

/** Name of the printer of this session, or null. */
export const printerName = (): string | null => device ? device.name || "Zebra" : null;

/** Calls f when the chosen printer changes. Returns the function that stops it. */
export function onPrinterChange(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

const dropChannel = () => { channel = null; };

function use(d: BluetoothDevice) {
  if (device === d) return;
  device?.removeEventListener("gattserverdisconnected", dropChannel);
  device = d;
  channel = null;
  d.addEventListener("gattserverdisconnected", dropChannel);
  changed();
}

/**
 * Finds a printer this site may already use (getDevices), without a chooser.
 * Call when the print window opens, so the tap on Print can go straight to the chooser if needed.
 */
export async function restorePrinter(): Promise<void> {
  if (device || !navigator.bluetooth?.getDevices) return;
  try {
    const known = await navigator.bluetooth.getDevices();
    if (known[0] && !device) use(known[0]);
  } catch { /* not allowed: the chooser shows on the first print */ }
}

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new DOMException("timeout", "NetworkError")), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}

function toPrintError(err: unknown): PrintError {
  if (err instanceof PrintError) return err;
  const name = err instanceof DOMException ? err.name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "NotFoundError" && /cancel/i.test(msg)) return new PrintError("cancelled", err);
  if (name === "NotFoundError" && /adapter|bluetooth.*(off|not available)/i.test(msg)) return new PrintError("off", err);
  if (name === "NotFoundError" || name === "NetworkError" || name === "NotSupportedError") return new PrintError("notFound", err);
  return new PrintError("failed", err);
}

/**
 * Connects to the printer of this session. If there is none yet, shows Chrome's chooser:
 * call from a tap, and before any other await, so Chrome allows the chooser.
 */
async function connect(): Promise<BluetoothRemoteGATTCharacteristic> {
  const bt = navigator.bluetooth;
  if (!bt) throw new PrintError("failed");
  if (!device) {
    use(await bt.requestDevice({ filters: [{ services: [PARSER] }, { services: [ZEBRA_16] }], optionalServices: [PARSER] }));
  }
  if (channel && device!.gatt?.connected) return channel;
  const gatt = device!.gatt;
  if (!gatt) throw new PrintError("notFound");
  if (!(await bt.getAvailability().catch(() => true))) throw new PrintError("off");
  const server = await within(gatt.connect(), 15000);
  const service = await server.getPrimaryService(PARSER);
  const c = await service.getCharacteristic(TO_PRINTER);
  if (!zplSet) {
    // Mobile Zebra printers can be set to "line print" mode, which would print the ZPL as text.
    // This setting command (SGD) is understood in every mode and switches the printer to ZPL. Once per session.
    await write(c, new TextEncoder().encode('! U1 setvar "device.languages" "zpl"\r\n'), 20);
    zplSet = true;
  }
  channel = c;
  return c;
}
let zplSet = false;

async function write(c: BluetoothRemoteGATTCharacteristic, data: Uint8Array, size: number) {
  for (let i = 0; i < data.length; i += size) {
    const part = data.slice(i, i + size);
    if (c.properties.write && c.writeValueWithResponse) await c.writeValueWithResponse(part);
    else if (c.writeValueWithoutResponse) await c.writeValueWithoutResponse(part);
    else await c.writeValue(part);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends a print job (ZPL) to the printer of this session. The first call of a session shows
 * Chrome's chooser. If a write fails, connects again and sends the whole job once more in
 * 20-byte parts. Jobs run one after the other.
 */
export function printZpl(zpl: string): Promise<void> {
  const data = new TextEncoder().encode(zpl);
  // connect() runs now, inside the tap; only the writing waits for an earlier job
  const ready = connect();
  ready.catch(() => undefined); // handled below; avoids an "unhandled rejection" while an earlier job runs
  const job = queue.then(async () => {
    try {
      const c = await ready;
      try { await write(c, data, chunk); }
      catch (err) {
        if (chunk === 20) throw err;
        chunk = 20;
        channel = null;
        await write(await connect(), data, chunk);
      }
    } catch (err) {
      throw toPrintError(err);
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Disconnects and forgets the printer: the next print shows the chooser again. */
export async function forgetPrinter(): Promise<void> {
  const d = device;
  if (!d) return;
  d.removeEventListener("gattserverdisconnected", dropChannel);
  device = null;
  zplSet = false;
  channel = null;
  changed();
  try { d.gatt?.disconnect(); } catch { /* already gone */ }
  try { await d.forget?.(); } catch { /* older Chrome */ }
}
