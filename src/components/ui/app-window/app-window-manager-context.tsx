"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { AppWindowFrame } from "@/components/ui/app-window/app-window-frame";
import {
  AppWindowInternalContext,
  type AppWindowManagerInternalValue,
} from "@/components/ui/app-window/app-window-internal-context";
import { AppWindowMinimizedTray } from "@/components/ui/app-window/app-window-minimized-tray";
import { AppWindowSnapPreview } from "@/components/ui/app-window/app-window-snap-preview";
import { cn } from "@/lib/cn";
import { buildManagedAppWindow } from "@/lib/app-window/build-managed-window";
import {
  clearPersistedWindowState,
  getStorageKey,
  savePersistedWindowState,
} from "@/lib/app-window/app-window-helpers";
import {
  appWindowManagerReducer,
  createInitialAppWindowManagerState,
} from "@/lib/app-window/app-window-reducer";
import type {
  AppWindowInstanceApi,
  AppWindowOpenRequest,
  AppWindowOptions,
  AppWindowTheme,
  ManagedAppWindow,
  SnapTarget,
} from "@/lib/app-window/types";

export interface AppWindowManagerPublicApi {
  openWindow: (req: AppWindowOpenRequest) => string;
  closeWindow: (id: string, opts?: { force?: boolean }) => boolean;
  closeAll: (opts?: { force?: boolean }) => void;
  focusWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  getWindow: (id: string) => ManagedAppWindow | null;
  updateWindow: (
    id: string,
    patch: {
      title?: string;
      children?: ReactNode;
      theme?: Partial<AppWindowTheme>;
      headerActions?: AppWindowOptions["headerActions"];
    }
  ) => void;
}

const PublicContext = createContext<AppWindowManagerPublicApi | null>(null);

function persistWindowFromState(w: ManagedAppWindow | undefined): void {
  if (!w?.options.rememberState) return;
  const key = getStorageKey(w.options.persistKey ?? "", w.id);
  savePersistedWindowState(key, {
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    isMaximized: w.isMaximized,
    isMinimized: w.isMinimized,
  });
}

function getCurrentContainerSize(
  host: HTMLDivElement | null,
  fallback: { width: number; height: number }
): { width: number; height: number; measured: boolean } {
  if (!host) {
    return { ...fallback, measured: false };
  }

  const rect = host.getBoundingClientRect();
  const liveWidth = Math.max(0, Math.floor(host.clientWidth || rect.width || 0));
  const liveHeight = Math.max(0, Math.floor(host.clientHeight || rect.height || 0));
  const measured = liveWidth > 0 && liveHeight > 0;
  const width = measured ? liveWidth : fallback.width;
  const height = measured ? liveHeight : fallback.height;

  return { width, height, measured };
}

