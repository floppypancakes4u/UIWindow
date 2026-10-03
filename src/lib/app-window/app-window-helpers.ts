import type { AppWindowBounds, AppWindowPersistedState, SnapTarget } from "@/lib/app-window/types";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "iframe",
  "object",
  "embed",
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Returns dock targets when the window's top-left (x,y) is near container edges.
 * All coordinates are relative to the manager host's content box.
 */
export function getSnapTarget(
  x: number,
  y: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
  threshold: number
): SnapTarget | null {
  if (threshold <= 0) {
    return null;
  }

  const nearLeft = x <= threshold;
  const nearRight = x + width >= containerWidth - threshold;
  const nearTop = y <= threshold;
  const nearBottom = y + height >= containerHeight - threshold;

  const halfW = Math.round(containerWidth / 2);
  const halfH = Math.round(containerHeight / 2);
  const ceilHalfW = Math.ceil(containerWidth / 2);
  const ceilHalfH = Math.ceil(containerHeight / 2);

  if (nearTop && nearLeft) {
    return { type: "top-left", x: 0, y: 0, width: halfW, height: halfH };
  }
  if (nearTop && nearRight) {
    return {
      type: "top-right",
      x: halfW,
      y: 0,
      width: ceilHalfW,
      height: halfH,
    };
  }
  if (nearBottom && nearLeft) {
    return {
      type: "bottom-left",
      x: 0,
      y: halfH,
      width: halfW,
      height: ceilHalfH,
    };
  }
  if (nearBottom && nearRight) {
    return {
      type: "bottom-right",
      x: halfW,
      y: halfH,
      width: ceilHalfW,
      height: ceilHalfH,
    };
  }
  if (nearTop) {
    return { type: "top", x: 0, y: 0, width: containerWidth, height: containerHeight };
  }
  if (nearLeft) {
    return { type: "left", x: 0, y: 0, width: halfW, height: containerHeight };
  }
  if (nearRight) {
    return { type: "right", x: halfW, y: 0, width: ceilHalfW, height: containerHeight };
  }
  return null;
}

export function getStorageKey(persistKey: string, windowId: string): string {
  return `app_window_state:${persistKey || windowId}`;
}

export function loadPersistedWindowState(key: string): Partial<AppWindowPersistedState> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const state = JSON.parse(raw) as unknown;
    if (!state || typeof state !== "object") return null;
    return state as Partial<AppWindowPersistedState>;
  } catch {
    return null;
  }
}

export function savePersistedWindowState(key: string, state: AppWindowPersistedState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearPersistedWindowState(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Visible, enabled focusables inside root, excluding resize handles.
 */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  for (const el of nodes) {
    if (!(el instanceof HTMLElement)) continue;
    if (el.closest("[data-app-window-resize-handle]")) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    out.push(el);
  }
  return out;
}

export function clampBoundsToContainer(
  x: number,
  y: number,
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
  minWidth: number,
  minHeight: number
): AppWindowBounds {
  const w = Math.max(minWidth, Math.min(width, containerWidth));
  const h = Math.max(minHeight, Math.min(height, containerHeight));
  const maxX = Math.max(0, containerWidth - w);
  const maxY = Math.max(0, containerHeight - h);
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY),
    width: w,
    height: h,
  };
}

export function defaultPositionForSize(
  containerWidth: number,
  containerHeight: number,
  width: number,
  height: number
): { x: number; y: number } {
  const x = Math.max(0, Math.round((containerWidth - width) * 0.1));
  const y = Math.max(0, Math.round((containerHeight - height) * 0.1));
  return { x, y };
}
