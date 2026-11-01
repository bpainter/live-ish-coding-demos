# Steps

A page plays its `steps` in order, one press each. `s0` is the entry state, and step ids run `s0`, `s1`, `s2`.

```ts
{
  id: "s1",
  label: "Open the panel",          // speaker window only, short
  key: true,                        // the one step to emphasise
  actions: [
    { type: "pointer", to: "#toggle" },
    { type: "click", target: "#toggle" },
    { type: "assert", target: "#answer", expect: "visible" },
  ],
  code: { file: "panel.js", lines: [[14, 19]] },
  spotlight: ["#toggle", "#answer"],
  callouts: [{ target: "#toggle", text: "No handler", side: "bottom" }],
  notes: ["One thing to say."],
}
```

## Limits `live-ish check` enforces

| Field | Limit |
|---|---|
| Steps after `s0` | 3 on a before page, 5 on after and single pages |
| `key: true` | Exactly one on each before and after page |
| `notes` | 1 to 3 paragraphs on a step, up to 3 on `s0` |
| `callouts` | After pages only, one per step, 3 words at most |
| `code.lines` | 12 highlighted lines at most, within a span of 20 |
| `files` | 4 tabs on a before page, 3 on an after page |
| `meter` | One per page, on the last step of a before page. `value` must match the count from `source` |
| `proof` | 2 per page |
| Intro `description` | 2 sentences and 20 words at most, with no numbers or Baseline |

## Details that catch people

- Every selector must exist in the beat's own files. If a script creates the element, add its selector to the beat's `runtimeSelectors`.
- `code.file` must be one of the page's `files`. `code.lines` counts shown lines, so an `excerpt()` numbers from its first shown line.
- A `toggle` action needs its flag in the beat's `flags`, such as `flags: { "enhance-css": true }`.
- A `hook` action needs its function in `hooks.js`: `window.demoHooks = { reset() {} }`, and its name in the beat's `hooks`.
- A `key` action needs an `ifKeyboard` note and a `via`. `via` names the DOM API with the same effect.
- A `meter.source` such as `before/*.js` is counted from the files. Use the value `check` prints.
