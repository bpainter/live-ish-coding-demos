// A hook that changes the server ends in a
// full load: the page shows what the server
// rendered, and the step resumes there.
const post = (path) =>
  fetch(liveIsh.withSession(path), {
    method: "POST",
  });

liveIsh.hooks({
  async reset() {
    liveIsh.startSession();
    await post("/__demo/reset");
    return liveIsh.load();
  },
  reload() {
    return liveIsh.load();
  },
  async invalidate() {
    await post("/__demo/invalidate");
  },
});
