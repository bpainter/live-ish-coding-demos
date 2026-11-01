import { defineDemo, shown } from "@live-ish/engine/config";

const files = [shown("../app/catalog.mjs"), shown("../app/page.js")];
const hooks = ["reset", "reload", "invalidate"];

export default defineDemo({
  id: "request-log",
  kind: "server",
  title: "A cache you can watch",
  scenario: "A small Node app logs every request, so the frame shows whether the server did the work.",
  support: { kind: "tooling", packages: [{ name: "Node.js", npm: "node", version: "22" }] },

  intro: {
    description: "This frame is a real server. The rows under the product come from its own request log.",
    notes: "Everything in this frame comes from a small Node app running beside the deck.\n\nThe log is the server's, so nothing here is staged.",
    minutes: 0.25,
  },

  before: {
    frame: { app: "shop", path: "/products/1" },
    notes: "Here is the page with no cache. Watch the log as we ask again.",
    files,
    hooks,
    minutes: 1,
    steps: [
      {
        id: "s0",
        label: "A fresh session",
        actions: [
          { type: "hook", name: "reset" },
          { type: "assert", target: "#title", expect: "text~=Notebook" },
          { type: "assert", target: ".log__row", expect: "count=1" },
        ],
        code: { file: "catalog.mjs", lines: [[12, 16]] },
        notes: [],
      },
      {
        id: "s1",
        label: "Ask again",
        key: true,
        actions: [
          { type: "hook", name: "reload" },
          { type: "assert", target: '.log__row[data-kind="render"]', expect: "count=2" },
        ],
        code: { file: "catalog.mjs", lines: [[12, 16]] },
        spotlight: ["#log"],
        notes: ["Same page, same answer, and the server did all the work again."],
      },
      {
        id: "s2",
        label: "Another page",
        actions: [
          { type: "navigate", url: "/products/2" },
          { type: "assert", target: "#title", expect: "text~=Pen" },
          { type: "assert", target: "#title", expect: "url=/products/2" },
          { type: "assert", target: '.log__row[data-kind="render"]', expect: "count=3" },
        ],
        code: { file: "catalog.mjs", lines: [[12, 16]] },
        spotlight: ["#title", "#log"],
        notes: ["A real navigation inside the frame. The log follows, because the session does."],
      },
    ],
  },

  after: {
    frame: { app: "shop", path: "/cached/products/1" },
    notes: "Now the same page with a cache in front of the render.",
    files,
    hooks,
    minutes: 1,
    steps: [
      {
        id: "s0",
        label: "A cold cache",
        actions: [
          { type: "hook", name: "reset" },
          { type: "assert", target: '.log__row[data-kind="render"]', expect: "count=1" },
        ],
        code: { file: "catalog.mjs", lines: [[20, 30]] },
        notes: [],
      },
      {
        id: "s1",
        label: "A hit",
        key: true,
        actions: [
          { type: "hook", name: "reload" },
          { type: "assert", target: '.log__row[data-kind="hit"]', expect: "count=1" },
          { type: "assert", target: '.log__row[data-kind="render"]', expect: "count=1" },
        ],
        code: { file: "catalog.mjs", lines: [[20, 30]] },
        spotlight: ["#log"],
        notes: ["The second request never reached the render."],
      },
      {
        id: "s2",
        label: "Invalidate",
        actions: [
          { type: "hook", name: "invalidate" },
          { type: "hook", name: "reload" },
          { type: "assert", target: '.log__row[data-kind="render"]', expect: "count=2" },
        ],
        code: { file: "page.js", lines: [[18, 20]] },
        spotlight: ["#log"],
        notes: ["Clear the entry and the next request renders again."],
      },
    ],
  },
});
