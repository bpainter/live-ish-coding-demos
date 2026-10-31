import type { CopyContent, Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { outboundHref } from "../../lib/content";
import { NewTabLink } from "./NewTabLink";
import { SlideShell } from "./SlideShell";
import { Wordmark } from "./Wordmark";

/**
 * The closing slide: the name, role and link on the left, and the QR, built at build from the slide's
 * `url`, on its white plate on the right. The link and the code open in a new tab. Both are left out
 * when the slide has no `url`.
 */
export function ClosingSlide({ slide, total, content, mode }: { slide: Slide; total: number; content: Extract<CopyContent, { kind: "closing" }>; mode: Mode }) {
  const href = content.url ? outboundHref(content.url, slide.id) : undefined;
  return (
    <SlideShell slide={slide} total={total} mode={mode} noHeader>
      {/* Every slide has one h1; the closing slide's visible text has no title line. */}
      <h1 className="visually-hidden" id="slide-title" tabIndex={-1}>
        {slide.title}
      </h1>
      <div className="closing__text">
        {content.eyebrow ? <p className="slide__eyebrow">{content.eyebrow}</p> : null}
        <p className="closing__name">{content.name}</p>
        {content.role ? <p className="closing__role">{content.role}</p> : null}
        {href && content.link ? (
          <NewTabLink className="closing__link" href={href} mode={mode} rel="me noopener">
            <span>{content.link}</span>
          </NewTabLink>
        ) : null}
        <Wordmark mode={mode} className="slide__wordmark closing__wordmark" />
      </div>
      {href && content.qr ? (
        <figure className="qr">
          {/* Generated at build; whole stage px per module. */}
          <span className="qr__frame">
            <NewTabLink href={href} mode={mode} rel="me noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="qr__code" src={content.qr} alt={`QR code for ${content.url}`} />
            </NewTabLink>
          </span>
          {content.caption ? <figcaption className="qr__caption">{content.caption}</figcaption> : null}
        </figure>
      ) : null}
    </SlideShell>
  );
}
