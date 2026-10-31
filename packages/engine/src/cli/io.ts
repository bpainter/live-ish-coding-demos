import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError, type Parsed } from "./args";

/** Public API: 0 pass, 1 findings, 2 misuse, 3 environment. */
export const EXIT = { ok: 0, findings: 1, misuse: 2, environment: 3 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** The `version` every `--json` document carries. Bumped only for a breaking change to a shape. */
export const JSON_VERSION = 1;

/** A failure with a sentence for the person at the terminal, and no stack. */
export class CliError extends Error {
  override name = "CliError";
  constructor(
    message: string,
    readonly code: ExitCode,
    readonly fix?: string,
  ) {
    super(message);
  }
}

/** Something on this machine is missing or wrong. Exit code 3. */
export function environment(message: string, fix?: string): CliError {
  return new CliError(message, EXIT.environment, fix);
}

/** The folder of the installed engine. */
export const ENGINE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function engineVersion(): string {
  return (JSON.parse(readFileSync(path.join(ENGINE, "package.json"), "utf8")) as { version: string }).version;
}

export interface Ctx extends Parsed {
  cwd: string;
  json: boolean;
  /** Progress for a person: stdout, or stderr under `--json` so stdout stays one document. */
  log(message?: string): void;
}

export function makeCtx(parsed: Parsed): Ctx {
  const json = parsed.flags.json === true;
  return {
    ...parsed,
    cwd: process.cwd(),
    json,
    log: (message = "") => (json ? process.stderr : process.stdout).write(`${message}\n`),
  };
}

/** Writes one JSON document to stdout. */
export function printJson(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify({ version: JSON_VERSION, ...value }, null, 2)}\n`);
}

/** The deck this command runs on: the nearest folder with a `deck.config.ts`. */
export function findDeck(from: string): string | null {
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "deck.config.ts"))) return dir;
    if (dir === path.dirname(dir)) return null;
  }
}

export function requireDeck(ctx: Ctx): string {
  const root = findDeck(ctx.cwd);
  if (!root) throw new UsageError(`No deck.config.ts here or in any folder above ${ctx.cwd}. Run this inside a deck.`);
  process.env.LIVE_ISH_DECK_ROOT = root;
  return root;
}

/** A file resolved from the deck's own `node_modules`, or null when it is not installed. */
export function resolveFromDeck(root: string, specifier: string): string | null {
  try {
    return createRequire(path.join(root, "package.json")).resolve(specifier);
  } catch {
    return null;
  }
}

/** `.live-ish/deck.json`, the summary `prepareDeck` writes. */
export interface DeckSummary {
  firstSlide: string;
  hosts: { site?: string; frames?: string; external?: Record<string, string> };
  addresses: unknown[];
  demos: string[];
  servers: { app: string; command: string; port: number }[];
}

export function readSummary(root: string): DeckSummary {
  return JSON.parse(readFileSync(path.join(root, ".live-ish", "deck.json"), "utf8")) as DeckSummary;
}
