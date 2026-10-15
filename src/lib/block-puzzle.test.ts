import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOARD_SIZE,
  SHAPES,
  canPlace,
  canPlaceAnywhere,
  dealTray,
  emptyBoard,
  place,
  score,
  snapToCell,
  type Board,
} from "./block-puzzle";

const byId = (id: string) => SHAPES.find((s) => s.id === id)!;

test("shapes are normalised and cover every required kind", () => {
  for (const s of SHAPES) {
    assert.equal(Math.min(...s.cells.map(([r]) => r)), 0, s.id);
    assert.equal(Math.min(...s.cells.map(([, c]) => c)), 0, s.id);
    assert.equal(Math.max(...s.cells.map(([r]) => r)) + 1, s.rows, s.id);
    assert.equal(Math.max(...s.cells.map(([, c]) => c)) + 1, s.cols, s.id);
  }
  assert.deepEqual(new Set(SHAPES.map((s) => s.kind)), new Set(["line", "square", "L", "J", "T", "S"]));
  assert.deepEqual(
    SHAPES.filter((s) => s.kind === "line").map((s) => s.cells.length).sort(),
    [2, 2, 3, 3, 4, 4],
  );
  assert.equal(byId("O2").cells.length, 4);
  assert.equal(byId("O3").cells.length, 9);
});

test("pieces must stay inside the board and off filled cells", () => {
  const board = emptyBoard();
  const i4 = byId("I4h");
  assert.ok(canPlace(board, i4, 0, 6));
  assert.ok(!canPlace(board, i4, 0, 7));
  assert.ok(!canPlace(board, i4, -1, 0));
  board[0][8] = "sky";
  assert.ok(!canPlace(board, i4, 0, 6));
  // The empty corner of an L may sit on a filled cell.
  const l = byId("L0");
  board[5][6] = "sky";
  assert.ok(canPlace(board, l, 5, 5));
});

test("full rows and columns clear together and score once per cell", () => {
  const board: Board = emptyBoard();
  for (let c = 0; c < BOARD_SIZE; c++) if (c !== 0) board[9][c] = "blue";
  for (let r = 0; r < BOARD_SIZE; r++) if (r < 8) board[r][0] = "blue";
  const result = place(board, byId("I2v"), 8, 0)!;
  assert.deepEqual(result.rows, [9]);
  assert.deepEqual(result.cols, [0]);
  assert.equal(result.cleared.length, 19);
  assert.ok(result.board.every((row) => row.every((v) => v === null)));
  assert.equal(result.points, score(2, 2));
  assert.equal(board[9][1], "blue", "input board is not mutated");
});

test("invalid placement returns null", () => {
  assert.equal(place(emptyBoard(), byId("O3"), 8, 8), null);
});

test("scoring rewards several lines and combos", () => {
  assert.equal(score(4, 0), 4);
  assert.equal(score(4, 1), 14);
  assert.equal(score(4, 2), 34);
  assert.equal(score(4, 1, 2), 34);
});

test("game over is detected when no shape fits", () => {
  const full: Board = emptyBoard().map((row) => row.map(() => "rose"));
  assert.ok(!canPlaceAnywhere(full, byId("I2h")));
  full[3][3] = null;
  full[3][4] = null;
  assert.ok(canPlaceAnywhere(full, byId("I2h")));
  assert.ok(!canPlaceAnywhere(full, byId("I2v")));
});

test("dealing prefers a tray where something fits", () => {
  const board: Board = emptyBoard().map((row) => row.map(() => "rose"));
  board[0][0] = null;
  board[0][1] = null;
  // Kind index 0 (line) then orientation 0 (I2h): fits the two-cell gap.
  const seq = [0.9, 0, 0.9, 0, 0.9, 0, 0, 0, 0, 0, 0, 0];
  let i = 0;
  const tray = dealTray(board, () => seq[i++ % seq.length]);
  assert.equal(tray.length, 3);
  assert.ok(tray.some((p) => canPlaceAnywhere(board, p)));
  assert.equal(new Set(tray.map((p) => p.key)).size, 3);
});

test("snapping picks the nearest cell regardless of cell size", () => {
  assert.deepEqual(snapToCell(0, 0, 40), { row: 0, col: 0 });
  assert.deepEqual(snapToCell(19, 21, 40), { row: 1, col: 0 });
  assert.deepEqual(snapToCell(-21, 99, 40), { row: 2, col: -1 });
  // Same relative position on a board half the size gives the same cell.
  assert.deepEqual(snapToCell(130, 70, 40), snapToCell(65, 35, 20));
});
