import { createElement } from "react";
import type { CopyContent, Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { deck, outboundHref } from "../../lib/content";
import { pictureSources } from "../../lib/assets";
import { ClosingSlide } from "./ClosingSlide";
import { iconByName } from "./icon";
import { NewTabLink } from "./NewTabLink";
import { Wordmark } from "./Wordmark";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

function Icon({ name, size }: { name?: string; size: number }) {
  const icon = iconByName(name);
  return icon ? createElement(icon, { size, strokeWidth: 1.75, className: "sg-icon", "aria-hidden": true }) : null;
}

/** A card's image: AVIF with a WebP fallback once encoded. Shown at 512 by 472 canvas px (object-fit: cover). */
function Portrait({ src, alt }: { src: string; alt: string }) {
  const p = pictureSources(src, 512);
  return (
    // display: contents keeps the card's layout on the <img>, as before the <picture>.
    <picture style={{ display: "contents" }}>
      {p.sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={p.sizes} />
      ))}
      <img className="sg-portrait" src={p.src} srcSet={p.srcSet} sizes={p.sizes} alt={alt} width={512} height={512} />
    </picture>
  );
}

/**
 * Two glass pills at y 1012: the site on the left, when the deck has one, and the footer text and
 * slide number on the right.
 */
function Footer({ slide, tone, mode }: { slide: Slide; tone: "light" | "dark"; mode: Mode }) {
  const site = deck.links.site;
  return (
    <footer className="sg-footer" data-tone={tone}>
      {site ? (
        <p className="sg-pill">
          <NewTabLink href={outboundHref(site.url, slide.id)} mode={mode}>
            {site.label}
          </NewTabLink>
        </p>
      ) : (
        <span />
      )}
      <p className="sg-pill">
        {/* The number is named for screen readers: "..., slide 48". */}
        {deck.footer}
        <span className="visually-hidden">, slide </span>
        <span className="sg-pill__num">{slide.index}</span>
      </p>
    </footer>
  );
}

/**
 * The composed copy layouts: the slide's background comes from the stage, and these draw text, cards
 * and panels with the theme's tokens only.
 */
export function CopySlide({ slide, mode }: Props) {
  const g = slide.copy as CopyContent | undefined;
  if (!g) throw new Error(`Slide ${slide.id} has layout ${slide.layout} but no content for it`);
  switch (g.kind) {
    case "title":
      return (
        <section className="sg sg--title" data-tone="dark" aria-label={slide.title}>
          {g.eyebrow ? <p className="sg-eyebrow">{g.eyebrow}</p> : null}
          <h1 className="sg-display sg-title-lines">
            {g.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </h1>
          {/* The name and role come from the deck config, shared with the closing and the metadata. */}
          <p className="sg-cover__name">
            {deck.speaker.url ? (
              <NewTabLink href={outboundHref(deck.speaker.url, slide.id)} mode={mode} rel="me noopener">
                {deck.speaker.name}
              </NewTabLink>
            ) : (
              deck.speaker.name
            )}
          </p>
          {deck.role ? <p className="sg-cover__role">{deck.role}</p> : null}
          <Wordmark mode={mode} />
        </section>
      );
    case "grid":
      return (
        <section className={`sg sg--grid sg--${g.variant}${g.align === "center" ? " sg--center" : ""}`} data-tone={g.tone} data-cards={g.cards.length} aria-label={slide.title}>
          {g.eyebrow ? <p className="sg-eyebrow">{g.eyebrow}</p> : null}
          {g.display ? <h1 className="sg-display">{g.display}</h1> : null}
          {g.title ? <h1 className="sg-title">{g.title}</h1> : null}
          {g.lede ? <p className="sg-body sg-lede">{g.lede}</p> : null}
          {g.cardsEyebrow ? <p className="sg-eyebrow sg-cards-eyebrow">{g.cardsEyebrow}</p> : null}
          <ul className="sg-cards">
            {g.cards.map((c) => (
              <li key={c.title} className={`sg-card ${g.tone === "dark" ? "sg-card--dark" : ""}`}>
                {c.image ? <Portrait src={c.image.src} alt={c.image.alt} /> : null}
                {c.num ? <p className="sg-num">{c.num}</p> : null}
                <Icon name={c.icon} size={g.variant === "numbered" || c.body ? 56 : 48} />
                <div className="sg-card__text">
                  <p className="sg-card__title">{c.title}</p>
                  {c.body ? <p className="sg-card__body">{c.body}</p> : null}
                </div>
                {c.question ? <p className="sg-question">{c.question}</p> : null}
              </li>
            ))}
          </ul>
          <Footer slide={slide} tone={g.tone} mode={mode} />
        </section>
      );
    case "quotes":
      return (
        <section className="sg sg--quotes" data-tone="dark" aria-label={slide.title}>
          <div className="sg-card sg-card--dark sg-quotes">
            <h1 className="sg-title">{g.title}</h1>
            <div className="sg-quotes__grid">
              {g.quotes.map((q) => (
                <figure key={q.cite} className="sg-quote">
                  <blockquote className="sg-quote__text">{q.text}</blockquote>
                  <figcaption className="sg-quote__cite">{q.cite}</figcaption>
                </figure>
              ))}
            </div>
          </div>
          <Footer slide={slide} tone="dark" mode={mode} />
        </section>
      );
    case "statement":
      return (
        <section className="sg sg--statement" data-tone="dark" aria-label={slide.title}>
          <div className="sg-card sg-card--dark sg-statement">
            <h1 className="sg-display sg-title-lines">
              {g.lines.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </h1>
          </div>
          <Footer slide={slide} tone="dark" mode={mode} />
        </section>
      );
    case "people":
      return (
        <section className="sg sg--people" data-tone="light" aria-label={slide.title}>
          <h1 className="sg-title">{g.title}</h1>
          <div className="sg-card sg-people">
            <ul className="sg-people__grid">
              {g.people.map((p) => (
                <li key={p.name} className="sg-person">
                  <span className="sg-person__avatar" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.photo ? <img className="sg-person__photo" src={p.photo} alt="" width={96} height={96} decoding="async" /> : (p.initials ?? p.name.slice(0, 1))}
                  </span>
                  <span className="sg-person__text">
                    <span className="sg-person__name">{p.name}</span>
                    <span className="sg-person__role">{p.role}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <Footer slide={slide} tone="light" mode={mode} />
        </section>
      );
    case "closing":
      return <ClosingSlide slide={slide} content={g} mode={mode} />;
  }
}
