import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "content-items",
  title: "What we measure at the gauge",
  eyebrow: "content, items",
  items: [
    {
      label: "Water level",
      detail: "Every six minutes, to the centimeter.",
      icon: "waves-horizontal"
    },
    {
      label: "Air pressure",
      detail: "One hectopascal moves the sea a centimeter.",
      icon: "gauge"
    },
    {
      label: "Wind",
      detail: "Sustained speed and direction at ten meters.",
      icon: "wind"
    },
    {
      label: "Water temperature",
      detail: "Corrects the sound path to the surface.",
      icon: "thermometer"
    }
  ],
  notes: "Items with icons."
});
