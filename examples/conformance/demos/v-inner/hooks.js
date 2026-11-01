// Not shown on the slide. The inner document has no runtime, so this reaches it directly.
window.demoHooks = {
  reset() {},
  // The runtime is ready at DOMContentLoaded, which can come before this document has loaded.
  loaded() {
    const frame = document.getElementById("panel");
    if (frame.contentDocument?.getElementById("reading")) return undefined;
    return new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  },
  fill(text) {
    document.getElementById("panel").contentDocument.getElementById("reading").textContent = text;
  },
};
