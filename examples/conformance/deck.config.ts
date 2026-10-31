import { defineDeck } from "@live-ish/engine/config";

/**
 * One slide per copy layout, and every grid variant, tone and alignment. A test fails if a layout
 * goes missing (packages/engine/test/conformance.test.ts). `?chrome=<id>` runs the deck through a theme.
 */
export default defineDeck({
  schemaVersion: 1,
  title: "Conformance",
  speaker: { name: "Rosa Quintero", title: "Staff engineer", org: "Tideline Labs", url: "https://example.com/rosa" },
  event: { name: "Conformance", city: "Halifax" },
  links: { site: { label: "example.com/conformance", url: "https://example.com/conformance" } },
  theme: { brand: { text: "Tideline" } },
  order: [
    "title",
    "content",
    "content-items",
    "content-image",
    "section",
    "grid-icons",
    "grid-numbered",
    "grid-numbered-dark",
    "grid-portraits",
    "grid-six",
    "grid-center",
    "statement",
    "quotes-two",
    "quotes-one",
    "people",
    "image",
    "stat",
    "stat-two",
    "comparison",
    "table",
    "timeline",
    "chart-dot",
    "chart-bar",
    "closing",
  ],
});
