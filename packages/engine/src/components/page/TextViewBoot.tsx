"use client";

import { useSyncExternalStore } from "react";
import { TEXT_VIEW_BOOT } from "../../lib/text-view";

const noop = () => () => {};

/**
 * The text view's boot script: it applies the session's "Text view" choice
 * before the stage paints. Only the server's HTML needs it, and it is kept while that HTML
 * hydrates (the server snapshot). A client render, after a slide change, renders nothing: React
 * never executes a script it inserts, and the attribute on `<html>` outlives the move anyway.
 */
export function TextViewBoot() {
  const fromServer = useSyncExternalStore(
    noop,
    () => false,
    () => true,
  );
  // eslint-disable-next-line react/no-danger -- a fixed one-line script from lib/text-view.ts, no user input.
  return fromServer ? <script dangerouslySetInnerHTML={{ __html: TEXT_VIEW_BOOT }} /> : null;
}
