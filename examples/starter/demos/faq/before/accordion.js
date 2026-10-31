const buttons = [
  ...document.querySelectorAll(
    ".faq__item button",
  ),
];

function panelOf(button) {
  const id = button.getAttribute(
    "aria-controls",
  );
  return document.getElementById(id);
}

function show(button) {
  button.setAttribute(
    "aria-expanded",
    "true",
  );
  panelOf(button).hidden = false;
}

function hide(button) {
  button.setAttribute(
    "aria-expanded",
    "false",
  );
  panelOf(button).hidden = true;
}

function closeOthers(current) {
  for (const button of buttons) {
    if (button === current) continue;
    hide(button);
  }
}

function onClick(event) {
  const button = event.currentTarget;
  const wasOpen =
    button.getAttribute("aria-expanded") ===
    "true";
  closeOthers(button);
  if (wasOpen) hide(button);
  else show(button);
}

for (const button of buttons) {
  button.addEventListener("click", onClick);
}
