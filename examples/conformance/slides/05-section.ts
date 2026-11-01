import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "section",
  layout: "section",
  background: "/backgrounds/slack-water.svg",
  label: "Part two",
  title: "When the forecast misses",
  legend: [
    {
      label: "Surge",
      detail: "Wind and low pressure stack the water."
    },
    {
      label: "Seiche",
      detail: "The harbor sloshes at its own period."
    },
    {
      label: "Datum",
      detail: "The gauge itself moved."
    }
  ],
  notes: "Divider with a legend."
});
