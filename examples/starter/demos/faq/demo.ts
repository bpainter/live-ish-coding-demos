import { defineDemo, excerpt, shown } from "@live-ish/engine/config";

// This one file runs the demo. The page ids (faq-intro, faq-before, faq-after), the routes, the
// frame size and the timing all come from it.
export default defineDemo({
  id: "faq",
  title: "Exclusive accordions",
  scenario: "A question list where only one answer stays open at a time.",
  // The support row on the intro. Find an id with `live-ish support details`.
  support: { kind: "web-features", id: "details-name" },

  // Three beats: the intro sets up the idea, before is the old way, after is the new one.
  intro: {
    description: "The details element gives you an accordion. One attribute makes it exclusive.",
    // `capture` names the step `live-ish capture` takes this still from.
    visual: { alt: "The question list with one answer open.", capture: { beat: "after", step: "s2" } },
    notes: "Here is a pattern most of us have built by hand: a question list.\n\nOnly one answer stays open at a time. We will build it the old way, then with the platform.",
    minutes: 0.25,
  },

  before: {
    notes: "Here is the list, built with buttons and panels.\n\nIt looks finished. Watch how much script sits behind it.",
    // The code panel's tabs. shown() is a whole file. excerpt() is parts of one, in source lines.
    //
    // An excerpt moves the line numbers. Every `code.lines` below counts the lines the panel shows,
    // and each gap takes one line for its "... more lines" comment. Shown line 1 is the first gap,
    // so shown line 2 is source line 14. Shown line 9 is the second gap, so shown line 10 is source
    // line 30. `check` confirms an excerpt against its source, line by line.
    files: [shown("index.html"), excerpt("accordion.js", [[14, 20], [30, 45]])],
    // The functions this beat's page has on `window.demoHooks`. They come from hooks.js, which is
    // kept out of the code panel and the line count.
    hooks: ["reset"],
    minutes: 1,
    steps: [
      // Step s0 is the page as it arrives. It takes no press.
      { id: "s0", label: "The closed list", actions: [], code: { file: "index.html", lines: [] }, notes: [] },
      // Every other step is one press. `actions` play in the frame, `code` picks the tab and the
      // lines to highlight, `spotlight` rings elements, and `notes` are what you say.
      {
        id: "s1",
        label: "Open a question",
        actions: [
          { type: "pointer", to: "#q1" },
          { type: "click", target: "#q1" },
          // An assert checks the page and shows nothing. If the demo breaks, `live-ish walk` fails here.
          { type: "assert", target: "#a1", expect: "visible" },
        ],
        code: { file: "accordion.js", lines: [[17, 25]] },
        spotlight: ["#q1", "#a1"],
        notes: ["Press the first question. Our click handler reads the state and opens the panel."],
      },
      {
        id: "s2",
        label: "Close the others",
        actions: [
          { type: "pointer", to: "#q2" },
          { type: "click", target: "#q2" },
          { type: "assert", target: "#a1", expect: "hidden" },
          { type: "assert", target: "#a2", expect: "visible" },
        ],
        code: { file: "accordion.js", lines: [[10, 15]] },
        spotlight: ["#q2", "#a2"],
        notes: ["Now the second. Nothing in the page knows these panels belong together, so we close the others by hand."],
      },
      {
        id: "s3",
        label: "Count the script",
        // The one step to stress on this page. The speaker window sets its notes in bold.
        key: true,
        actions: [
          // `wait` holds for a moment, then `reveal` shows an element that starts hidden.
          { type: "wait", ms: 300 },
          { type: "reveal", target: "#note" },
        ],
        code: { file: "accordion.js", lines: [[2, 8]] },
        spotlight: ["#note"],
        // `check` recounts `source` and fails if this number is wrong, so the slide can't drift.
        meter: { label: "JavaScript", value: "43 lines", source: "before/*.js" },
        notes: ["That is 43 lines of JavaScript for a list of questions. Keep that number in mind."],
      },
    ],
  },

  after: {
    notes: "Same list, same task. This time the markup does the work.\n\nStart with the HTML.",
    files: [shown("index.html"), shown("faq.css")],
    // The switches this beat understands, with their first values. A `toggle` action flips one.
    flags: { "enhance-css": true },
    hooks: ["reset"],
    minutes: 2,
    steps: [
      {
        id: "s0",
        label: "Same list",
        // A `hook` action calls a function on `window.demoHooks` in the page.
        actions: [{ type: "hook", name: "reset" }],
        code: { file: "index.html", lines: [] },
        notes: [],
      },
      {
        id: "s1",
        label: "Open with no script",
        actions: [
          { type: "pointer", to: "#q1 summary" },
          { type: "click", target: "#q1 summary" },
          { type: "assert", target: "#q1", expect: "attr:open" },
        ],
        code: { file: "index.html", lines: [[4, 7]] },
        spotlight: ["#q1"],
        notes: ["The details element opens and closes by itself. No handler runs."],
      },
      {
        id: "s2",
        label: "One name, one open",
        key: true,
        actions: [
          { type: "pointer", to: "#q2 summary" },
          { type: "click", target: "#q2 summary" },
          { type: "assert", target: "#q1", expect: "no-attr:open" },
          { type: "assert", target: "#q2", expect: "attr:open" },
        ],
        // `[4, 8]` highlights two separate lines. `[[4, 7]]`, one step back, is a range.
        code: { file: "index.html", lines: [4, 8] },
        spotlight: ["#q1", "#q2"],
        // To pin a short label to an element on an after page, add a callout:
        // callouts: [{ target: "#q2", text: "Same name", side: "bottom" }],
        notes: ["Both elements share the name faq. That one attribute makes the group exclusive.", "The first answer closed, and we wrote no code to close it."],
      },
      {
        id: "s3",
        label: "The keyboard works",
        actions: [
          { type: "focus", target: "#q1 summary", visible: true },
          // A script can't press a real key. This shows a keycap, and `via` names the DOM call that
          // does the same job.
          { type: "key", key: "Enter", target: "#q1 summary", via: "el.click()" },
          { type: "assert", target: "#q1", expect: "attr:open" },
          { type: "assert", target: "#q2", expect: "no-attr:open" },
        ],
        code: { file: "index.html", lines: [5, 9] },
        spotlight: ["#q1 summary"],
        // What to do by hand in hands-on mode.
        ifKeyboard: "Press Tab to the first question, then Enter. Then press Next once to sync the frame.",
        notes: ["Focus and Enter work with no extra code. The browser gives us that behavior."],
      },
      {
        id: "s4",
        label: "Turn the CSS off",
        actions: [
          { type: "toggle", flag: "enhance-css", on: false },
          { type: "assert", target: "#q1", expect: "attr:open" },
        ],
        // `off` dims the file and puts an "Off" chip on its tab.
        code: { file: "faq.css", lines: [], off: true },
        spotlight: ["#q1"],
        notes: ["Here the styles are off. It still works, because the behavior lives in the HTML."],
      },
      {
        id: "s5",
        label: "Count the script",
        actions: [
          { type: "toggle", flag: "enhance-css", on: true },
          { type: "wait", ms: 300 },
          { type: "reveal", target: "#note" },
        ],
        code: { file: "faq.css", lines: [[15, 17]] },
        spotlight: ["#note"],
        meter: { label: "JavaScript", value: "0 lines", source: "after/*.js" },
        notes: ["The styles are back, and the count is zero.", "Check support before you ship this. The intro slide showed where it works."],
      },
    ],
  },

  citations: [{ text: "MDN: the details element", url: "https://developer.mozilla.org/docs/Web/HTML/Element/details" }],
});
