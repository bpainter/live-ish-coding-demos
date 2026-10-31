import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "chart-bar",
  layout: "chart",
  title: "Hours of warning by model",
  eyebrow: "chart, bar",
  chart: {
    kind: "bar",
    xLabel: "Model",
    yLabel: "Hours",
    points: [
      {
        label: "1993",
        x: 0,
        y: 1.2
      },
      {
        label: "2003",
        x: 0,
        y: 2.4
      },
      {
        label: "2014",
        x: 0,
        y: 3.4
      },
      {
        label: "2021",
        x: 0,
        y: 5.6
      }
    ]
  },
  notes: "Bar chart."
});
