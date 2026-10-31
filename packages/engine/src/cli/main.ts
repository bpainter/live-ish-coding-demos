import { nearest, parseArgs, UsageError, type FlagSpec } from "./args";
import { CliError, EXIT, engineVersion, makeCtx, requireDeck, type Ctx } from "./io";
import { prepareDeck } from "../prepare";
import { isDeckError } from "../schema/errors";
import { check, devTick } from "./commands/check";
import { fonts } from "./commands/fonts";
import { images } from "./commands/images";
import { addVerify, delegate, doctor, upgrade, VERIFY_COMMANDS } from "./commands/maintain";
import { create } from "./commands/new";
import { record } from "./commands/record";
import { actions, explain } from "./commands/reference";
import { build, dev, present, start } from "./commands/run";
import { schema } from "./commands/schema";
import { addAgents, skillsSync } from "./commands/skills";
import { support } from "./commands/support";
import { themeNew, themes } from "./commands/themes";

interface Command {
  usage: string;
  summary: string;
  flags?: FlagSpec;
  run(ctx: Ctx): Promise<number>;
}

const JSON_FLAG: FlagSpec = { json: "boolean" };

const COMMANDS: Record<string, Command> = {
  dev: { usage: "dev [--port]", summary: "Run the dev server. Regenerates and checks on save.", flags: { port: "string" }, run: dev },
  build: { usage: "build [--strict]", summary: "Check the deck, then make a deployable build.", flags: { strict: "boolean" }, run: build },
  start: { usage: "start [--port]", summary: "Serve the build.", flags: { port: "string" }, run: start },
  present: { usage: "present [--port] [--no-open]", summary: "Build and serve for the stage, with no network.", flags: { port: "string", "no-open": "boolean" }, run: present },
  check: { usage: "check [id] [--strict] [--watch] [--json]", summary: "Run the validators.", flags: { strict: "boolean", watch: "boolean", ...JSON_FLAG }, run: check },
  "new copy": { usage: 'new copy "<title>" [--layout] [--json]', summary: "Add a copy slide.", flags: { layout: "string", ...JSON_FLAG }, run: (ctx) => create(ctx, "copy") },
  "new web-demo": { usage: "new web-demo <id> [--static] [--single] [--server] [--json]", summary: "Add a web demo.", flags: { static: "boolean", single: "boolean", server: "boolean", ...JSON_FLAG }, run: (ctx) => create(ctx, "web-demo") },
  "new terminal-demo": { usage: "new terminal-demo <id> [--json]", summary: "Add a terminal demo, recorded and ready to play.", flags: JSON_FLAG, run: (ctx) => create(ctx, "terminal-demo") },
  record: { usage: "record <id> [--session] [--json]", summary: "Run session.txt and write the recording. Needs no browser.", flags: { session: "string", ...JSON_FLAG }, run: record },
  themes: { usage: "themes [--json]", summary: "List audience themes.", flags: JSON_FLAG, run: themes },
  "theme new": { usage: "theme new <id> [--from] [--json]", summary: "Write a custom theme file.", flags: { from: "string", ...JSON_FLAG }, run: themeNew },
  support: { usage: "support <query> [--json], support --tools", summary: "Search browser support in the installed data.", flags: { tools: "boolean", ...JSON_FLAG }, run: support },
  schema: { usage: "schema [--json]", summary: "Write JSON Schemas to .live-ish/schema/.", flags: JSON_FLAG, run: schema },
  explain: { usage: "explain <rule> [--json]", summary: "Print a rule's docs, offline.", flags: JSON_FLAG, run: explain },
  actions: { usage: "actions [--json]", summary: "List action types and the assert grammar.", flags: JSON_FLAG, run: actions },
  doctor: { usage: "doctor [--json]", summary: "Check this machine and the deck's generated files.", flags: JSON_FLAG, run: doctor },
  upgrade: { usage: "upgrade [--force] [--json]", summary: "Refresh the shell from the installed engine and run schema codemods.", flags: { force: "boolean", ...JSON_FLAG }, run: upgrade },
  "add verify": { usage: "add verify [--dry-run] [--json]", summary: "Install @live-ish/verify at this version and one Chromium.", flags: { "dry-run": "boolean", ...JSON_FLAG }, run: addVerify },
  "add agents": { usage: "add agents [--json]", summary: "Add AGENTS.md, CLAUDE.md and skills to the deck.", flags: JSON_FLAG, run: addAgents },
  "skills sync": { usage: "skills sync [--check] [--json]", summary: "Regenerate agent skills.", flags: { check: "boolean", ...JSON_FLAG }, run: skillsSync },
  fonts: { usage: "fonts [--check] [--next] [--json]", summary: "Subset the fonts under public/fonts/.", flags: { check: "boolean", next: "boolean", ...JSON_FLAG }, run: fonts },
  images: { usage: "images [--only] [--force] [--json]", summary: "Encode images to AVIF and WebP.", flags: { only: "string", force: "boolean", ...JSON_FLAG }, run: images },
};

