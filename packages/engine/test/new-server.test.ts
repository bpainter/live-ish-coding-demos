import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { bridgeScript } from "../../bridge/src/index.mjs";
import { ENGINE, starterCopy } from "./validate-fixture";

const CLI = path.join(ENGINE, "bin", "live-ish.mjs");
const BRIDGE = path.join(ENGINE, "..", "bridge");

/**
 * `new` connects to each port from 3106 up to find a free one. A port the config already names is
 * skipped with no connection, so a test leaves whatever a machine runs on those ports alone.
 */
const NAMED_PORTS = Array.from({ length: 594 }, (_, i) => `port: ${3106 + i}`).join(" ");

interface Deck {
  root: string;
  cli(args: string[], env?: Record<string, string>): { status: number | null; stdout: string; stderr: string };
  done(): void;
}

function deck({ bridge = true } = {}): Deck {
  const { root, done } = starterCopy();
  if (bridge) symlinkSync(BRIDGE, path.join(root, "node_modules", "@live-ish", "bridge"));
  const config = path.join(root, "deck.config.ts");
  writeFileSync(config, `// ${NAMED_PORTS}\n${readFileSync(config, "utf8")}`);
  writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ name: "deck", private: true, packageManager: "pnpm@10.0.0" })}\n`);
  return { root, done, cli: (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, ...env } }) };
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

/** Runs the generated server, as `live-ish dev` does, until `body` finishes. */
async function withServer(root: string, id: string, body: (origin: string) => Promise<void>) {
  const port = await freePort();
  const server = spawn(process.execPath, [`demos/${id}/single/server.mjs`], { cwd: root, stdio: "ignore", env: { ...process.env, PORT: String(port) } });
  const origin = `http://127.0.0.1:${port}`;
  try {
    const until = Date.now() + 10_000;
    while (!(await fetch(`${origin}/hello`).then((r) => r.ok, () => false))) {
      assert.ok(Date.now() < until, "the generated server never answered");
      await new Promise((r) => setTimeout(r, 50));
    }
    await body(origin);
  } finally {
    server.kill();
  }
}

/** A stand-in for the deck's package manager: it writes its arguments to a file and exits `code`. */
function fakeManager(code: number): { bin: string; log: string; calls(): string; done(): void } {
  const bin = mkdtempSync(path.join(os.tmpdir(), "live-ish-pm-"));
  const log = path.join(bin, "calls.txt");
  const pnpm = path.join(bin, "pnpm");
  writeFileSync(pnpm, `#!/bin/sh\necho "$@" >> "${log}"\nexit ${code}\n`);
  chmodSync(pnpm, 0o755);
  return { bin, log, calls: () => (existsSync(log) ? readFileSync(log, "utf8") : ""), done: () => rmSync(bin, { recursive: true, force: true }) };
}

test("new web-demo --server writes a demo that passes check", () => {
  const d = deck();
  try {
    const made = d.cli(["new", "web-demo", "shop", "--server", "--json"]);
    assert.equal(made.status, 0, made.stderr);
    const { files } = JSON.parse(made.stdout) as { files: string[] };
    assert.deepEqual(files, ["demos/shop/demo.ts", "demos/shop/single/page.html", "demos/shop/single/server.mjs"]);
    // Strict, because a line too long for the code card is only a warning without it. A strict
    // check also wants the shell, which a copy of the starter's content doesn't have.
    assert.equal(d.cli(["upgrade", "--force"]).status, 0);
    const check = d.cli(["check", "shop", "--strict"]);
    assert.equal(check.status, 0, check.stdout + check.stderr);
    const config = readFileSync(path.join(d.root, "deck.config.ts"), "utf8");
    assert.match(config, /servers: \[\{ app: "shop", command: "node demos\/shop\/single\/server\.mjs", port: \d+ \}\]/);
    assert.match(config, /external: \{ shop: "http:\/\/localhost:\d+" \}/);
  } finally {
    d.done();
  }
});

