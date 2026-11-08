import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { buildManagedAppWindow } from "@/lib/app-window/build-managed-window";
import { getStorageKey } from "@/lib/app-window/app-window-helpers";

describe("buildManagedAppWindow", () => {
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

  it("ignores persisted isMaximized when maximizable is false", () => {
    const windowId = "spify-build-details";
    const persistKey = "range-build-details";
    const storageKey = getStorageKey(persistKey, windowId);
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key !== storageKey) return null;
      return JSON.stringify({
        x: 12,
        y: 34,
        width: 400,
        height: 520,
        isMaximized: true,
        isMinimized: false,
      });
    });

    const w = buildManagedAppWindow(
      {
        id: windowId,
        title: "Details",
        persistKey,
        rememberState: true,
        maximizable: false,
        width: 400,
        height: 520,
        children: null,
      },
      1200,
      800,
      10
    );

    expect(w.isMaximized).toBe(false);
    expect(w.options).not.toHaveProperty("id");
    expect(w.width).toBe(400);
    expect(w.height).toBe(520);
    expect(w.x).toBe(12);
    expect(w.y).toBe(34);
  });

  it("applies persisted isMaximized when maximizable is true", () => {
    const windowId = "win-max";
    const persistKey = "pk-max";
    const storageKey = getStorageKey(persistKey, windowId);
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key !== storageKey) return null;
      return JSON.stringify({
        x: 1,
        y: 2,
        width: 300,
        height: 200,
        isMaximized: true,
        isMinimized: false,
      });
    });

    const w = buildManagedAppWindow(
      {
        id: windowId,
        title: "T",
        persistKey,
        rememberState: true,
        maximizable: true,
        width: 300,
        height: 200,
        children: null,
      },
      1200,
      800,
      10
    );

    expect(w.isMaximized).toBe(true);
    expect(w.width).toBe(1200);
    expect(w.height).toBe(800);
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
  });

  it("does not clamp restored persisted bounds before the container is measured", () => {
    const windowId = "persisted-unmeasured";
    const persistKey = "persisted-unmeasured-key";
    const storageKey = getStorageKey(persistKey, windowId);
    vi.mocked(localStorage.getItem).mockImplementation((key) => {
      if (key !== storageKey) return null;
      return JSON.stringify({
        x: 920,
        y: 540,
        width: 300,
        height: 200,
        isMaximized: false,
        isMinimized: false,
      });
    });

    const w = buildManagedAppWindow(
      {
        id: windowId,
        title: "Persisted",
        persistKey,
        rememberState: true,
        width: 300,
        height: 200,
        children: null,
      },
      800,
      600,
      10,
      { containerMeasured: false }
    );

    expect(w.x).toBe(920);
    expect(w.y).toBe(540);
    expect(w.width).toBe(300);
    expect(w.height).toBe(200);
  });
});
