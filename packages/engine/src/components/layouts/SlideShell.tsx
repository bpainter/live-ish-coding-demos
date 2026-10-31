import type { ReactNode } from "react";
import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { fieldFor } from "../../lib/field";
import { deck, outboundHref } from "../../lib/content";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
  /** Rendered under the title inside the header (demo slides put `body[0]` here). */
  headerExtra?: ReactNode;
  /** Rendered before the header, for full-bleed imagery behind the content. */
  before?: ReactNode;
  /** Title size: "xl" (64px, default) or "2xl" (88px for title, section and close). */
  titleSize?: "xl" | "2xl";
  /** Keep the h1 in the DOM but hide it (statement layout). */
  hideTitle?: boolean;
  /** Omit the eyebrow/title header entirely (layouts that place the title themselves). */
  noHeader?: boolean;
  footer?: boolean;
  /** The `content` layout's image placement, for the body's width. */
  imagePlacement?: string;
  children: ReactNode;
}

export function SlideFooter({ slide, mode }: { slide: Slide; mode: Mode }) {
  const site = deck.links.site;
  return (
    <footer className="slide__footer">
      {site ? (
        mode === "reader" ? (
          <a className="slide__footer-link" href={outboundHref(site.url, slide.id)}>
            {site.label}
          </a>
        ) : (
          <p className="slide__footer-link">{site.label}</p>
        )
      ) : (
        <span />
      )}
      <p className="slide__footer-label">{deck.footer}</p>
      <p className="slide__counter">{slide.index}</p>
    </footer>
  );
}

/** The outer shell every layout shares: header, body, footer. */
export function SlideShell({ slide, total, mode, headerExtra, before, titleSize = "xl", hideTitle, noHeader, footer = true, imagePlacement, children }: Props) {
  return (
    <section
      className={`slide slide--${slide.layout}`}
      aria-roledescription="slide"
      aria-label={`Slide ${slide.index} of ${total}: ${slide.title}`}
      data-field={fieldFor(slide)}
      data-slide-id={slide.id}
      data-footer={footer}
      data-image={imagePlacement}
    >
      {before}
      {noHeader ? null : (
        <header className="slide__header">
          {slide.eyebrow ? <p className="slide__eyebrow">{slide.eyebrow}</p> : null}
          <h1 className={hideTitle ? "slide__title visually-hidden" : "slide__title"} data-size={titleSize} id="slide-title" tabIndex={-1}>
            {slide.title}
          </h1>
          {headerExtra}
        </header>
      )}
      <div className="slide__body">{children}</div>
      {footer ? <SlideFooter slide={slide} mode={mode} /> : null}
    </section>
  );
}
