// Rejects Tailwind utility classes in JSX. JSX carries semantic block__element--modifier names only;
// utilities live in styles/components/**/*.css behind @apply. (PRD Part A, section 10.4.)
const SEMANTIC = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const UTILITY_HINT =
  /^(?:-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|w|h|min-w|min-h|max-w|max-h|gap|space-[xy]|inset|top|right|bottom|left|z|text|bg|border|rounded|font|leading|tracking|flex|grid|col|row|items|justify|content|self|place|overflow|opacity|shadow|ring|outline|transition|duration|ease|translate|scale|rotate|cursor|select|pointer-events|sr-only|not-sr-only|hidden|block|inline|table|absolute|relative|fixed|sticky|static|size)(?:-|$)|.*[:[\]/!].*)/;

function tokensOf(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value.split(/\s+/).filter(Boolean);
  if (node.type === "TemplateLiteral") {
    // A token touching a `${}` is only half a class name (`slide--${layout}`); skip those halves.
    const last = node.quasis.length - 1;
    return node.quasis.flatMap((q, i) => {
      const raw = q.value.cooked;
      const parts = raw.split(/\s+/).filter(Boolean);
      if (i > 0 && !/^\s/.test(raw)) parts.shift();
      if (i < last && !/\s$/.test(raw)) parts.pop();
      return parts;
    });
  }
  return [];
}

const rule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      util: 'Utility class "{{cls}}" in JSX. Move it to a semantic class with @apply.',
      shape: 'Class "{{cls}}" is not a semantic block__element--modifier name.',
    },
  },
  create(ctx) {
    function check(node) {
      if (!node) return;
      for (const cls of tokensOf(node)) {
        if (UTILITY_HINT.test(cls)) ctx.report({ node, messageId: "util", data: { cls } });
        else if (!SEMANTIC.test(cls)) ctx.report({ node, messageId: "shape", data: { cls } });
      }
    }
    return {
      JSXAttribute(node) {
        if (node.name.name !== "className" && node.name.name !== "class") return;
        const v = node.value;
        if (!v) return;
        if (v.type === "Literal") check(v);
        if (v.type === "JSXExpressionContainer") {
          const e = v.expression;
          if (e.type === "Literal" || e.type === "TemplateLiteral") check(e);
          if (e.type === "CallExpression") e.arguments.forEach((a) => (a.type === "Literal" || a.type === "TemplateLiteral") && check(a));
          if (e.type === "ConditionalExpression") [e.consequent, e.alternate].forEach(check);
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && ["cva", "cn", "clsx"].includes(node.callee.name)) {
          node.arguments.forEach((a) => {
            if (a.type === "Literal" || a.type === "TemplateLiteral") check(a);
          });
        }
      },
    };
  },
};

export default rule;
