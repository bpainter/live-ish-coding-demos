import type { Mode } from "../../lib/mode";
import { deck, outboundHref } from "../../lib/content";
import { NewTabLink } from "./NewTabLink";

/** `theme.brand`: the deck's wordmark, a link when it has a url. Renders nothing without one. */
export function Wordmark({ mode, className = "sg-wordmark" }: { mode: Mode; className?: string }) {
  const brand = deck.theme.brand;
  if (!brand) return null;
  return (
    <p className={className}>
      {brand.url ? (
        <NewTabLink href={outboundHref(brand.url)} mode={mode} label={brand.text}>
          {brand.text}
        </NewTabLink>
      ) : (
        brand.text
      )}
    </p>
  );
}
