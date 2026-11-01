const dialog = document.getElementById("confirm");
document.getElementById("ask").addEventListener("click", () => dialog.showModal());
document.getElementById("keep").addEventListener("click", () => dialog.close());
