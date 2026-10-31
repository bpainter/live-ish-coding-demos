import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "comparison",
  layout: "comparison",
  title: "Chart datum and the gauge",
  eyebrow: "comparison",
  items: [
    {
      label: "What the chart says",
      detail: "5.2 m: lowest astronomical tide\nFixed when the survey was drawn.\nNever moves on its own."
    },
    {
      label: "What the gauge says",
      detail: "4.9 m: this morning at 06:12\nMeasured every six minutes.\nMoves with the wall it is bolted to."
    }
  ],
  notes: "Two columns."
});
