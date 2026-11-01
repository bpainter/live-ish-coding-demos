const hue = Math.floor(Math.random() * 360);
const box = document.querySelector("div");
const color = `hsl(${hue} 70% 85%)`;
box.style.background = color;
