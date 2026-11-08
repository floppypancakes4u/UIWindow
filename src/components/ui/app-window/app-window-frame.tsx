"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAppWindowManagerInternal } from "@/components/ui/app-window/app-window-internal-context";
import { cn } from "@/lib/cn";
import {
  getFocusableElements,
  getSnapTarget,
} from "@/lib/app-window/app-window-helpers";
import type { ManagedAppWindow, SnapTarget } from "@/lib/app-window/types";

const HEADER_PX = 40;

const RESIZE_DEFS = [
  { dir: "n", cursor: "ns-resize", top: -5, left: 10, right: 10, height: 10 },
  { dir: "s", cursor: "ns-resize", bottom: -5, left: 10, right: 10, height: 10 },
  { dir: "e", cursor: "ew-resize", top: 10, right: -5, bottom: 10, width: 10 },
  { dir: "w", cursor: "ew-resize", top: 10, left: -5, bottom: 10, width: 10 },
  { dir: "ne", cursor: "nesw-resize", top: -5, right: -5, width: 12, height: 12 },
  { dir: "nw", cursor: "nwse-resize", top: -5, left: -5, width: 12, height: 12 },
  { dir: "se", cursor: "nwse-resize", bottom: -5, right: -5, width: 12, height: 12 },
  { dir: "sw", cursor: "nesw-resize", bottom: -5, left: -5, width: 12, height: 12 },
];

function resizeHandleStyle(def: (typeof RESIZE_DEFS)[number]): CSSProperties {
  const s: CSSProperties = {
    position: "absolute",
    cursor: def.cursor as CSSProperties["cursor"],
  };
  if ("top" in def) s.top = def.top;
  if ("left" in def) s.left = def.left;
  if ("right" in def) s.right = def.right;
  if ("bottom" in def) s.bottom = def.bottom;
  if ("width" in def) s.width = def.width;
  if ("height" in def) s.height = def.height;
  return s;
}