export function AppWindowManagerProvider({
  children,
  className,
  minimizedTrayPortalElement = null,
}: {
  children: ReactNode;
  className?: string;
  /** When set, minimized chips render here instead of over the canvas (e.g. build toolbar). */
  minimizedTrayPortalElement?: HTMLElement | null;
}) {
  const [state, dispatch] = useReducer(
    appWindowManagerReducer,
    undefined,
    createInitialAppWindowManagerState
  );
  const stateRef = useRef(state);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const containerSizeRef = useRef(containerSize);
  const minimizeFlashSeqRef = useRef(0);
  const [minimizeFlashSignal, setMinimizeFlashSignal] = useState<{
    windowId: string;
    seq: number;
  } | null>(null);

  useLayoutEffect(() => {
    stateRef.current = state;
  });
  useLayoutEffect(() => {
    containerSizeRef.current = containerSize;
  });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.max(1, Math.floor(cr.width));
      const h = Math.max(1, Math.floor(cr.height));
      setContainerSize({ width: w, height: h });
      dispatch({ type: "constrainAll", containerWidth: w, containerHeight: h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persistWindowById = useCallback((id: string) => {
    persistWindowFromState(stateRef.current.windows[id]);
  }, []);

  const buildApiRef = useRef<(id: string) => AppWindowInstanceApi>(() => ({
    id: "",
    close: () => false,
    minimize: () => {},
    restore: () => {},
    toggleMaximize: () => {},
    focus: () => {},
    setTitle: () => {},
  }));

  const closeWindowImpl = useCallback((id: string, opts?: { force?: boolean }): boolean => {
    const w = stateRef.current.windows[id];
    if (!w) return false;
    if (!opts?.force && w.options.closable === false) {
      return false;
    }
    const api = buildApiRef.current(id);
    if (!opts?.force && w.options.onClose?.(api) === false) {
      return false;
    }
    if (w.options.clearStateOnDestroy) {
      clearPersistedWindowState(getStorageKey(w.options.persistKey ?? "", id));
    }
    dispatch({ type: "close", id });
    return true;
  }, []);

  const focusWindow = useCallback((id: string) => {
    const w = stateRef.current.windows[id];
    if (!w || w.isMinimized) return;
    const z = stateRef.current.zCounter;
    dispatch({ type: "focus", id, z });
  }, []);

  const minimizeWindow = useCallback(
    (id: string) => {
      const w = stateRef.current.windows[id];
      if (!w || w.isMinimized) return;
      if (w.isMaximized) {
        dispatch({ type: "unmaximize", id });
      }
      dispatch({ type: "minimize", id });
      minimizeFlashSeqRef.current += 1;
      setMinimizeFlashSignal({ windowId: id, seq: minimizeFlashSeqRef.current });
      w.options.onMinimize?.(buildApiRef.current(id));
      persistWindowById(id);
    },
    [persistWindowById]
  );

  const restoreWindow = useCallback(
    (id: string) => {
      const w = stateRef.current.windows[id];
      if (!w || !w.isMinimized) return;
      dispatch({ type: "restore", id });
      requestAnimationFrame(() => {
        const nw = stateRef.current.windows[id];
        nw?.options.onRestore?.(buildApiRef.current(id));
        persistWindowById(id);
        focusWindow(id);
      });
    },
    [focusWindow, persistWindowById]
  );

  const toggleMaximizeWindow = useCallback(
    (id: string, force?: boolean | null) => {
      const w = stateRef.current.windows[id];
      if (!w || w.isMinimized || !w.options.maximizable) return;
      const { width: cw, height: ch } = getCurrentContainerSize(
        hostRef.current,
        containerSizeRef.current
      );
      const next = force === null || force === undefined ? !w.isMaximized : !!force;
      if (next === w.isMaximized) return;
      if (next) {
        dispatch({ type: "maximize", id, containerWidth: cw, containerHeight: ch });
        w.options.onMaximize?.(buildApiRef.current(id), true);
      } else {
        dispatch({ type: "unmaximize", id });
        w.options.onMaximize?.(buildApiRef.current(id), false);
      }
      requestAnimationFrame(() => persistWindowById(id));
    },
    [persistWindowById]
  );

  const buildApi = useCallback(
    (id: string): AppWindowInstanceApi => ({
      id,
      close: (opts) => closeWindowImpl(id, opts),
      minimize: () => minimizeWindow(id),
      restore: () => restoreWindow(id),
      toggleMaximize: (force) => toggleMaximizeWindow(id, force ?? null),
      focus: () => focusWindow(id),
      setTitle: (title) => dispatch({ type: "updateWindow", id, patch: { title } }),
    }),
    [closeWindowImpl, focusWindow, minimizeWindow, restoreWindow, toggleMaximizeWindow]
  );

  useLayoutEffect(() => {
    buildApiRef.current = buildApi;
  });

   const openWindow = useCallback(
     (req: AppWindowOpenRequest): string => {
       const { width: cw, height: ch, measured } = getCurrentContainerSize(
         hostRef.current,
         containerSizeRef.current
       );
       const z = stateRef.current.zCounter;
       const managed = buildManagedAppWindow(req, cw, ch, z, {
         containerMeasured: measured,
       });
       dispatch({ type: "open", window: managed, zCounter: z + 1 });
       const id = managed.id;
       requestAnimationFrame(() => {
         if (!managed.wasRestoredFromPersistence) {
           persistWindowById(id);
         }
         buildApiRef.current(id).focus();
       });
       return id;
     },
     [persistWindowById]
   );

  const closeWindow = useCallback(
    (id: string, opts?: { force?: boolean }) => closeWindowImpl(id, opts),
    [closeWindowImpl]
  );

  const closeAll = useCallback(
    (opts?: { force?: boolean }) => {
      for (const id of [...stateRef.current.ids]) {
        closeWindowImpl(id, opts);
      }
    },
    [closeWindowImpl]
  );

  const getWindow = useCallback(
    (id: string): ManagedAppWindow | null => stateRef.current.windows[id] ?? null,
    []
  );

  const updateWindow = useCallback(
    (
      id: string,
      patch: {
        title?: string;
        children?: ReactNode;
        theme?: Partial<AppWindowTheme>;
      }
    ) => {
      dispatch({ type: "updateWindow", id, patch });
    },
    []
  );

  const publicApi = useMemo<AppWindowManagerPublicApi>(
    () => ({
      openWindow,
      closeWindow,
      closeAll,
      focusWindow,
      restoreWindow,
      getWindow,
      updateWindow,
    }),
    [openWindow, closeWindow, closeAll, focusWindow, restoreWindow, getWindow, updateWindow]
  );

  const setSnapPreview = useCallback((target: SnapTarget | null) => {
    dispatch({ type: "setSnapPreview", target });
  }, []);

  const isTopModalFor = useCallback((id: string): boolean => {
    const wins = stateRef.current.windows;
    const ids = stateRef.current.ids;
    const modals = ids
      .map((i) => wins[i])
      .filter((w) => w?.options.modal && !w.isMinimized);
    if (!modals.length) return false;
    const top = [...modals].sort((a, b) => b.zIndex - a.zIndex)[0];
    return top?.id === id;
  }, []);

  const internalValue = useMemo<AppWindowManagerInternalValue>(
    () => ({
      hostRef,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      activeId: state.activeId,
      dispatch,
      setSnapPreview,
      buildApi,
      isTopModalFor,
      persistWindowById,
    }),
    [
      state,
      containerSize.width,
      containerSize.height,
      setSnapPreview,
      buildApi,
      isTopModalFor,
      persistWindowById,
    ]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = stateRef.current.activeId;
      if (!active) return;
      const w = stateRef.current.windows[active];
      if (!w?.options.closeOnEscape) return;
      e.preventDefault();
      if (w.isMinimized) {
        dispatch({ type: "restore", id: active });
        requestAnimationFrame(() => persistWindowById(active));
      } else {
        closeWindowImpl(active, { force: false });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeWindowImpl, persistWindowById]);

  const minimizedItems = state.ids
    .map((id) => state.windows[id])
    .filter((w) => w?.isMinimized)
    .map((w) => ({ id: w.id, title: w.title }));

  const minimizedTray =
    minimizedItems.length === 0 ? null : (
      <AppWindowMinimizedTray
        items={minimizedItems}
        flashSignal={minimizeFlashSignal}
        onRestore={(id) => restoreWindow(id)}
        placement={minimizedTrayPortalElement ? "toolbar" : "canvas"}
      />
    );

  return (
    <PublicContext.Provider value={publicApi}>
      <AppWindowInternalContext.Provider value={internalValue}>
        <div
          ref={hostRef}
          data-testid="app-window-manager-host"
          className={cn(
            "relative h-full min-h-0 w-full min-w-0 overflow-hidden",
            className
          )}
        >
          {children}
          {state.ids.map((id) => {
            const w = state.windows[id];
            if (!w) return null;
            return <AppWindowFrame key={id} win={w} />;
          })}
          <AppWindowSnapPreview target={state.snapPreview} />
          {minimizedTray && minimizedTrayPortalElement
            ? createPortal(minimizedTray, minimizedTrayPortalElement)
            : minimizedTray}
        </div>
      </AppWindowInternalContext.Provider>
    </PublicContext.Provider>
  );
}

export function useAppWindowManager(): AppWindowManagerPublicApi {
  const v = useContext(PublicContext);
  if (!v) {
    throw new Error("useAppWindowManager must be used within AppWindowManagerProvider");
  }
  return v;
}
