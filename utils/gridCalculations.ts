import { SharedValue } from "react-native-reanimated";
import {
  GridPosition,
  GridPositions,
  GridDimensions,
  GridOrientation,
  GridStrategy,
  GridScrollDirection,
} from "../types/grid";
import { SortableData } from "../types/sortable";

/**
 * Items without an entry in `dimensions.itemHeights` fall back to `itemHeight`.
 */
export function getGridItemHeight(
  itemId: string,
  dimensions: GridDimensions
): number {
  "worklet";

  const customHeight = dimensions.itemHeights
    ? dimensions.itemHeights[itemId]
    : undefined;

  return customHeight !== undefined && customHeight > 0
    ? customHeight
    : dimensions.itemHeight;
}

/**
 * Row-band heights for an id -> index assignment: each band (vertical:
 * floor(index / columns), horizontal: index % rows) is sized to its tallest
 * item. Single source of truth for variable-height geometry.
 */
export function computeGridBandHeights(
  indexById: { [id: string]: number },
  dimensions: GridDimensions,
  orientation: GridOrientation,
  itemsCount: number
): number[] {
  "worklet";

  const { columns = 3, rows = 3, itemHeight } = dimensions;

  const bandCount =
    orientation === GridOrientation.Vertical
      ? Math.ceil(itemsCount / columns)
      : rows;

  const bandHeights: number[] = [];
  for (let band = 0; band < bandCount; band++) {
    bandHeights.push(0);
  }

  for (const id in indexById) {
    const index = indexById[id];
    if (index < 0 || index >= itemsCount) {
      continue;
    }
    const band =
      orientation === GridOrientation.Vertical
        ? Math.floor(index / columns)
        : index % rows;
    const height = getGridItemHeight(id, dimensions);
    if (height > bandHeights[band]) {
      bandHeights[band] = height;
    }
  }

  // Empty bands (fewer items than fixed rows) keep the default slot height
  for (let band = 0; band < bandCount; band++) {
    if (bandHeights[band] <= 0) {
      bandHeights[band] = itemHeight;
    }
  }

  return bandHeights;
}

/**
 * Row-band heights for the live positions object.
 */
export function computeGridBands(
  positions: GridPositions,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  itemsCount: number
): number[] {
  "worklet";

  const indexById: { [id: string]: number } = {};
  for (const id in positions) {
    indexById[id] = positions[id].index;
  }

  return computeGridBandHeights(indexById, dimensions, orientation, itemsCount);
}

/**
 * Y offset of a band, summing the variable heights of all preceding bands.
 */
export function getGridBandTop(
  band: number,
  bandHeights: number[],
  rowGap: number
): number {
  "worklet";

  let top = 0;
  for (let b = 0; b < band && b < bandHeights.length; b++) {
    top += bandHeights[b] + rowGap;
  }
  return top;
}

/**
 * Band containing y. The rowGap below a band belongs to it, matching the
 * uniform `floor(y / (itemHeight + rowGap))` behavior.
 */
export function getGridBandFromY(
  y: number,
  bandHeights: number[],
  rowGap: number
): number {
  "worklet";

  if (bandHeights.length === 0) {
    return 0;
  }

  let top = 0;
  for (let band = 0; band < bandHeights.length; band++) {
    const bandEnd = top + bandHeights[band] + rowGap;
    if (y < bandEnd || band === bandHeights.length - 1) {
      return band;
    }
    top = bandEnd;
  }
  return bandHeights.length - 1;
}

/**
 * Calculate grid position from linear index
 */
export function calculateGridPosition(
  index: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  bandHeights?: number[]
): GridPosition {
  "worklet";

  const {
    columns = 3,
    rows = 3,
    itemWidth,
    itemHeight,
    rowGap = 0,
    columnGap = 0,
  } = dimensions;

  let row: number;
  let column: number;

  if (orientation === GridOrientation.Vertical) {
    // Vertical grid: fixed columns, flow top to bottom, left to right
    row = Math.floor(index / columns);
    column = index % columns;
  } else {
    // Horizontal grid: fixed rows, flow left to right, top to bottom
    column = Math.floor(index / rows);
    row = index % rows;
  }

  const x = column * (itemWidth + columnGap);
  const y = bandHeights
    ? getGridBandTop(row, bandHeights, rowGap)
    : row * (itemHeight + rowGap);

  return {
    index,
    row,
    column,
    x,
    y,
  };
}

/**
 * Calculate linear index from row and column
 */
export function calculateIndexFromRowColumn(
  row: number,
  column: number,
  dimensions: GridDimensions,
  orientation: GridOrientation
): number {
  "worklet";

  const { columns = 3, rows = 3 } = dimensions;

  if (orientation === GridOrientation.Vertical) {
    return row * columns + column;
  } else {
    return column * rows + row;
  }
}

/**
 * Convert data array to grid positions object
 */
