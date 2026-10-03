import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  clearPersistedWindowState,
  clampBoundsToContainer,
  defaultPositionForSize,
  getFocusableElements,
  getSnapTarget,
  getStorageKey,
  loadPersistedWindowState,
  savePersistedWindowState,
} from "@/lib/app-window/app-window-helpers";

describe("getSnapTarget", () => {
  const cw = 1000;
  const ch = 800;
  const w = 200;
  const h = 150;
  const t = 22;

  it("returns top snap when near top edge only", () => {
    const s = getSnapTarget(100, 10, w, h, cw, ch, t);
    expect(s).toEqual({ type: "top", x: 0, y: 0, width: cw, height: ch });
  });

  it("returns left half when near left edge", () => {
    const s = getSnapTarget(5, 200, w, h, cw, ch, t);
    expect(s).toEqual({ type: "left", x: 0, y: 0, width: 500, height: ch });
  });

  it("returns right half when near right edge", () => {
    const s = getSnapTarget(790, 200, w, h, cw, ch, t);
    expect(s).toEqual({ type: "right", x: 500, y: 0, width: 500, height: ch });
  });

  it("returns top-left quarter when near both top and left", () => {
    const s = getSnapTarget(5, 5, w, h, cw, ch, t);
    expect(s).toEqual({ type: "top-left", x: 0, y: 0, width: 500, height: 400 });
  });

  it("returns null when away from edges", () => {
    const s = getSnapTarget(400, 300, w, h, cw, ch, t);
    expect(s).toBeNull();
  });

  it("returns null when threshold is zero (snapping disabled)", () => {
    expect(getSnapTarget(0, 0, w, h, cw, ch, 0)).toBeNull();
    expect(getSnapTarget(0, 0, cw, ch, cw, ch, 0)).toBeNull();
  });
});

describe("persistence helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getStorageKey uses persistKey when provided", () => {
    expect(getStorageKey("my-key", "win1")).toBe("app_window_state:my-key");
  });

  it("getStorageKey falls back to window id", () => {
    expect(getStorageKey("", "win1")).toBe("app_window_state:win1");
  });

  it("loadPersistedWindowState returns null for missing key", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(loadPersistedWindowState("k")).toBeNull();
  });

  it("loadPersistedWindowState parses valid JSON", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ x: 1, y: 2, width: 3, height: 4, isMaximized: true, isMinimized: false })
    );
    expect(loadPersistedWindowState("k")).toMatchObject({ x: 1, width: 3, isMaximized: true });
  });

  it("loadPersistedWindowState returns null on invalid JSON", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("not-json");
    expect(loadPersistedWindowState("k")).toBeNull();
  });

  it("savePersistedWindowState writes JSON", () => {
    savePersistedWindowState("k", {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      isMaximized: false,
      isMinimized: false,
    });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "k",
      expect.stringContaining('"width":100')
    );
  });

  it("clearPersistedWindowState removes key", () => {
    clearPersistedWindowState("k");
    expect(localStorage.removeItem).toHaveBeenCalledWith("k");
  });
});

describe("getFocusableElements", () => {
  it("collects buttons and excludes resize handles", () => {
    document.body.innerHTML = `
      <div id="root">
        <button type="button" id="b1">A</button>
        <div data-app-window-resize-handle="1"><button type="button" id="b2">B</button></div>
        <button type="button" id="b3" style="display:none">C</button>
      </div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const list = getFocusableElements(root);
    expect(list.map((el) => el.id)).toEqual(["b1"]);
  });
});

describe("clampBoundsToContainer", () => {
  it("clamps position and size to container and mins", () => {
    const b = clampBoundsToContainer(-10, -10, 2000, 2000, 800, 600, 100, 80);
    expect(b.width).toBe(800);
    expect(b.height).toBe(600);
    expect(b.x).toBe(0);
    expect(b.y).toBe(0);
  });
});

describe("defaultPositionForSize", () => {
  it("returns 10% inset defaults", () => {
    const p = defaultPositionForSize(1000, 800, 600, 400);
    expect(p.x).toBe(40);
    expect(p.y).toBe(40);
  });
});
