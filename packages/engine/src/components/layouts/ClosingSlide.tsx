import type { CopyContent, Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { outboundHref } from "../../lib/content";
import { NewTabLink } from "./NewTabLink";
import { Wordmark } from "./Wordmark";

/**
 * The closing slide: name, role and link on dark glass, the QR on white. The link and the QR code
 * open in a new tab. Both are left out when the slide has no `url`.
 */
export function ClosingSlide({ slide, content, mode }: { slide: Slide; content: Extract<CopyContent, { kind: "closing" }>; mode: Mode }) {
  const href = content.url ? outboundHref(content.url, slide.id) : undefined;
  return (
    <section className="sg sg--closing" data-tone="dark" aria-label={slide.title}>
      {/* Every slide has one h1; the closing slide's visible text has no title line. */}
      <h1 className="visually-hidden">{slide.title}</h1>
      <div className="sg-card sg-card--dark sg-closing">
        <div className="sg-closing__text">
          {content.eyebrow ? <p className="sg-eyebrow">{content.eyebrow}</p> : null}
          <p className="sg-closing__name">{content.name}</p>
          {content.role ? <p className="sg-closing__role">{content.role}</p> : null}
          {href && content.link ? (
            <NewTabLink className="sg-closing__link" href={href} mode={mode} rel="me noopener">
              <span>{content.link}</span>
            </NewTabLink>
          ) : null}
        </div>
        <Wordmark mode={mode} className="sg-wordmark sg-closing__wordmark" />
      </div>
      {href && content.qr ? (
        <figure className="sg-qr">
          {/* Generated at build; whole stage px per module. */}
          <span className="sg-qr__frame">
            <NewTabLink href={href} mode={mode} rel="me noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="sg-qr__code" src={content.qr} alt={`QR code for ${content.url}`} />
            </NewTabLink>
          </span>
          {content.caption ? <figcaption className="sg-qr__caption">{content.caption}</figcaption> : null}
        </figure>
      ) : null}
    </section>
  );
}
