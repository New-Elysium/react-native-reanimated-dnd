import { test } from "node:test";
import assert from "node:assert";
import {
  calculateGridPosition,
  calculateGridContentDimensions,
  computeGridBands,
  getGridBandFromY,
  getGridBandTop,
  getGridCellFromCoordinates,
  getGridItemHeight,
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

test("band geometry helpers", () => {
  assert.strictEqual(getGridBandTop(0, [160, 80], 10), 0);
  assert.strictEqual(getGridBandTop(1, [160, 80], 10), 170);
  assert.strictEqual(getGridBandTop(2, [160, 80], 10), 260);
  assert.strictEqual(getGridBandFromY(0, [160, 80], 10), 0);
  assert.strictEqual(getGridBandFromY(170, [160, 80], 10), 1);
  assert.strictEqual(getGridBandFromY(-5, [160, 80], 10), 0);
});
