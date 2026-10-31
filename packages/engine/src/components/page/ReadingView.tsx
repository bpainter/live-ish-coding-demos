import { existsSync, readFileSync } from "node:fs";
import type { ReactNode } from "react";
import type { CopyContent, Slide } from "../../schema/slide";
import { hasFrame, type Demo, type DemoCodeFile, type FramePage, type IntroPage } from "../../schema/demo";
import { deck, outboundHref } from "../../lib/content";
import { fromDeck } from "../../lib/paths";
import { hostOf } from "../../lib/text";
import { posterUrl } from "../../lib/posters";
import { elisionLines, lineSet } from "../../lib/excerpt";
import { firstPoster, introImage, pictureSources } from "../../lib/assets";
import { supportEntry } from "../../lib/support";
import { meterValue } from "../../lib/meters";
import { lineRuns, stepCodeSentence } from "../../lib/code-description";
import { NewTabLink } from "../layouts/NewTabLink";
import { NotesInlineText, NotesText } from "../presenter/NotesText";

/**
 * The reader's text view of a slide. The stage is a
 * fixed 1920 by 1080 canvas scaled to the window, so its text can't be resized and is 4 px on a
 * phone. This is the same slide as normal HTML at real sizes: it reflows, zooms and reads in
 * order. It shows instead of the stage below 900 px wide or 500 px tall, or when the reader turns
 * on "Text view" (styles/components/reading-view.css). It is rendered by the reader routes only,
 * never in the audience or speaker windows, and it reads content without changing it.
 *
 * Code is plain text here, not highlighted: smaller pages, and nothing to keep in step with the
 * stage's colors. Speaker notes show only when the deck turns on `reader.notes`.
 */
export function ReadingView({ slide, total }: { slide: Slide; total: number }) {
  return (
    <main className="reading-view" aria-labelledby="reading-view-title">
      <article className="reading-view__slide">
        <p className="reading-view__position">
          Slide {slide.index} of {total}
        </p>
        <SlideText slide={slide} />
        <Notes slide={slide} />
      </article>
    </main>
  );
}

function H1({ children }: { children: ReactNode }) {
  return (
    <h1 className="reading-view__title" id="reading-view-title">
      {children}
    </h1>
  );
}

function SlideText({ slide }: { slide: Slide }) {
  if (slide.copy) return <CopyText slide={slide} g={slide.copy} />;
  const page = slide.page;
  const demo = slide.demo;
  if (page && demo) return hasFrame(page) ? <WalkText page={page} demo={demo} /> : <IntroText demo={demo} page={page} />;
  return (
    <>
      <H1>{slide.title}</H1>
      {slide.eyebrow ? <p className="reading-view__eyebrow">{slide.eyebrow}</p> : null}
      {slide.body?.map((b) => (
        <p key={b}>{b}</p>
      ))}
      {slide.items?.length || slide.legend?.length ? (
        <ul>
          {(slide.legend ?? slide.items)!.map((item) => (
            <li key={item.label}>
              <strong>{item.label}</strong>
              {item.detail ? `: ${item.detail}` : null}
            </li>
          ))}
        </ul>
      ) : null}
      {slide.stats?.length ? (
        <ul className="reading-view__stats">
          {slide.stats.map((s) => (
            <li key={s.value + s.label}>
              <strong>{s.value}</strong> {s.label}
              {s.source ? ` (${hostOf(s.source)})` : null}
            </li>
          ))}
        </ul>
      ) : null}
      <DataTable slide={slide} />
      <ChartTable slide={slide} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {slide.image ? <img className="reading-view__image" src={slide.image.src} alt={slide.image.alt} loading="lazy" decoding="async" /> : null}
    </>
  );
}

