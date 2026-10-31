import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "image",
  layout: "image",
  title: "High water, 3 January",
  eyebrow: "image",
  body: [
    "The highest reading on the wall in forty years."
  ],
  image: {
    src: "/images/tide-chart.svg",
    alt: "Contour lines rising across a dark field, with a pale sun at the upper right.",
    placement: "full-bleed"
  },
  notes: "A full-bleed image."
});
