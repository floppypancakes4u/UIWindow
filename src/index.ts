// Public API for @spify/app-window.

// Provider + hook (the primary surface most consumers need).
export {
  AppWindowManagerProvider,
  useAppWindowManager,
  type AppWindowManagerPublicApi,
} from "@/components/ui/app-window/app-window-manager-context";

// Core types.
export type {
  AppWindowInstanceApi,
  AppWindowOpenRequest,
  AppWindowOptions,
  ManagedAppWindow,
  AppWindowTheme,
  AppWindowBounds,
  AppWindowControlAction,
  AppWindowPersistedState,
  ResolvedAppWindowOptions,
  SnapTarget,
  SnapTargetType,
} from "@/lib/app-window/types";

// Theme + option defaults (handy for building custom themes / presets).
export {
  APP_WINDOW_BASE_THEME,
  APP_WINDOW_DEFAULT_OPTIONS,
} from "@/lib/app-window/types";

// Persistence helpers (consumers that wire their own save/restore around windows).
export {
  getStorageKey,
  loadPersistedWindowState,
  savePersistedWindowState,
  clearPersistedWindowState,
} from "@/lib/app-window/app-window-helpers";

// Lower-level building blocks for advanced/custom window managers.
export {
  appWindowManagerReducer,
  createInitialAppWindowManagerState,
  type AppWindowManagerState,
  type AppWindowManagerAction,
} from "@/lib/app-window/app-window-reducer";
export { buildManagedAppWindow } from "@/lib/app-window/build-managed-window";

export { DockProvider, useDockWorkspace, useDockDrag } from "@/components/ui/dock/dock-provider";
export type { DockDrag, DockDragApi, DockHit, DockWorkspaceApi } from "@/components/ui/dock/dock-provider";
export { DockWorkspace } from "@/components/ui/dock/dock-workspace";
export type { DockView } from "@/components/ui/dock/dock-workspace";
export { DOCK_DEFAULT_THEME } from "@/lib/dock/theme";
export type { DockTheme } from "@/lib/dock/theme";
export type {
  DockEdge,
  DockGroupNode,
  DockLayout,
  DockNode,
  DockPlacement,
  DockSplitNode,
  DockSplitPreset,
  DockTabLocation,
} from "@/lib/dock/types";
export {
  closeTab,
  dockTab,
  ensureTab,
  flattenDock,
  locateTab,
  moveTab,
  openTab,
  openPreviewTab,
  popOutTab,
  floatTab,
  sanitizeDockLayout,
  splitGroupPreset,
  toggleTab,
} from "@/lib/dock/layout";
