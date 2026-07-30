import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface SortableBoardItem {
  id: string;
}

export interface SortableBoardColumn<TItem extends SortableBoardItem> {
  id: string;
  items: TItem[];
}

export interface SortableBoardMoveEvent<TItem extends SortableBoardItem> {
  item: TItem;
  fromColumnId: string;
  toColumnId: string;
  fromIndex: number;
  toIndex: number;
}

export interface SortableBoardRenderItemProps<TItem extends SortableBoardItem> {
  item: TItem;
  columnId: string;
  index: number;
  isDragging: boolean;
  isOverlay: boolean;
}

export interface SortableBoardProps<
  TItem extends SortableBoardItem,
  TColumn extends SortableBoardColumn<TItem>,
> {
  /** Controlled board columns and their ordered items. */
  columns: TColumn[];

  /** Render a card in its column and in the root-level drag overlay. */
  renderItem: (props: SortableBoardRenderItemProps<TItem>) => ReactNode;

  /** Called with the complete next board state after a valid move. */
  onChange: (columns: TColumn[], event: SortableBoardMoveEvent<TItem>) => void;

  /** Optional column header renderer. */
  renderColumnHeader?: (column: TColumn, index: number) => ReactNode;

  /** Content shown in an empty column. */
  renderEmptyColumn?: (column: TColumn, index: number) => ReactNode;

  /** Width of each column. @default 280 */
  columnWidth?: number;

  /** Horizontal gap between columns. @default 12 */
  columnGap?: number;

  /** Vertical gap between cards. @default 10 */
  itemGap?: number;

  /** Long-press delay before a card drag starts. @default 150 */
  activationDelay?: number;

  /** Enable edge auto-scroll for the board and its columns. @default true */
  autoScroll?: boolean;

  /** Edge distance that starts auto-scroll. @default 56 */
  autoScrollThreshold?: number;

  /** Points scrolled per active drag update. @default 14 */
  autoScrollStep?: number;

  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  columnStyle?: StyleProp<ViewStyle>;
  columnContentStyle?: StyleProp<ViewStyle>;
  itemContainerStyle?: StyleProp<ViewStyle>;
  activeItemContainerStyle?: StyleProp<ViewStyle>;
  activeDropStyle?: StyleProp<ViewStyle>;
  overlayStyle?: StyleProp<ViewStyle>;

  onDragStart?: (item: TItem, columnId: string, index: number) => void;
  onDragEnd?: (item: TItem) => void;
}