export function AppWindowFrame({ win }: { win: ManagedAppWindow }) {
  const {
    hostRef,
    containerWidth,
    containerHeight,
    activeId,
    dispatch,
    setSnapPreview,
    buildApi,
    isTopModalFor,
    persistWindowById,
  } = useAppWindowManagerInternal();

  const sectionRef = useRef<HTMLElement | null>(null);
  const createdRef = useRef(false);
  const didModalAutofocusRef = useRef(false);
  const isDragging = useRef(false);
  /** Suppresses React left/top so parent re-renders cannot clobber DOM drag position. */
  const [dragGesture, setDragGesture] = useState(false);
  const dragSnapRef = useRef<SnapTarget | null>(null);
  /** Fixed size during a drag started from maximized (DOM may lag one frame). */
  const dragBoundsRef = useRef<{ width: number; height: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragHostRectRef = useRef<{ left: number; top: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastSnapTypeRef = useRef<SnapTarget["type"] | null>(null);
  const isResizing = useRef(false);
  const resizeDir = useRef<string | null>(null);
  const resizeStart = useRef({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  });

  const api = buildApi(win.id);
  const isActive = activeId === win.id && !win.isMinimized;
  const topModal = isTopModalFor(win.id);
  const theme = win.options.theme;

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    win.options.onCreate?.(api);
  }, [api, win.options]);

  useEffect(() => {
    if (!win.isMinimized && isActive) {
      win.options.onFocus?.(api);
    }
  }, [api, isActive, win.id, win.isMinimized, win.options]);

  useEffect(() => {
    if (!isActive) {
      didModalAutofocusRef.current = false;
      return;
    }
    if (win.isMinimized || !win.options.modal || !win.options.trapFocus) return;
    if (!topModal) return;
    if (didModalAutofocusRef.current) return;
    didModalAutofocusRef.current = true;
    const root = sectionRef.current;
    if (!root) return;
    const list = getFocusableElements(root);
    (list[0] ?? root).focus({ preventScroll: true });
  }, [isActive, topModal, win.id, win.isMinimized, win.options.modal, win.options.trapFocus]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.target === sectionRef.current && win.isMinimized) {
        api.restore();
        return;
      }
      if (
        e.key === "Tab" &&
        win.options.modal &&
        win.options.trapFocus &&
        topModal
      ) {
        const root = sectionRef.current;
        if (!root) return;
        const focusables = getFocusableElements(root);
        if (!focusables.length) {
          e.preventDefault();
          root.focus({ preventScroll: true });
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        const shift = e.shiftKey;
        if (!root.contains(active)) {
          e.preventDefault();
          (shift ? last : first).focus({ preventScroll: true });
          return;
        }
        if (!shift && active === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        } else if (shift && active === first) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      }
    },
    [api, topModal, win.isMinimized, win.options]
  );

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if (!win.options.draggable || win.isMinimized) return;
      const host = hostRef.current;
      if (!host) return;
      const el = sectionRef.current;
      const elRect = el?.getBoundingClientRect();
      if (!el || !elRect) return;

      isDragging.current = true;
      setDragGesture(true);
      win.options.onMoveStart?.(api);
      const hostRect = host.getBoundingClientRect();
      dragHostRectRef.current = { left: hostRect.left, top: hostRect.top };
      dragOffset.current = {
        x: e.clientX - elRect.left,
        y: e.clientY - elRect.top,
      };
      dragBoundsRef.current = null;
      dragPosRef.current = null;
      lastSnapTypeRef.current = null;

      if (win.isMaximized) {
        const prev = win.previousBounds ?? {
          x: 40,
          y: 40,
          width: win.minWidth,
          height: win.minHeight,
        };
        const ew = Math.max(win.minWidth, prev.width);
        const eh = Math.max(win.minHeight, prev.height);
        let x = e.clientX - hostRect.left - dragOffset.current.x;
        let y = e.clientY - hostRect.top - dragOffset.current.y;
        if (win.options.constrainToViewport) {
          const maxX = Math.max(0, containerWidth - ew);
          const maxY = Math.max(0, containerHeight - eh);
          x = Math.max(0, Math.min(x, maxX));
          y = Math.max(0, Math.min(y, maxY));
        }
        dispatch({ type: "unmaximize", id: win.id });
        dispatch({
          type: "setBounds",
          id: win.id,
          x,
          y,
          width: ew,
          height: eh,
        });
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${ew}px`;
        el.style.height = `${eh}px`;
        dragBoundsRef.current = { width: ew, height: eh };
        dragPosRef.current = { x, y };
        win.options.onMaximize?.(api, false);
      }

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current || !sectionRef.current || !dragHostRectRef.current) return;
        const r = dragHostRectRef.current;
        const node = sectionRef.current;
        let x = ev.clientX - r.left - dragOffset.current.x;
        let y = ev.clientY - r.top - dragOffset.current.y;
        const ew = dragBoundsRef.current?.width ?? node.offsetWidth;
        const eh = dragBoundsRef.current?.height ?? node.offsetHeight;
        if (win.options.constrainToViewport) {
          const maxX = Math.max(0, containerWidth - ew);
          const maxY = Math.max(0, containerHeight - eh);
          x = Math.max(0, Math.min(x, maxX));
          y = Math.max(0, Math.min(y, maxY));
        }
        // Move via DOM during the gesture; commit React state once on mouseup.
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        dragPosRef.current = { x, y };
        const snap = getSnapTarget(
          x,
          y,
          ew,
          eh,
          containerWidth,
          containerHeight,
          win.options.snapThreshold ?? 22
        );
        dragSnapRef.current = snap;
        const snapType = snap?.type ?? null;
        if (snapType !== lastSnapTypeRef.current) {
          lastSnapTypeRef.current = snapType;
          setSnapPreview(snap);
        }
        win.options.onMove?.(api, { x, y, snapTarget: snap });
      };

      const onUp = () => {
        const was = isDragging.current;
        isDragging.current = false;
        const ew = dragBoundsRef.current?.width ?? sectionRef.current?.offsetWidth ?? win.width;
        const eh = dragBoundsRef.current?.height ?? sectionRef.current?.offsetHeight ?? win.height;
        const pos = dragPosRef.current;
        dragBoundsRef.current = null;
        dragHostRectRef.current = null;
        dragPosRef.current = null;
        lastSnapTypeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (was) {
          const target = dragSnapRef.current;
          dragSnapRef.current = null;
          setSnapPreview(null);
          if (target) {
            dispatch({ type: "applySnap", id: win.id, target });
          } else if (pos) {
            dispatch({
              type: "setBounds",
              id: win.id,
              x: pos.x,
              y: pos.y,
              width: ew,
              height: eh,
            });
          }
          setDragGesture(false);
          requestAnimationFrame(() => {
            persistWindowById(win.id);
            win.options.onMoveEnd?.(api);
          });
        } else {
          setDragGesture(false);
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    },
    [
      api,
      containerHeight,
      containerWidth,
      dispatch,
      hostRef,
      persistWindowById,
      setSnapPreview,
      win,
    ]
  );

  const startResize = useCallback(
    (e: React.MouseEvent, direction: string) => {
      if (!sectionRef.current || win.isMaximized || win.isMinimized) return;
      isResizing.current = true;
      resizeDir.current = direction;
      const rect = sectionRef.current.getBoundingClientRect();
      const host = hostRef.current;
      const hr = host?.getBoundingClientRect();
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: rect.width,
        height: rect.height,
        left: hr ? rect.left - hr.left : win.x,
        top: hr ? rect.top - hr.top : win.y,
      };

      const onMove = (ev: MouseEvent) => {
        if (!isResizing.current || !resizeDir.current) return;
        const dir = resizeDir.current;
        const dx = ev.clientX - resizeStart.current.x;
        const dy = ev.clientY - resizeStart.current.y;
        let newW = resizeStart.current.width;
        let newH = resizeStart.current.height;
        let newLeft = resizeStart.current.left;
        let newTop = resizeStart.current.top;
        if (dir.includes("e")) newW = resizeStart.current.width + dx;
        if (dir.includes("s")) newH = resizeStart.current.height + dy;
        if (dir.includes("w")) {
          newW = resizeStart.current.width - dx;
          newLeft = resizeStart.current.left + dx;
        }
        if (dir.includes("n")) {
          newH = resizeStart.current.height - dy;
          newTop = resizeStart.current.top + dy;
        }
        if (newW < win.minWidth) {
          if (dir.includes("w")) newLeft -= win.minWidth - newW;
          newW = win.minWidth;
        }
        if (newH < win.minHeight) {
          if (dir.includes("n")) newTop -= win.minHeight - newH;
          newH = win.minHeight;
        }
        if (win.options.constrainToViewport) {
          if (newLeft < 0) {
            if (dir.includes("w")) newW += newLeft;
            newLeft = 0;
          }
          if (newTop < 0) {
            if (dir.includes("n")) newH += newTop;
            newTop = 0;
          }
          if (newLeft + newW > containerWidth) {
            newW = containerWidth - newLeft;
          }
          if (newTop + newH > containerHeight) {
            newH = containerHeight - newTop;
          }
          newW = Math.max(win.minWidth, newW);
          newH = Math.max(win.minHeight, newH);
        }
        dispatch({
          type: "setBounds",
          id: win.id,
          x: newLeft,
          y: newTop,
          width: newW,
          height: newH,
        });
        win.options.onResize?.(api, {
          width: newW,
          height: newH,
          x: newLeft,
          y: newTop,
          direction: dir,
        });
      };

       const onUp = () => {
         const was = isResizing.current;
         isResizing.current = false;
         resizeDir.current = null;
         document.removeEventListener("mousemove", onMove);
         document.removeEventListener("mouseup", onUp);
         if (was) {
           requestAnimationFrame(() => {
             persistWindowById(win.id);
             win.options.onResizeEnd?.(api);
           });
         }
       };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
      e.stopPropagation();
    },
    [
      api,
      containerHeight,
      containerWidth,
      dispatch,
      hostRef,
      persistWindowById,
      win,
    ]
  );

  const headerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-app-window-control]")) {
        api.focus();
        return;
      }
      e.stopPropagation();
      api.focus();
      startDrag(e);
    },
    [api, startDrag]
  );

  const headerDblClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-app-window-control]")) return;
      if (win.options.maximizable) api.toggleMaximize();
    },
    [api, win.options.maximizable]
  );

  if (win.isMinimized) {
    return null;
  }

  const shellStyle: CSSProperties = {
    position: "absolute",
    // During drag, prefer the live gesture position so React cannot snap back to win.x/y.
    left: dragGesture ? (dragPosRef.current?.x ?? win.x) : win.x,
    top: dragGesture ? (dragPosRef.current?.y ?? win.y) : win.y,
    width: win.width,
    height: win.height,
    zIndex: win.zIndex,
    overflow: "hidden",
    outline: "none",
    transition: "box-shadow 120ms ease, opacity 120ms ease",
    ...win.options.style,
    background: theme.background,
    border: theme.border,
    borderRadius: theme.borderRadius,
    boxShadow: isActive ? theme.activeBoxShadow : theme.boxShadow,
    backdropFilter: theme.backdropFilter,
    opacity: isActive ? 1 : parseFloat(theme.inactiveOpacity) || 0.92,
  };

  const headerStyle: CSSProperties = {
    height: HEADER_PX,
    background: theme.headerBackground,
    borderBottom: theme.headerBorderBottom,
    ...win.options.headerStyle,
  };

  const bodyStyle: CSSProperties = {
    height: `calc(100% - ${HEADER_PX}px)`,
    color: theme.bodyColor,
    ...win.options.bodyStyle,
  };

  const headerActions =
    typeof win.options.headerActions === "function"
      ? win.options.headerActions(api)
      : win.options.headerActions;

  const showResize =
    win.options.resizable && !win.isMaximized && !win.isMinimized;

  return (
    <>
      {win.options.modal ? (
        <div
          role="presentation"
          tabIndex={-1}
          className="absolute inset-0 cursor-default bg-[rgba(3,7,18,0.48)] backdrop-blur-[2px]"
          style={{ zIndex: win.zIndex - 1 }}
          onMouseDown={() => api.focus()}
        />
      ) : null}
      <section
        ref={sectionRef}
        id={win.id}
        data-window-id={win.id}
        data-active={isActive ? "true" : "false"}
        role={win.options.modal ? "dialog" : "region"}
        aria-modal={win.options.modal ? "true" : "false"}
        aria-label={win.options.ariaLabel ?? win.title}
        tabIndex={0}
        className={cn("flex flex-col", win.options.className)}
        style={shellStyle}
        onMouseDown={() => api.focus()}
        onKeyDown={onKeyDown}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-3 px-3 select-none",
            win.options.draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            win.options.headerClassName
          )}
          style={headerStyle}
          onMouseDown={headerMouseDown}
          onDoubleClick={headerDblClick}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className="truncate text-sm font-semibold"
              style={{ color: theme.titleColor }}
            >
              {win.title}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions ? (
              <div className="flex items-center gap-1.5">{headerActions}</div>
            ) : null}
            {win.options.controlOrder?.map((action) => {
              if (action === "close" && win.options.closable) {
                return (
                  <button
                    key="close"
                    type="button"
                    data-app-window-control
                    aria-label={`Close ${win.title}`}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 text-sm font-bold text-zinc-200 transition-colors",
                      "hover:border-red-800/70 hover:bg-red-950/40 hover:text-white"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      void api.close();
                    }}
                  >
                    ×
                  </button>
                );
              }
              if (action === "minimize" && win.options.minimizable) {
                return (
                  <button
                    key="minimize"
                    type="button"
                    data-app-window-control
                    disabled={win.isMinimized}
                    aria-label={`Minimize ${win.title}`}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 text-sm font-bold text-zinc-200 transition-colors",
                      "hover:border-zinc-500 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-55"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      api.minimize();
                    }}
                  >
                    –
                  </button>
                );
              }
              if (action === "maximize" && win.options.maximizable) {
                return (
                  <button
                    key="maximize"
                    type="button"
                    data-app-window-control
                    aria-label={`${win.isMaximized ? "Restore" : "Maximize"} ${win.title}`}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 text-sm font-bold text-zinc-200 transition-colors",
                      "hover:border-zinc-500 hover:bg-zinc-700"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      api.toggleMaximize();
                    }}
                  >
                    {win.isMaximized ? "❐" : "□"}
                  </button>
                );
              }
              return null;
            })}
          </div>
        </div>
        <div
          data-app-window-body
          className={cn("min-h-0 flex-1 overflow-auto p-4", win.options.bodyClassName)}
          style={bodyStyle}
        >
          {win.children}
        </div>
        {showResize
          ? RESIZE_DEFS.map((def) => (
              <div
                key={def.dir}
                role="presentation"
                data-app-window-resize-handle
                className="absolute z-[5] bg-transparent"
                style={resizeHandleStyle(def)}
                onMouseDown={(e) => startResize(e, def.dir)}
              />
            ))
          : null}
      </section>
    </>
  );
}
