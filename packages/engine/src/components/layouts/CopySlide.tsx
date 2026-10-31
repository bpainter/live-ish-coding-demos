import { createElement } from "react";
import type { CopyContent, Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { deck, outboundHref } from "../../lib/content";
import { pictureSources } from "../../lib/assets";
import { ClosingSlide } from "./ClosingSlide";
import { iconByName } from "./icon";
import { NewTabLink } from "./NewTabLink";
import { SlideShell, SlideTitle } from "./SlideShell";
import { Wordmark } from "./Wordmark";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

function Icon({ name, size }: { name?: string; size: number }) {
  const icon = iconByName(name);
  return icon ? createElement(icon, { size, strokeWidth: 1.75, className: "card__icon", "aria-hidden": true }) : null;
}

/** A card's image: AVIF with a WebP fallback once encoded, else the file. */
function Portrait({ src, alt }: { src: string; alt: string }) {
  const p = pictureSources(src, 512);
  return (
    // display: contents keeps the card's layout on the <img>.
    <picture style={{ display: "contents" }}>
      {p.sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes={p.sizes} />
      ))}
      <img className="card__portrait" src={p.src} srcSet={p.srcSet} sizes={p.sizes} alt={alt} width={512} height={300} />
    </picture>
  );
}

/** The longest line decides the display size, so a long title fills the slide without wrapping. */
function displayFit(lines: string[]): "lg" | "md" | "sm" {
  const longest = Math.max(...lines.map((l) => l.length));
  return longest <= 16 ? "lg" : longest <= 22 ? "md" : "sm";
}

/**
 * The composed copy layouts: the slide's background comes from the stage, and these draw type and
 * rules with the deck's tokens only.
 */
export function CopySlide({ slide, total, mode }: Props) {
  const g = slide.copy as CopyContent | undefined;
  if (!g) throw new Error(`Slide ${slide.id} has layout ${slide.layout} but no content for it`);
  const shell = { slide, total, mode };
  switch (g.kind) {
    case "title":
      return (
        <SlideShell {...shell} noHeader footer={false}>
          {g.eyebrow ? <p className="slide__eyebrow cover__slug">{g.eyebrow}</p> : null}
          <span className="slide__stroke" aria-hidden="true" />
          <h1 className="cover__display" id="slide-title" tabIndex={-1} data-fit={displayFit(g.lines)}>
            {g.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </h1>
          {/* The name and role come from the deck config, shared with the closing and the metadata. */}
          <div className="cover__byline">
            <p className="cover__name">
              {deck.speaker.url ? (
                <NewTabLink href={outboundHref(deck.speaker.url, slide.id)} mode={mode} rel="me noopener">
                  {deck.speaker.name}
                </NewTabLink>
              ) : (
                deck.speaker.name
              )}
            </p>
            {deck.role ? <p className="cover__role">{deck.role}</p> : null}
            <Wordmark mode={mode} />
          </div>
        </SlideShell>
      );
    case "grid":
      return (
        <SlideShell {...shell} noHeader data={{ "data-variant": g.variant, "data-align": g.align, "data-cards": g.cards.length }}>
          {g.eyebrow ? <p className="slide__eyebrow">{g.eyebrow}</p> : null}
          {g.display ? (
            <h1 className="slide__display" id="slide-title" tabIndex={-1}>
              {g.display}
            </h1>
          ) : null}
          {g.title ? <SlideTitle>{g.title}</SlideTitle> : null}
          {g.lede ? <p className="slide__lede">{g.lede}</p> : null}
          {g.cardsEyebrow ? <p className="cards__eyebrow">{g.cardsEyebrow}</p> : null}
          <ul className="cards" data-count={g.cards.length}>
            {g.cards.map((c) => (
              <li key={c.title} className="card">
                {c.image ? <Portrait src={c.image.src} alt={c.image.alt} /> : null}
                {c.num ? <p className="card__num">{c.num}</p> : null}
                <Icon name={c.icon} size={g.cards.length === 6 ? 40 : 48} />
                <div className="card__text">
                  <p className="card__title">{c.title}</p>
                  {c.body ? <p className="card__body">{c.body}</p> : null}
                </div>
                {c.question ? <p className="card__question">{c.question}</p> : null}
              </li>
            ))}
          </ul>
        </SlideShell>
      );
    case "quotes":
      return (
        <SlideShell {...shell}>
          <div className="quotes" data-count={g.quotes.length}>
            {g.quotes.map((q) => (
              <figure key={q.cite} className="quote">
                <blockquote className="quote__text">{q.text}</blockquote>
                <figcaption className="quote__cite">{q.cite}</figcaption>
              </figure>
            ))}
          </div>
        </SlideShell>
      );
    case "statement":
      return (
        <SlideShell {...shell} noHeader>
          <span className="slide__stroke" aria-hidden="true" />
          <h1 className="statement__lines" id="slide-title" tabIndex={-1}>
            {g.lines.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </h1>
        </SlideShell>
      );
    case "people":
      return (
        <SlideShell {...shell}>
          <ul className="people">
            {g.people.map((p) => (
              <li key={p.name} className="person">
                <span className="person__avatar" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.photo ? <img className="person__photo" src={p.photo} alt="" width={96} height={96} decoding="async" /> : (p.initials ?? p.name.slice(0, 1))}
                </span>
                <span className="person__text">
                  <span className="person__name">{p.name}</span>
                  <span className="person__role">{p.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </SlideShell>
      );
    case "closing":
      return <ClosingSlide {...shell} content={g} />;
  }
}
