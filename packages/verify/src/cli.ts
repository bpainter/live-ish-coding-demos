import { EXIT, EnvironmentError, UsageError } from "./lib/args";

/** Every command this package answers. */
export const COMMANDS = ["walk", "axe", "capture", "og", "warmup", "perf", "backgrounds", "parity"] as const;
export type Command = (typeof COMMANDS)[number];

export interface RunContext {
  /** The deck folder. */
  root: string;
  engineVersion: string;
}

/** Loaded on use, so `walk` never pays for what `perf lighthouse` imports. */
async function dispatch(command: string, argv: string[], context: RunContext): Promise<number> {
  switch (command) {
    case "walk":
      return (await import("./walk")).walk(argv, context);
    case "axe":
      return (await import("./axe")).axe(argv, context);
    case "capture":
      return (await import("./capture")).capture(argv, context);
    case "og":
      return (await import("./og")).og(argv, context);
    case "warmup":
      return (await import("./warmup")).warmup(argv, context);
    case "perf":
      return (await import("./perf")).perf(argv, context);
    case "backgrounds":
      return (await import("./backgrounds")).backgrounds(argv, context);
    case "parity":
      throw new EnvironmentError("live-ish parity is not in this version of @live-ish/verify.");
    default:
      throw new UsageError(`Unknown command "${command}". Commands: ${COMMANDS.join(", ")}.`);
  }
}

/**
 * The engine's CLI calls this with `[command, ...argv]`, and the number it returns is the exit code:
 * 0 pass, 1 findings, 2 misuse, 3 environment.
 */
export async function run(argv: string[], context: RunContext): Promise<number> {
  const [command = "", ...rest] = argv;
  try {
    return await dispatch(command, rest, context);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`live-ish: ${e.message}`);
      return EXIT.misuse;
    }
    if (e instanceof EnvironmentError) {
      console.error(`live-ish: ${e.message}`);
      return EXIT.environment;
    }
    throw e;
  }
}
