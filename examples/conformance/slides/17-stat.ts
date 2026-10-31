import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "stat",
  layout: "stat",
  title: "How far the water rose",
  eyebrow: "stat",
  stats: [
    {
      value: "1.87 m",
      label: "above the predicted tide at the inner basin",
      source: "https://example.com/gauge-report"
    }
  ],
  notes: "One big number."
});
