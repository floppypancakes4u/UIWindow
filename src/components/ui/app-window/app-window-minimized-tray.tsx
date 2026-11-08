"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";

export interface MinimizedTrayItem {
  id: string;
  title: string;
}

/** Drives a double bright-yellow flash on the matching tray chip after minimize. */
export interface MinimizedTrayFlashSignal {
  windowId: string;
  seq: number;
}

const FLASH_ON_MS = 50;
const FLASH_GAP_MS = 175;

function MinimizedTrayChip({
  item,
  isToolbar,
  onRestore,
  flashSignal,
}: {
  item: MinimizedTrayItem;
  isToolbar: boolean;
  onRestore: (id: string) => void;
  flashSignal: MinimizedTrayFlashSignal | null;
}) {
  const [highlight, setHighlight] = useState(false);
  const flashWindowId = flashSignal?.windowId ?? "";
  const flashSeq = flashSignal?.seq ?? 0;

  useEffect(() => {
    if (!flashWindowId || flashWindowId !== item.id || flashSeq < 1) {
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, delay: number) => {
      timers.push(
        setTimeout(() => {
          if (!cancelled) fn();
        }, delay)
      );
    };

    // Schedule the first flash instead of setting it during the effect.
    // StrictMode runs the effect, cleans it up, then runs it again; a
    // synchronous setState is cancelled by that cleanup and the flash never shows.
    schedule(() => setHighlight(true), 0);
    schedule(() => setHighlight(false), FLASH_ON_MS);
    schedule(() => setHighlight(true), FLASH_ON_MS + FLASH_GAP_MS);
    schedule(() => setHighlight(false), 2 * FLASH_ON_MS + FLASH_GAP_MS);

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      setHighlight(false);
    };
  }, [flashWindowId, flashSeq, item.id]);

  return (
    <button
      type="button"
      role="button"
      tabIndex={0}
      aria-label={`Restore ${item.title}`}
      data-minimized-tray-highlight={highlight ? "true" : undefined}
      className={cn(
        "inline-flex min-h-7 max-w-[11rem] items-center gap-1.5 rounded-md border text-left text-xs leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500",
        isToolbar
          ? "border-zinc-700/90 bg-zinc-900/90 px-2 py-1 text-zinc-200 shadow-sm hover:border-zinc-600 hover:bg-zinc-800"
          : "max-w-[13.75rem] min-h-[2.125rem] gap-2 rounded-md border border-zinc-700/90 bg-zinc-800/90 px-2.5 py-1.5 text-[13px] text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800",
        highlight &&
          "!border-yellow-500 !bg-yellow-300 !text-zinc-950 !shadow-[0_0_14px_rgba(250,204,21,0.75)] transition-none hover:!border-yellow-500 hover:!bg-yellow-300",
        highlight && "[&>span:first-of-type]:!text-zinc-800"
      )}
      onClick={() => onRestore(item.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onRestore(item.id);
        }
      }}
    >
      <span aria-hidden className="shrink-0 text-zinc-500">
        ▢
      </span>
      <span className="min-w-0 truncate">{item.title}</span>
    </button>
  );
}

export function AppWindowMinimizedTray({
  items,
  flashSignal = null,
  onRestore,
  className,
  placement = "canvas",
}: {
  items: MinimizedTrayItem[];
  /** When set after a minimize, the matching chip flashes bright yellow twice. */
  flashSignal?: MinimizedTrayFlashSignal | null;
  onRestore: (id: string) => void;
  className?: string;
  /** `toolbar`: compact chips for the range workspace tab row (portaled). */
  placement?: "canvas" | "toolbar";
}) {
  if (items.length === 0) return null;

  const isToolbar = placement === "toolbar";

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-wrap items-center",
        isToolbar
          ? "max-w-[min(24rem,50vw)] gap-1"
          : "absolute bottom-3 left-3 z-[10060] max-w-[min(40rem,calc(100%-1.5rem))] gap-2 rounded-md border border-zinc-800 bg-zinc-900/90 p-2 shadow-sm",
        className
      )}
      role="toolbar"
      aria-label="Minimized windows"
    >
      {items.map((item) => (
        <MinimizedTrayChip
          key={item.id}
          item={item}
          isToolbar={isToolbar}
          flashSignal={flashSignal}
          onRestore={onRestore}
        />
      ))}
    </div>
  );
}