/** A `table` slide as a real table. */
function DataTable({ slide }: { slide: Slide }) {
  const rows = slide.tableRows;
  if (!rows?.length) return null;
  return (
    <div className="reading-view__table">
      <table>
        <caption className="visually-hidden">{slide.title}</caption>
        {slide.tableColumns?.length ? (
          <thead>
            <tr>
              {slide.tableColumns.map((c) => (
                <th scope="col" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row) => (
            <tr key={row.cells.join("|")}>
              {row.cells.map((cell, i) => (i === 0 ? <th scope="row" key={i}>{cell}</th> : <td key={i}>{cell}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A `chart` slide's data: the numbers carry the slide, so the text view keeps them all. */
function ChartTable({ slide }: { slide: Slide }) {
  const chart = slide.chart;
  if (!chart) return null;
  const bar = chart.kind === "bar";
  return (
    <div className="reading-view__table">
      <table>
        <caption className="visually-hidden">{slide.title}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            {bar ? null : <th scope="col">{chart.xLabel}</th>}
            <th scope="col">{chart.yLabel}</th>
          </tr>
        </thead>
        <tbody>
          {chart.points.map((p) => (
            <tr key={p.label}>
              <th scope="row">{p.label}</th>
              {bar ? null : <td>{p.x}</td>}
              <td>{p.y}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CopyText({ slide, g }: { slide: Slide; g: CopyContent }) {
  switch (g.kind) {
    case "title":
      return (
        <>
          {g.eyebrow ? <p className="reading-view__eyebrow">{g.eyebrow}</p> : null}
          <H1>{g.lines.join(" ")}</H1>
          <p>
            {deck.speaker.url ? (
              <NewTabLink href={outboundHref(deck.speaker.url, slide.id)} mode="reader" rel="me noopener">
                {deck.speaker.name}
              </NewTabLink>
            ) : (
              deck.speaker.name
            )}
            {deck.role ? `, ${deck.role}` : null}
          </p>
        </>
      );
    case "grid":
      return (
        <>
          {g.eyebrow ? <p className="reading-view__eyebrow">{g.eyebrow}</p> : null}
          <H1>{g.title ?? g.display ?? slide.title}</H1>
          {g.title && g.display ? <p className="reading-view__lede">{g.display}</p> : null}
          {g.lede ? <p className="reading-view__lede">{g.lede}</p> : null}
          {g.cardsEyebrow ? <h2>{g.cardsEyebrow}</h2> : null}
          <ul className="reading-view__cards">
            {g.cards.map((c) => (
              <li key={c.title} className="reading-view__card">
                {c.image ? <Portrait src={c.image.src} alt={c.image.alt} /> : null}
                <p className="reading-view__card-title">
                  {c.num ? <span className="reading-view__num">{c.num} </span> : null}
                  {c.title}
                </p>
                {c.body ? <p>{c.body}</p> : null}
                {c.question ? <p className="reading-view__question">{c.question}</p> : null}
              </li>
            ))}
          </ul>
        </>
      );
    case "quotes":
      return (
        <>
          <H1>{g.title}</H1>
          {g.quotes.map((q) => (
            <figure key={q.cite} className="reading-view__quote">
              <blockquote>
                <p>{q.text}</p>
              </blockquote>
              <figcaption>{q.cite}</figcaption>
            </figure>
          ))}
        </>
      );
    case "statement":
      return <H1>{g.lines.join(" ")}</H1>;
    case "people":
      return (
        <>
          <H1>{g.title}</H1>
          <ul className="reading-view__people">
            {g.people.map((p) => (
              <li key={p.name}>
                <span className="reading-view__card-title">{p.name}</span>, {p.role}
              </li>
            ))}
          </ul>
        </>
      );
    case "closing":
      return (
        <>
          {g.eyebrow ? <p className="reading-view__eyebrow">{g.eyebrow}</p> : null}
          <H1>{g.name}</H1>
          {g.role ? <p>{g.role}</p> : null}
          {g.url ? (
            <p>
              <NewTabLink href={outboundHref(g.url, slide.id)} mode="reader" rel="me noopener">
                {g.link}
              </NewTabLink>
            </p>
          ) : null}
        </>
      );
  }
}

function Portrait({ src, alt }: { src: string; alt: string }) {
  const p = pictureSources(src, 512);
  return (
    <picture>
      {p.sources.map((s) => (
        <source key={s.type} type={s.type} srcSet={s.srcSet} sizes="(max-width: 640px) 100vw, 512px" />
      ))}
      {/* Prebuilt AVIF and WebP; next/image adds nothing here. */}
      <img className="reading-view__image reading-view__image--portrait" src={p.src} srcSet={p.srcSet} sizes="(max-width: 640px) 100vw, 512px" alt={alt} width={512} height={512} loading="lazy" decoding="async" />
    </picture>
  );
}

function IntroText({ demo, page }: { demo: Omit<Demo, "routes">; page: IntroPage }) {
  const support = supportEntry(demo.id);
  const still = page.visual ? introImage(page.visual.src) : null;
  return (
    <>
      {demo.chip ? <p className="reading-view__eyebrow">{demo.chip}</p> : null}
      <H1>{demo.title}</H1>
      <p className="reading-view__lede">
        {page.description} {support?.since ?? ""}
      </p>
      {support ? (
        <ul className="reading-view__support" aria-label={support.kind === "tooling" ? "Tool versions" : "Browser support"}>
          {support.tiles.map((t) => (
            <li key={t.id}>
              {t.name}: {t.version ?? "not yet"}
            </li>
          ))}
        </ul>
      ) : null}
      {support?.alsoUses ? <p>{support.alsoUses}</p> : null}
      {still ? (
        <picture>
          {still.avifSrcSet ? <source type="image/avif" srcSet={still.avifSrcSet} sizes="(max-width: 720px) 100vw, 720px" /> : null}
          <img className="reading-view__image" src={still.src} srcSet={still.webpSrcSet || undefined} sizes="(max-width: 720px) 100vw, 720px" width={still.width} height={still.height} alt={page.visual?.alt} loading="lazy" decoding="async" />
        </picture>
      ) : null}
    </>
  );
}

/** The page's files as shown on the stage, with their elision lines (as DemoPageSlide computes them). */
function shownFiles(page: FramePage): (DemoCodeFile & { elisions: number[] })[] {
  return page.files.map((f) => {
    const ex = f.excerptOf;
    const abs = ex ? fromDeck(ex.path) : null;
    const total = abs && existsSync(/*turbopackIgnore: true*/ abs) ? readFileSync(/*turbopackIgnore: true*/ abs, "utf8").replace(/\n$/, "").split("\n").length : 0;
    return { ...f, elisions: ex ? elisionLines(ex.ranges, total) : [] };
  });
}

function WalkText({ page, demo }: { page: FramePage; demo: Omit<Demo, "routes"> }) {
  const files = shownFiles(page);
  const eyebrow = page.beat === "single" ? null : page.eyebrow;
  const meterStep = [...page.steps].reverse().find((s) => s.meter);
  return (
    <>
      <H1>
        {eyebrow ? <span className="reading-view__eyebrow reading-view__eyebrow--title">{eyebrow}: </span> : null}
        {page.title}
      </H1>
      {page.beat === "single" && page.badge ? <p className="reading-view__lede">{page.badge.text}</p> : null}
      {meterStep?.meter ? (
        <p className="reading-view__meter">
          {meterStep.meter.label}: <strong>{meterValue(demo.id, meterStep.meter.source) ?? meterStep.meter.value}</strong>
        </p>
      ) : null}
      <h2>Steps</h2>
      <ol className="reading-view__steps">
        {page.steps.map((step) => {
          const file = files.find((f) => f.file === step.code?.file);
          const sentence = stepCodeSentence(step.code, file?.elisions);
          const skip = new Set(file?.elisions ?? []);
          const runs = file && step.code && !step.code.off ? lineRuns([...lineSet(step.code.lines)].filter((n) => !skip.has(n))) : [];
          const source = file ? file.source.split("\n") : [];
          const poster = firstPoster(step.poster, posterUrl(page, step.id, page.chrome), page.frame.poster);
          return (
            <li key={step.id} className="reading-view__step">
              <h3>{step.label}</h3>
              {sentence ? <p>{sentence}</p> : null}
              {runs.length ? (
                <pre className="reading-view__code" aria-label={`Highlighted lines of ${file!.file}`} tabIndex={0}>
                  <code>
                    {runs.map(([a, b], i) => (
                      <span key={a}>
                        {i > 0 ? <span className="reading-view__gap" aria-hidden="true">{"…\n"}</span> : null}
                        {source.slice(a - 1, b).join("\n")}
                        {"\n"}
                      </span>
                    ))}
                  </code>
                </pre>
              ) : null}
              {poster ? (
                // A captured still of the step, served as AVIF; the text view mounts no live frame.
                // eslint-disable-next-line @next/next/no-img-element
                <img className="reading-view__image" src={poster} alt={`Captured still of the live demo: ${step.label}`} width={page.frame.viewport.width} height={page.frame.viewport.height} loading="lazy" decoding="async" />
              ) : null}
            </li>
          );
        })}
      </ol>
      {files.length ? (
        <>
          <h2>Code</h2>
          {files.map((f) => (
            <section key={f.file} className="reading-view__file" aria-labelledby={`reading-view-file-${f.file.replace(/[^a-z0-9]+/gi, "-")}`}>
              <h3 id={`reading-view-file-${f.file.replace(/[^a-z0-9]+/gi, "-")}`}>{f.file}</h3>
              <pre className="reading-view__code" tabIndex={0} aria-label={f.file}>
                <code>{f.source}</code>
              </pre>
            </section>
          ))}
        </>
      ) : null}
    </>
  );
}

/** The speaker notes, as the speaker window shows them: the page's opening notes and each step's paragraphs, or the slide's notes. */
function Notes({ slide }: { slide: Slide }) {
  if (!deck.reader.notes) return null;
  const page = slide.page;
  const demo = slide.demo;
  const steps = page?.steps.filter((s) => s.notes.length) ?? [];
  const cautions = page?.beat === "after" && demo ? demo.cautions : [];
  const hasNotes = page ? Boolean(page.notes || steps.length || cautions.length) : Boolean(slide.notes);
  if (!hasNotes) return null;
  return (
    <section className="reading-view__notes" aria-labelledby="reading-view-notes">
      <h2 id="reading-view-notes">Speaker notes</h2>
      {page ? (
        <>
          {page.notes ? <NotesText text={page.notes} /> : null}
          {steps.map((s) => (
            <div key={s.id}>
              {page.steps.length > 1 ? <h3>{s.label}</h3> : null}
              <ul>
                {s.notes.map((b) => (
                  <li key={b}>
                    <NotesInlineText text={b} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {cautions.length ? (
            <>
              <h3>Cautions</h3>
              <ul>
                {cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <NotesText text={slide.notes} />
      )}
    </section>
  );
}
