// A small catalog with a request log and a page cache, both in memory, so the frame shows what the
// server really did. No framework: the bridge is the only import.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { bridgeScript, frameHeaders, frameSession, runtimeTag } from "@live-ish/bridge";
import { cached, invalidate, known, plain, reset } from "./catalog.mjs";
import { logFor } from "./log.mjs";

const FILES = { "page.js": "text/javascript", "page.css": "text/css" };
const ACTIONS = { "/__demo/reset": reset, "/__demo/invalidate": invalidate };

const logRows = (session) => logFor(session).map(({ kind, path }) => `<li class="log__row" data-kind="${kind}"><b>${kind}</b> GET ${path}</li>`).join("");

function pageFor(session, content) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    ${runtimeTag()}
    <link rel="stylesheet" href="/page.css">
    <title>Catalog</title>
  </head>
  <body>
    <main>${content}</main>
    <ol id="log">${logRows(session)}</ol>
    <script src="/page.js"></script>
  </body>
</html>`;
}

async function answer(req, res) {
  const { pathname } = new URL(req.url, "http://shop");
  const session = frameSession(req);
  const headers = frameHeaders();
  if (req.method === "POST") {
    ACTIONS[pathname]?.(session);
    return res.writeHead(204).end();
  }
  if (pathname === "/live-ish-bridge.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    return res.end(bridgeScript());
  }
  const name = pathname.slice(1);
  if (FILES[name]) {
    res.writeHead(200, { "Content-Type": FILES[name] });
    return res.end(await readFile(new URL(name, import.meta.url)));
  }
  const match = /^(\/cached)?\/products\/(\d+)$/.exec(pathname);
  if (!match || !known(match[2])) return res.writeHead(404, headers).end("Not found");
  const content = (match[1] ? cached : plain)(session, match[2], pathname);
  res.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" });
  res.end(pageFor(session, content));
}

const port = Number(process.env.PORT ?? 4100);
createServer(answer).listen(port, () => console.log(`Catalog on http://localhost:${port}`));
