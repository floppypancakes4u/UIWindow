"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useAppWindowManager } from "@/components/ui/app-window/app-window-manager-context";
import { useDockDrag, useDockWorkspace, type DockHit } from "@/components/ui/dock/dock-provider";
import { cn } from "@/lib/cn";
import { edgeAt } from "@/lib/dock/edge-zone";
import { flattenDock, splitDisplayRatio } from "@/lib/dock/layout";
import type { DockEdge, DockGroupNode, DockNode, DockSplitNode } from "@/lib/dock/types";
import type { AppWindowTheme } from "@/lib/app-window/types";
import type { DockTheme } from "@/lib/dock/theme";

export interface DockView {
  id: string;
  title: string;
  render: () => ReactNode;
}

const ViewsContext = createContext<DockView[]>([]);
const PopoutContext = createContext<(tabId: string) => void>(() => undefined);

export function DockWorkspace({
  views,
  windowTheme,
  className,
}: {
  views: DockView[];
  windowTheme?: Partial<AppWindowTheme>;
  className?: string;
}) {
  const dock = useDockWorkspace();
  const { setDrag } = useDockDrag();
  const wm = useAppWindowManager();
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const openedFloats = useRef(new Set<string>());
  const floatHitRaf = useRef<number | null>(null);
  const themeRef = useRef(windowTheme);
  themeRef.current = windowTheme;
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const setDragRef = useRef(setDrag);
  setDragRef.current = setDrag;
  const wmRef = useRef(wm);
  wmRef.current = wm;

  const openFloat = useCallback((tabId: string) => {
    const view = viewsRef.current.find((item) => item.id === tabId);
    if (!view) return;
    const windowId = `dock-float:${tabId}`;
    const windows = wmRef.current;
    if (windows.getWindow(windowId)) {
      windows.focusWindow(windowId);
      openedFloats.current.add(tabId);
      return;
    }
    windows.openWindow({
      id: windowId,
      title: view.title,
      persistKey: `dock:${tabId}`,
      children: <DockViewHost id={tabId} />,
      closable: true,
      minimizable: true,
      maximizable: true,
      resizable: true,
      draggable: true,
      closeOnEscape: false,
      snapThreshold: 0,
      width: 720,
      height: 480,
      minWidth: 320,
      minHeight: 180,
      bodyClassName: "h-full min-h-0 overflow-hidden p-0",
      theme: themeRef.current,
      onClose: () => {
        openedFloats.current.delete(tabId);
        const workspace = dockRef.current;
        if (workspace.closable(tabId)) {
          workspace.closeTab(tabId);
          return;
        }
        workspace.dockInto(tabId, { groupId: "main", zone: "tabs", index: 0 });
      },
      onMoveStart: () => {
        if (floatHitRaf.current != null) {
          cancelAnimationFrame(floatHitRaf.current);
          floatHitRaf.current = null;
        }
        setDragRef.current({ tabId, kind: "float", x: 0, y: 0, hit: null });
      },
      onMove: () => {
        if (floatHitRaf.current != null) return;
        floatHitRaf.current = requestAnimationFrame(() => {
          floatHitRaf.current = null;
          const point = lastPointer();
          if (!point) return;
          const hit = hitTest(point.x, point.y, !dockRef.current.singleGroup);
          // setDrag ignores pointer x/y; React updates only when the hit target changes.
          setDragRef.current({ tabId, kind: "float", x: point.x, y: point.y, hit });
        });
      },
      onMoveEnd: () => {
        if (floatHitRaf.current != null) {
          cancelAnimationFrame(floatHitRaf.current);
          floatHitRaf.current = null;
        }
        const point = lastPointer();
        const hit = point ? hitTest(point.x, point.y, !dockRef.current.singleGroup) : null;
        setDragRef.current(null);
        if (!hit) return;
        openedFloats.current.delete(tabId);
        wmRef.current.closeWindow(windowId, { force: true });
        dockRef.current.dockInto(tabId, hit);
      },
    });
    openedFloats.current.add(tabId);
  }, []);

  const popOut = useCallback((tabId: string) => {
    setDrag(null);
    dock.releaseTab(tabId);
    openFloat(tabId);
  }, [dock, openFloat, setDrag]);

  useEffect(() => {
    for (const id of dock.layout.floated) {
      if (openedFloats.current.has(id)) continue;
      openFloat(id);
    }
  }, [dock.layout.floated, openFloat]);

  const shown = dock.singleGroup
    ? flattenDock(dock.layout, "mobile", dock.focusedId ?? undefined)
    : dock.layout.root;

  return (
    <ViewsContext.Provider value={views}>
      <PopoutContext.Provider value={popOut}>
        <div
          className={cn("relative h-full min-h-0 min-w-0", className)}
          style={{ background: dock.theme.body, color: dock.theme.tabText }}
        >
          <DockTree node={shown} />
          <ViewPool views={views} />
          <DragGhostChip views={views} theme={dock.theme} />
        </div>
      </PopoutContext.Provider>
    </ViewsContext.Provider>
  );
}

