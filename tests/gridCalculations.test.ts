import { test } from "node:test";
import assert from "node:assert";
import {
  calculateGridPosition,
  calculateGridContentDimensions,
  computeGridBands,
  findItemIdAtCell,
  getGridBandFromY,
  getGridBandTop,
  getGridCellFromCoordinates,
  getGridItemColumnSpan,
  getGridItemHeight,
  getGridItemRowSpan,
  getGridItemSpanHeight,
  getGridItemSpanWidth,
  listToGridObject,
  reorderGridInsert,
  reorderGridSwap,
  setGridPosition,
} from "../utils/gridCalculations";
import { GridOrientation, GridStrategy } from "../types/grid";
import type { GridPositions } from "../types/grid";

const BASE = {
  columns: 3,
  rows: 2,
  itemWidth: 100,
  itemHeight: 80,
  rowGap: 10,
  columnGap: 10,
};

function makeList(ids: string[]) {
  return ids.map((id) => ({ id }));
}

function mockSharedValue<T>(value: T): { value: T } {
  return { value };
}

test("uniform heights keep legacy geometry (backward compat)", () => {
  for (let i = 0; i < 6; i++) {
    const pos = calculateGridPosition(i, BASE, GridOrientation.Vertical);
    assert.deepStrictEqual(pos, {
      index: i,
      row: Math.floor(i / 3),
      column: i % 3,
      x: (i % 3) * 110,
      y: Math.floor(i / 3) * 90,
    });
  }
});

test("banded layout sizes rows to their tallest item", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );

  // Band 0 = max(80, 80, 160) = 160, band 1 = max(80, 80) = 80
  assert.strictEqual(positions.a.y, 0);
  assert.strictEqual(positions.tall.y, 0);
  assert.strictEqual(positions.d.y, 170);
  assert.strictEqual(positions.e.y, 170);

  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);
  assert.deepStrictEqual(bands, [160, 80]);
});

test("content dimensions sum band heights", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );
  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);

  const { width, height } = calculateGridContentDimensions(
    5,
    dims,
    GridOrientation.Vertical,
    bands
  );
  assert.strictEqual(width, 3 * 100 + 2 * 10);
  assert.strictEqual(height, 160 + 80 + 10);
});

test("hit testing resolves rows against variable bands", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );
  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);

  // y=100 is inside band 0 ([0, 170)) -> index 1
  assert.strictEqual(
    getGridCellFromCoordinates(120, 100, dims, GridOrientation.Vertical, 5, bands)
      .index,
    1
  );
  // Gap below band 0 belongs to band 0
  assert.strictEqual(
    getGridCellFromCoordinates(120, 165, dims, GridOrientation.Vertical, 5, bands)
      .index,
    1
  );
  // y=200 is inside band 1 ([170, 260)) -> index 4
  assert.strictEqual(
    getGridCellFromCoordinates(120, 200, dims, GridOrientation.Vertical, 5, bands)
      .index,
    4
  );
  // Beyond the last band clamps to it
  assert.strictEqual(getGridBandFromY(10000, bands, 10), 1);
});

test("insert reordering re-lays out against the new band heights", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );

  // Move "d" (index 3) to index 0: new order d, a, b, tall, e
  const moved = reorderGridInsert(positions, "d", 0, dims, GridOrientation.Vertical);

  assert.strictEqual(moved.d.index, 0);
  assert.strictEqual(moved.d.y, 0);
  assert.strictEqual(moved.a.y, 0);
  assert.strictEqual(moved.b.y, 0);
  // Band 0 = max(80, 80, 80) = 80, so tall/e land at y = 80 + gap
  assert.strictEqual(moved.tall.index, 3);
  assert.strictEqual(moved.tall.y, 90);
  assert.strictEqual(moved.e.y, 90);

  const bands = computeGridBands(moved, dims, GridOrientation.Vertical, 5);
  assert.deepStrictEqual(bands, [80, 160]);
});

test("swap reordering recomputes band heights", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );

  const swapped = reorderGridSwap(positions, "tall", "d", dims, GridOrientation.Vertical);

  assert.strictEqual(swapped.d.index, 2);
  assert.strictEqual(swapped.d.y, 0);
  assert.strictEqual(swapped.tall.index, 3);
  assert.strictEqual(swapped.tall.y, 90);

  const bands = computeGridBands(swapped, dims, GridOrientation.Vertical, 5);
  assert.deepStrictEqual(bands, [80, 160]);
});

