import { BASE_CSS, esc } from "./common";
import type { ShellDef } from "./types";

/**
 * A terminal app on dark glass: the title bar (three dots, the title, the "Recorded" chip), one
 * session tab with the working directory, and a status bar with whatever the recording's `env`
 * holds. The shown block is the recorded lines. Nothing reads as live.
 */
export const terminalWindow: ShellDef = {
  id: "terminal-window",
  banned: [{ name: "a live label", pattern: /\bLive\b/ }],
  render: ({ window }) => {
    const before = [
      '<div class="wrap wrap--terminal"><div class="wrap-window">',
      `<header class="wrap-window__bar"><span class="wrap-window__dots" aria-hidden="true"><span class="wrap-window__dot"></span><span class="wrap-window__dot"></span><span class="wrap-window__dot"></span></span><p class="wrap-window__title">${esc(window?.title ?? "")}</p><span class="wrap-window__chip">${window?.chip ?? ""}</span></header>`,
      `<div class="wrap-window__tabs"><span class="wrap-window__tab">${esc(window?.cwd ?? "")}</span></div>`,
    ].join("");
    const after = [`<div class="wrap-window__status">${window?.status ?? ""}</div>`, "</div></div>"].join("");
    return { before, after, shownClass: "wrap-shown--bare wrap-window__body", styles: [BASE_CSS, "/live-ish/shells/terminal-window.css"], scripts: [] };
  },
};
