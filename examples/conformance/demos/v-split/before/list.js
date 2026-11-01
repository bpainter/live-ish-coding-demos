const names = ["North wall", "South wall"];
const list = document.querySelector("ul");

for (const name of names) {
  const item = document.createElement("li");
  item.textContent = name;
  list.append(item);
}
