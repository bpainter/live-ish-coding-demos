import type { Slide } from "../../schema/slide";
import { imageSrc } from "../../lib/images";

interface Props {
  slide: Slide;
  variant: "full-bleed" | "right-half" | "background";
}

/** The slide's image: a plain file under public/, or a URL. `alt` is required on every `image`. */
export function SlideImage({ slide, variant }: Props) {
  const image = slide.image;
  if (!image) return null;
  const src = imageSrc(image.src);
  if (!src) return null;
  // The runtime optimizer is off: a deck's images are plain files, or encoded ahead of time.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="slide-image" data-variant={variant} src={src} alt={variant === "background" ? "" : image.alt} />;
}
