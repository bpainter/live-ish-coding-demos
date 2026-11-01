import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeo, type OgFile } from "../src/lib/seo-core";
import { SHARE_CARD, drawable, shareCardFacts, shareCardVersion } from "../src/lib/share-card";
import { shareCardImage } from "../src/lib/share-card-image";
import { RESERVED_ROUTES } from "../src/lib/validate/rules/frames";
import type { AssembledDeck } from "../src/schema/assemble";
import { fixture } from "./validate-fixture";

/** The fixture deck, assembled. */
async function assembled(): Promise<AssembledDeck> {
  const f = fixture();
  let deck: AssembledDeck | undefined;
  try {
    await f.check({ tamper: (d) => (deck = d) });
  } finally {
    f.done();
  }
  return deck!;
}

const SITE = "https://talk.example.com";
const CAPTURE: OgFile = { hash: "abcdef0123456789", width: 1200, height: 630 };

/** Every network address `next/og` asks for while `run` works. It answers none of them. */
async function requests(run: () => Promise<unknown>): Promise<string[]> {
  const asked: string[] = [];
  const real = globalThis.fetch;
  const log = console.error;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    // The renderer loads its own WASM through `fetch` on a `data:` address, which is no request.
    if (String(input).startsWith("data:")) return real(input, init);
    asked.push(String(input));
    throw new Error("no network");
  }) as typeof fetch;
  // `next/og` logs a failed font load, which is the point of the trap.
  console.error = () => undefined;
  try {
    await run().catch(() => undefined);
  } finally {
    globalThis.fetch = real;
    console.error = log;
  }
  return asked;
}

const png = async (res: Response) => Buffer.from(await res.arrayBuffer());

test("a deck with no capture gets the default card, sized for a large preview", async () => {
  const deck = await assembled();
  const { OG_IMAGE, baseMetadata } = createSeo(deck, SITE, null);
  assert.equal(OG_IMAGE?.path, `${SHARE_CARD.path}?v=${shareCardVersion(deck.deck)}`);
  assert.equal(OG_IMAGE?.type, "image/png");
  assert.equal(OG_IMAGE?.alt, `Cover slide: ${deck.deck.title}. ${deck.deck.speaker.name}.`);
  const meta = baseMetadata();
  assert.equal((meta.twitter as { card: string }).card, "summary_large_image");
  const [image] = meta.openGraph?.images as { width: number; height: number }[];
  assert.deepEqual([image.width, image.height], [1200, 630]);
});

test("a capture from `live-ish og` wins over the default card", async () => {
  const { OG_IMAGE } = createSeo(await assembled(), SITE, CAPTURE);
  assert.equal(OG_IMAGE?.path, "/live-ish/og/cover.jpg?v=abcdef01");
});

test("a build with no site names no image, because it has no address to put in a card", async () => {
  const deck = await assembled();
  const { OG_IMAGE, baseMetadata, talkJsonLd } = createSeo(deck, "", null);
  assert.equal(OG_IMAGE, null);
  assert.equal((baseMetadata().twitter as { card: string }).card, "summary");
  assert.equal(JSON.stringify(talkJsonLd()).includes(SHARE_CARD.path), false);
});

test("the card's version moves with what it shows, and not with anything else", async () => {
  const { deck } = await assembled();
  const version = shareCardVersion(deck);
  assert.equal(shareCardVersion({ ...deck, description: "Another description." }), version);
  assert.notEqual(shareCardVersion({ ...deck, title: "Another title" }), version);
  assert.notEqual(shareCardVersion({ ...deck, speaker: { ...deck.speaker, name: "Someone Else" } }), version);
  assert.notEqual(shareCardVersion({ ...deck, theme: { ...deck.theme, tokens: { "--deck-paper": "#000000" } } }), version);
});

test("the card's colors come from the deck, and a value the renderer can't read falls back", async () => {
  const { deck } = await assembled();
  assert.equal(shareCardFacts({ ...deck, theme: { ...deck.theme, tokens: { "--deck-paper": "#112233" } } }).paper, "#112233");
  assert.equal(shareCardFacts({ ...deck, theme: { ...deck.theme, tokens: { "--deck-paper": "var(--nope)" } } }).paper, shareCardFacts(deck).paper);
});

test("the card sits under a reserved address, so a demo route can't hide it", () => {
  assert.ok(RESERVED_ROUTES.some((r) => SHARE_CARD.path.startsWith(`${r}/`)));
});

test("drawable text: symbols leave, and a line that would lose a letter goes whole", () => {
  assert.equal(drawable("Show the code"), "Show the code");
  assert.equal(drawable("Crème brûlée, Привет, Việt"), "Crème brûlée, Привет, Việt");
  assert.equal(drawable("Crème"), "Crème");
  assert.equal(drawable("Ship it 🎉"), "Ship it");
  assert.equal(drawable("Ship 🎉 it"), "Ship it");
  assert.equal(drawable("日本語のデッキ"), "");
  assert.equal(drawable("Half 日本語"), "");
  assert.equal(drawable("  two\n lines "), "two lines");
});

test("the card is a 1200 by 630 PNG, drawn with no browser", async () => {
  const { deck } = await assembled();
  const image = await png(shareCardImage(shareCardFacts(deck)));
  assert.equal(image.subarray(1, 4).toString("latin1"), "PNG");
  assert.equal(image.readUInt32BE(16), SHARE_CARD.width);
  assert.equal(image.readUInt32BE(20), SHARE_CARD.height);
});

test("a title with no drawable text still gets a card", async () => {
  const { deck } = await assembled();
  const image = await png(shareCardImage(shareCardFacts({ ...deck, title: "日本語のデッキ", speaker: { ...deck.speaker, name: "山田" } })));
  assert.equal(image.readUInt32BE(16), SHARE_CARD.width);
});

test("the card reaches for no network, whatever the deck's text", async () => {
  const { deck } = await assembled();
  // Every character the card claims to draw, so a font change in Next fails here.
  const claimed = [...new Set(Array.from({ length: 0x2200 }, (_, i) => drawable(String.fromCodePoint(i))))].join("");
  assert.ok(claimed.length > 500, `${claimed.length} characters`);
  const facts = shareCardFacts(deck);
  assert.deepEqual(await requests(() => png(shareCardImage({ ...facts, title: claimed }))), []);
  for (const title of ["Ship it 🎉", "日本語のデッキ", "مرحبا", "Half 日本語"]) {
    assert.deepEqual(await requests(() => png(shareCardImage(shareCardFacts({ ...deck, title })))), [], title);
  }
});

test("the network trap is real: text outside the list does reach for a font", async () => {
  const { deck } = await assembled();
  const asked = await requests(() => png(shareCardImage({ ...shareCardFacts(deck), title: "日本語のデッキ" })));
  assert.ok(asked.some((url) => url.includes("fonts.googleapis.com")), asked.join(" "));
});
