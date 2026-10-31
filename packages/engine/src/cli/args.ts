/** The CLI's argument parser: no framework, because a deck should not install one to run `check`. */

export type FlagKind = "boolean" | "string";
export type FlagSpec = Record<string, FlagKind>;

export interface Parsed {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/** Bad input from the person at the terminal. Exit code 2. */
export class UsageError extends Error {
  override name = "UsageError";
}

/** Flags every command takes. */
export const GLOBAL_FLAGS: FlagSpec = { help: "boolean" };

/**
 * `--flag`, `--flag=value` and `--flag value`, against a per-command spec. `--` ends the flags. A
 * flag the spec does not name is an error, so a typo never passes for a default.
 */
export function parseArgs(argv: string[], spec: FlagSpec): Parsed {
  const known = { ...GLOBAL_FLAGS, ...spec };
  const parsed: Parsed = { positionals: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      parsed.positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "-h") {
      parsed.flags.help = true;
      continue;
    }
    if (!arg.startsWith("--") || arg === "--") {
      parsed.positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const kind = known[name];
    if (!kind) throw new UsageError(`Unknown flag --${name}.${names(known)}`);
    if (kind === "boolean") {
      if (eq !== -1) throw new UsageError(`--${name} takes no value.`);
      parsed.flags[name] = true;
      continue;
    }
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined || value === "" || (eq === -1 && value.startsWith("--"))) throw new UsageError(`--${name} needs a value.`);
    parsed.flags[name] = value;
  }
  return parsed;
}

function names(spec: FlagSpec): string {
  const list = Object.keys(spec).filter((f) => f !== "help");
  return list.length ? ` This command takes ${list.map((f) => `--${f}`).join(", ")}.` : "";
}

/** A port flag, with the default when it is unset. */
export function portOf(flags: Parsed["flags"], fallback = 3000): number {
  const raw = flags.port;
  if (raw === undefined) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UsageError(`--port must be a number from 1 to 65535, found "${String(raw)}".`);
  return port;
}

/** The Levenshtein-nearest name, for "did you mean", when it is close enough to be worth saying. */
export function nearest(name: string, candidates: string[]): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = row[j];
        row[j] = next;
      }
    }
    return row[b.length];
  };
  const best = candidates.map((c) => ({ c, d: distance(name, c) })).sort((x, y) => x.d - y.d)[0];
  return best && best.d <= Math.max(2, Math.floor(name.length / 2)) ? best.c : undefined;
}
