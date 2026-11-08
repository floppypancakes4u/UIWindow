"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  activateTab,
  closeTab as closeTabIn,
  locateTab,
  dockTab as dockTabIn,
  ensureTab as ensureTabIn,
  moveTab as moveTabIn,
  openTab as openTabIn,
  openPreviewTab,
  popOutTab,
  floatTab as floatTabIn,
  setSplitRatio,
  splitGroupPreset,
  splitOffTab,
  toggleTab as toggleTabIn,
  sanitizeDockLayout,
} from "@/lib/dock/layout";
import type { DockEdge, DockLayout, DockPlacement, DockSplitPreset, DockTabId } from "@/lib/dock/types";
import { DOCK_DEFAULT_THEME, type DockTheme } from "@/lib/dock/theme";

export interface DockHit {
  groupId: string;
  zone: "tabs" | DockEdge;
  index: number;
}

export interface DockDrag {
  tabId: string;
  kind: "tab" | "float";
  x: number;
  y: number;
  hit: DockHit | null;
}

export interface DockWorkspaceApi {
  layout: DockLayout;
  theme: DockTheme;
  singleGroup: boolean;
  focusedId: string | null;
  drag: DockDrag | null;
  openTab: (id: DockTabId, placement: DockPlacement) => "group" | "float";
  openPreview: (id: DockTabId, placement: DockPlacement) => void;
  pinTab: (id: DockTabId) => void;
  previewId: DockTabId | null;
  ensureTab: (id: DockTabId, placement: DockPlacement) => void;
  toggleTab: (id: DockTabId, placement: DockPlacement) => "focused" | "closed" | "float";
  closeTab: (id: DockTabId) => void;
  focusTab: (id: DockTabId) => void;
  isTabOpen: (id: DockTabId) => boolean;
  isTabActive: (id: DockTabId) => boolean;
  openTabIds: () => DockTabId[];
  moveTab: (id: DockTabId, groupId: string, index: number) => void;
  splitOff: (id: DockTabId, groupId: string, edge: DockEdge) => void;
  resizeSplit: (splitId: string, ratio: number) => void;
  applyPreset: (groupId: string, preset: DockSplitPreset) => void;
  /** Take a tab out of the tree and mark it floated. */
  releaseTab: (id: DockTabId) => void;
  /** Float a tab whether it is docked or closed. No-ops when already floated. */
  floatTab: (id: DockTabId) => void;
  /** Put a tab, including a floated one, at a hit target. */
  dockInto: (id: DockTabId, hit: DockHit) => void;
  setDrag: (drag: DockDrag | null) => void;
  setFocusedId: (id: string | null) => void;
  closable: (id: DockTabId) => boolean;
  hosts: ReadonlyMap<string, HTMLElement>;
  registerHost: (id: string, node: HTMLElement | null) => void;
}

const DockContext = createContext<DockWorkspaceApi | null>(null);

export interface DockDragApi {
  drag: DockDrag | null;
  setDrag: (drag: DockDrag | null) => void;
}

const DockDragContext = createContext<DockDragApi | null>(null);

function hitEquals(a: DockHit | null | undefined, b: DockHit | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.groupId === b.groupId && a.zone === b.zone && a.index === b.index;
}

/** True when two drag snapshots share the same tab/kind/hit (pointer x/y ignored). */
export function dragHitEquals(a: DockDrag | null, b: DockDrag | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.tabId === b.tabId && a.kind === b.kind && hitEquals(a.hit, b.hit);
}

function readSaved(storageKey: string | undefined): unknown {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch {
    return null;
  }
}

function useNarrowScreen(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const media = window.matchMedia("(max-width: 760px)");
    media.addEventListener("change", onStoreChange);
    return () => media.removeEventListener("change", onStoreChange);
  }, []);
  return useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 760px)").matches, () => false);
}

