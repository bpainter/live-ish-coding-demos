import type { ReactNode } from "react";
import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { deck, outboundHref } from "../../lib/content";
import { NewTabLink } from "./NewTabLink";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
  /** Rendered under the title inside the header. */
  headerExtra?: ReactNode;
  /** Rendered before the header, for imagery behind the content. */
  before?: ReactNode;
  /** Omit the eyebrow and title header (layouts that place the title themselves). */
  noHeader?: boolean;
  footer?: boolean;
  /** The `content` layout's image placement, for the body's width. */
  imagePlacement?: string;
  /** Extra attributes a layout's stylesheet selects on. */
  data?: Record<`data-${string}`, string | number | undefined>;
  children: ReactNode;
}

/** The foot of the slide: the site on the left when the deck has one, the footer text and the folio. */
export function SlideFooter({ slide, mode }: { slide: Slide; mode: Mode }) {
  const site = deck.links.site;
  return (
    <footer className="slide__footer">
      {site ? (
        <p className="slide__footer-link">
          <NewTabLink href={outboundHref(site.url, slide.id)} mode={mode}>
            {site.label}
          </NewTabLink>
        </p>
      ) : (
        <span />
      )}
      <p className="slide__footer-label">{deck.footer}</p>
      <p className="slide__counter">
        {/* The number is named for screen readers: "..., slide 48". */}
        <span className="visually-hidden">Slide </span>
        {slide.index}
      </p>
    </footer>
  );
}

/** The title every layout gets. Exactly one h1 on a slide. */
export function SlideTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="slide__title" id="slide-title" tabIndex={-1}>
      {children}
    </h1>
  );
}

/** The outer shell every copy layout shares: header, body, footer. */
export function SlideShell({ slide, total, mode, headerExtra, before, noHeader, footer = true, imagePlacement, data, children }: Props) {
  return (
    <section className={`slide slide--${slide.layout}`} aria-roledescription="slide" aria-label={`Slide ${slide.index} of ${total}: ${slide.title}`} data-slide-id={slide.id} data-header={!noHeader} data-footer={footer} data-image={imagePlacement} {...data}>
      {before}
      {noHeader ? null : (
        <header className="slide__header">
          {slide.eyebrow ? <p className="slide__eyebrow">{slide.eyebrow}</p> : null}
          <SlideTitle>{slide.title}</SlideTitle>
          {headerExtra}
        </header>
      )}
      <div className="slide__body">{children}</div>
      {footer ? <SlideFooter slide={slide} mode={mode} /> : null}
    </section>
  );
}