test("reordering is a no-op when the index is unchanged", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );
  assert.strictEqual(
    reorderGridInsert(positions, "a", 0, dims, GridOrientation.Vertical),
    positions
  );
});

test("setGridPosition hit tests with scroll and reorders (insert)", () => {
  const dims = { ...BASE, itemHeights: { tall: 160 } };
  const positions = listToGridObject(
    makeList(["a", "b", "tall", "d", "e"]),
    dims,
    GridOrientation.Vertical
  );
  const sv = mockSharedValue<GridPositions>(positions);

  // Drag "e" (index 4) over slot index 2, with scroll offset applied
  setGridPosition(
    220,
    -50,
    0,
    50,
    5,
    sv as any,
    "e",
    dims,
    GridOrientation.Vertical,
    GridStrategy.Insert
  );

  const after = sv.value;
  // New order: a, b, e, tall, d
  assert.strictEqual(after.e.index, 2);
  assert.strictEqual(after.tall.index, 3);
  assert.strictEqual(after.tall.y, 90);
  assert.strictEqual(after.d.index, 4);
  assert.strictEqual(after.d.y, 90);
});

test("horizontal grids band by the fixed rows", () => {
  const dims = {
    columns: 2,
    rows: 2,
    itemWidth: 100,
    itemHeight: 80,
    rowGap: 10,
    columnGap: 10,
    itemHeights: { b: 160 },
  };
  const positions = listToGridObject(
    makeList(["a", "b", "c", "d"]),
    dims,
    GridOrientation.Horizontal
  );

  // Band 0 = indices 0,2 -> max(80, 80) = 80; band 1 = indices 1,3 -> 160
  assert.strictEqual(positions.a.y, 0);
  assert.strictEqual(positions.b.y, 90);
  assert.strictEqual(positions.c.x, 110);
  assert.strictEqual(positions.c.y, 0);
  assert.strictEqual(positions.d.y, 90);

  const bands = computeGridBands(positions, dims, GridOrientation.Horizontal, 4);
  assert.deepStrictEqual(bands, [80, 160]);

  const { width, height } = calculateGridContentDimensions(
    4,
    dims,
    GridOrientation.Horizontal,
    bands
  );
  assert.strictEqual(width, 2 * 100 + 10);
  assert.strictEqual(height, 80 + 160 + 10);
});

test("empty horizontal bands keep the default slot height", () => {
  const positions = listToGridObject(
    makeList(["a"]),
    BASE,
    GridOrientation.Horizontal
  );
  // BASE.rows = 2: band 0 holds the item, band 1 is empty and keeps itemHeight
  const bands = computeGridBands(positions, BASE, GridOrientation.Horizontal, 1);
  assert.deepStrictEqual(bands, [80, 80]);

  const { height } = calculateGridContentDimensions(
    1,
    BASE,
    GridOrientation.Horizontal,
    bands
  );
  assert.strictEqual(height, 2 * 80 + 10);
});

test("item height helpers", () => {
  const dims = { ...BASE, itemHeights: { tall: 160, zero: 0 } };
  assert.strictEqual(getGridItemHeight("tall", dims), 160);
  assert.strictEqual(getGridItemHeight("missing", dims), 80);
  assert.strictEqual(getGridItemHeight("zero", dims), 80);
});

test("row span helper", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2, big: 5, zero: 0 } };
  assert.strictEqual(getGridItemRowSpan("t", dims), 2);
  assert.strictEqual(getGridItemRowSpan("big", dims), 5);
  assert.strictEqual(getGridItemRowSpan("zero", dims), 1);
  assert.strictEqual(getGridItemRowSpan("missing", dims), 1);
});

