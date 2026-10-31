import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "grid-portraits",
  layout: "grid",
  variant: "portraits",
  title: "Three kinds of harbor",
  eyebrow: "grid, portraits",
  cards: [
    {
      image: {
        src: "/images/harbor-wall.svg",
        alt: "A pale stone wall above dark water."
      },
      title: "The stone wall",
      body: "Old, heavy, and it reflects every wave.",
      question: "Who pays?"
    },
    {
      image: {
        src: "/images/tide-chart.svg",
        alt: "Contour lines rising across a dark field."
      },
      title: "The open roadstead",
      body: "No wall at all. Ships ride it out.",
      question: "Who waits?"
    },
    {
      image: {
        src: "/images/harbor-wall.svg",
        alt: "A pale stone wall above dark water."
      },
      title: "The dredged basin",
      body: "Quiet water, and a yearly bill.",
      question: "Who digs?"
    }
  ],
  notes: "Image cards."
});
