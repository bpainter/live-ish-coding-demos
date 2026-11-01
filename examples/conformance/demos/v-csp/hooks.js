// Not shown on the slide. A data: image loads only with the policy off.
window.demoHooks = {
  reset() {},
  async check() {
    const dot = document.getElementById("dot");
    const ok = await dot.decode().then(() => true, () => false);
    document.getElementById("state").textContent = ok ? "Image allowed" : "Image blocked";
  },
};
