"use client";

import { useEffect } from "react";
import { usePresenter } from "../../lib/presenter/context";

/** Tells the presenter provider which slide this page rendered, so it can follow the shared state. */
export function RenderedSlide({ id }: { id: string }) {
  const presenter = usePresenter();
  const setRenderedSlide = presenter?.setRenderedSlide;
  useEffect(() => {
    setRenderedSlide?.(id);
  }, [id, setRenderedSlide]);
  return null;
}