export function listToGridObject<T extends SortableData>(
  list: T[],
  dimensions: GridDimensions,
  orientation: GridOrientation
): GridPositions {
  const indexById: { [id: string]: number } = {};
  for (let i = 0; i < list.length; i++) {
    indexById[list[i].id] = i;
  }

  const bandHeights = computeGridBandHeights(
    indexById,
    dimensions,
    orientation,
    list.length
  );

  const positions: GridPositions = {};
  for (let i = 0; i < list.length; i++) {
    positions[list[i].id] = calculateGridPosition(
      i,
      dimensions,
      orientation,
      bandHeights
    );
  }

  return positions;
}

/**
 * Clamp value between bounds
 */
export function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.max(min, Math.min(value, max));
}

/**
 * Calculate which grid cell contains the given coordinates
 */
export function getGridCellFromCoordinates(
  x: number,
  y: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  totalItems: number,
  bandHeights?: number[]
): { row: number; column: number; index: number } {
  "worklet";

  const {
    itemWidth,
    itemHeight,
    rowGap = 0,
    columnGap = 0,
  } = dimensions;

  // Calculate which column and row the coordinates fall into
  const column = Math.floor(x / (itemWidth + columnGap));
  const row = bandHeights
    ? getGridBandFromY(y, bandHeights, rowGap)
    : Math.floor(y / (itemHeight + rowGap));

  // Calculate the linear index
  const index = calculateIndexFromRowColumn(row, column, dimensions, orientation);

  // Clamp to valid range
  const clampedIndex = clamp(index, 0, totalItems - 1);
  const clampedPosition = calculateGridPosition(
    clampedIndex,
    dimensions,
    orientation,
    bandHeights
  );

  return {
    row: clampedPosition.row,
    column: clampedPosition.column,
    index: clampedIndex,
  };
}

/**
 * Reorder grid positions using insert strategy.
 * Slot indices shift first, then all items are re-laid out against band
 * heights derived from the NEW assignment.
 */
export function reorderGridInsert(
  positions: GridPositions,
  activeId: string,
  targetIndex: number,
  dimensions: GridDimensions,
  orientation: GridOrientation
): GridPositions {
  "worklet";

  const activePosition = positions[activeId];
  if (!activePosition) {
    return positions;
  }
  const fromIndex = activePosition.index;

  if (fromIndex === targetIndex) {
    return positions;
  }

  const movingUp = targetIndex < fromIndex;

  // Reassign positions
  let itemsCount = 0;
  const indexById: { [id: string]: number } = {};
  for (const id in positions) {
    const currentIndex = positions[id].index;

    if (id === activeId) {
      // Move the active item to target
      indexById[id] = targetIndex;
    } else if (movingUp && currentIndex >= targetIndex && currentIndex < fromIndex) {
      // Shift items down (increase index by 1)
      indexById[id] = currentIndex + 1;
    } else if (!movingUp && currentIndex <= targetIndex && currentIndex > fromIndex) {
      // Shift items up (decrease index by 1)
      indexById[id] = currentIndex - 1;
    } else {
      // Keep the same position
      indexById[id] = currentIndex;
    }
    itemsCount++;
  }

  const bandHeights = computeGridBandHeights(
    indexById,
    dimensions,
    orientation,
    itemsCount
  );

  const newPositions: GridPositions = {};
  for (const id in indexById) {
    newPositions[id] = calculateGridPosition(
      indexById[id],
      dimensions,
      orientation,
      bandHeights
    );
  }

  return newPositions;
}

/**
 * Reorder grid positions using swap strategy.
 * Band heights are recomputed after the exchange since items change rows.
 */
export function reorderGridSwap(
  positions: GridPositions,
  activeId: string,
  targetId: string,
  dimensions: GridDimensions,
  orientation: GridOrientation
): GridPositions {
  "worklet";

  const activePosition = positions[activeId];
  const targetPosition = positions[targetId];
  if (!activePosition || !targetPosition) {
    return positions;
  }

  const activeIndex = activePosition.index;
  const targetIndex = targetPosition.index;
  if (activeIndex === targetIndex) {
    return positions;
  }

  let itemsCount = 0;
  const indexById: { [id: string]: number } = {};
  for (const id in positions) {
    indexById[id] = positions[id].index;
    itemsCount++;
  }
  indexById[activeId] = targetIndex;
  indexById[targetId] = activeIndex;

  const bandHeights = computeGridBandHeights(
    indexById,
    dimensions,
    orientation,
    itemsCount
  );

  const newPositions: GridPositions = {};
  for (const id in indexById) {
    newPositions[id] = calculateGridPosition(
      indexById[id],
      dimensions,
      orientation,
      bandHeights
    );
  }

  return newPositions;
}

/**
 * Update grid positions based on drag position.
 * Hit testing uses pre-reorder band geometry; reordering re-lays out.
 */
