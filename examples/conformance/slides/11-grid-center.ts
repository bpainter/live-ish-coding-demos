import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "grid-center",
  layout: "grid",
  variant: "icons",
  align: "center",
  title: "Two gauges, one harbor",
  cards: [
    {
      icon: "map-pin",
      title: "Inner basin",
      body: "Reads the water the boats sit in."
    },
    {
      icon: "compass",
      title: "Outer mole",
      body: "Reads the water that is on its way."
    }
  ],
  notes: "Centered group."
});
