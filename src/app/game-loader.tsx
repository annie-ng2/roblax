"use client";

import dynamic from "next/dynamic";

// Client only: the pieces are random and the best score lives in localStorage, so a
// server render would never match the first client render.
const BlockPuzzleGame = dynamic(() => import("./block-puzzle-game"), {
  ssr: false,
  loading: () => (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "#94a3b8" }}>Đang tải trò chơi…</div>
  ),
});

export function GameLoader() {
  return <BlockPuzzleGame />;
}
