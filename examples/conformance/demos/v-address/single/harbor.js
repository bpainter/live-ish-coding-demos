const byId = (id) =>
  document.getElementById(id);
const load = byId("load");
const save = byId("save");

load.addEventListener("click", async () => {
  const res = await fetch("/api/tides");
  const { level } = await res.json();
  byId("tide").textContent =
    `High water ${level}`;
});

save.addEventListener("click", async () => {
  const res = await fetch("/api/notes", {
    method: "POST",
    body: "Slack water at noon",
  });
  const { saved } = await res.json();
  byId("saved").textContent =
    `Saved ${saved} characters`;
});
