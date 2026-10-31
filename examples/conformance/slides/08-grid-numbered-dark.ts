import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "grid-numbered-dark",
  layout: "grid",
  variant: "numbered",
  tone: "dark",
  title: "What changed in thirty years",
  eyebrow: "grid, numbered, dark",
  cards: [
    {
      num: "01",
      title: "Gauges went digital",
      body: "Six-minute data replaced a paper drum."
    },
    {
      num: "02",
      title: "Models went regional",
      body: "Grid cells fell from 12 km to 800 m."
    },
    {
      num: "03",
      title: "Sea level moved",
      body: "Datums now carry a date."
    }
  ],
  notes: "Numbered cards, dark tone."
});
