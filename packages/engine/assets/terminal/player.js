// The terminal player. The runtime reveals lines (`hidden = false`) and scrolls
// the `[data-terminal]` scroller after each range; this keeps the newest line
// in view while a range is still revealing. The frame declares
// `hooks: ["reset"]`; the engine remounts on reset, so the hook only re-hides
// the lines for a document reset in place.
const scroller = document.querySelector("[data-terminal]");
const lines = document.querySelectorAll("[data-line]");

function follow() {
  scroller.scrollTop = scroller.scrollHeight;
}

new MutationObserver(follow).observe(scroller, {
  attributes: true,
  attributeFilter: ["hidden"],
  subtree: true,
});

window.demoHooks = {
  reset() {
    for (const line of lines) line.hidden = true;
    scroller.scrollTop = 0;
  },
};
