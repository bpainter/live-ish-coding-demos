// Not shown on the slide. The inner document has no runtime, so this reaches it directly.
window.demoHooks = {
  reset() {},
  fill(text) {
    document.getElementById("panel").contentDocument.getElementById("reading").textContent = text;
  },
};
