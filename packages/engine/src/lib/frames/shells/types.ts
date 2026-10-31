/** Frame shells: context around the shown block, composed at serve time and never shown as code. */
export interface ShellRender {
  /** Markup before the shown block. */
  before: string;
  /** Markup after the shown block. */
  after: string;
  /** Classes on the `[data-shown]` slot besides `wrap-shown`. */
  shownClass?: string;
  /** Root-relative stylesheets, base.css first. */
  styles: string[];
  /** Root-relative scripts, loaded as instrumentation, never removed by enhance-js off. */
  scripts: string[];
}

export interface ShellContext {
  build: string;
  demo: string;
  /** Terminal pages: the window's title, working directory, recorded chip and status bar. */
  window?: { title: string; cwd: string; chip?: string; status?: string };
}

export interface ShellDef {
  id: string;
  /** What this shell must never use, checked in its CSS, markup and scripts. */
  banned: { name: string; pattern: RegExp }[];
  render(ctx: ShellContext): ShellRender;
}
