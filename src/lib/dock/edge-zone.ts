import type { DockEdge } from "@/lib/dock/types";

/** Pixels from a pane edge before a dock highlight / drop zone activates. */
export const DOCK_EDGE_BAND_PX = 40;

/**
 * Pick an edge (or corner-preferred edge) when the pointer is within
 * `bandPx` of the pane boundary. Coordinates are relative to the pane.
 */
export function edgeAt(
  x: number,
  y: number,
  width: number,
  height: number,
  bandPx: number = DOCK_EDGE_BAND_PX
): DockEdge | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0 || bandPx <= 0) {
    return null;
  }
  const nearLeft = x <= bandPx;
  const nearRight = x >= width - bandPx;
  const nearTop = y <= bandPx;
  const nearBottom = y >= height - bandPx;
  if (!nearLeft && !nearRight && !nearTop && !nearBottom) return null;

  // Prefer the nearest edge when multiple bands overlap (corners).
  const scores: Array<[DockEdge, number]> = [];
  if (nearLeft) scores.push(["left", x]);
  if (nearRight) scores.push(["right", width - x]);
  if (nearTop) scores.push(["top", y]);
  if (nearBottom) scores.push(["bottom", height - y]);
  scores.sort((a, b) => a[1] - b[1]);
  return scores[0]?.[0] ?? null;
}