export function DockProvider({
  children,
  initialLayout,
  storageKey,
  knownIds,
  permanentIds = [],
  theme,
}: {
  children: ReactNode;
  initialLayout: DockLayout;
  storageKey?: string;
  knownIds: readonly string[];
  permanentIds?: readonly string[];
  theme?: Partial<DockTheme>;
}) {
  const permanentKey = permanentIds.join("\0");
  const [layout, setLayout] = useState<DockLayout>(() => (
    sanitizeDockLayout(readSaved(storageKey) ?? initialLayout, knownIds, permanentIds, initialLayout)
  ));
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewRef = useRef(previewId);
  previewRef.current = previewId;
  const [drag, setDragState] = useState<DockDrag | null>(null);
  const dragRef = useRef<DockDrag | null>(null);
  dragRef.current = drag;
  // Pointer x/y are driven via DOM on the ghost chip; React only needs hit identity.
  const setDrag = useCallback((next: DockDrag | null) => {
    setDragState((current) => (dragHitEquals(current, next) ? current : next));
  }, []);
  const [hosts, setHosts] = useState<ReadonlyMap<string, HTMLElement>>(() => new Map());
  const singleGroup = useNarrowScreen();
  const registerHost = useCallback((id: string, node: HTMLElement | null) => {
    setHosts((current) => {
      const has = current.get(id) ?? null;
      if (has === node) return current;
      const next = new Map(current);
      if (node) next.set(id, node);
      else next.delete(id);
      return next;
    });
  }, []);
  const mergedTheme = useMemo(() => ({ ...DOCK_DEFAULT_THEME, ...theme }), [theme]);
  const closable = useCallback((id: string) => !permanentIds.includes(id), [permanentKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // A full or blocked store keeps the in-memory layout.
    }
  }, [layout, storageKey]);

  const openTab = useCallback((id: string, placement: DockPlacement) => {
    const resultBox: { where: "group" | "float" } = { where: "group" };
    setLayout((current) => {
      const result = openTabIn(current, id, placement);
      resultBox.where = result.where;
      return result.layout;
    });
    if (resultBox.where === "group") setFocusedId(id);
    return resultBox.where;
  }, []);

  const openPreview = useCallback((id: string, placement: DockPlacement) => {
    setLayout((current) => {
      const result = openPreviewTab(current, id, placement, previewRef.current, closable);
      previewRef.current = result.previewId;
      return result.layout;
    });
    setPreviewId(previewRef.current);
    setFocusedId(id);
  }, [closable]);

  const pinTab = useCallback((id: string) => {
    setPreviewId((current) => {
      if (current !== id) return current;
      previewRef.current = null;
      return null;
    });
  }, []);

  const toggleTab = useCallback((id: string, placement: DockPlacement) => {
    const resultBox: { action: "focused" | "closed" | "float" } = { action: "focused" };
    setLayout((current) => {
      const result = toggleTabIn(current, id, placement, closable);
      resultBox.action = result.action;
      return result.layout;
    });
    if (resultBox.action === "focused") setFocusedId(id);
    return resultBox.action;
  }, [closable]);

  const close = useCallback((id: string) => {
    setLayout((current) => closeTabIn(current, id, closable));
    setPreviewId((current) => {
      if (current !== id) return current;
      previewRef.current = null;
      return null;
    });
  }, [closable]);

  const focusTab = useCallback((id: string) => {
    setLayout((current) => activateTab(current, id));
    setFocusedId(id);
  }, []);

  const dragApi = useMemo<DockDragApi>(() => ({ drag, setDrag }), [drag, setDrag]);

  // Keep drag off the main context memo so layout consumers (e.g. AppShell) do not
  // re-render on every pointer move. `drag` is exposed via a getter for API compat.
  const api = useMemo<DockWorkspaceApi>(() => ({
    layout,
    theme: mergedTheme,
    singleGroup,
    focusedId,
    get drag() {
      return dragRef.current;
    },
    openTab,
    openPreview,
    pinTab,
    previewId,
    ensureTab: (id, placement) => setLayout((current) => ensureTabIn(current, id, placement)),
    toggleTab,
    closeTab: close,
    focusTab,
    isTabOpen: (id) => locateTab(layout, id).kind !== "closed",
    isTabActive: (id) => {
      const location = locateTab(layout, id);
      return location.kind === "group" && location.active === true;
    },
    openTabIds: () => {
      const ids: string[] = [];
      const walk = (node: DockLayout["root"]) => {
        if (node.type === "group") ids.push(...node.tabs);
        else { walk(node.first); walk(node.second); }
      };
      walk(layout.root);
      return ids;
    },
    moveTab: (id, groupId, index) => {
      setLayout((current) => moveTabIn(current, id, groupId, index));
      setFocusedId(id);
    },
    splitOff: (id, groupId, edge) => {
      setLayout((current) => splitOffTab(current, id, groupId, edge, `${groupId}-pane`, `${groupId}-split`));
      setFocusedId(id);
    },
    resizeSplit: (splitId, ratio) => setLayout((current) => setSplitRatio(current, splitId, ratio)),
    applyPreset: (groupId, preset) => setLayout((current) => splitGroupPreset(current, groupId, preset)),
    releaseTab: (id) => setLayout((current) => popOutTab(current, id)),
    floatTab: (id) => {
      setLayout((current) => floatTabIn(current, id));
      setFocusedId(id);
    },
    dockInto: (id, hit) => {
      const placement: DockPlacement = hit.zone === "tabs"
        ? {
            groupId: hit.groupId,
            index: hit.index,
            newGroupId: `${hit.groupId}-dock`,
            newSplitId: `${hit.groupId}-dock-split`,
          }
        : {
            splitGroupId: hit.groupId,
            edge: hit.zone,
            sizePx: 360,
            newGroupId: `${hit.groupId}-dock`,
            newSplitId: `${hit.groupId}-dock-split`,
          };
      setLayout((current) => dockTabIn(current, id, placement));
      setFocusedId(id);
    },
    setDrag,
    setFocusedId,
    closable,
    hosts,
    registerHost,
  }), [layout, mergedTheme, singleGroup, focusedId, previewId, openTab, openPreview, pinTab, toggleTab, close, focusTab, closable, hosts, registerHost, setDrag]);

  return (
    <DockDragContext.Provider value={dragApi}>
      <DockContext.Provider value={api}>{children}</DockContext.Provider>
    </DockDragContext.Provider>
  );
}

export function useDockWorkspace(): DockWorkspaceApi {
  const value = useContext(DockContext);
  if (!value) throw new Error("useDockWorkspace must be used within DockProvider");
  return value;
}

/** Subscribe to dock drag / drop-target state without invalidating layout consumers. */
export function useDockDrag(): DockDragApi {
  const value = useContext(DockDragContext);
  if (!value) throw new Error("useDockDrag must be used within DockProvider");
  return value;
}
