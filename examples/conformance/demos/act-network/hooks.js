// Not shown on the slide.
window.demoHooks = {
  reset() {},
  setNetwork(profile) {
    document.getElementById("speed").textContent = profile === "slow" ? "Slow link" : "Fast link";
  },
};