test("row-span items claim a full column and shorts pack around them", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2 } };
  const positions = listToGridObject(
    makeList(["t", "a", "b", "c", "d"]),
    dims,
    GridOrientation.Vertical
  );

  // t spans (0,0)-(1,0); shorts fill the remaining cells row-major
  assert.strictEqual(positions.t.index, 0);
  assert.strictEqual(positions.a.index, 1);
  assert.strictEqual(positions.b.index, 2);
  assert.strictEqual(positions.c.index, 4);
  assert.strictEqual(positions.d.index, 5);
  assert.strictEqual(positions.c.row, 1);
  assert.strictEqual(positions.c.column, 1);
  assert.strictEqual(positions.d.column, 2);

  // Bands are sized by the shorts only — the span item derives its height
  // from the bands, never the reverse.
  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);
  assert.deepStrictEqual(bands, [80, 80]);

  assert.strictEqual(positions.t.y, 0);
  assert.strictEqual(positions.a.y, 0);
  assert.strictEqual(positions.c.y, 90);
  assert.strictEqual(positions.d.y, 90);
});

test("row-span items stretch to the bands they cover", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2 } };
  const positions = listToGridObject(
    makeList(["t", "a", "b", "c", "d"]),
    dims,
    GridOrientation.Vertical
  );
  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);

  assert.strictEqual(
    getGridItemSpanHeight("t", positions.t.row, bands, 10, dims),
    80 + 10 + 80
  );
  // Non-span items keep their own height
  assert.strictEqual(getGridItemSpanHeight("a", positions.a.row, bands, 10, dims), 80);
});

test("late span anchors to the top row and shorts flow beneath", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2 } };
  const positions = listToGridObject(
    makeList(["a", "b", "c", "d", "e", "t"]),
    dims,
    GridOrientation.Vertical
  );

  // t anchors to row 0 of its column (slot 5 -> column 2)
  assert.strictEqual(positions.t.row, 0);
  assert.strictEqual(positions.t.column, 2);
  // Shorts fill the remaining cells, flowing into a third row
  assert.strictEqual(positions.a.index, 0);
  assert.strictEqual(positions.b.index, 1);
  assert.strictEqual(positions.c.index, 3);
  assert.strictEqual(positions.d.index, 4);
  assert.strictEqual(positions.e.row, 2);

  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 6);
  assert.deepStrictEqual(bands, [80, 80, 80]);

  const { height } = calculateGridContentDimensions(
    6,
    dims,
    GridOrientation.Vertical,
    bands
  );
  assert.strictEqual(height, 3 * 80 + 2 * 10);
});

test("dragging a span low re-anchors it to the top with no orphan row", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2 } };
  const positions = listToGridObject(
    makeList(["1", "2", "3", "t", "4"]),
    dims,
    GridOrientation.Vertical
  );

  // [T][1][2] / [T][3][4] — nothing above the span, no dangling third row
  assert.strictEqual(positions.t.row, 0);
  assert.strictEqual(positions.t.column, 0);
  assert.strictEqual(positions["1"].index, 1);
  assert.strictEqual(positions["2"].index, 2);
  assert.strictEqual(positions["3"].index, 4);
  assert.strictEqual(positions["4"].index, 5);

  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);
  assert.strictEqual(bands.length, 2);
  assert.deepStrictEqual(bands, [80, 80]);

  const { height } = calculateGridContentDimensions(
    5,
    dims,
    GridOrientation.Vertical,
    bands
  );
  assert.strictEqual(height, 2 * 80 + 10);
});

test("insert reordering re-packs spans into a valid footprint", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2 } };
  const positions = listToGridObject(
    makeList(["t", "a", "b", "c", "d"]),
    dims,
    GridOrientation.Vertical
  );

  // Drag t onto a (index 1): t lands in column 1 spanning both rows
  const moved = reorderGridInsert(positions, "t", 1, dims, GridOrientation.Vertical);

  assert.strictEqual(moved.t.column, 1);
  assert.strictEqual(moved.t.row, 0);
  assert.strictEqual(moved.t.index, 1);
  // [a][t][b] / [c][t][d]
  assert.strictEqual(moved.a.index, 0);
  assert.strictEqual(moved.b.index, 2);
  assert.strictEqual(moved.c.index, 3);
  assert.strictEqual(moved.d.index, 5);
});