/** Ghost label follows the pointer via DOM; React only mounts/unmounts it. */
function DragGhostChip({ views, theme }: { views: DockView[]; theme: DockTheme }) {
  const { drag } = useDockDrag();
  const chipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!drag) return;
    const chip = chipRef.current;
    if (!chip) return;
    const place = (x: number, y: number) => {
      chip.style.left = `${x + 12}px`;
      chip.style.top = `${y + 12}px`;
    };
    const point = lastPointer();
    if (point) place(point.x, point.y);
    const onMove = (event: PointerEvent) => place(event.clientX, event.clientY);
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [drag]);

  if (!drag) return null;
  const title = views.find((view) => view.id === drag.tabId)?.title ?? drag.tabId;
  const point = lastPointer();
  return (
    <div
      ref={chipRef}
      className="pointer-events-none fixed z-[80] rounded-sm px-2 py-1 text-xs"
      style={{
        left: point ? point.x + 12 : 0,
        top: point ? point.y + 12 : 0,
        background: theme.bar,
        color: theme.barText,
        border: `1px solid ${theme.border}`,
      }}
    >
      {title}
    </div>
  );
}

function ViewPool({ views }: { views: DockView[] }) {
  const dock = useDockWorkspace();
  return (
    <div hidden aria-hidden>
      {views.map((view) => (
        <PortaledView key={view.id} view={view} target={dock.hosts.get(view.id) ?? null} />
      ))}
    </div>
  );
}

function PortaledView({ view, target }: { view: DockView; target: HTMLElement | null }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [park, setPark] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = document.createElement("div");
    node.className = "ops-document h-full min-h-0 w-full";
    node.dataset.dockView = view.id;
    setSlot(node);
    return () => node.remove();
  }, [view.id]);
  useEffect(() => {
    const dest = target ?? park;
    if (!slot || !dest) return;
    dest.appendChild(slot);
    slot.hidden = target == null;
  }, [slot, target, park]);
  // The slot node stays the portal container, so moving it between a group and a
  // float does not remount the document. The map viewer depends on that.
  return (
    <>
      <div ref={setPark} hidden />
      {slot ? createPortal(view.render(), slot) : null}
    </>
  );
}

function DockViewHost({ id }: { id: string }) {
  const dock = useDockWorkspace();
  const register = dock.registerHost;
  const pinTab = dock.pinTab;
  const ref = useCallback((node: HTMLDivElement | null) => {
    register(id, node);
  }, [register, id]);
  const pin = useCallback(() => {
    pinTab(id);
  }, [pinTab, id]);
  return (
    <div
      ref={ref}
      className="h-full min-h-0 w-full"
      onPointerDownCapture={pin}
      onKeyDownCapture={pin}
      onWheelCapture={pin}
    />
  );
}