/** Internal steps a long-running command calls in a fresh process. Not public API. */
const HIDDEN: Record<string, Command> = {
  "dev-tick": { usage: "", summary: "", run: devTick },
  prepare: {
    usage: "",
    summary: "",
    async run(ctx) {
      const { slides, demos } = await prepareDeck(requireDeck(ctx));
      ctx.log(`Prepared ${slides.length} slides and ${demos.length} demos.`);
      return EXIT.ok;
    },
  },
};

const VERIFY_USAGE: Record<string, string> = {
  capture: "capture [id]",
  og: "og",
  walk: "walk [id] [--browser] [--mode]",
  axe: "axe [id] [--presenter]",
  warmup: "warmup",
  perf: "perf <task>",
  parity: "parity",
};

function help(): string {
  const width = Math.max(...Object.values(COMMANDS).map((c) => c.usage.length));
  const rows = Object.values(COMMANDS).map((c) => `  ${c.usage.padEnd(width)}  ${c.summary}`);
  const verify = VERIFY_COMMANDS.map((c) => `  ${VERIFY_USAGE[c]}`);
  return [
    "live-ish <command>",
    "",
    "Commands:",
    ...rows,
    "",
    "With @live-ish/verify (`live-ish add verify`):",
    ...verify,
    "",
    "Flags: --help, --version. Exit codes: 0 pass, 1 findings, 2 misuse, 3 environment.",
  ].join("\n");
}

/** Two-word commands take their second word from the arguments. */
function lookup(argv: string[]): { name: string; command: Command; rest: string[] } | null {
  const [first, second] = argv;
  const pair = `${first} ${second}`;
  if (COMMANDS[pair]) return { name: pair, command: COMMANDS[pair], rest: argv.slice(2) };
  const command = COMMANDS[first] ?? HIDDEN[first];
  return command ? { name: first, command, rest: argv.slice(1) } : null;
}

function usageFor(first: string): string | null {
  const forms = Object.keys(COMMANDS).filter((name) => name.startsWith(`${first} `));
  return forms.length ? `Use one of: ${forms.map((f) => `live-ish ${f}`).join(", ")}.` : null;
}

async function main(argv: string[]): Promise<number> {
  const [first] = argv;
  if (first === undefined) {
    process.stderr.write(`${help()}\n`);
    return EXIT.misuse;
  }
  if (first === "--help" || first === "-h" || first === "help") {
    process.stdout.write(`${help()}\n`);
    return EXIT.ok;
  }
  if (first === "--version" || first === "-v") {
    process.stdout.write(`${engineVersion()}\n`);
    return EXIT.ok;
  }
  if (VERIFY_COMMANDS.includes(first)) {
    if (argv.includes("--help") || argv.includes("-h")) {
      process.stdout.write(`live-ish ${VERIFY_USAGE[first]}\n\nNeeds @live-ish/verify. Install it with: live-ish add verify\n`);
      return EXIT.ok;
    }
    return delegate(makeCtx({ positionals: [], flags: {} }), first, argv.slice(1));
  }
  const found = lookup(argv);
  if (!found) {
    const forms = usageFor(first);
    if (forms && (argv.includes("--help") || argv.includes("-h"))) {
      process.stdout.write(`${forms}\n`);
      return EXIT.ok;
    }
    if (forms) throw new UsageError(`${first} needs a second word. ${forms}`);
    const hint = nearest(first, [...Object.keys(COMMANDS).filter((c) => !c.includes(" ")), ...VERIFY_COMMANDS]);
    throw new UsageError(`Unknown command "${first}".${hint ? ` Did you mean "${hint}"?` : ""} Run live-ish --help.`);
  }
  const parsed = parseArgs(found.rest, found.command.flags ?? {});
  if (parsed.flags.help === true) {
    process.stdout.write(`live-ish ${found.command.usage}\n\n${found.command.summary}\n`);
    return EXIT.ok;
  }
  return found.command.run(makeCtx(parsed));
}

function report(error: unknown): number {
  if (error instanceof UsageError) {
    process.stderr.write(`live-ish: ${error.message}\n`);
    return EXIT.misuse;
  }
  if (error instanceof CliError) {
    process.stderr.write(`live-ish: ${error.message}\n`);
    if (error.fix) process.stderr.write(`  ${error.fix}\n`);
    return error.code;
  }
  // An author's mistake gets its sentence, with no stack.
  if (isDeckError(error)) {
    process.stderr.write(`live-ish: ${error.message}\n`);
    return EXIT.findings;
  }
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  return EXIT.environment;
}

process.exitCode = await main(process.argv.slice(2)).catch(report);
