import { brotliDecompressSync } from "node:zlib";

/**
 * Reads the OpenType `name` table out of a WOFF2 file, so the license check needs no font library.
 * WOFF2 stores every table in one Brotli stream after a directory of variable-length records.
 */
const KNOWN_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill", "CBLC", "COLR", "CPAL", "SVG "];

export const NAME_IDS = { copyright: 0, family: 1, version: 5, trademark: 7, manufacturer: 8, designer: 9, licenseDescription: 13, licenseUrl: 14 } as const;

function base128(buf: Buffer, at: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[at + i];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return [value, at + i + 1];
  }
  throw new Error("Bad UIntBase128 in the WOFF2 directory.");
}

/** The name records of a WOFF2 file, English where there is a choice: `{ 0: "Copyright...", 1: "Inter" }`. */
export function woff2Names(file: Buffer): Record<number, string> {
  if (file.toString("latin1", 0, 4) !== "wOF2") throw new Error("Not a WOFF2 file.");
  const numTables = file.readUInt16BE(12);
  const compressedLength = file.readUInt32BE(20);
  let at = 48;
  let offset = 0;
  let name: { offset: number; length: number } | null = null;
  for (let i = 0; i < numTables; i++) {
    const flags = file[at++];
    const index = flags & 0x3f;
    let tag = KNOWN_TAGS[index];
    if (index === 63) {
      tag = file.toString("latin1", at, at + 4);
      at += 4;
    }
    let length: number;
    [length, at] = base128(file, at);
    const transform = (flags >> 6) & 0x03;
    const transformed = tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
    let stored = length;
    if (transformed) [stored, at] = base128(file, at);
    if (tag === "name") name = { offset, length: stored };
    offset += stored;
  }
  if (!name) throw new Error("The font has no name table.");
  const tables = brotliDecompressSync(file.subarray(at, at + compressedLength));
  const table = tables.subarray(name.offset, name.offset + name.length);
  const count = table.readUInt16BE(2);
  const strings = table.readUInt16BE(4);
  const out: Record<number, string> = {};
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const platform = table.readUInt16BE(r);
    const language = table.readUInt16BE(r + 4);
    const id = table.readUInt16BE(r + 6);
    const size = table.readUInt16BE(r + 8);
    const start = strings + table.readUInt16BE(r + 10);
    const raw = table.subarray(start, start + size);
    const english = platform === 3 ? language === 0x409 : platform === 1 ? language === 0 : true;
    if (!english) continue;
    if (platform === 1 && out[id] !== undefined) continue;
    out[id] = platform === 1 ? raw.toString("latin1") : Buffer.from(raw).swap16().toString("utf16le");
  }
  return out;
}