function DockTree({ node }: { node: DockNode }) {
  if (node.type === "group") return <DockGroup node={node} />;
  return <DockSplit node={node} />;
}

function DockSplit({ node }: { node: DockSplitNode }) {
  const dock = useDockWorkspace();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const span = useElementSpan(hostRef, node.direction);
  const ratio = splitDisplayRatio(node, span);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dock.singleGroup) return;
    event.preventDefault();
    const element = hostRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const size = node.direction === "row" ? rect.width : rect.height;
      const pos = node.direction === "row" ? ev.clientX - rect.left : ev.clientY - rect.top;
      if (size <= 0) return;
      dock.resizeSplit(node.id, pos / size);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const horizontal = node.direction === "row";
  return (
    <div ref={hostRef} className={cn("flex h-full min-h-0 min-w-0", horizontal ? "flex-row" : "flex-col")}>
      <div className="min-h-0 min-w-0" style={{ flex: `${ratio} 1 0` }}>
        <DockTree node={node.first} />
      </div>
      <div
        role="separator"
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        className={horizontal ? "w-1 shrink-0 cursor-col-resize" : "h-1 shrink-0 cursor-row-resize"}
        style={{ background: dock.theme.border }}
        onPointerDown={onPointerDown}
      />
      <div className="min-h-0 min-w-0" style={{ flex: `${1 - ratio} 1 0` }}>
        <DockTree node={node.second} />
      </div>
    </div>
  );
}

function useElementSpan(ref: RefObject<HTMLDivElement | null>, direction: "row" | "column"): number {
  const [span, setSpan] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSpan(direction === "row" ? rect.width : rect.height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [direction, ref]);
  return span;
}

