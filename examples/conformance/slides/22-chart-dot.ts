import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "chart-dot",
  layout: "chart",
  title: "Warning time against surge height",
  eyebrow: "chart, dot",
  chart: {
    kind: "dot",
    xLabel: "Warning, hours",
    yLabel: "Surge, cm",
    points: [
      {
        label: "1993",
        x: 1.2,
        y: 126
      },
      {
        label: "2003",
        x: 2.4,
        y: 152
      },
      {
        label: "2011",
        x: 3.1,
        y: 98
      },
      {
        label: "2014",
        x: 3.4,
        y: 187
      },
      {
        label: "2021",
        x: 5.6,
        y: 134
      }
    ],
    axisNotes: [
      {
        label: "Wall crest",
        y: 170
      }
    ]
  },
  stats: [
    {
      value: "2014",
      label: "The highest surge, with the most warning to that date."
    },
    {
      value: "2021",
      label: "The first event on the regional grid."
    }
  ],
  notes: "Dot chart with an axis note."
});
