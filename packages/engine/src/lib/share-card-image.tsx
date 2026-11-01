import { ImageResponse } from "next/og";
import { SHARE_CARD, type ShareCardFacts } from "./share-card";

/** The longest title that holds each size in four lines at most. */
const TITLE_SIZES: [number, number][] = [
  [24, 104],
  [48, 84],
  [90, 64],
];
const SMALLEST_TITLE = 52;

const titleSize = (title: string) => TITLE_SIZES.find(([chars]) => title.length <= chars)?.[1] ?? SMALLEST_TITLE;

/**
 * The card, drawn by `next/og` with no browser and from the font it ships. Its renderer never meets
 * a stylesheet, so inline styles are the only styling it reads, and every box must set `display`.
 * Nothing here reaches a page.
 */
export function shareCardImage({ title, byline, paper, ink, soft, accent }: ShareCardFacts): Response {
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: paper, color: ink }}>
      <div style={{ display: "flex", width: 120, height: 8, background: accent }} />
      {title ? <div style={{ display: "block", fontSize: titleSize(title), lineHeight: 1.1, lineClamp: 4 }}>{title}</div> : null}
      {byline ? <div style={{ display: "block", fontSize: 32, color: soft, lineClamp: 1 }}>{byline}</div> : null}
    </div>,
    { width: SHARE_CARD.width, height: SHARE_CARD.height },
  );
}
