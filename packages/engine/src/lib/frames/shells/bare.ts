import type { ShellDef } from "./types";

/** No context: the shown block alone. */
export const bare: ShellDef = {
  id: "bare",
  banned: [],
  render: () => ({ before: "", after: "", shownClass: "wrap-shown--bare", styles: [], scripts: [] }),
};
