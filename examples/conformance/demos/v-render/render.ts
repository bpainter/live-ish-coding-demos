import type { TemplateRender } from "@live-ish/engine/config";

const STATIONS: Record<string, { name: string; level: string }> = {
  north: { name: "North wall", level: "3.2 m" },
};

/** Fills the shown templates. An unknown record throws, and the frame route answers 404. */
const render: TemplateRender = (file, html, url) => {
  if (file === "index.html") return html.replace("{{site}}", "Halifax harbor");
  const station = STATIONS[url.searchParams.get("id") ?? ""];
  if (!station) throw new Error("No such station");
  return html.replace("{{name}}", station.name).replace("{{level}}", station.level);
};

export default render;