test("the generated server uses the bridge, with one route and one hook", async () => {
  const d = deck();
  try {
    assert.equal(d.cli(["new", "web-demo", "shop", "--server"]).status, 0);
    const source = readFileSync(path.join(d.root, "demos/shop/single/server.mjs"), "utf8");
    assert.ok(source.includes('from "@live-ish/bridge"'));
    assert.equal(source.includes("demo-runtime"), false, "the deck serves the runtime, not the app");
    assert.equal(/frame-ancestors/.test(source), false, "the bridge writes the CSP");

    await withServer(d.root, "shop", async (origin) => {
      const page = await fetch(`${origin}/?presenter=http://localhost:3700&mount=1`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-type") ?? "", /text\/html/);
      assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors http:\/\/localhost:\*/);
      assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self' 'unsafe-inline'/);
      assert.equal(page.headers.get("referrer-policy"), "no-referrer");
      assert.ok(html.includes('<script src="/live-ish-bridge.js"></script>'));
      assert.equal(html.includes("<!-- bridge -->"), false);
      assert.ok(html.indexOf("/live-ish-bridge.js") < html.indexOf("liveIsh.hooks"), "the tag comes before the page's own script");
      assert.ok(html.includes("liveIsh.hooks({ ask })"));

      const client = await fetch(`${origin}/live-ish-bridge.js`);
      assert.match(client.headers.get("content-type") ?? "", /javascript/);
      assert.equal(await client.text(), bridgeScript());

      assert.deepEqual(await (await fetch(`${origin}/hello`)).json(), { message: "Hello" });
      assert.equal((await fetch(`${origin}/nope`)).status, 404);
    });
  } finally {
    d.done();
  }
});

test("the step's highlight sits on the route it talks about", () => {
  const d = deck();
  try {
    assert.equal(d.cli(["new", "web-demo", "shop", "--server"]).status, 0);
    const demo = readFileSync(path.join(d.root, "demos/shop/demo.ts"), "utf8");
    const [, from, to] = /file: "server\.mjs", lines: \[\[(\d+), (\d+)\]\]/.exec(demo)!;
    const lines = readFileSync(path.join(d.root, "demos/shop/single/server.mjs"), "utf8").split("\n").slice(Number(from) - 1, Number(to));
    assert.ok(lines[0].includes('"/hello"'), lines[0]);
    assert.ok(lines.join("\n").includes('message: "Hello"'));
  } finally {
    d.done();
  }
});

test("a deck with no bridge installs it first, at the engine's version, with its own manager", () => {
  const d = deck({ bridge: false });
  const pm = fakeManager(0);
  try {
    const { version } = JSON.parse(readFileSync(path.join(ENGINE, "package.json"), "utf8")) as { version: string };
    const made = d.cli(["new", "web-demo", "shop", "--server", "--json"], { PATH: `${pm.bin}${path.delimiter}${process.env.PATH}` });
    assert.equal(made.status, 0, made.stderr);
    assert.equal(pm.calls().trim(), `add @live-ish/bridge@${version}`);
    assert.doesNotThrow(() => JSON.parse(made.stdout), "--json keeps one document on stdout");
  } finally {
    pm.done();
    d.done();
  }
});

test("a deck that already has the bridge installs nothing", () => {
  const d = deck();
  const pm = fakeManager(1);
  try {
    assert.equal(d.cli(["new", "web-demo", "shop", "--server"], { PATH: `${pm.bin}${path.delimiter}${process.env.PATH}` }).status, 0);
    assert.equal(pm.calls(), "");
  } finally {
    pm.done();
    d.done();
  }
});

test("a failed install exits 3 and leaves the deck as it was", () => {
  const d = deck({ bridge: false });
  const pm = fakeManager(1);
  try {
    const config = readFileSync(path.join(d.root, "deck.config.ts"), "utf8");
    const made = d.cli(["new", "web-demo", "shop", "--server"], { PATH: `${pm.bin}${path.delimiter}${process.env.PATH}` });
    assert.equal(made.status, 3, made.stdout + made.stderr);
    assert.match(made.stderr, /@live-ish\/bridge/);
    assert.equal(existsSync(path.join(d.root, "demos/shop")), false);
    assert.equal(readFileSync(path.join(d.root, "deck.config.ts"), "utf8"), config);
  } finally {
    pm.done();
    d.done();
  }
});

test("a plain web demo never asks for the bridge", () => {
  const d = deck({ bridge: false });
  const pm = fakeManager(1);
  try {
    mkdirSync(path.join(d.root, "demos"), { recursive: true });
    assert.equal(d.cli(["new", "web-demo", "tabs"], { PATH: `${pm.bin}${path.delimiter}${process.env.PATH}` }).status, 0);
    assert.equal(pm.calls(), "");
  } finally {
    pm.done();
    d.done();
  }
});
