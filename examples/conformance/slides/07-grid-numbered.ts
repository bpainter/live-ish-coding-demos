import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "grid-numbered",
  layout: "grid",
  variant: "numbered",
  title: "How a surge warning goes out",
  eyebrow: "grid, numbered",
  cards: [
    {
      num: "01",
      title: "The model runs",
      body: "Four times a day, on six-hour weather."
    },
    {
      num: "02",
      title: "A person checks it",
      body: "A duty forecaster reads it against the gauges."
    },
    {
      num: "03",
      title: "The harbor master calls",
      body: "By phone, because the radio was busy."
    }
  ],
  notes: "Numbered cards, light."
});
