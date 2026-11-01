#!/usr/bin/env node
// Writes dist/schema/*.json from the engine's TypeScript types, so the types stay the one source of
// truth. A small walker over the compiler API: the shapes here are plain data, and a generator
// package would be a dependency for what fits in one file.
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = [
  { out: "deck-config.json", file: "src/schema/config.ts", type: "DeckConfig", title: "Live-ish deck config" },
  { out: "slide.json", file: "src/schema/slide.ts", type: "SlideConfig", title: "Live-ish slide" },
  { out: "demo.json", file: "src/schema/config.ts", type: "DemoConfig", title: "Live-ish demo" },
  { out: "recording.json", file: "src/lib/frames/terminal.ts", type: "TerminalRecording", title: "Live-ish terminal recording" },

];

const files = [...new Set(TARGETS.map((t) => path.join(root, t.file)))];
const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, noEmit: true, skipLibCheck: true, types: ["node"] });
const checker = program.getTypeChecker();

function describe(symbol) {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  return text ? { description: text } : {};
}

class Walker {
  defs = {};

  /** A named interface goes under `$defs`, which also ends any recursion. */
  named(type, name) {
    if (!this.defs[name]) {
      this.defs[name] = {};
      this.defs[name] = this.object(type);
    }
    return { $ref: `#/$defs/${name}` };
  }

  object(type) {
    const properties = {};
    const required = [];
    for (const symbol of checker.getPropertiesOfType(type)) {
      const declared = symbol.valueDeclaration ?? symbol.declarations?.[0];
      const valueType = checker.getTypeOfSymbolAtLocation(symbol, declared);
      properties[symbol.name] = { ...this.convert(valueType), ...describe(symbol) };
      if (!(symbol.flags & ts.SymbolFlags.Optional)) required.push(symbol.name);
    }
    const index = checker.getIndexInfoOfType(type, ts.IndexKind.String);
    const out = { type: "object" };
    if (Object.keys(properties).length) out.properties = properties;
    if (required.length) out.required = required;
    out.additionalProperties = index ? this.convert(index.type) : false;
    return out;
  }

  union(type) {
    const members = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
    if (members.length === 1) return this.convert(members[0]);
    const literal = (t) => t.isStringLiteral() || t.isNumberLiteral();
    if (members.every(literal)) return { enum: members.map((t) => t.value) };
    const booleans = members.filter((t) => t.flags & ts.TypeFlags.BooleanLiteral);
    const rest = members.filter((t) => !(t.flags & ts.TypeFlags.BooleanLiteral));
    const anyOf = rest.map((t) => this.convert(t));
    if (booleans.length) anyOf.push({ type: "boolean" });
    return anyOf.length === 1 ? anyOf[0] : { anyOf };
  }

  convert(type) {
    const f = type.flags;
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (f & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral)) return { type: "string" };
    if (f & ts.TypeFlags.Number) return { type: "number" };
    if (f & ts.TypeFlags.Boolean) return { type: "boolean" };
    if (f & ts.TypeFlags.Null) return { type: "null" };
    if (type.isStringLiteral() || type.isNumberLiteral()) return { const: type.value };
    if (f & ts.TypeFlags.BooleanLiteral) return { const: checker.typeToString(type) === "true" };
    if (type.isUnion()) return this.union(type);
    if (checker.isArrayType(type)) return { type: "array", items: this.convert(checker.getTypeArguments(type)[0]) };
    if (checker.isTupleType(type)) {
      const items = checker.getTypeArguments(type).map((t) => this.convert(t));
      return { type: "array", prefixItems: items, minItems: items.length, maxItems: items.length };
    }
    const interfaceName = type.isClassOrInterface() ? type.symbol?.name : undefined;
    return interfaceName ? this.named(type, interfaceName) : this.object(type);
  }
}

const out = path.join(root, "dist", "schema");
mkdirSync(out, { recursive: true });
for (const target of TARGETS) {
  const source = program.getSourceFile(path.join(root, target.file));
  const symbol = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find((s) => s.name === target.type);
  if (!symbol) throw new Error(`${target.file} does not export ${target.type}`);
  const walker = new Walker();
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const body = walker.object(type);
  const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: `https://live-ish.vercel.app/schema/${target.out}`, title: target.title, ...body };
  if (Object.keys(walker.defs).length) schema.$defs = walker.defs;
  writeFileSync(path.join(out, target.out), `${JSON.stringify(schema, null, 2)}\n`);
}
// The theme file's schema has its own generator, which reads the token contract.
copyFileSync(path.join(root, "themes", "chrome-theme.schema.json"), path.join(out, "chrome-theme.json"));
console.log(`wrote ${TARGETS.length + 1} schemas to dist/schema`);
