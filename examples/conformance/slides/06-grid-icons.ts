import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "grid-icons",
  layout: "grid",
  variant: "icons",
  title: "Three reasons a reading goes bad",
  eyebrow: "grid, icons",
  cards: [
    {
      icon: "anchor",
      title: "Something hit the gauge",
      body: "A mooring line, a hull, a curious seal."
    },
    {
      icon: "cable",
      title: "The telemetry dropped",
      body: "Readings arrive late and out of order."
    },
    {
      icon: "ship-wheel",
      title: "A wake crossed the well",
      body: "Twelve minutes of noise in a calm hour."
    }
  ],
  notes: "Icon cards."
});
