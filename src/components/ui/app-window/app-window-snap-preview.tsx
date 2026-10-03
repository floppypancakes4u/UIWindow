"use client";

import type { SnapTarget } from "@/lib/app-window/types";
import { cn } from "@/lib/cn";

export function AppWindowSnapPreview({
  target,
  className,
}: {
  target: SnapTarget | null;
  className?: string;
}) {
  if (!target) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-md border border-sky-400/50 bg-sky-500/[0.12] opacity-100 shadow-none transition-[opacity,transform] duration-100",
        className
      )}
      style={{
        left: target.x,
        top: target.y,
        width: target.width,
        height: target.height,
        zIndex: 10050,
      }}
    />
  );
}
