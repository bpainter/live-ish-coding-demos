import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkInput } from "../src/lib/validate";
import type { AssembledDeck, DeckInput } from "../src/schema/assemble";
import type { DeckConfig, DemoConfig } from "../src/schema/config";
import { excerpt, shown } from "../src/schema";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE = path.join(HERE, "..");
export const STARTER = path.join(ENGINE, "..", "..", "examples", "starter");

const FIXTURE_JS = Array.from({ length: 60 }, (_, i) => `const line${i + 1} = ${i + 1};`).join("\n") + "\n";

/** A small valid demo: an intro, a before page on an excerpt, and an after page. */
export function baseDemo(id = "x1"): DemoConfig {
  return {
    id,
    title: "Dialog element",
    scenario: "A row opens a dialog.",
    support: { kind: "web-features", id: "dialog", alsoUses: ["popover"] },
    cautions: ["Check permission on the server."],
    intro: {
      description: "The dialog element asks the user to confirm.",
      visual: { alt: "A dialog over a row.", capture: { beat: "after", step: "s1" } },
      notes: "This is the fixture. It has one row.",
      minutes: 0.25,
    },
    before: {
      notes: "This is the old row. The code lights up as it plays.",
      files: [excerpt("app.js", [[1, 10], [20, 30]])],
      minutes: 0.5,
      steps: [
        { id: "s0", label: "The old row", actions: [], code: { file: "app.js", lines: [] } },
        { id: "s1", label: "Open the box", actions: [{ type: "click", target: "#open" }], code: { file: "app.js", lines: [[1, 4]] }, notes: ["The button opens the box."] },
        {
          id: "s2",
          label: "Count the code",
          key: true,
          actions: [{ type: "click", target: "#close" }],
          code: { file: "app.js", lines: [[13, 16]] },
          meter: { label: "JavaScript", value: "60 lines", source: "before/*.js" },
          notes: ["The box closes.", "That took sixty lines."],
        },
      ],
    },
    after: {
      notes: "This is the same row. The box is a dialog.",
      files: [shown("index.html")],
      flags: { "enhance-css": true },
      hooks: ["reset"],
      minutes: 1.75,
      steps: [
        { id: "s0", label: "Same row", actions: [{ type: "hook", name: "reset" }], code: { file: "index.html", lines: [] } },
        {
          id: "s1",
          label: "Open the dialog",
          key: true,
          actions: [{ type: "click", target: "#open" }],
          code: { file: "index.html", lines: [[1, 3]] },
          callouts: [{ target: "dialog", text: "Page is inert", side: "top" }],
          notes: ["The button opens the dialog.", "The page behind waits."],
        },
        { id: "s2", label: "Styles off", actions: [{ type: "toggle", flag: "enhance-css", on: false }], code: { file: "index.html", lines: [] }, proof: "Styles off.", notes: ["The styles are off."] },
      ],
    },
  };
}

export interface Fixture {
  root: string;
  input: DeckInput;
  config: DeckConfig;
  demo: DemoConfig;
  /** Writes a file under the deck. */
  write(rel: string, text: string | Buffer): void;
  /** Adds a second demo folder. */
  addDemo(id: string): DemoConfig;
  check(options?: { strict?: boolean; only?: string; tamper?: (deck: AssembledDeck) => void }): ReturnType<typeof checkInput>;
  done(): void;
}

/** A valid deck on disk in a temp folder, with its input in memory. Tests break one thing at a time. */
export function fixture(): Fixture {
  const root = mkdtempSync(path.join(tmpdir(), "live-ish-check-"));
  const write = (rel: string, text: string | Buffer) => {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const files = (id: string) => {
    write(`demos/${id}/before/index.html`, '<button id="open">Open</button>\n<button id="close">Close</button>\n');
    write(`demos/${id}/before/app.js`, FIXTURE_JS);
    write(`demos/${id}/after/index.html`, '<button id="open">\n  Open\n</button>\n<dialog id="box"></dialog>\n');
    write(`demos/${id}/hooks.js`, "window.demoHooks = { reset() {} };\n");
  };
  files("x1");
  const demo = baseDemo();
  const config: DeckConfig = { schemaVersion: 1, title: "A fixture deck", order: ["title", "plain", "x1", "closing"], speaker: { name: "A Speaker" } };
  const input: DeckInput = {
    config,
    slides: [
      { id: "title", layout: "title", title: "A fixture deck", notes: "Welcome. This is a fixture.", minutes: 0.5 },
      { id: "plain", title: "What this shows", description: "One slide of copy.", body: ["One slide of copy."], minutes: 0.5 },
      { id: "closing", layout: "closing", title: "Thank you", url: "https://example.com", caption: "Scan for the link", minutes: 0.25 },
    ],
    demos: [{ folder: "demos/x1", demo, hooks: true }],
  };
  return {
    root,
    input,
    config,
    demo,
    write,
    addDemo(id) {
      files(id);
      const added = baseDemo(id);
      input.demos.push({ folder: `demos/${id}`, demo: added, hooks: true });
      config.order.splice(config.order.indexOf("closing"), 0, id);
      return added;
    },
    check: (options = {}) => checkInput({ root, input, slideFiles: new Map([["title", "slides/01-title.ts"], ["plain", "slides/02-plain.ts"], ["closing", "slides/03-closing.ts"]]), ...options }),
    done: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** A copy of the starter that resolves the engine from this checkout. */
export function starterCopy(edit?: (replace: (file: string, from: string, to: string) => void) => void): { root: string; done(): void } {
  const root = mkdtempSync(path.join(tmpdir(), "live-ish-starter-"));
  for (const entry of ["deck.config.ts", "slides", "demos"]) cpSync(path.join(STARTER, entry), path.join(root, entry), { recursive: true });
  if (existsSync(path.join(STARTER, "public"))) cpSync(path.join(STARTER, "public"), path.join(root, "public"), { recursive: true });
  mkdirSync(path.join(root, "node_modules", "@live-ish"), { recursive: true });
  symlinkSync(ENGINE, path.join(root, "node_modules", "@live-ish", "engine"));
  edit?.((file, from, to) => {
    const abs = path.join(root, file);
    const text = readFileSync(abs, "utf8");
    if (!text.includes(from)) throw new Error(`${file} has no ${JSON.stringify(from)}`);
    writeFileSync(abs, text.replace(from, to));
  });
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}
