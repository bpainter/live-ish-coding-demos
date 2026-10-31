import type { NextConfig } from "next";
import type { Provider } from "./hosting.cjs";

export interface WithDeckOptions {
  /** The deck folder. Defaults to the working directory. */
  root?: string;
  /** Provider preset. Defaults to the provider a build detects from its environment. */
  provider?: Provider;
  /** Next config merged under what the deck owns. */
  next?: NextConfig;
}

export function withDeck(options?: WithDeckOptions): NextConfig;
