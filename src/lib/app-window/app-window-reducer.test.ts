import { describe, expect, it } from "vitest";

import {
  appWindowManagerReducer,
  createInitialAppWindowManagerState,
} from "@/lib/app-window/app-window-reducer";
import { APP_WINDOW_BASE_THEME, APP_WINDOW_DEFAULT_OPTIONS } from "@/lib/app-window/types";
import type { ManagedAppWindow } from "@/lib/app-window/types";

function baseWindow(over: Partial<ManagedAppWindow> = {}): ManagedAppWindow {
  const id = over.id ?? "w1";
  return {
    id,
    title: "T",
    children: null,
    zIndex: 1000,
    x: 10,
    y: 10,
    width: 200,
    height: 150,
    minWidth: 100,
    minHeight: 80,
    isMinimized: false,
    isMaximized: false,
    previousBounds: null,
    options: {
      ...APP_WINDOW_DEFAULT_OPTIONS,
      trapFocus: false,
      theme: { ...APP_WINDOW_BASE_THEME },
      persistKey: null,
      ...over.options,
    },
    ...over,
  };
}

describe("appWindowManagerReducer", () => {
  it("open adds window and bumps zCounter", () => {
    let s = createInitialAppWindowManagerState();
    const w = baseWindow({ id: "a", zIndex: 1000 });
    s = appWindowManagerReducer(s, { type: "open", window: w, zCounter: 1001 });
    expect(s.ids).toEqual(["a"]);
    expect(s.windows.a).toEqual(w);
    expect(s.zCounter).toBe(1001);
    expect(s.activeId).toBe("a");
  });

  it("open with same id replaces window without duplicating ids", () => {
    let s = createInitialAppWindowManagerState();
    const w1 = baseWindow({ id: "a", zIndex: 1000, title: "One" });
    s = appWindowManagerReducer(s, { type: "open", window: w1, zCounter: 1001 });
    const w2 = baseWindow({ id: "a", zIndex: 1001, title: "Two" });
    s = appWindowManagerReducer(s, { type: "open", window: w2, zCounter: 1002 });
    expect(s.ids).toEqual(["a"]);
    expect(s.windows.a.title).toBe("Two");
    expect(s.zCounter).toBe(1002);
  });

  it("focus raises zIndex and sets activeId", () => {
    let s = createInitialAppWindowManagerState();
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "a", zIndex: 1000 }),
      zCounter: 1001,
    });
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "b", zIndex: 1001 }),
      zCounter: 1002,
    });
    s = appWindowManagerReducer(s, { type: "focus", id: "a", z: 1010 });
    expect(s.windows.a.zIndex).toBe(1010);
    expect(s.activeId).toBe("a");
    expect(s.zCounter).toBe(1011);
  });

  it("close removes window and repoints activeId", () => {
    let s = createInitialAppWindowManagerState();
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "a", zIndex: 1000 }),
      zCounter: 1001,
    });
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "b", zIndex: 1001 }),
      zCounter: 1002,
    });
    s = appWindowManagerReducer(s, { type: "close", id: "b" });
    expect(s.ids).toEqual(["a"]);
    expect(s.windows.b).toBeUndefined();
    expect(s.activeId).toBe("a");
  });

  it("minimize picks another active window", () => {
    let s = createInitialAppWindowManagerState();
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "a", zIndex: 1000 }),
      zCounter: 1001,
    });
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "b", zIndex: 1001 }),
      zCounter: 1002,
    });
    s = appWindowManagerReducer(s, { type: "focus", id: "b", z: 1010 });
    s = appWindowManagerReducer(s, { type: "minimize", id: "b" });
    expect(s.windows.b.isMinimized).toBe(true);
    expect(s.activeId).toBe("a");
  });

  it("maximize fills container and stores previousBounds", () => {
    let s = createInitialAppWindowManagerState();
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "a", x: 5, y: 5, width: 100, height: 80 }),
      zCounter: 1001,
    });
    s = appWindowManagerReducer(s, {
      type: "maximize",
      id: "a",
      containerWidth: 800,
      containerHeight: 600,
    });
    expect(s.windows.a.isMaximized).toBe(true);
    expect(s.windows.a.previousBounds).toEqual({ x: 5, y: 5, width: 100, height: 80 });
    expect(s.windows.a.width).toBe(800);
    expect(s.windows.a.height).toBe(600);
  });

  it("updateWindow merges headerActions into options", () => {
    let s = createInitialAppWindowManagerState();
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "a" }),
      zCounter: 1001,
    });
    const headerActions = () => "x";
    s = appWindowManagerReducer(s, {
      type: "updateWindow",
      id: "a",
      patch: { headerActions },
    });
    expect(s.windows.a.options.headerActions).toBe(headerActions);
  });

  it("applySnap clears snapPreview", () => {
    let s = createInitialAppWindowManagerState();
    s = appWindowManagerReducer(s, {
      type: "open",
      window: baseWindow({ id: "a" }),
      zCounter: 1001,
    });
    s = appWindowManagerReducer(s, {
      type: "setSnapPreview",
      target: { type: "left", x: 0, y: 0, width: 100, height: 100 },
    });
    s = appWindowManagerReducer(s, {
      type: "applySnap",
      id: "a",
      target: { type: "left", x: 0, y: 0, width: 400, height: 600 },
    });
    expect(s.snapPreview).toBeNull();
    expect(s.windows.a.x).toBe(0);
    expect(s.windows.a.width).toBe(400);
  });
});
