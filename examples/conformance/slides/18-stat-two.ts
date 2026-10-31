import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "stat-two",
  layout: "stat",
  title: "Before and after the new model",
  eyebrow: "stat, two",
  stats: [
    {
      value: "41 min",
      label: "of warning with the old grid"
    },
    {
      value: "3.2 h",
      label: "of warning with the regional grid"
    }
  ],
  notes: "Two big numbers."
});
