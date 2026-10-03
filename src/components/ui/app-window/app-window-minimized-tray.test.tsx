import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  AppWindowMinimizedTray,
  type MinimizedTrayFlashSignal,
} from "@/components/ui/app-window/app-window-minimized-tray";

describe("AppWindowMinimizedTray", () => {
  it("flashes the matching chip bright yellow twice when flashSignal updates", async () => {
    const onRestore = vi.fn();
    const flash: MinimizedTrayFlashSignal = { windowId: "w-a", seq: 1 };

    const { rerender } = render(
      <AppWindowMinimizedTray
        items={[
          { id: "w-a", title: "Alpha" },
          { id: "w-b", title: "Beta" },
        ]}
        flashSignal={null}
        onRestore={onRestore}
        placement="toolbar"
      />
    );

    rerender(
      <AppWindowMinimizedTray
        items={[
          { id: "w-a", title: "Alpha" },
          { id: "w-b", title: "Beta" },
        ]}
        flashSignal={flash}
        onRestore={onRestore}
        placement="toolbar"
      />
    );

    const alpha = screen.getByRole("button", { name: "Restore Alpha" });
    const beta = screen.getByRole("button", { name: "Restore Beta" });

    await waitFor(() =>
      expect(alpha).toHaveAttribute("data-minimized-tray-highlight", "true")
    );
    expect(beta).not.toHaveAttribute("data-minimized-tray-highlight");

    await waitFor(() =>
      expect(alpha).not.toHaveAttribute("data-minimized-tray-highlight")
    );

    await waitFor(() =>
      expect(alpha).toHaveAttribute("data-minimized-tray-highlight", "true")
    );

    await waitFor(() =>
      expect(alpha).not.toHaveAttribute("data-minimized-tray-highlight")
    );
  });

  it("runs flash again when seq increments for the same window", async () => {
    const onRestore = vi.fn();
    const { rerender } = render(
      <AppWindowMinimizedTray
        items={[{ id: "w-a", title: "Alpha" }]}
        flashSignal={{ windowId: "w-a", seq: 1 }}
        onRestore={onRestore}
        placement="toolbar"
      />
    );

    const alpha = screen.getByRole("button", { name: "Restore Alpha" });

    await waitFor(() =>
      expect(alpha).toHaveAttribute("data-minimized-tray-highlight", "true")
    );
    await waitFor(() =>
      expect(alpha).not.toHaveAttribute("data-minimized-tray-highlight")
    );

    rerender(
      <AppWindowMinimizedTray
        items={[{ id: "w-a", title: "Alpha" }]}
        flashSignal={{ windowId: "w-a", seq: 2 }}
        onRestore={onRestore}
        placement="toolbar"
      />
    );

    await waitFor(() =>
      expect(alpha).toHaveAttribute("data-minimized-tray-highlight", "true")
    );
  });

  it("shows minimize flash under React StrictMode (dev double effect)", async () => {
    const onRestore = vi.fn();
    const flash: MinimizedTrayFlashSignal = { windowId: "w-strict", seq: 1 };

    const { rerender } = render(
      <StrictMode>
        <AppWindowMinimizedTray
          items={[{ id: "w-strict", title: "StrictWin" }]}
          flashSignal={null}
          onRestore={onRestore}
          placement="toolbar"
        />
      </StrictMode>
    );

    rerender(
      <StrictMode>
        <AppWindowMinimizedTray
          items={[{ id: "w-strict", title: "StrictWin" }]}
          flashSignal={flash}
          onRestore={onRestore}
          placement="toolbar"
        />
      </StrictMode>
    );

    const chip = screen.getByRole("button", { name: "Restore StrictWin" });
    await waitFor(() =>
      expect(chip).toHaveAttribute("data-minimized-tray-highlight", "true")
    );
  });
});
