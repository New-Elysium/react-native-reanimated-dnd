import type { ScrollViewProps } from "react-native";

/**
 * Props for a provider-aware scroll view that keeps drag/drop measurements in
 * sync and can scroll when a draggable approaches an edge.
 */
export interface DropScrollViewProps extends ScrollViewProps {
  /**
   * Automatically scroll while the active draggable is near a viewport edge.
   *
   * @default true
   */
  autoScroll?: boolean;

  /**
   * Distance from an edge, in points, that starts auto-scrolling.
   *
   * @default 56
   */
  autoScrollThreshold?: number;

  /**
   * Points scrolled for each drag update while inside the edge threshold.
   *
   * @default 14
   */
  autoScrollStep?: number;
}
