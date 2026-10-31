import type { Slide } from "../../schema/slide";
import type { Mode } from "../../lib/mode";
import { ChartSlide } from "../layouts/ChartSlide";
import { ComparisonSlide } from "../layouts/ComparisonSlide";
import { ContentSlide } from "../layouts/ContentSlide";
import { CopySlide } from "../layouts/CopySlide";
import { ImageLedSlide } from "../layouts/ImageLedSlide";
import { SectionSlide } from "../layouts/SectionSlide";
import { StatSlide } from "../layouts/StatSlide";
import { TableSlide } from "../layouts/TableSlide";
import { TimelineSlide } from "../layouts/TimelineSlide";
import { DemoPageSlide } from "../page/DemoPageSlide";

interface Props {
  slide: Slide;
  total: number;
  mode: Mode;
}

/** Picks the layout component from `slide.layout`; a new Layout value is a type error until handled. */
export function SlideRouter(props: Props) {
  switch (props.slide.layout) {
    case "content":
      return <ContentSlide {...props} />;
    case "title":
    case "closing":
    case "grid":
    case "quotes":
    case "statement":
    case "people":
      return <CopySlide {...props} />;
    case "stat":
      return <StatSlide {...props} />;
    case "comparison":
      return <ComparisonSlide {...props} />;
    case "timeline":
      return <TimelineSlide {...props} />;
    case "table":
      return <TableSlide {...props} />;
    case "chart":
      return <ChartSlide {...props} />;
    case "image":
      return <ImageLedSlide {...props} />;
    case "section":
      return <SectionSlide {...props} />;
    case "demo-page":
      return <DemoPageSlide {...props} />;
    default: {
      const exhaustive: never = props.slide.layout;
      throw new Error(`Unhandled layout ${String(exhaustive)}`);
    }
  }
}
