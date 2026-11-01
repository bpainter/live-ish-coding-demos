import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "@playwright/test";
import { hasFrame } from "@live-ish/engine/verify";
import { axe } from "./axe";
import { EXIT, EnvironmentError, UsageError } from "./lib/args";
import { liveFrames, loadDeck, type DeckData } from "./lib/deck";
import { Report } from "./lib/report";
import { walk, type WalkContext } from "./walk";
import { slideText } from "./walk/a11y";

/**
 * Proves each walk can fail. Every row breaks one thing on purpose, the way a real regression would
 * break it, and passes only when its walk fails and names what broke. A check that cannot fail
 * proves nothing.
 *
 *   node --conditions=react-server --import tsx src/selftest.ts --origin=<next start> [--root=<deck>] [row ...]
 *
 * Needs the conformance deck under `next start`, captured, so the underlay row has posters to slow.
 */

type Sabotage = NonNullable<WalkContext["sabotage"]>;

export interface Row {
  id: string;
  what: string;
  argv: string[];
  sabotage?: Sabotage;
  /** The failure this row must produce. */
  expect: RegExp;
  /** An exit code other than findings. */
  exit?: number;
  /** A row for `axe`. Every other row runs `walk`. */
  command?: "axe";
}

/** A script in every document, frames included, ahead of any page script. */
const everywhere = (script: string): Sabotage => async (ctx: BrowserContext) => {
  await ctx.addInitScript(script);
};

/** A style in every document. */
const styled = (css: string) => everywhere(`(() => { const add = () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.documentElement.append(s); }; if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add); })()`);

/** A style in the top document only, and only under one `?chrome=`: a regression in one theme. */
const styledUnder = (theme: string, css: string) => everywhere(`(() => { if (window !== window.top || new URLSearchParams(location.search).get("chrome") !== ${JSON.stringify(theme)}) return; const add = () => { const s = document.createElement("style"); s.textContent = ${JSON.stringify(css)}; document.documentElement.append(s); }; if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add); })()`);

/** A key that dies before anything hears it, in the window and in every frame. */
const eatKey = (key: string) => everywhere(`addEventListener("keydown", (e) => { if (e.key === ${JSON.stringify(key)} && !e.shiftKey) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);`);

/** The first page that clicks something, and what it clicks. */
function clicker(deck: DeckData) {
  for (const { page } of liveFrames(deck)) {
    for (const step of page.steps) {
      const click = step.actions.find((a) => a.type === "click");
      if (click?.type === "click" && click.target.startsWith("#")) return { page, step, id: click.target.slice(1) };
    }
  }
  return null;
}

/** Rewrites one page's frame document, as a markup change that no longer matches its script would. */
const dropId = (page: { frame: { route: string } }, id: string): Sabotage => async (ctx: BrowserContext) => {
  await ctx.route(`**${page.frame.route}/**`, async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(`id="${id}"`, `id="${id}-gone"`) });
  });
};

