import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "grid-six",
  title: "Six tides",
  layout: "grid",
  variant: "icons",
  display: "Six tides",
  lede: "A day has four. A sailor's almanac names six more kinds.",
  cardsEyebrow: "The ones with names",
  cards: [
    {
      icon: "moon",
      title: "Spring"
    },
    {
      icon: "moon-star",
      title: "Neap"
    },
    {
      icon: "sunrise",
      title: "Higher high"
    },
    {
      icon: "sunset",
      title: "Lower low"
    },
    {
      icon: "waves-horizontal",
      title: "Slack"
    },
    {
      icon: "wind",
      title: "Surge"
    }
  ],
  notes: "Six short cards under a display line."
});