export function setGridPosition(
  x: number,
  y: number,
  scrollX: number,
  scrollY: number,
  itemsCount: number,
  positions: SharedValue<GridPositions>,
  id: string,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  strategy: GridStrategy
): void {
  "worklet";

  // Adjust coordinates for scroll offset
  const adjustedX = x + scrollX;
  const adjustedY = y + scrollY;

  const bandHeights = computeGridBands(
    positions.value,
    dimensions,
    orientation,
    itemsCount
  );

  // Get target cell
  const targetCell = getGridCellFromCoordinates(
    adjustedX,
    adjustedY,
    dimensions,
    orientation,
    itemsCount,
    bandHeights
  );

  const currentIndex = positions.value[id].index;

  if (targetCell.index === currentIndex) {
    return;
  }

  // Find the ID of the item at the target position
  let targetId: string | null = null;
  for (const itemId in positions.value) {
    if (positions.value[itemId].index === targetCell.index) {
      targetId = itemId;
      break;
    }
  }

  // Apply reordering strategy
  if (strategy === GridStrategy.Insert) {
    positions.value = reorderGridInsert(
      positions.value,
      id,
      targetCell.index,
      dimensions,
      orientation
    );
  } else if (strategy === GridStrategy.Swap && targetId) {
    positions.value = reorderGridSwap(
      positions.value,
      id,
      targetId,
      dimensions,
      orientation
    );
  }
}

/**
 * Calculate total content dimensions for the grid
 */
export function calculateGridContentDimensions(
  itemsCount: number,
  dimensions: GridDimensions,
  orientation: GridOrientation,
  bandHeights?: number[]
): { width: number; height: number } {
  "worklet";

  const {
    columns = 3,
    rows = 3,
    itemWidth,
    itemHeight,
    rowGap = 0,
    columnGap = 0,
  } = dimensions;

  if (orientation === GridOrientation.Vertical) {
    // Calculate number of rows needed
    const totalRows = Math.ceil(itemsCount / columns);
    const width = columns * itemWidth + (columns - 1) * columnGap;
    const height =
      bandHeights && bandHeights.length > 0
        ? sumBandHeights(bandHeights) + (bandHeights.length - 1) * rowGap
        : totalRows * itemHeight + (totalRows - 1) * rowGap;
    return { width, height };
  } else {
    // Calculate number of columns needed
    const totalColumns = Math.ceil(itemsCount / rows);
    const width = totalColumns * itemWidth + (totalColumns - 1) * columnGap;
    const height =
      bandHeights && bandHeights.length > 0
        ? sumBandHeights(bandHeights) + (bandHeights.length - 1) * rowGap
        : rows * itemHeight + (rows - 1) * rowGap;
    return { width, height };
  }
}

function sumBandHeights(bandHeights: number[]): number {
  "worklet";
  let total = 0;
  for (let i = 0; i < bandHeights.length; i++) {
    total += bandHeights[i];
  }
  return total;
}

/**
 * Determine auto-scroll direction based on drag position
 */
export function setGridAutoScroll(
  x: number,
  y: number,
  scrollX: number,
  scrollY: number,
  containerWidth: number,
  containerHeight: number,
  scrollThreshold: number,
  autoScrollDirection: SharedValue<GridScrollDirection>
): void {
  "worklet";

  const leftBound = scrollX;
  const rightBound = scrollX + containerWidth;
  const topBound = scrollY;
  const bottomBound = scrollY + containerHeight;

  const isNearLeft = x < leftBound + scrollThreshold;
  const isNearRight = x > rightBound - scrollThreshold;
  const isNearTop = y < topBound + scrollThreshold;
  const isNearBottom = y > bottomBound - scrollThreshold;

  // Determine direction (including corners for diagonal scrolling)
  if (isNearTop && isNearLeft) {
    autoScrollDirection.value = GridScrollDirection.UpLeft;
  } else if (isNearTop && isNearRight) {
    autoScrollDirection.value = GridScrollDirection.UpRight;
  } else if (isNearBottom && isNearLeft) {
    autoScrollDirection.value = GridScrollDirection.DownLeft;
  } else if (isNearBottom && isNearRight) {
    autoScrollDirection.value = GridScrollDirection.DownRight;
  } else if (isNearTop) {
    autoScrollDirection.value = GridScrollDirection.Up;
  } else if (isNearBottom) {
    autoScrollDirection.value = GridScrollDirection.Down;
  } else if (isNearLeft) {
    autoScrollDirection.value = GridScrollDirection.Left;
  } else if (isNearRight) {
    autoScrollDirection.value = GridScrollDirection.Right;
  } else {
    autoScrollDirection.value = GridScrollDirection.None;
  }
}

/**
 * Find item ID at a given index
 */
export function findItemIdAtIndex(
  positions: GridPositions,
  index: number
): string | null {
  "worklet";

  for (const id in positions) {
    if (positions[id].index === index) {
      return id;
    }
  }

  return null;
}