export function selfTestRows(deck: DeckData): Row[] {
  const c = clicker(deck);
  const shell = deck.input.demos.find((d) => d.demo.before?.shell || d.demo.after?.shell)?.demo.id;
  const lanes = deck.demos.find((d) => d.pages.some((p) => p.steps.some((s) => s.actions.some((a) => a.type === "assert" && a.when))))?.id;
  const switches = deck.input.config.verify?.chromiumArgs ?? [];
  const intro = deck.demos.find((d) => d.pages[0]?.beat === "intro" && hasFrame(d.pages[1]))?.id;
  const out: Row[] = [];
  if (c) out.push({ id: "WK-1", what: "a selector matches nothing", argv: [c.page.id, "--no-speaker"], sabotage: dropId(c.page, c.id), expect: new RegExp(`${c.step.id} .*selector-not-found|${c.step.id} .*no step result`) });
  out.push(
    { id: "WK-2", what: "the grain is off its token", argv: ["deck"], sabotage: styled(".stage__grain { opacity: 0.93 !important; }"), expect: /grain at 0\.93/ },
    { id: "WK-3", what: "Next is swallowed", argv: ["advance", ...(c ? [c.page.id] : [])], sabotage: eatKey("ArrowRight"), expect: /still on|never finished|stayed on/ },
    { id: "WK-4", what: "the crossfade never runs", argv: ["transitions"], sabotage: everywhere("delete Document.prototype.startViewTransition;"), expect: /view transitions: next 0/ },
    { id: "WK-5", what: "Enter does not reach the menu button", argv: ["drawer"], sabotage: eatKey("Enter"), expect: /did not open the drawer/ },
    { id: "WK-6", what: "the stage never takes focus back", argv: ["links"], sabotage: everywhere(`HTMLElement.prototype.focus = function () {};`), expect: /focus is on/ },
    { id: "WK-7", what: "a spotlight's corners are wrong", argv: ["fixtures"], sabotage: styled(".overlay__spotlight { border-radius: 3px !important; }"), expect: /radii:/ },
    { id: "WK-8", what: "a press is lost on arrival", argv: ["focus", ...(intro ? [intro] : []), "--holds=0", "--delays=300"], sabotage: eatKey("ArrowRight"), expect: /presses lost/ },
    {
      id: "WK-9",
      what: "the first frame and its poster arrive late",
      argv: ["underlay", ...(c ? [c.page.id] : []), "--runs=1", "--min-arrivals=0", "--profile=none"],
      sabotage: async (ctx) => {
        await ctx.route(/\/(demos|posters|opt)\//, async (route) => {
          await new Promise((r) => setTimeout(r, 450));
          await route.continue().catch(() => {});
        });
      },
      expect: /key to frame content visible/,
    },
    { id: "WK-10", what: "a blank key dies", argv: ["keys"], sabotage: eatKey("b"), expect: /b blank/ },
    { id: "WK-11", what: "the pill's focus ring is gone", argv: ["a11y"], sabotage: styled('[data-control]:focus-visible { outline: none !important; box-shadow: none !important; }'), expect: /the ring measures/ },
  );
  if (shell) out.push({ id: "WK-12", what: "a frame has two shown slots", argv: [shell, "--no-speaker"], sabotage: everywhere(`addEventListener("DOMContentLoaded", () => { if (document.documentElement.dataset.wrapper) { const extra = document.createElement("div"); extra.hidden = true; extra.setAttribute("data-shown", ""); document.body.append(extra); } });`), expect: /2 \[data-shown\] slots/ });
  out.push(
    { id: "WK-13", what: "a browser that does not exist", argv: ["--browser=netscape"], expect: /must be chromium/, exit: EXIT.misuse },
    { id: "WK-13", what: "a channel that is not installed", argv: ["--channel=no-such-channel", "deck"], expect: /Could not start/, exit: EXIT.environment },
  );
  if (lanes && switches.length) out.push({ id: "WK-14", what: "a browser claims a feature the run removed", argv: [lanes, "--no-speaker", ...switches.map((s) => `--without=${s}`)], sabotage: everywhere(`CSS.supports = () => true;`), expect: /got display=|style:display/ });
  out.push({ id: "local-only", what: "a page reaches for another host", argv: ["links", "--local-only"], sabotage: everywhere(`addEventListener("DOMContentLoaded", () => { void fetch("https://example.invalid/").catch(() => {}); });`), expect: /left the two local origins/ });
  const layouts = deck.slides.filter((s) => !s.page);
  // The middle of the deck on purpose: the first and last slides were always scanned.
  const inner = layouts.find((s) => s.layout !== layouts[0].layout && s.layout !== layouts.at(-1)!.layout);
  if (inner) out.push({ id: "axe-layout", what: "one copy layout loses its contrast", command: "axe", argv: ["--presenter"], sabotage: styled(`.slide--${inner.layout} * { color: #c8c8c8 !important; background: #ffffff !important; }`), expect: new RegExp(`/s/${inner.id}: color-contrast`) });
  const pictured = layouts.find((s) => slideText(s).alts.length);
  out.push(
    { id: "text-content", what: "the text view drops its image alts and its lists", argv: ["a11y"], sabotage: everywhere(`addEventListener("DOMContentLoaded", () => { for (const n of document.querySelectorAll(".reading-view img")) n.alt = ""; for (const n of document.querySelectorAll(".reading-view ul, .reading-view figure")) n.remove(); });`), expect: /text content \/s\/.*: no / },
  );
  if (pictured) out.push({ id: "stage-image", what: "an image on the stage loses its alt", argv: ["a11y"], sabotage: everywhere(`addEventListener("DOMContentLoaded", () => { for (const n of document.querySelectorAll("#stage img")) n.alt = ""; });`), expect: new RegExp(`image /s/${pictured.id}: no drawn image`) });
  const theme = ["theme", "--chrome=flat"];
  out.push(
    { id: "theme-frame", what: "a theme reaches inside the frame", argv: theme, sabotage: styledUnder("flat", ".page-frame__iframe { filter: invert(1) !important; }"), expect: /the frame differs from glass/ },
    { id: "theme-chrome", what: "a theme stops changing the code panel", argv: theme, sabotage: styled(".code { background: #101010 !important; border-radius: 0 !important; box-shadow: none !important; font-family: monospace !important; }"), expect: /the code panel is the same/ },
    { id: "theme-ink", what: "a theme reaches --speaker-ink", argv: theme, sabotage: styledUnder("flat", ":root { --speaker-ink: #123456 !important; }"), expect: /--speaker-ink is rgb\(18, 52, 86\)/ },
    { id: "theme-pill", what: "a theme reaches the footer pill", argv: theme, sabotage: styledUnder("flat", ".speaker__controls { background: #ff0000 !important; }"), expect: /the footer pill is rgb\(255, 0, 0\)/ },
    { id: "theme-motion", what: "an effect runs with reduced motion", argv: theme, sabotage: styled(".page__steps-seg { animation: chrome-blink 1s steps(1, end) 3 !important; }"), expect: /an effect ran with reduced motion.*chrome-blink/ },
    { id: "theme-duration", what: "a transition runs long with reduced motion", argv: theme, sabotage: styled(".page__steps-seg { animation: page-long 2s linear 1 !important; } @keyframes page-long { from { opacity: 0.5; } }"), expect: /over 160 ms with reduced motion: page-long/ },
    { id: "theme-transparency", what: "a surface keeps its blur with reduced transparency", argv: theme, sabotage: styled(".code { -webkit-backdrop-filter: blur(8px) !important; backdrop-filter: blur(8px) !important; background: rgb(0 0 0 / 0.4) !important; }"), expect: /still blurred: code/ },
    { id: "theme-forced", what: "a surface keeps its own color in forced colors", argv: theme, sabotage: styled(".code { forced-color-adjust: none; background: #123456 !important; }"), expect: /not system colors: code/ },
  );
  if (Object.keys(deck.deck.hosts.external).length) out.push({ id: "servers", what: "a stopped app's page shows no note", argv: ["servers"], sabotage: styled(".page__poster-note { display: none !important; }"), expect: /no note where the frame would be/ });
  return out;
}