function DockGroup({ node }: { node: DockGroupNode }) {
  const dock = useDockWorkspace();
  const { drag, setDrag } = useDockDrag();
  const popOut = useContext(PopoutContext);
  const views = useContext(ViewsContext);
  const [menu, setMenu] = useState(false);
  const hitHere = drag?.hit?.groupId === node.id ? drag.hit : null;

  const onTabPointerDown = (tabId: string, event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const allowEdges = !dock.singleGroup;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      moved = true;
      // React updates only when the drop hit changes; chip position is DOM-driven.
      setDrag({
        tabId,
        kind: "tab",
        x: ev.clientX,
        y: ev.clientY,
        hit: hitTest(ev.clientX, ev.clientY, allowEdges),
      });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!moved) {
        dock.focusTab(tabId);
        dock.pinTab(tabId);
        return;
      }
      const hit = hitTest(ev.clientX, ev.clientY, allowEdges);
      if (!hit) return;
      if (hit.zone === "tabs") dock.moveTab(tabId, hit.groupId, hit.index);
      else dock.splitOff(tabId, hit.groupId, hit.zone);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section
      data-dock-bounds={node.id}
      className="flex h-full min-h-0 min-w-0 flex-col"
      style={{ background: dock.theme.body }}
    >
      <div
        role="tablist"
        data-dock-tabs=""
        className="flex h-8 shrink-0 items-stretch gap-1 overflow-x-auto px-1"
        style={{ background: dock.theme.bar, borderBottom: `1px solid ${dock.theme.border}`, color: dock.theme.barText }}
      >
        {node.tabs.map((tabId) => {
          const active = node.activeId === tabId;
          const preview = dock.previewId === tabId;
          const title = views.find((view) => view.id === tabId)?.title ?? tabId;
          return (
            <div
              key={tabId}
              role="tab"
              aria-selected={active}
              data-dock-tab={tabId}
              data-preview={preview ? "" : undefined}
              className="flex min-w-0 max-w-[14rem] cursor-grab items-center gap-1 px-2"
              style={{
                background: active ? dock.theme.tabActive : "transparent",
                color: active ? dock.theme.tabText : dock.theme.muted,
                boxShadow: active ? `inset 0 -2px 0 ${dock.theme.accent}` : undefined,
                fontStyle: preview ? "italic" : undefined,
              }}
              onPointerDown={(event) => onTabPointerDown(tabId, event)}
            >
              <span className="truncate text-xs">{title}</span>
              <button type="button" className="px-1 text-xs" aria-label={`Pop out ${title}`} onClick={() => popOut(tabId)}>↗</button>
              {dock.closable(tabId) && (
                <button type="button" className="px-1 text-xs" aria-label={`Close ${title}`} onClick={() => dock.closeTab(tabId)}>×</button>
              )}
            </div>
          );
        })}
        <div className="relative ml-auto flex items-center pr-1">
          <button
            type="button"
            className="px-2 text-xs"
            aria-label="Split group"
            aria-expanded={menu}
            disabled={dock.singleGroup || node.tabs.length < 2}
            onClick={() => setMenu((open) => !open)}
          >
            Split
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 top-7 z-20 flex w-28 flex-col py-1 text-xs" style={{ background: dock.theme.bar, border: `1px solid ${dock.theme.border}` }}>
              {(["right", "bottom", "quad"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  role="menuitem"
                  className="px-2 py-1 text-left"
                  onClick={() => {
                    dock.applyPreset(node.id, preset);
                    setMenu(false);
                  }}
                >
                  {preset === "right" ? "Right" : preset === "bottom" ? "Bottom" : "Quad"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {node.activeId ? <DockViewHost id={node.activeId} /> : null}
        {hitHere && hitHere.zone !== "tabs" && (
          <div className="pointer-events-none absolute" style={previewStyle(hitHere.zone, dock.theme.preview)} />
        )}
        {hitHere?.zone === "tabs" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-8" style={{ background: dock.theme.preview }} />
        )}
      </div>
    </section>
  );
}

function previewStyle(edge: DockEdge, color: string): CSSProperties {
  const base: CSSProperties = { background: color };
  if (edge === "left") return { ...base, top: 0, bottom: 0, left: 0, width: "50%" };
  if (edge === "right") return { ...base, top: 0, bottom: 0, right: 0, width: "50%" };
  if (edge === "top") return { ...base, top: 0, left: 0, right: 0, height: "50%" };
  return { ...base, bottom: 0, left: 0, right: 0, height: "50%" };
}

const pointer = { x: 0, y: 0, ready: false };

if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.ready = true;
  });
}

function lastPointer(): { x: number; y: number } | null {
  return pointer.ready ? { x: pointer.x, y: pointer.y } : null;
}

function hitTest(x: number, y: number, allowEdges: boolean): DockHit | null {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-dock-bounds]")];
  const matches = nodes.filter((element) => {
    const rect = element.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }).sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return ar.width * ar.height - br.width * br.height;
  });
  const element = matches[0];
  if (!element) return null;
  const groupId = element.dataset.dockBounds ?? "";
  const bar = element.querySelector<HTMLElement>("[data-dock-tabs]");
  if (bar) {
    const rect = bar.getBoundingClientRect();
    if (y >= rect.top && y <= rect.bottom) return { groupId, zone: "tabs", index: indexOnBar(bar, x) };
  }
  if (!allowEdges) return null;
  const rect = element.getBoundingClientRect();
  const edge = edgeAt(x - rect.left, y - rect.top, rect.width, rect.height);
  if (!edge) return null;
  return { groupId, zone: edge, index: Number.MAX_SAFE_INTEGER };
}

function indexOnBar(bar: HTMLElement, x: number): number {
  const tabs = [...bar.querySelectorAll<HTMLElement>("[data-dock-tab]")];
  for (let index = 0; index < tabs.length; index += 1) {
    const rect = tabs[index]!.getBoundingClientRect();
    if (x < rect.left + rect.width / 2) return index;
  }
  return tabs.length;
}
