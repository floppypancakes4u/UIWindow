import type { CSSProperties, ReactNode } from "react";

/** Dock target when dragging near container edges (coordinates relative to manager host). */
export type SnapTargetType =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top"
  | "left"
  | "right";

export interface SnapTarget {
  type: SnapTargetType;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppWindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppWindowPersistedState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
  isMinimized: boolean;
}

/** Visual overrides merged onto defaults (inline styles). */
export interface AppWindowTheme {
  background: string;
  border: string;
  borderRadius: string;
  boxShadow: string;
  backdropFilter: string;
  headerBackground: string;
  headerBorderBottom: string;
  titleColor: string;
  bodyColor: string;
  controlBackground: string;
  controlHoverBackground: string;
  controlColor: string;
  resizeHandleSize: string;
  activeBoxShadow: string;
  inactiveOpacity: string;
}

/** Dense zinc panel tokens — aligned with `styleguide.md` (Cards / information-dense workspace). */
export const APP_WINDOW_BASE_THEME: AppWindowTheme = {
  background: "rgba(24, 24, 27, 0.96)",
  border: "1px solid #000000",
  borderRadius: "6px",
  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.28)",
  backdropFilter: "none",
  headerBackground: "rgb(9 9 11)",
  headerBorderBottom: "1px solid #000000",
  titleColor: "#fafafa",
  bodyColor: "#a1a1aa",
  controlBackground: "rgb(39 39 42)",
  controlHoverBackground: "rgb(63 63 70)",
  controlColor: "#e4e4e7",
  resizeHandleSize: "10px",
  activeBoxShadow: "0 2px 10px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(59, 130, 246, 0.35)",
  inactiveOpacity: "0.94",
};

export type AppWindowControlAction = "minimize" | "maximize" | "close";

/** Imperative handle passed to `headerActions` render prop and `onClose`. */
export interface AppWindowInstanceApi {
  id: string;
  close: (opts?: { force?: boolean }) => boolean;
  minimize: () => void;
  restore: () => void;
  toggleMaximize: (force?: boolean | null) => void;
  focus: () => void;
  setTitle: (title: string) => void;
}

export interface AppWindowOptions {
  persistKey?: string | null;
  clearStateOnDestroy?: boolean;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  x?: number | null;
  y?: number | null;
  resizable?: boolean;
  closable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  draggable?: boolean;
  modal?: boolean;
  /** Defaults to `true` when `modal` is true. */
  trapFocus?: boolean | null;
  constrainToViewport?: boolean;
  rememberState?: boolean;
  closeOnEscape?: boolean;
  /** Pixels from container edges to show snap preview; `0` or negative disables edge/corner snapping. */
  snapThreshold?: number;
  controlOrder?: AppWindowControlAction[];
  headerActions?: ReactNode | ((api: AppWindowInstanceApi) => ReactNode);
  theme?: Partial<AppWindowTheme>;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
  headerStyle?: CSSProperties;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
  ariaLabel?: string | null;
   onCreate?: (api: AppWindowInstanceApi) => void;
   onFocus?: (api: AppWindowInstanceApi) => void;
   onMoveStart?: (api: AppWindowInstanceApi) => void;
   onMove?: (api: AppWindowInstanceApi, detail: { x: number; y: number; snapTarget: SnapTarget | null }) => void;
   onResize?: (
     api: AppWindowInstanceApi,
     detail: {
       width: number;
       height: number;
       x: number;
       y: number;
       direction: string;
     }
   ) => void;
    onMinimize?: (api: AppWindowInstanceApi) => void;
    onRestore?: (api: AppWindowInstanceApi) => void;
    onMaximize?: (api: AppWindowInstanceApi, maximized: boolean) => void;
    onMoveEnd?: (api: AppWindowInstanceApi) => void;
    onResizeEnd?: (api: AppWindowInstanceApi) => void;
   /** Return `false` to veto close (ignored when `force: true`). */
   onClose?: (api: AppWindowInstanceApi) => void | boolean;
}

export interface AppWindowOpenRequest extends AppWindowOptions {
  title: string;
  children: ReactNode;
  id?: string;
}

export const APP_WINDOW_DEFAULT_OPTIONS = {
  persistKey: null as string | null,
  clearStateOnDestroy: false,
  width: 600,
  height: 400,
  minWidth: 300,
  minHeight: 200,
  x: null as number | null,
  y: null as number | null,
  resizable: true,
  closable: true,
  minimizable: true,
  maximizable: true,
  draggable: true,
  modal: false,
  trapFocus: null as boolean | null,
  constrainToViewport: true,
  rememberState: true,
  closeOnEscape: false,
  snapThreshold: 22,
  controlOrder: ["minimize", "maximize", "close"] as AppWindowControlAction[],
} as const;

export type ResolvedAppWindowOptions = Omit<AppWindowOptions, "trapFocus" | "theme"> & {
  trapFocus: boolean;
  theme: AppWindowTheme;
};

/** Runtime entry owned by the window manager. */
export interface ManagedAppWindow {
  id: string;
  title: string;
  children: ReactNode;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  isMinimized: boolean;
  isMaximized: boolean;
  previousBounds: AppWindowBounds | null;
  options: ResolvedAppWindowOptions;
  /** Internal: true if this window was restored from persisted state on creation */
  wasRestoredFromPersistence?: boolean;
}
