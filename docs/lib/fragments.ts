// Turns data files into Markdown tables. Pure, so a test can hand them any shape.
import { existsSync, readFileSync } from "node:fs";

interface SchemaNode {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  anyOf?: SchemaNode[];
  oneOf?: SchemaNode[];
  additionalProperties?: SchemaNode | boolean;
  required?: string[];
  $ref?: string;
  $defs?: Record<string, SchemaNode>;
}

/**
 * Text for a table cell. Outside code, `<` and `{` are escaped, because MDX reads them as JSX. The
 * backslash form reads the same in plain Markdown, so the Markdown copy stays clean.
 */
export const cell = (text: string) =>
  text
    .replace(/\n+/g, " ")
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 ? part : part.replace(/[<{]/g, (mark) => `\\${mark}`)))
    .join("")
    .replace(/\|/g, "\\|");

function typeName(node: SchemaNode, root: SchemaNode): string {
  if (node.$ref) {
    const name = node.$ref.split("/").pop() ?? "";
    const target = root.$defs?.[name];
    return target ? typeName(target, root) : name;
  }
  if (node.enum) return node.enum.map((v) => JSON.stringify(v)).join(" or ");
  if (node.const !== undefined) return JSON.stringify(node.const);
  const options = node.anyOf ?? node.oneOf;
  if (options) return options.map((o) => typeName(o, root)).join(" or ");
  if (node.type === "array") return node.items ? `array of ${typeName(node.items, root)}` : "array";
  if (Array.isArray(node.type)) return node.type.join(" or ");
  return node.type ?? "any";
}

function resolve(node: SchemaNode, root: SchemaNode): SchemaNode {
  if (!node.$ref) return node;
  const name = node.$ref.split("/").pop() ?? "";
  return root.$defs?.[name] ?? node;
}

function rows(node: SchemaNode, root: SchemaNode, prefix: string, depth: number): string[] {
  const target = resolve(node, root);
  return Object.entries(target.properties ?? {}).flatMap(([key, child]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    const resolved = resolve(child, root);
    const required = target.required?.includes(key) ? "Yes" : "No";
    const row = `| \`${name}\` | ${cell(typeName(child, root))} | ${required} | ${cell(child.description ?? resolved.description ?? "")} |`;
    return [row, ...(depth > 0 && resolved.properties ? rows(resolved, root, name, depth - 1) : [])];
  });
}

const HEADER = ["| Field | Type | Required | What it does |", "|---|---|---|---|"];

/** The `deck.config.ts` fields, from the JSON Schema the engine generates from its types. */
export function configFragment(schema: SchemaNode): string {
  return [...HEADER, ...rows(schema, schema, "", 2)].join("\n");
}

/** The `demo.ts` fields, from the same source. */
export function schemaFragment(schema: SchemaNode): string {
  return [...HEADER, ...rows(schema, schema, "", 0)].join("\n");
}

const scalar = (value: unknown) => (typeof value === "object" && value !== null ? JSON.stringify(value) : String(value));

function flatten(value: unknown, prefix: string, out: [string, string][]) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else out.push([prefix, scalar(value)]);
  return out;
}

/** `packages/verify/budgets.json`, as a table. The checks read the same file, so the two cannot differ. */
export function budgetFragment(file: string): string {
  if (!existsSync(file)) return "This build has no `packages/verify/budgets.json`, so it prints no numbers here. The checks in `@live-ish/verify` read that file, and this table comes from it.";
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  const rows = flatten(data, "", []);
  return ["| Budget | Value |", "|---|---|", ...rows.map(([key, value]) => `| \`${cell(key)}\` | ${cell(value)} |`)].join("\n");
}

/** `parity/matrix.json`, as one table per area. Never edited by hand. */
export function parityFragment(file: string): string {
  if (!existsSync(file)) return "This build has no `parity/matrix.json`, so it prints no rows here. The `matrix` job in CI fails when a row has no proving check.";
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[] | { rows: Record<string, unknown>[] };
  const list = Array.isArray(data) ? data : data.rows;
  if (!list?.length) return "The matrix has no rows yet.";
  const columns = Object.keys(list[0]);
  return [`| ${columns.map((c) => c[0].toUpperCase() + c.slice(1)).join(" | ")} |`, `|${columns.map(() => "---").join("|")}|`, ...list.map((row) => `| ${columns.map((c) => cell(scalar(row[c] ?? ""))).join(" | ")} |`)].join("\n");
}
