"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  BOARD_SIZE,
  canPlace,
  canPlaceAnywhere,
  dealTray,
  emptyBoard,
  place,
  snapToCell,
  type Board,
  type Piece,
} from "@/lib/block-puzzle";
import "./block-puzzle.css";

const COLORS: Record<string, string> = {
  sky: "#38bdf8",
  cyan: "#22d3ee",
  blue: "#3b82f6",
  amber: "#fbbf24",
  rose: "#fb7185",
  orange: "#fb923c",
  indigo: "#818cf8",
  violet: "#c084fc",
  emerald: "#34d399",
};

const BEST_KEY = "block-puzzle-best";

type Game = { board: Board; tray: (Piece | null)[]; score: number; combo: number; over: boolean };

/** Where the dragged (or keyboard-moved) piece would land. `lines` holds r*10+c of cells a drop would clear. */
type Target = { row: number; col: number; valid: boolean; lines: Set<number> };

/** fx/fy: grab point inside the piece, in cells, so it stays correct when the cell size changes. */
type Drag = { index: number; pointerId: number; fx: number; fy: number; x: number; y: number; target: Target | null };

/** The board grid's top-left corner in viewport pixels and the size of one cell. */
type Geom = { left: number; top: number; pitch: number };

type Flash = { id: number; row: number; col: number; color: string };
type Popup = { id: number; row: number; col: number; text: string };

