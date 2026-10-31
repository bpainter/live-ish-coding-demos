import type { NextConfig } from "next";

export interface WithDeckOptions {
  /** The deck folder. Defaults to the working directory. */
  root?: string;
  /** Next config merged under what the deck owns. */
  next?: NextConfig;
}

export function withDeck(options?: WithDeckOptions): NextConfig;
