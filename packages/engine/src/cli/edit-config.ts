/**
 * Edits to `deck.config.ts` as text. The file is the author's, with their comments and spacing, so
 * it is never parsed and printed back: these functions find the one spot that changes and leave
 * every other byte alone. Enough of JavaScript is read to step over strings and comments.
 */

export class ConfigEditError extends Error {
  override name = "ConfigEditError";
}

interface Property {
  key: string;
  valueStart: number;
  valueEnd: number;
}

/** The index just past the string or comment that starts at `i`, or `i` when neither does. */
function skipOver(src: string, i: number): number {
  const ch = src[i];
  if (ch === "/" && src[i + 1] === "/") {
    const end = src.indexOf("\n", i);
    return end === -1 ? src.length : end;
  }
  if (ch === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    for (let j = i + 1; j < src.length; j++) {
      if (src[j] === "\\") j++;
      else if (src[j] === ch) return j + 1;
    }
    return src.length;
  }
  return i;
}

function skipTrivia(src: string, from: number): number {
  let i = from;
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    const next = src[i] === "/" ? skipOver(src, i) : i;
    if (next === i) return i;
    i = next;
  }
}

/** The index of the bracket closing the one at `open`. */
function closing(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; ) {
    const next = skipOver(src, i);
    if (next !== i) {
      i = next;
      continue;
    }
    if ("([{".includes(src[i])) depth++;
    else if (")]}".includes(src[i]) && --depth === 0) return i;
    i++;
  }
  throw new ConfigEditError("deck.config.ts has an unclosed bracket.");
}

/** The end of the value that starts at `from`: the next comma or closing bracket at its own depth. */
function valueEnd(src: string, from: number): number {
  for (let i = from; i < src.length; ) {
    const next = skipOver(src, i);
    if (next !== i) {
      i = next;
      continue;
    }
    if ("([{".includes(src[i])) {
      i = closing(src, i) + 1;
      continue;
    }
    if (src[i] === "," || ")]}".includes(src[i])) return i;
    i++;
  }
  return src.length;
}

/** The index right after the last character of a value, past no trailing space or comment. */
function trimEnd(src: string, start: number, end: number): number {
  let last = start;
  for (let i = start; i < end; ) {
    const next = skipOver(src, i);
    if (next === i) {
      if (!/\s/.test(src[i])) last = i + 1;
      i++;
      continue;
    }
    if (src[i] !== "/") last = next;
    i = next;
  }
  return last;
}

/** The properties of the object literal whose `{` is at `open`. */
function properties(src: string, open: number): Property[] {
  const end = closing(src, open);
  const out: Property[] = [];
  let i = skipTrivia(src, open + 1);
  while (i < end) {
    if (src.startsWith("...", i)) {
      const stop = valueEnd(src, i);
      i = skipTrivia(src, src[stop] === "," ? stop + 1 : stop);
      continue;
    }
    const quoted = src[i] === '"' || src[i] === "'";
    const keyEnd = quoted ? skipOver(src, i) : i + (/^[\w$]+/.exec(src.slice(i))?.[0].length ?? 0);
    if (keyEnd === i) throw new ConfigEditError(`deck.config.ts: a property could not be read near "${src.slice(i, i + 20)}".`);
    const key = quoted ? src.slice(i + 1, keyEnd - 1) : src.slice(i, keyEnd);
    let at = skipTrivia(src, keyEnd);
    if (src[at] === ":") {
      at = skipTrivia(src, at + 1);
      const stop = valueEnd(src, at);
      out.push({ key, valueStart: at, valueEnd: trimEnd(src, at, stop) });
      at = stop;
    } else {
      out.push({ key, valueStart: i, valueEnd: keyEnd });
    }
    if (src[at] === ",") at++;
    i = skipTrivia(src, at);
  }
  return out;
}

