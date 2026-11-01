import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "what-this-shows",
  layout: "content",
  title: "What this deck shows",
  body: ["Three things your own deck can do."],
  items: [
    { label: "Slides", detail: "Plain slides like this one, with text and images.", icon: "presentation" },
    { label: "Web demos", detail: "Real pages, played one step at a time.", icon: "play" },
    { label: "Terminal demos", detail: "Recorded commands beside their code.", icon: "square-terminal" },
  ],
  // An image is a plain file under public/. `check` fails if it has no `alt`.
  image: {
    src: "/images/two-windows.svg",
    alt: "A speaker window with notes beside an audience window showing a highlighted element.",
    placement: "right-half",
  },
  notes:
    "This is a standard copy slide. It holds a title, a sentence, up to six items and an image.\n\nThe notes you are reading live in the same file. Press `s` to open the speaker window.\n\nNext we look at a demo.",
  minutes: 1,
});
