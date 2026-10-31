const button =
  document.getElementById("toggle");
const answer =
  document.getElementById("answer");

function setOpen(open) {
  button.setAttribute(
    "aria-expanded",
    open,
  );
  answer.hidden = !open;
}

button.addEventListener("click", () => {
  const open =
    button.getAttribute("aria-expanded") ===
    "true";
  setOpen(!open);
});