/** The `{` of the object handed to `defineDeck`, or of a bare `export default {`. */
function rootObject(src: string): number {
  const anchor = /defineDeck\s*\(\s*/.exec(src) ?? /export\s+default\s+/.exec(src);
  if (!anchor) throw new ConfigEditError("deck.config.ts does not export a deck.");
  const open = anchor.index + anchor[0].length;
  if (src[open] !== "{") throw new ConfigEditError("deck.config.ts does not pass an object to defineDeck().");
  return open;
}

function find(src: string, open: number, key: string): Property | undefined {
  return properties(src, open).find((p) => p.key === key);
}

function indentAt(src: string, index: number): string {
  const start = src.lastIndexOf("\n", index - 1) + 1;
  return /^[ \t]*/.exec(src.slice(start))![0];
}

function onOwnLine(src: string, index: number): boolean {
  return /^[ \t]*$/.test(src.slice(src.lastIndexOf("\n", index - 1) + 1, index));
}

const insert = (src: string, at: number, text: string) => src.slice(0, at) + text + src.slice(at);

/** The string or object items of the array whose `[` is at `open`. */
function items(src: string, open: number): { start: number; end: number; text: string }[] {
  const close = closing(src, open);
  const out: { start: number; end: number; text: string }[] = [];
  let i = skipTrivia(src, open + 1);
  while (i < close) {
    const stop = valueEnd(src, i);
    const end = trimEnd(src, i, stop);
    out.push({ start: i, end, text: src.slice(i, end) });
    i = skipTrivia(src, src[stop] === "," ? stop + 1 : stop);
  }
  return out;
}

/** Adds one item at the end of an array, in the style of the array it joins. */
function appendItem(src: string, open: number, text: string): string {
  const close = closing(src, open);
  const list = items(src, open);
  if (list.length === 0) {
    const inner = src.slice(open + 1, close);
    return /^\s*$/.test(inner) ? src.slice(0, open + 1) + text + src.slice(close) : insert(src, close, `${text}, `);
  }
  const last = list[list.length - 1];
  // Items that end on the bracket's own line stay on one line: `["a", "b"]`.
  if (!src.slice(last.end, close).includes("\n")) return insert(src, last.end, `, ${text}`);
  const hasComma = src.slice(last.end, close).trimStart().startsWith(",");
  const lineEnd = src.indexOf("\n", last.end);
  const indent = indentAt(src, last.start);
  const added = insert(src, lineEnd, `\n${indent}${text}${hasComma ? "," : ""}`);
  return hasComma ? added : insert(added, last.end, ",");
}

/** Adds one property at the end of an object, before anything commented out at its foot. */
function appendProperty(src: string, open: number, key: string, value: string): string {
  const close = closing(src, open);
  const props = properties(src, open);
  const last = props[props.length - 1];
  if (!src.slice(open, close).includes("\n") || !onOwnLine(src, close)) {
    if (!last) return `${src.slice(0, open + 1)} ${key}: ${value} ${src.slice(close)}`;
    return insert(src, last.valueEnd, `, ${key}: ${value}`);
  }
  const indent = last ? indentAt(src, last.valueStart) : `${indentAt(src, close)}  `;
  const added = insert(src, src.lastIndexOf("\n", close - 1) + 1, `${indent}${key}: ${value},\n`);
  const hasComma = !last || src.slice(last.valueEnd, close).trimStart().startsWith(",");
  return hasComma ? added : insert(added, last.valueEnd, ",");
}

/**
 * Adds an id to `order`. With `before`, the id goes ahead of that item, which keeps a closing slide
 * last. An id already there changes nothing.
 */
export function insertOrderId(src: string, id: string, before?: string): string {
  const order = find(src, rootObject(src), "order");
  if (!order) throw new ConfigEditError("deck.config.ts has no order.");
  if (src[order.valueStart] !== "[") throw new ConfigEditError("order in deck.config.ts is not an array written in place. Add the id by hand.");
  const list = items(src, order.valueStart);
  const unquote = (t: string) => t.replace(/^["'`]|["'`]$/g, "");
  if (list.some((i) => unquote(i.text) === id)) return src;
  const quote = list[0]?.text[0] === "'" ? "'" : '"';
  const text = `${quote}${id}${quote}`;
  const anchor = before ? list.find((i) => unquote(i.text) === before) : undefined;
  if (!anchor) return appendItem(src, order.valueStart, text);
  const own = onOwnLine(src, anchor.start);
  return insert(src, anchor.start, own ? `${text},\n${indentAt(src, anchor.start)}` : `${text}, `);
}

/** Adds `servers` and `hosts.external` entries for a server-backed demo. */
export function addServer(src: string, server: { app: string; command: string; port: number; origin: string }): string {
  const entry = `{ app: ${JSON.stringify(server.app)}, command: ${JSON.stringify(server.command)}, port: ${server.port} }`;
  let out = src;
  const servers = find(out, rootObject(out), "servers");
  if (!servers) out = appendProperty(out, rootObject(out), "servers", `[${entry}]`);
  else if (out[servers.valueStart] === "[") out = appendItem(out, servers.valueStart, entry);
  else throw new ConfigEditError("servers in deck.config.ts is not an array written in place. Add the server by hand.");

  const external = `${/^[A-Za-z_$][\w$]*$/.test(server.app) ? server.app : JSON.stringify(server.app)}: ${JSON.stringify(server.origin)}`;
  const hosts = find(out, rootObject(out), "hosts");
  if (!hosts) return appendProperty(out, rootObject(out), "hosts", `{ external: { ${external} } }`);
  if (out[hosts.valueStart] !== "{") throw new ConfigEditError("hosts in deck.config.ts is not an object written in place. Add the host by hand.");
  const inner = find(out, hosts.valueStart, "external");
  if (!inner) return appendProperty(out, hosts.valueStart, "external", `{ ${external} }`);
  if (out[inner.valueStart] !== "{") throw new ConfigEditError("hosts.external in deck.config.ts is not an object written in place. Add the host by hand.");
  const [key, ...rest] = external.split(": ");
  return appendProperty(out, inner.valueStart, key, rest.join(": "));
}

/** The ids in `order`, read from the text, so a half-finished deck can still take a new slide. */
export function readOrder(src: string): string[] {
  const order = find(src, rootObject(src), "order");
  if (!order || src[order.valueStart] !== "[") return [];
  return items(src, order.valueStart).map((i) => i.text.replace(/^["'`]|["'`]$/g, ""));
}

/** The `schemaVersion` in the text, or null when it is not a plain number. */
export function readSchemaVersion(src: string): number | null {
  const version = find(src, rootObject(src), "schemaVersion");
  const n = version ? Number(src.slice(version.valueStart, version.valueEnd)) : Number.NaN;
  return Number.isInteger(n) ? n : null;
}