function newGame(): Game {
  const board = emptyBoard();
  return { board, tray: dealTray(board), score: 0, combo: 0, over: false };
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function targetAt(board: Board, piece: Piece, row: number, col: number): Target | null {
  if (row < 0 || col < 0 || row + piece.rows > BOARD_SIZE || col + piece.cols > BOARD_SIZE) return null;
  const lines = new Set<number>();
  const result = place(board, piece, row, col);
  if (result) for (const c of result.cleared) lines.add(c.row * BOARD_SIZE + c.col);
  return { row, col, valid: canPlace(board, piece, row, col), lines };
}

export default function BlockPuzzleGame() {
  // Rendered only on the client (see game-loader), so random pieces and localStorage are safe here.
  const [game, setGameState] = useState<Game>(newGame);
  const [best, setBest] = useState(readBest);
  const [drag, setDragState] = useState<Drag | null>(null);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [kb, setKb] = useState<{ index: number; row: number; col: number } | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [announce, setAnnounce] = useState("");

  // Window listeners read these instead of possibly stale state.
  const gameRef = useRef(game);
  const dragRef = useRef<Drag | null>(null);
  const geomRef = useRef<Geom | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const endDragRef = useRef<(() => void) | null>(null);

  const setGame = useCallback((g: Game) => {
    gameRef.current = g;
    setGameState(g);
  }, []);

  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);

  const computeDragTarget = useCallback((d: Drag, g: Geom): Target | null => {
    const piece = gameRef.current.tray[d.index];
    if (!piece) return null;
    // Top-left of the floating piece, exactly as it is drawn, relative to the grid origin.
    const x = d.x - d.fx * g.pitch - g.left;
    const y = d.y - d.fy * g.pitch - g.top;
    const { row, col } = snapToCell(x, y, g.pitch);
    return targetAt(gameRef.current.board, piece, row, col);
  }, []);

  // Re-measures the board. Called on resize, scroll, orientation change and drag start, so
  // switching e.g. 16:9 → 4:3 mid-drag keeps the piece, preview and drop on the same cells.
  const measure = useCallback(() => {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const g: Geom = { left: r.left, top: r.top, pitch: r.width / BOARD_SIZE };
    const prev = geomRef.current;
    if (!prev || prev.left !== g.left || prev.top !== g.top || prev.pitch !== g.pitch) {
      geomRef.current = g;
      setGeom(g);
      const d = dragRef.current;
      if (d) setDrag({ ...d, target: computeDragTarget(d, g) });
    }
    return g;
  }, [computeDragTarget, setDrag]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    ro.observe(document.documentElement);
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("orientationchange", onChange);
    window.visualViewport?.addEventListener("resize", onChange);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("orientationchange", onChange);
      window.visualViewport?.removeEventListener("resize", onChange);
      endDragRef.current?.();
    };
  }, [measure]);

  const commit = useCallback(
    (index: number, row: number, col: number) => {
      const g = gameRef.current;
      const piece = g.tray[index];
      if (!piece) return false;
      const result = place(g.board, piece, row, col, g.combo);
      if (!result) return false;

      const lines = result.rows.length + result.cols.length;
      let tray = g.tray.map((p, i) => (i === index ? null : p));
      if (tray.every((p) => p === null)) tray = dealTray(result.board);
      const over = !tray.some((p) => p && canPlaceAnywhere(result.board, p));
      const next: Game = {
        board: result.board,
        tray,
        score: g.score + result.points,
        combo: lines > 0 ? g.combo + 1 : 0,
        over,
      };
      setGame(next);
      if (next.score > readBest()) {
        setBest(next.score);
        try {
          localStorage.setItem(BEST_KEY, String(next.score));
        } catch {
          // Private mode: keep the best score for this visit only.
        }
      }

      if (result.cleared.length) {
        const added = result.cleared.map((c) => ({ ...c, id: ++idRef.current }));
        setFlashes((f) => [...f, ...added]);
        const ids = new Set(added.map((a) => a.id));
        setTimeout(() => setFlashes((f) => f.filter((x) => !ids.has(x.id))), 500);
      }
      const popup: Popup = {
        id: ++idRef.current,
        row: row + piece.rows / 2,
        col: col + piece.cols / 2,
        text: lines > 0 ? `+${result.points}${g.combo > 0 ? ` · Combo x${g.combo + 1}` : ""}` : `+${result.points}`,
      };
      setPopups((p) => [...p, popup]);
      setTimeout(() => setPopups((p) => p.filter((x) => x.id !== popup.id)), 900);

      setAnnounce(
        over
          ? `Hết nước đi. Điểm: ${next.score}.`
          : lines > 0
            ? `Xoá ${lines} hàng. Điểm: ${next.score}.`
            : `Đã đặt khối. Điểm: ${next.score}.`,
      );
      return true;
    },
    [setGame],
  );

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>, index: number) => {
    const piece = game.tray[index];
    if (game.over || !piece || !canPlaceAnywhere(game.board, piece)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (dragRef.current) return;
    e.preventDefault();
    setKb(null);
    const g = measure() ?? geomRef.current;
    if (!g) return;

    let fx: number;
    let fy: number;
    if (e.pointerType === "mouse") {
      // Keep the piece where it was grabbed.
      const r = e.currentTarget.getBoundingClientRect();
      fx = ((e.clientX - r.left) / r.width) * piece.cols;
      fy = ((e.clientY - r.top) / r.height) * piece.rows;
    } else {
      // Finger: centre the piece just above the touch point so it stays visible.
      fx = piece.cols / 2;
      fy = piece.rows + 0.6;
    }
    const d: Drag = { index, pointerId: e.pointerId, fx, fy, x: e.clientX, y: e.clientY, target: null };
    d.target = computeDragTarget(d, g);
    setDrag(d);

    const onMove = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      ev.preventDefault();
      const geomNow = geomRef.current;
      const moved = { ...cur, x: ev.clientX, y: ev.clientY };
      moved.target = geomNow ? computeDragTarget(moved, geomNow) : null;
      setDrag(moved);
    };
    const onUp = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || ev.pointerId !== cur.pointerId) return;
      // Drop on exactly the cell the preview shows; anything else returns the piece to its slot.
      const geomNow = measure() ?? geomRef.current;
      const final = geomNow ? computeDragTarget({ ...cur, x: ev.clientX, y: ev.clientY }, geomNow) : null;
      const t = final ?? cur.target;
      if (t?.valid) commit(cur.index, t.row, t.col);
      end();
    };
    const onCancel = (ev: PointerEvent) => {
      if (dragRef.current && ev.pointerId === dragRef.current.pointerId) end();
    };
    const end = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", end);
      endDragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", end);
    endDragRef.current = end;
  };

  // Keyboard play: Enter on a piece picks it, arrows move the preview, Enter places, Esc cancels.
  const pickWithKeyboard = (index: number) => {
    const piece = game.tray[index];
    if (game.over || !piece || !canPlaceAnywhere(game.board, piece)) return;
    setKb({
      index,
      row: Math.floor((BOARD_SIZE - piece.rows) / 2),
      col: Math.floor((BOARD_SIZE - piece.cols) / 2),
    });
    setAnnounce("Dùng phím mũi tên để di chuyển, Enter để đặt, Esc để huỷ.");
  };

  useEffect(() => {
    if (!kb) return;
    const onKey = (e: KeyboardEvent) => {
      const piece = gameRef.current.tray[kb.index];
      if (!piece) return setKb(null);
      const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (moves[e.key]) {
        e.preventDefault();
        const [dr, dc] = moves[e.key];
        setKb({
          ...kb,
          row: clamp(kb.row + dr, BOARD_SIZE - piece.rows),
          col: clamp(kb.col + dc, BOARD_SIZE - piece.cols),
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (commit(kb.index, kb.row, kb.col)) setKb(null);
        else setAnnounce("Không thể đặt ở đây.");
      } else if (e.key === "Escape") {
        setKb(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kb, commit]);

  const restart = () => {
    endDragRef.current?.();
    setKb(null);
    setFlashes([]);
    setPopups([]);
    setGame(newGame());
    setAnnounce("Ván mới.");
  };

  // What the board shows under the active piece.
  const activeIndex = drag?.index ?? kb?.index ?? null;
  const activePiece = activeIndex !== null ? game.tray[activeIndex] : null;
  const target: Target | null = drag ? drag.target : kb && activePiece ? targetAt(game.board, activePiece, kb.row, kb.col) : null;
  const ghost = new Map<number, boolean>();
  if (target && activePiece) {
    for (const [r, c] of activePiece.cells) ghost.set((target.row + r) * BOARD_SIZE + (target.col + c), target.valid);
  }
  const clearing = target?.valid ? target.lines : null;

  const dragPiece = drag ? game.tray[drag.index] : null;

  return (
    <div className={`bp-page ${drag ? "bp-dragging" : ""}`}>
      <div className="bp-layout">
        <section className="bp-boardColumn" aria-label="Bảng chơi">
          <header className="bp-header">
            <div className="bp-stat">
              <span className="bp-statLabel">Điểm</span>
              <span className="bp-statValue">{game.score}</span>
            </div>
            <div className="bp-stat">
              <span className="bp-statLabel">Kỷ lục</span>
              <span className="bp-statValue">{best}</span>
            </div>
            <button type="button" className="bp-restart" onClick={restart}>
              Chơi lại
            </button>
          </header>

          <div className="bp-board">
            <div ref={gridRef} className="bp-grid" role="grid" aria-label="Bảng 10×10" aria-rowcount={BOARD_SIZE}>
              {game.board.map((row, r) =>
                row.map((color, c) => {
                  const i = r * BOARD_SIZE + c;
                  const g = ghost.get(i);
                  const tileColor = color ?? (g !== undefined && activePiece ? activePiece.color : null);
                  const cls = [
                    "bp-cell",
                    color ? "bp-filled" : "",
                    !color && g === true ? "bp-ghost" : "",
                    g === false ? "bp-blocked" : "",
                    clearing?.has(i) ? "bp-willClear" : "",
                  ].join(" ");
                  return (
                    <div key={i} className={cls} style={tileColor ? ({ "--c": COLORS[tileColor] } as CSSProperties) : undefined}>
                      {(color || g !== undefined) && <span className="bp-tile" />}
                    </div>
                  );
                }),
              )}
              {flashes.map((f) => (
                <span
                  key={f.id}
                  className="bp-flash"
                  style={{ "--c": COLORS[f.color], left: `${f.col * 10}%`, top: `${f.row * 10}%` } as CSSProperties}
                />
              ))}
              {popups.map((p) => (
                <span key={p.id} className="bp-popup" style={{ left: `${p.col * 10}%`, top: `${p.row * 10}%` }}>
                  {p.text}
                </span>
              ))}
            </div>

            {game.over && (
              <div className="bp-overlay" role="dialog" aria-modal="true" aria-labelledby="over-title">
                <h2 id="over-title">Hết chỗ đặt khối!</h2>
                <p>
                  Điểm của bạn: <strong>{game.score}</strong>
                </p>
                {game.score > 0 && game.score >= best && <p className="bp-record">Kỷ lục mới 🎉</p>}
                <button type="button" className="bp-primary" onClick={restart} autoFocus>
                  Chơi lại
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="bp-tray" aria-label="Khối có thể đặt">
          {game.tray.map((piece, index) => {
            const usable = !!piece && !game.over && canPlaceAnywhere(game.board, piece);
            const active = activeIndex === index;
            return (
              <div key={piece?.key ?? `empty-${index}`} className="bp-slot">
                {piece && (
                  <div
                    role="button"
                    tabIndex={usable ? 0 : -1}
                    aria-disabled={!usable}
                    aria-pressed={kb?.index === index}
                    aria-label={`Khối ${index + 1}: ${piece.cells.length} ô${usable ? "" : ", không còn chỗ đặt"}`}
                    className={`bp-piece ${usable ? "" : "bp-unusable"} ${active ? "bp-lifted" : ""} ${
                      kb?.index === index ? "bp-selected" : ""
                    }`}
                    style={{ "--rows": piece.rows, "--cols": piece.cols } as CSSProperties}
                    onPointerDown={(e) => startDrag(e, index)}
                    onKeyDown={(e) => {
                      // Enter on the piece already picked falls through to the window handler and places it.
                      if ((e.key === "Enter" || e.key === " ") && kb?.index !== index) {
                        e.preventDefault();
                        e.stopPropagation();
                        pickWithKeyboard(index);
                      }
                    }}
                  >
                    {piece.cells.map(([r, c]) => (
                      <span
                        key={`${r}-${c}`}
                        className="bp-miniCell"
                        style={{ gridRow: r + 1, gridColumn: c + 1, "--c": COLORS[piece.color] } as CSSProperties}
                      >
                        <span className="bp-tile" />
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="bp-hint">Kéo khối vào bảng · Bàn phím: Tab chọn khối, Enter, phím mũi tên</p>
        </section>
      </div>

      {drag && dragPiece && geom && (
        // Drawn with the board's own cell size, so when snapped it covers the preview exactly.
        <div
          className="bp-floating"
          aria-hidden
          style={{
            left: drag.x - drag.fx * geom.pitch,
            top: drag.y - drag.fy * geom.pitch,
            width: dragPiece.cols * geom.pitch,
            height: dragPiece.rows * geom.pitch,
          }}
        >
          {dragPiece.cells.map(([r, c]) => (
            <span
              key={`${r}-${c}`}
              className="bp-floatCell"
              style={
                {
                  left: c * geom.pitch,
                  top: r * geom.pitch,
                  width: geom.pitch,
                  height: geom.pitch,
                  "--c": COLORS[dragPiece.color],
                } as CSSProperties
              }
            >
              <span className="bp-tile" />
            </span>
          ))}
        </div>
      )}

      <p className="bp-srOnly" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
