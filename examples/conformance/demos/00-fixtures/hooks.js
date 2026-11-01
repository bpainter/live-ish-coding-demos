// Not shown on the slide. A fresh document is the reset point.
window.demoHooks = {
  reset() {},
  grow() {
    document.getElementById("grow").classList.add("is-wide");
  },
  scaleIn() {
    const panel = document.getElementById("panel");
    panel.classList.remove("is-in");
    void panel.offsetWidth;
    panel.classList.add("is-in");
  },
};
