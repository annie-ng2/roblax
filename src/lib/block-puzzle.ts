// Pure game rules for the 10×10 block puzzle. No DOM or React here, so the
// rules can be unit tested and the UI can never disagree with them about where a piece fits.

export const BOARD_SIZE = 10;
export const TRAY_SIZE = 3;

export type Cell = readonly [row: number, col: number];

/** Each value is a colour key; null is an empty cell. */
export type Board = (string | null)[][];

export type ShapeKind = "line" | "square" | "L" | "J" | "T" | "S";

export type Shape = {
  id: string;
  kind: ShapeKind;
  color: string;
  /** Cells relative to the shape's top-left corner; min row and min col are both 0. */
  cells: Cell[];
  rows: number;
  cols: number;
};

export type Piece = Shape & { key: string };

function shape(id: string, kind: ShapeKind, color: string, rows: string[]): Shape {
  const cells: Cell[] = [];
  rows.forEach((line, r) => [...line].forEach((ch, c) => ch === "#" && cells.push([r, c])));
  return { id, kind, color, cells, rows: rows.length, cols: Math.max(...rows.map((l) => l.length)) };
}

// Rotations are listed explicitly so every orientation is easy to read and check.
export const SHAPES: Shape[] = [
  shape("I2h", "line", "sky", ["##"]),
  shape("I2v", "line", "sky", ["#", "#"]),
  shape("I3h", "line", "cyan", ["###"]),
  shape("I3v", "line", "cyan", ["#", "#", "#"]),
  shape("I4h", "line", "blue", ["####"]),
  shape("I4v", "line", "blue", ["#", "#", "#", "#"]),
  shape("O2", "square", "amber", ["##", "##"]),
  shape("O3", "square", "rose", ["###", "###", "###"]),
  shape("L0", "L", "orange", ["#.", "#.", "##"]),
  shape("L1", "L", "orange", ["###", "#.."]),
  shape("L2", "L", "orange", ["##", ".#", ".#"]),
  shape("L3", "L", "orange", ["..#", "###"]),
  shape("J0", "J", "indigo", [".#", ".#", "##"]),
  shape("J1", "J", "indigo", ["#..", "###"]),
  shape("J2", "J", "indigo", ["##", "#.", "#."]),
  shape("J3", "J", "indigo", ["###", "..#"]),
  shape("T0", "T", "violet", ["###", ".#."]),
  shape("T1", "T", "violet", [".#", "##", ".#"]),
  shape("T2", "T", "violet", [".#.", "###"]),
  shape("T3", "T", "violet", ["#.", "##", "#."]),
  shape("S0", "S", "emerald", [".##", "##."]),
  shape("S1", "S", "emerald", ["#.", "##", ".#"]),
];

// Each kind is equally likely, then each orientation within it, so the many L/J/T
// rotations do not crowd out lines and squares.
const KINDS: ShapeKind[] = ["line", "square", "L", "J", "T", "S"];

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array<string | null>(BOARD_SIZE).fill(null));
}

export function randomShape(rng: () => number = Math.random): Shape {
  const kind = KINDS[Math.floor(rng() * KINDS.length)];
  const options = SHAPES.filter((s) => s.kind === kind);
  return options[Math.floor(rng() * options.length)];
}

let pieceCounter = 0;

/**
 * Three new pieces. When the board is crowded, retries a few times so that at least one
 * piece fits (if any shape can), which avoids a game over that the player could not affect.
 */
export function dealTray(board: Board, rng: () => number = Math.random): Piece[] {
  let shapes: Shape[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    shapes = Array.from({ length: TRAY_SIZE }, () => randomShape(rng));
    if (shapes.some((s) => canPlaceAnywhere(board, s))) break;
  }
  return shapes.map((s) => ({ ...s, key: `${s.id}-${++pieceCounter}` }));
}

export function canPlace(board: Board, s: Shape, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row + s.rows > BOARD_SIZE || col + s.cols > BOARD_SIZE) return false;
  return s.cells.every(([r, c]) => board[row + r][col + c] === null);
}

export function canPlaceAnywhere(board: Board, s: Shape): boolean {
  for (let r = 0; r + s.rows <= BOARD_SIZE; r++) {
    for (let c = 0; c + s.cols <= BOARD_SIZE; c++) if (canPlace(board, s, r, c)) return true;
  }
  return false;
}

export type PlaceResult = {
  board: Board;
  /** Cells that were removed, with the colour they had, for the clear animation. */
  cleared: { row: number; col: number; color: string }[];
  rows: number[];
  cols: number[];
  points: number;
};

/**
 * Places a shape and clears every full row and column at once (a cell where a full row
 * and a full column cross counts for both). Returns null when the placement is invalid.
 * `combo` is how many placements in a row (before this one) cleared lines.
 */
export function place(board: Board, s: Shape, row: number, col: number, combo = 0): PlaceResult | null {
  if (!canPlace(board, s, row, col)) return null;
  const next = board.map((r) => [...r]);
  for (const [r, c] of s.cells) next[row + r][col + c] = s.color;

  const rows: number[] = [];
  const cols: number[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (next[i].every((v) => v !== null)) rows.push(i);
    if (next.every((r) => r[i] !== null)) cols.push(i);
  }

  const cleared: PlaceResult["cleared"] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if ((rows.includes(r) || cols.includes(c)) && next[r][c] !== null) {
        cleared.push({ row: r, col: c, color: next[r][c]! });
        next[r][c] = null;
      }
    }
  }

  return { board: next, cleared, rows, cols, points: score(s.cells.length, rows.length + cols.length, combo) };
}

/** One point per placed cell; lines score 10, 30, 60, 100… and a combo streak multiplies them. */
export function score(cells: number, lines: number, combo = 0): number {
  if (lines === 0) return cells;
  return cells + ((10 * lines * (lines + 1)) / 2) * (1 + combo);
}

/**
 * Board cell under a dragged piece. `x`/`y` are the piece's top-left corner relative to
 * the board's grid origin, `pitch` is the size of one cell in the same units. Rounding to
 * the nearest cell means the preview and the drop always land on the same, closest cell.
 */
export function snapToCell(x: number, y: number, pitch: number): { row: number; col: number } {
  return { row: Math.round(y / pitch), col: Math.round(x / pitch) };
}
