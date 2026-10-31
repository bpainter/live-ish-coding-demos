import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "content-image",
  title: "The wall the gauge is bolted to",
  eyebrow: "content, image",
  body: [
    "Built in 1887, re-faced in 1962.",
    "It settles about a millimeter a year."
  ],
  image: {
    src: "/images/harbor-wall.svg",
    alt: "A stacked harbor wall of pale stone blocks above a dark waterline.",
    placement: "right-half"
  },
  notes: "Image at the right."
});
