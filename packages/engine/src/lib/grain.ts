import { deflateSync, inflateSync } from "node:zlib";

/**
 * The shared grain tile: 256 by 256, 8-bit gray, Gaussian noise around 50 percent
 * gray with a standard deviation of 18 percent, from a fixed seed. Node's zlib only.
 */
export const GRAIN_SIZE = 256;
const MEAN = 0.5 * 255;
const SIGMA = 0.18 * 255;
const SEED = 0x5a10a4;

/** mulberry32: a small seeded PRNG, so the tile is the same on every machine. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The tile's pixels, row by row. */
export function grainPixels(): Uint8Array {
  const rand = prng(SEED);
  const px = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE);
  for (let i = 0; i < px.length; i += 2) {
    // Box-Muller: two normal samples per pair of uniforms.
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    const a = r * Math.cos(2 * Math.PI * v);
    const b = r * Math.sin(2 * Math.PI * v);
    px[i] = Math.min(255, Math.max(0, Math.round(MEAN + a * SIGMA)));
    if (i + 1 < px.length) px[i + 1] = Math.min(255, Math.max(0, Math.round(MEAN + b * SIGMA)));
  }
  return px;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A gray PNG of the tile (no filter, deflated). */
export function grainPng(): Buffer {
  const px = grainPixels();
  const raw = Buffer.alloc((GRAIN_SIZE + 1) * GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) {
    raw[y * (GRAIN_SIZE + 1)] = 0;
    raw.set(px.subarray(y * GRAIN_SIZE, (y + 1) * GRAIN_SIZE), y * (GRAIN_SIZE + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(GRAIN_SIZE, 0);
  ihdr.writeUInt32BE(GRAIN_SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // gray
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * The pixels of a committed grain PNG as written by `grainPng` (filter 0 rows), or null if it is
 * not such a file. The check compares pixels, so a different zlib build cannot fail it.
 */
export function decodeGrainPng(file: Buffer): Uint8Array | null {
  if (file.length < 33 || file.readUInt32BE(16) !== GRAIN_SIZE || file.readUInt32BE(20) !== GRAIN_SIZE || file[24] !== 8 || file[25] !== 0) return null;
  const parts: Buffer[] = [];
  let off = 8;
  while (off < file.length) {
    const len = file.readUInt32BE(off);
    const type = file.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") parts.push(file.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));
  if (raw.length !== (GRAIN_SIZE + 1) * GRAIN_SIZE) return null;
  const px = new Uint8Array(GRAIN_SIZE * GRAIN_SIZE);
  for (let y = 0; y < GRAIN_SIZE; y++) {
    if (raw[y * (GRAIN_SIZE + 1)] !== 0) return null;
    px.set(raw.subarray(y * (GRAIN_SIZE + 1) + 1, (y + 1) * (GRAIN_SIZE + 1)), y * GRAIN_SIZE);
  }
  return px;
}
