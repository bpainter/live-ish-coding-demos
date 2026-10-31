/** An author's mistake: it gets its sentence, with no stack. */
export class DeckError extends Error {
  override name = "DeckError";
}

export interface ConfigIssue {
  /** The dotted path into the config: "writing.preset". */
  path: string;
  /** What is wrong, with the expected type. */
  message: string;
  /** The nearest valid name, or what to do instead. */
  fix?: string;
}

/** `deck.config.ts` failed validation. `issues` keeps each problem apart for `live-ish check`. */
export class DeckConfigError extends DeckError {
  override name = "DeckConfigError";
  constructor(readonly issues: ConfigIssue[]) {
    super(issues.map((i) => `deck.config.ts: ${i.path}: ${i.message}${i.fix ? ` ${i.fix}` : ""}`).join("\n"));
  }
}

/**
 * Use these, not `instanceof`. A deck's modules load as CommonJS under tsx when its package has no
 * `"type": "module"`, while the CLI loads as ESM, so one process can hold two copies of these
 * classes and `instanceof` fails across them. The name survives that.
 */
export function isDeckError(e: unknown): e is DeckError {
  return e instanceof Error && (e.name === "DeckError" || e.name === "DeckConfigError");
}

export function isDeckConfigError(e: unknown): e is DeckConfigError {
  return e instanceof Error && e.name === "DeckConfigError" && Array.isArray((e as DeckConfigError).issues);
}