test("hit testing maps a span item's lower cell back to the span item", () => {
  const dims = { ...BASE, itemRowSpans: { t: 2 } };
  const positions = listToGridObject(
    makeList(["t", "a", "b", "c", "d"]),
    dims,
    GridOrientation.Vertical
  );

  // Cell (1,0) is covered by t's span (raw index 3 has no owner)
  assert.strictEqual(
    findItemIdAtCell(positions, 1, 0, dims, GridOrientation.Vertical),
    "t"
  );
  assert.strictEqual(
    findItemIdAtCell(positions, 0, 1, dims, GridOrientation.Vertical),
    "a"
  );

  // Dragging d over the lower half of t targets t, and d re-packs before it
  const sv = mockSharedValue<GridPositions>(positions);
  setGridPosition(
    0,
    90,
    0,
    0,
    5,
    sv as any,
    "d",
    dims,
    GridOrientation.Vertical,
    GridStrategy.Insert
  );
  assert.strictEqual(sv.value.d.index, 0);
  assert.strictEqual(sv.value.t.index, 1);
});

test("column span helper", () => {
  const dims = { ...BASE, itemColumnSpans: { w: 2, big: 9, zero: 0 } };
  assert.strictEqual(getGridItemColumnSpan("w", dims), 2);
  assert.strictEqual(getGridItemColumnSpan("zero", dims), 1);
  assert.strictEqual(getGridItemColumnSpan("missing", dims), 1);
});

test("column-span items claim adjacent cells in one row", () => {
  const dims = { ...BASE, itemColumnSpans: { w: 2 } };
  const positions = listToGridObject(
    makeList(["w", "a", "b", "c", "d"]),
    dims,
    GridOrientation.Vertical
  );

  // w takes (0,0)-(0,1); shorts fill the rest row-major
  assert.strictEqual(positions.w.index, 0);
  assert.strictEqual(positions.a.index, 2);
  assert.strictEqual(positions.b.index, 3);
  assert.strictEqual(positions.c.index, 4);
  assert.strictEqual(positions.d.index, 5);

  const bands = computeGridBands(positions, dims, GridOrientation.Vertical, 5);
  assert.deepStrictEqual(bands, [80, 80]);
});

test("column-span items wrap to the next row when they do not fit", () => {
  const dims = { ...BASE, itemColumnSpans: { w: 2 } };
  const positions = listToGridObject(
    makeList(["a", "b", "c", "w", "d"]),
    dims,
    GridOrientation.Vertical
  );

  // Row 0 fills with shorts; w wraps to (1,0)-(1,1); d takes (1,2)
  assert.strictEqual(positions.w.row, 1);
  assert.strictEqual(positions.w.column, 0);
  assert.strictEqual(positions.d.index, 5);
});

test("hit testing maps a column-span item's second cell back to it", () => {
  const dims = { ...BASE, itemColumnSpans: { w: 2 } };
  const positions = listToGridObject(
    makeList(["w", "a", "b", "c", "d"]),
    dims,
    GridOrientation.Vertical
  );

  assert.strictEqual(
    findItemIdAtCell(positions, 0, 1, dims, GridOrientation.Vertical),
    "w"
  );
  assert.strictEqual(
    findItemIdAtCell(positions, 0, 0, dims, GridOrientation.Vertical),
    "w"
  );
  assert.strictEqual(
    findItemIdAtCell(positions, 1, 0, dims, GridOrientation.Vertical),
    "b"
  );

  // Dragging d over w's right half targets w, and d re-packs before it
  const sv = mockSharedValue<GridPositions>(positions);
  setGridPosition(
    110,
    0,
    0,
    0,
    5,
    sv as any,
    "d",
    dims,
    GridOrientation.Vertical,
    GridStrategy.Insert
  );
  assert.strictEqual(sv.value.d.index, 0);
  assert.strictEqual(sv.value.w.index, 1);
});

test("span width helper", () => {
  const dims = { ...BASE, itemColumnSpans: { w: 2 } };
  assert.strictEqual(getGridItemSpanWidth("w", dims), 2 * 100 + 10);
  assert.strictEqual(getGridItemSpanWidth("a", dims), 100);
});

test("band geometry helpers", () => {
  assert.strictEqual(getGridBandTop(0, [160, 80], 10), 0);
  assert.strictEqual(getGridBandTop(1, [160, 80], 10), 170);
  assert.strictEqual(getGridBandTop(2, [160, 80], 10), 260);
  assert.strictEqual(getGridBandFromY(0, [160, 80], 10), 0);
  assert.strictEqual(getGridBandFromY(170, [160, 80], 10), 1);
  assert.strictEqual(getGridBandFromY(-5, [160, 80], 10), 0);
});
