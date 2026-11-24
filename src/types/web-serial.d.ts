/**
 * The parts of Web Serial (Chrome, Edge on desktop) that src/lib/zebraSerial.ts uses.
 * TypeScript's DOM types do not include Web Serial.
 */
interface SerialOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  /** Removes the site's permission for this port. Not in every Chrome version. */
  forget?(): Promise<void>;
}

interface Serial extends EventTarget {
  requestPort(options?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  readonly serial?: Serial;
}
