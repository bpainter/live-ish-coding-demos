/** Exit codes are public API. */
export const EXIT = { pass: 0, findings: 1, misuse: 2, environment: 3 } as const;

/** A command used wrongly: an unknown option, mode or id. Exits 2. */
export class UsageError extends Error {}
/** The machine is not ready: no server, no browser, no deck folder. Exits 3. */
export class EnvironmentError extends Error {}

export interface Parsed {
  /** Bare words, in order. */
  words: string[];
  /** The value of `--name=value` or `--name value`. */
  opt(name: string): string | undefined;
  /** Every value of an option given more than once. */
  all(name: string): string[];
  /** A switch with no value. */
  flag(name: string): boolean;
}

/**
 * `--name=value`, `--name value` and `--name`. `values` take a value, `flags` do not, and any other
 * option is a mistake. A value may itself start with dashes, as a Chromium switch does:
 * `--without --enable-blink-features=Thing`.
 */
export function parseArgs(argv: string[], spec: { values?: string[]; flags?: string[] }): Parsed {
  const values = new Set(spec.values ?? []);
  const flags = new Set(spec.flags ?? []);
  const words: string[] = [];
  const opts = new Map<string, string[]>();
  const on = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      words.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
    if (values.has(name)) {
      const value = eq < 0 ? argv[++i] : a.slice(eq + 1);
      if (value === undefined) throw new UsageError(`--${name} needs a value.`);
      opts.set(name, [...(opts.get(name) ?? []), value]);
    } else if (flags.has(name) && eq < 0) {
      on.add(name);
    } else {
      const known = [...values].map((v) => `--${v}=<value>`).concat([...flags].map((f) => `--${f}`));
      throw new UsageError(`Unknown option ${a}. Known: ${known.join(", ") || "none"}.`);
    }
  }
  return { words, opt: (n) => opts.get(n)?.at(-1), all: (n) => opts.get(n) ?? [], flag: (n) => on.has(n) };
}

/** A number option, with a default. A value that is not a number is a mistake. */
export function numberOpt(args: Parsed, name: string, fallback: number): number {
  const raw = args.opt(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new UsageError(`--${name} must be a number, found "${raw}".`);
  return n;
}
