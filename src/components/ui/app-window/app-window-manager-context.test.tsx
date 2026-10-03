"use client";

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppWindowManagerProvider,
  useAppWindowManager,
  type AppWindowManagerPublicApi,
} from "@/components/ui/app-window/app-window-manager-context";
import { getStorageKey } from "@/lib/app-window/app-window-helpers";

const hostContentRect = { width: 800, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 800 };

/** jsdom often yields ~0×0 host size; the manager relies on ResizeObserver for real bounds. */
function mockResizeObserverFor800x600Host() {
  globalThis.ResizeObserver = class ResizeObserverMock {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const contentRect = {
        ...hostContentRect,
        toJSON: () => hostContentRect,
      } as DOMRectReadOnly;
      this.callback(
        [
          {
            target,
            contentRect,
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  };
}

function Host({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[600px] w-[800px]">
      <AppWindowManagerProvider className="h-full w-full">{children}</AppWindowManagerProvider>
    </div>
  );
}

function OpenStackingPair() {
  const wm = useAppWindowManager();
  return (
    <button
      type="button"
      onClick={() => {
        wm.openWindow({
          title: "First",
          id: "w-first",
          rememberState: false,
          width: 220,
          height: 140,
          x: 16,
          y: 16,
          children: <span>one</span>,
        });
        wm.openWindow({
          title: "Second",
          id: "w-second",
          rememberState: false,
          width: 220,
          height: 140,
          x: 48,
          y: 48,
          children: <span>two</span>,
        });
      }}
    >
      open-both
    </button>
  );
}

const OriginalResizeObserver = globalThis.ResizeObserver;

describe("AppWindowManagerProvider", () => {
  beforeEach(() => {
    mockResizeObserverFor800x600Host();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  it("raises the window that receives a header mousedown to active", async () => {
    render(
      <Host>
        <OpenStackingPair />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-both" }));
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Second" })).toBeInTheDocument();
    });
    const first = screen.getByRole("region", { name: "First" });
    const second = screen.getByRole("region", { name: "Second" });
    expect(second).toHaveAttribute("data-active", "true");
    const firstHeader = first.firstElementChild as HTMLElement;
    fireEvent.mouseDown(firstHeader);
    await waitFor(() => {
      expect(first).toHaveAttribute("data-active", "true");
    });
  });

  it("closes the active window on Escape when closeOnEscape is set", async () => {
    function Escaper() {
      const wm = useAppWindowManager();
      return (
        <button
          type="button"
          onClick={() => {
            wm.openWindow({
              title: "EscWin",
              id: "w-esc",
              rememberState: false,
              closeOnEscape: true,
              width: 200,
              height: 120,
              children: <span>inside</span>,
            });
          }}
        >
          open-esc
        </button>
      );
    }
    render(
      <Host>
        <Escaper />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-esc" }));
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "EscWin" })).toBeInTheDocument();
    });
    fireEvent.keyDown(document, { key: "Escape", bubbles: true });
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "EscWin" })).toBeNull();
    });
  });

  it("keeps Tab focus inside the top modal when trapFocus is enabled", async () => {
    function ModalOpener() {
      const wm = useAppWindowManager();
      return (
        <button
          type="button"
          onClick={() => {
            wm.openWindow({
              title: "TrapModal",
              id: "w-trap",
              rememberState: false,
              modal: true,
              trapFocus: true,
              minimizable: false,
              maximizable: false,
              closable: false,
              width: 320,
              height: 200,
              children: (
                <div className="flex gap-2">
                  <button type="button">alpha</button>
                  <button type="button">beta</button>
                </div>
              ),
            });
          }}
        >
          open-modal
        </button>
      );
    }
    render(
      <Host>
        <ModalOpener />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-modal" }));
    const dialog = await screen.findByRole("dialog", { name: "TrapModal" });
    const alpha = screen.getByRole("button", { name: "alpha" });
    const beta = screen.getByRole("button", { name: "beta" });
    await waitFor(() => {
      expect(dialog).toBeInTheDocument();
    });
    beta.focus();
    expect(document.activeElement).toBe(beta);
    fireEvent.keyDown(beta, { key: "Tab", bubbles: true });
    expect(document.activeElement).toBe(alpha);

    alpha.focus();
    fireEvent.keyDown(alpha, { key: "Tab", shiftKey: true, bubbles: true });
    expect(document.activeElement).toBe(beta);
  });

  it("does not remove a window when closable is false and closeWindow is called", async () => {
    function Closer() {
      const wm = useAppWindowManager();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              wm.openWindow({
                id: "no-close",
                title: "Pinned",
                rememberState: false,
                closable: false,
                width: 160,
                height: 100,
                children: <span>inside</span>,
              })
            }
          >
            open-pinned
          </button>
          <button type="button" onClick={() => wm.closeWindow("no-close")}>
            try-close
          </button>
        </>
      );
    }
    render(
      <Host>
        <Closer />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-pinned" }));
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Pinned" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "try-close" }));
    expect(screen.getByRole("region", { name: "Pinned" })).toBeInTheDocument();
  });

  it("unmaximizes when dragging the title bar while maximized", async () => {
    const wmRef: { current: AppWindowManagerPublicApi | null } = { current: null };
    function MaxDragOpener() {
      const wm = useAppWindowManager();
      // eslint-disable-next-line react-hooks/immutability -- test fixture: expose manager API to assertions
      wmRef.current = wm;
      return (
        <button
          type="button"
          onClick={() =>
            wm.openWindow({
              id: "max-drag",
              title: "MaxDrag",
              rememberState: false,
              minWidth: 200,
              minHeight: 120,
              width: 220,
              height: 140,
              x: 24,
              y: 32,
              children: <span>content</span>,
            })
          }
        >
          open-max-drag
        </button>
      );
    }
    render(
      <Host>
        <MaxDragOpener />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-max-drag" }));
    const region = await screen.findByRole("region", { name: "MaxDrag" });
    const host = screen.getByTestId("app-window-manager-host");
    fireEvent.click(screen.getByRole("button", { name: "Maximize MaxDrag" }));
    await waitFor(() => {
      const w = wmRef.current?.getWindow("max-drag");
      expect(w?.isMaximized).toBe(true);
      expect(w?.previousBounds).toEqual(
        expect.objectContaining({ width: 220, height: 140 })
      );
    });

    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(region, "offsetWidth", {
      configurable: true,
      get: () => 800,
    });
    Object.defineProperty(region, "offsetHeight", {
      configurable: true,
      get: () => 600,
    });

    const header = region.firstElementChild as HTMLElement;
    fireEvent.mouseDown(header, { clientX: 120, clientY: 20, buttons: 1, button: 0 });
    fireEvent.mouseUp(document);

    await waitFor(() => {
      const w = wmRef.current?.getWindow("max-drag");
      expect(w?.isMaximized).toBe(false);
      expect(w?.width).toBe(220);
      expect(w?.height).toBe(140);
      expect(w?.x).toBe(0);
      expect(w?.y).toBe(0);
    });
  });

  it("commits edge snap on drag release (snap target applied on mouseup)", async () => {
    const wmRef: { current: AppWindowManagerPublicApi | null } = { current: null };
    function SnapDragOpener() {
      const wm = useAppWindowManager();
      // eslint-disable-next-line react-hooks/immutability -- test fixture: expose manager API to assertions
      wmRef.current = wm;
      return (
        <button
          type="button"
          onClick={() =>
            wm.openWindow({
              id: "snap-drag",
              title: "SnapDrag",
              rememberState: false,
              minWidth: 200,
              minHeight: 100,
              width: 200,
              height: 100,
              x: 120,
              y: 80,
              children: <span>content</span>,
            })
          }
        >
          open-snap-drag
        </button>
      );
    }
    render(
      <Host>
        <SnapDragOpener />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-snap-drag" }));
    const region = await screen.findByRole("region", { name: "SnapDrag" });
    const host = screen.getByTestId("app-window-manager-host");

    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({
      left: 120,
      top: 80,
      right: 320,
      bottom: 200,
      width: 200,
      height: 120,
      x: 120,
      y: 80,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(region, "offsetWidth", {
      configurable: true,
      get: () => 200,
    });
    Object.defineProperty(region, "offsetHeight", {
      configurable: true,
      get: () => 100,
    });

    const header = region.firstElementChild as HTMLElement;
    fireEvent.mouseDown(header, { clientX: 220, clientY: 100, buttons: 1, button: 0 });
    fireEvent.mouseMove(document, { clientX: 40, clientY: 100, buttons: 1 });
    fireEvent.mouseUp(document);

    await waitFor(() => {
      const w = wmRef.current?.getWindow("snap-drag");
      expect(w?.isMaximized).toBe(false);
      expect(w?.width).toBe(400);
      expect(w?.height).toBe(600);
      expect(w?.x).toBe(0);
      expect(w?.y).toBe(0);
    });
  });

  it("flashes the minimized tray restore chip bright yellow twice after minimize", async () => {
    function FlashMinimizeOpener() {
      const wm = useAppWindowManager();
      return (
        <button
          type="button"
          onClick={() =>
            wm.openWindow({
              title: "FlashWin",
              id: "w-flash",
              rememberState: false,
              width: 200,
              height: 120,
              x: 10,
              y: 10,
              children: <span>in</span>,
            })
          }
        >
          open-flash
        </button>
      );
    }
    render(
      <Host>
        <FlashMinimizeOpener />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-flash" }));
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "FlashWin" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Minimize FlashWin" }));

    const restore = await screen.findByRole("button", { name: "Restore FlashWin" });

    await waitFor(() =>
      expect(restore).toHaveAttribute("data-minimized-tray-highlight", "true")
    );

    await waitFor(() =>
      expect(restore).not.toHaveAttribute("data-minimized-tray-highlight")
    );

    await waitFor(() =>
      expect(restore).toHaveAttribute("data-minimized-tray-highlight", "true")
    );

    await waitFor(() =>
      expect(restore).not.toHaveAttribute("data-minimized-tray-highlight")
    );
  });

  it("persists updated bounds after dragging a window with persistKey", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    });

    function PersistedDragOpener() {
      const wm = useAppWindowManager();
      return (
        <button
          type="button"
          onClick={() =>
            wm.openWindow({
              id: "persist-drag",
              title: "PersistDrag",
              persistKey: "persist-drag-key",
              width: 200,
              height: 100,
              x: 120,
              y: 80,
              children: <span>content</span>,
            })
          }
        >
          open-persist-drag
        </button>
      );
    }

    render(
      <Host>
        <PersistedDragOpener />
      </Host>
    );
    fireEvent.click(screen.getByRole("button", { name: "open-persist-drag" }));
    const region = await screen.findByRole("region", { name: "PersistDrag" });
    const host = screen.getByTestId("app-window-manager-host");

    vi.spyOn(region, "getBoundingClientRect").mockReturnValue({
      left: 120,
      top: 80,
      right: 320,
      bottom: 180,
      width: 200,
      height: 100,
      x: 120,
      y: 80,
      toJSON: () => ({}),
    } as DOMRect);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(region, "offsetWidth", {
      configurable: true,
      get: () => 200,
    });
    Object.defineProperty(region, "offsetHeight", {
      configurable: true,
      get: () => 100,
    });

    const header = region.firstElementChild as HTMLElement;
    fireEvent.mouseDown(header, { clientX: 220, clientY: 100, buttons: 1, button: 0 });
    fireEvent.mouseMove(document, { clientX: 320, clientY: 200, buttons: 1 });
    fireEvent.mouseUp(document);

    await waitFor(() => {
      const saved = storage.get(getStorageKey("persist-drag-key", "persist-drag"));
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved ?? "{}")).toMatchObject({
        x: 220,
        y: 180,
        width: 200,
        height: 100,
        isMaximized: false,
        isMinimized: false,
      });
    });
  });

  it("restores persisted bounds from persistKey before ResizeObserver reports host size", async () => {
    globalThis.ResizeObserver = class ResizeObserverMock {
      constructor(_callback: ResizeObserverCallback) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    });

    const wmRef: { current: AppWindowManagerPublicApi | null } = { current: null };

    function PersistedWindowOpener() {
      const wm = useAppWindowManager();
      // eslint-disable-next-line react-hooks/immutability -- test fixture: expose manager API to assertions
      wmRef.current = wm;
      return (
        <button
          type="button"
          onClick={() =>
            wm.openWindow({
              id: "persisted-window",
              title: "Persisted",
              persistKey: "persisted-window-key",
              width: 300,
              height: 200,
              children: <span>content</span>,
            })
          }
        >
          open-persisted
        </button>
      );
    }

    const storageKey = getStorageKey("persisted-window-key", "persisted-window");
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        x: 920,
        y: 540,
        width: 300,
        height: 200,
        isMaximized: false,
        isMinimized: false,
      })
    );

    render(
      <Host>
        <PersistedWindowOpener />
      </Host>
    );

    const host = screen.getByTestId("app-window-manager-host");
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 1400,
      bottom: 900,
      width: 1400,
      height: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(host, "clientWidth", {
      configurable: true,
      get: () => 1400,
    });
    Object.defineProperty(host, "clientHeight", {
      configurable: true,
      get: () => 900,
    });

    fireEvent.click(screen.getByRole("button", { name: "open-persisted" }));

    await waitFor(() => {
      const win = wmRef.current?.getWindow("persisted-window");
      expect(win?.x).toBe(920);
      expect(win?.y).toBe(540);
      expect(win?.width).toBe(300);
      expect(win?.height).toBe(200);
    });
  });

  it("does not clamp restored persisted bounds when the host has not measured yet", async () => {
    globalThis.ResizeObserver = class ResizeObserverMock {
      constructor(_callback: ResizeObserverCallback) {}
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    });

    const wmRef: { current: AppWindowManagerPublicApi | null } = { current: null };

    function UnmeasuredPersistedWindowOpener() {
      const wm = useAppWindowManager();
      // eslint-disable-next-line react-hooks/immutability -- test fixture: expose manager API to assertions
      wmRef.current = wm;
      return (
        <button
          type="button"
          onClick={() =>
            wm.openWindow({
              id: "persisted-unmeasured-window",
              title: "PersistedUnmeasured",
              persistKey: "persisted-unmeasured-key",
              width: 300,
              height: 200,
              children: <span>content</span>,
            })
          }
        >
          open-persisted-unmeasured
        </button>
      );
    }

    localStorage.setItem(
      getStorageKey("persisted-unmeasured-key", "persisted-unmeasured-window"),
      JSON.stringify({
        x: 920,
        y: 540,
        width: 300,
        height: 200,
        isMaximized: false,
        isMinimized: false,
      })
    );

    render(
      <Host>
        <UnmeasuredPersistedWindowOpener />
      </Host>
    );

    const host = screen.getByTestId("app-window-manager-host");
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperty(host, "clientWidth", {
      configurable: true,
      get: () => 0,
    });
    Object.defineProperty(host, "clientHeight", {
      configurable: true,
      get: () => 0,
    });

    fireEvent.click(screen.getByRole("button", { name: "open-persisted-unmeasured" }));

    await waitFor(() => {
      const win = wmRef.current?.getWindow("persisted-unmeasured-window");
      expect(win?.x).toBe(920);
      expect(win?.y).toBe(540);
      expect(win?.width).toBe(300);
      expect(win?.height).toBe(200);
    });
  });
});
