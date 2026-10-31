import postcss, { type AtRule, type Container, type Rule } from "postcss";

/**
 * Frame CSS lint. The theme and a shell paint around shown code, so they must never win against it
 * or use the features a demo is there to show:
 *
 * - `@layer frame-theme` is paint: no position, inset, display, appearance, sizing, field-sizing,
 *   container queries, @scope, anchor properties, transitions, animation, overlay or z-index on any
 *   element; on dialog, [popover], ::backdrop, select, ::picker(select), option, input and
 *   textarea only color, background, border, border-radius, box-shadow, padding, font and
 *   backdrop-filter (custom properties and outline for focus are allowed too).
 * - `@layer frame-layout` may lay out the shell, but only on the engine's own class selectors,
 *   never on an element, attribute or pseudo-element selector (other than ::before and ::after),
 *   and still never with the demo-relevant properties.
 * - Every rule sits in one of the two layers, so shown CSS (unlayered) always wins.
 */

export interface Lint {
  line: number;
  message: string;
}

const DEMO_RELEVANT = /^(field-sizing|container(-type|-name)?|anchor-name|anchor-scope|position-anchor|position-area|position-try(-.*)?|position-visibility|inset-area|transition(-.*)?|animation(-.*)?|overlay)$/;
const LAYOUT = /^(position|inset(-.*)?|top|right|bottom|left|display|appearance|z-index|(min-|max-)?(width|height|inline-size|block-size))$/;
const PAINT_ONLY = /^(--.*|color|background(-.*)?|border(-.*)?|box-shadow|padding(-.*)?|font(-.*)?|line-height|-webkit-backdrop-filter|backdrop-filter|outline(-.*)?|text-decoration(-.*)?|accent-color)$/;
const FEATURE_ELEMENTS = /(?<![\w.-])(dialog|select|option|input|textarea)(?![\w-])|\[popover|::backdrop|::picker/;
const BANNED_AT = /^(container|scope|keyframes|position-try|starting-style)$/;

/** Compounds of a selector, split at combinators outside parentheses. */
export function compounds(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of selector.trim()) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function layerOf(node: Container | AtRule | Rule): string | null {
  let p = node.parent;
  while (p && p.type !== "root") {
    if (p.type === "atrule" && (p as AtRule).name === "layer") return (p as AtRule).params.trim();
    p = p.parent;
  }
  return null;
}

/** Lints frame theme CSS; one entry per violation. `perDemo` CSS lays out its own content classes. */
export function lintTheme(css: string, opts: { perDemo?: boolean } = {}): Lint[] {
  const out: Lint[] = [];
  const add = (line: number | undefined, message: string) => out.push({ line: line ?? 1, message });
  const root = postcss.parse(css);
  root.walkAtRules((at) => {
    if (BANNED_AT.test(at.name)) add(at.source?.start?.line, `@${at.name} is not allowed in the theme.`);
  });
  root.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test((rule.parent as AtRule).name)) return;
    const line = rule.source?.start?.line;
    const layer = layerOf(rule);
    if (layer !== "frame-theme" && layer !== "frame-layout") {
      add(line, `"${rule.selector}" sits outside @layer frame-theme and frame-layout.`);
      return;
    }
    // Only the subject (last compound) of a selector decides whether a feature element is styled.
    const featureTarget = rule.selectors.some((sel) => FEATURE_ELEMENTS.test(compounds(sel).pop() ?? ""));
    // Per-demo CSS lays out its own content classes; the shared theme keeps to its own classes.
    if (layer === "frame-layout" && !opts.perDemo) {
      for (const sel of rule.selectors) {
        const ok = compounds(sel).every((c) => /^\.(app-shell|glass-|chrome-)[\w-]*/.test(c) && !/\[|::(?!before|after)/.test(c) && !/(^|[^\w-])(dialog|select|option|input|textarea|button|a|ul|li|nav|main|header|h[1-6])\b(?![\w-])/.test(c.replace(/^\.[\w-]+/, "")));
        if (!ok) add(line, `frame-layout selector "${sel}" must use the engine's own class selectors only.`);
      }
    }
    // The one exception: `appearance: none` on native selects, so the theme can draw one chevron in
    // every engine. The subject must be a select and nothing else.
    const selectOnly = rule.selectors.every((sel) => /(?<![\w.-])select(?![\w-])/.test(compounds(sel).pop() ?? ""));
    rule.walkDecls((d) => {
      const prop = d.prop.toLowerCase();
      const at = d.source?.start?.line;
      if (prop === "appearance" && d.value.trim() === "none" && layer === "frame-theme" && selectOnly) return;
      if (DEMO_RELEVANT.test(prop)) add(at, `${prop} is never allowed in the theme ("${rule.selector}").`);
      else if (layer === "frame-theme" && LAYOUT.test(prop)) add(at, `${prop} is layout, so it does not belong in frame-theme ("${rule.selector}").`);
      else if (featureTarget && !PAINT_ONLY.test(prop)) add(at, `${prop} on "${rule.selector}": feature elements take paint properties only.`);
    });
  });
  return out;
}

/**
 * Shell CSS: every rule in `@layer wrapper`; selectors use only `.wrap*` classes (with ::before,
 * ::after, :not() and attribute tests on them) and the `[data-shown]` slot, never an element or an
 * id; tokens only, no raw colors; the demo-relevant properties banned as in the theme; and the
 * shell's own banned features.
 */
export function lintShellCss(css: string, banned: { name: string; pattern: RegExp }[] = []): Lint[] {
  const out: Lint[] = [];
  const add = (line: number | undefined, message: string) => out.push({ line: line ?? 1, message });
  const root = postcss.parse(css);
  root.walkAtRules((at) => {
    if (BANNED_AT.test(at.name)) add(at.source?.start?.line, `@${at.name} is not allowed in shell CSS.`);
  });
  root.walkRules((rule) => {
    const line = rule.source?.start?.line;
    if (layerOf(rule) !== "wrapper") {
      add(line, `"${rule.selector}" sits outside @layer wrapper.`);
      return;
    }
    for (const sel of rule.selectors) {
      for (const c of compounds(sel)) {
        const head = /^(\.wrap[\w-]*|\[data-shown\])/.exec(c);
        const rest = head ? c.slice(head[0].length) : "";
        const ok = Boolean(head) && /^((\.[\w-]+)|(\[[^\]]*\])|(::?[\w-]+(\([^)]*\))?))*$/.test(rest);
        if (!ok) add(line, `shell selector "${sel}" must use .wrap* classes or [data-shown] only.`);
      }
    }
    rule.walkDecls((d) => {
      const prop = d.prop.toLowerCase();
      const at = d.source?.start?.line;
      if (DEMO_RELEVANT.test(prop)) add(at, `${prop} is never allowed in shell CSS ("${rule.selector}").`);
      if (!prop.startsWith("--") && /#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\(/i.test(d.value)) add(at, `raw color "${d.value}" on ${prop}. Use a token.`);
    });
  });
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const b of banned) if (b.pattern.test(text)) add(1, `uses ${b.name}, which this shell must not.`);
  return out;
}
