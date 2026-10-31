import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "timeline",
  layout: "timeline",
  title: "One storm, in order",
  eyebrow: "timeline",
  body: [
    "All times local, 3 January."
  ],
  items: [
    {
      label: "04:10 · Pressure falls",
      detail: "Fastest drop on record at the mole."
    },
    {
      label: "06:30 · First warning",
      detail: "By phone to the harbor master."
    },
    {
      label: "08:05 · Gates closed",
      detail: "Forty minutes ahead of the peak."
    },
    {
      label: "08:47 · High water",
      detail: "6.91 m at the inner basin."
    },
    {
      label: "11:00 · All clear",
      detail: "Time not logged, from memory.",
      hollow: true
    }
  ],
  stats: [
    {
      value: "6 h 50 m",
      label: "from the first fall to the all clear"
    }
  ],
  notes: "Dated markers. The last is hollow."
});
