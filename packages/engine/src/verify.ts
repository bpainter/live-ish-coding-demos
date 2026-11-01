/**
 * What `@live-ish/verify` reads from the engine. It is one package with the engine in practice, kept
 * apart so a deck that never runs a walk never installs a browser. Not part of the public API.
 */
export { keyHelpFor } from "./lib/keys";
export { firstPoster, type ImageManifest } from "./lib/assets";
export { posterMatchesTheme, posterThemeInput, posterUrl } from "./lib/posters";
export { flagsAt } from "./lib/engine/steps";
export { frameQuery, flagsQuery } from "./lib/frames/origins";
export { MANIFEST_FILE, POSTERS_FILE, jpegSize, posterInputHash, type PosterRecord } from "./lib/validate/assets";
export { OG_IMAGE_FILE, OG_META_FILE, ogHash, ogInputs, type OgMeta } from "./lib/validate/seo";
export { runChecks } from "./lib/validate";
export { encodeImages } from "./cli/commands/images";
export { prepareDeck, writeDeckModule } from "./prepare";
export { assembleDeck, DeckError, type AssembledDeck, type DeckInput } from "./schema/assemble";
export { isBackgroundFile } from "./schema/backgrounds";
export { SPLITS, hasFrame, type Action, type Demo, type DemoCodeFile, type DemoPage, type FramePage, type IntroPage, type Step } from "./schema/demo";
export type { Slide } from "./schema/slide";
