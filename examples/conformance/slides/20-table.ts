import { defineSlide } from "@live-ish/engine/config";

export default defineSlide({
  id: "table",
  layout: "table",
  title: "The five highest readings",
  eyebrow: "table",
  tableColumns: [
    "Date",
    "Reading",
    "Surge",
    "Cause"
  ],
  tableRows: [
    {
      cells: [
        "3 Jan 2014",
        "6.91 m",
        "1.87 m",
        "Deep low, onshore gale"
      ]
    },
    {
      cells: [
        "29 Oct 2003",
        "6.74 m",
        "1.52 m",
        "Hurricane remnant"
      ]
    },
    {
      cells: [
        "5 Dec 1976",
        "6.62 m",
        "1.41 m",
        "Spring tide, northeasterly"
      ]
    },
    {
      cells: [
        "21 Feb 1993",
        "6.48 m",
        "1.26 m",
        "Fast-moving low"
      ]
    },
    {
      cells: [
        "14 Mar 1987",
        "6.40 m",
        "1.18 m",
        "Spring tide, swell"
      ]
    }
  ],
  notes: "A plain table."
});