/** One row, quietly, with its failures kept. */
export async function runRow(root: string, deck: DeckData, origin: string, row: Row): Promise<{ ok: boolean; detail: string }> {
  const report = new Report("selftest", false, true);
  try {
    const command = row.command === "axe" ? axe : walk;
    const code = await command([...row.argv, `--origin=${origin}`], { root, deck, sabotage: row.sabotage, report });
    const text = report.failures.map((f) => `${f.where}: ${f.message}`).join("\n");
    const ok = code === (row.exit ?? EXIT.findings) && row.expect.test(text);
    return { ok, detail: ok ? text.split("\n").find((l) => row.expect.test(l))!.slice(0, 140) : `exit ${code}; ${text.slice(0, 300) || "no failure reported"}` };
  } catch (e) {
    const message = (e as Error).message;
    const code = e instanceof UsageError ? EXIT.misuse : e instanceof EnvironmentError ? EXIT.environment : EXIT.findings;
    const ok = code === row.exit && row.expect.test(message);
    return { ok, detail: message.slice(0, 200) };
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const only = argv.filter((a) => !a.startsWith("--"));
  const origin = opt("origin") ?? "http://localhost:3000";
  const root = path.resolve(opt("root") ?? process.cwd());
  const deck = await loadDeck(root);
  let failed = 0;
  let ran = 0;
  for (const row of selfTestRows(deck)) {
    if (only.length && !only.includes(row.id)) continue;
    ran++;
    const { ok, detail } = await runRow(root, deck, origin, row);
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${row.id} ${row.what}: ${detail}`);
  }
  console.log(`\nselftest: ${ran - failed} of ${ran} rows caught what they broke`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
