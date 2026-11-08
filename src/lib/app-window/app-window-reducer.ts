import type {
  AppWindowBounds,
  AppWindowOptions,
  AppWindowTheme,
  ManagedAppWindow,
  SnapTarget,
} from "@/lib/app-window/types";

export interface AppWindowManagerState {
  windows: Record<string, ManagedAppWindow>;
  ids: string[];
  zCounter: number;
  activeId: string | null;
  snapPreview: SnapTarget | null;
}

export type AppWindowManagerAction =
  | { type: "open"; window: ManagedAppWindow; zCounter: number }
  | { type: "close"; id: string }
  | { type: "focus"; id: string; z: number }
  | {
      type: "setBounds";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | { type: "minimize"; id: string }
  | { type: "restore"; id: string }
  | { type: "maximize"; id: string; containerWidth: number; containerHeight: number }
  | { type: "unmaximize"; id: string }
  | { type: "applySnap"; id: string; target: SnapTarget }
  | {
      type: "updateWindow";
      id: string;
      patch: Partial<
        Pick<ManagedAppWindow, "title" | "children"> & {
          theme?: Partial<AppWindowTheme>;
          headerActions?: AppWindowOptions["headerActions"];
        }
      >;
    }
  | { type: "setSnapPreview"; target: SnapTarget | null }
  | { type: "constrainAll"; containerWidth: number; containerHeight: number };

const initialState: AppWindowManagerState = {
  windows: {},
  ids: [],
  zCounter: 1000,
  activeId: null,
  snapPreview: null,
};

function pickTopNonMinimized(
  windows: Record<string, ManagedAppWindow>,
  ids: string[]
): string | null {
  const candidates = ids
    .filter((id) => windows[id] && !windows[id].isMinimized)
    .map((id) => windows[id])
    .sort((a, b) => b.zIndex - a.zIndex);
  return candidates[0]?.id ?? null;
}

export function appWindowManagerReducer(
  state: AppWindowManagerState,
  action: AppWindowManagerAction
): AppWindowManagerState {
  switch (action.type) {
    case "open": {
      const wid = action.window.id;
      const exists = state.ids.includes(wid);
      return {
        ...state,
        windows: { ...state.windows, [wid]: action.window },
        ids: exists ? state.ids : [...state.ids, wid],
        zCounter: action.zCounter,
        activeId: wid,
        snapPreview: null,
      };
    }
    case "close": {
      const rest = { ...state.windows };
      delete rest[action.id];
      const ids = state.ids.filter((i) => i !== action.id);
      let activeId = state.activeId;
      if (activeId === action.id) {
        activeId = pickTopNonMinimized(rest, ids);
      }
      return {
        ...state,
        windows: rest,
        ids,
        activeId,
        snapPreview: null,
      };
    }
    case "focus": {
      const w = state.windows[action.id];
      if (!w || w.isMinimized) return state;
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: { ...w, zIndex: action.z },
        },
        zCounter: action.z + 1,
        activeId: action.id,
      };
    }
    case "setBounds": {
      const w = state.windows[action.id];
      if (!w) return state;
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: {
            ...w,
            x: action.x,
            y: action.y,
            width: action.width,
            height: action.height,
            isMaximized: false,
          },
        },
      };
    }
    case "minimize": {
      const w = state.windows[action.id];
      if (!w || w.isMinimized) return state;
      const nextWindows = {
        ...state.windows,
        [action.id]: { ...w, isMinimized: true },
      };
      let activeId = state.activeId;
      if (activeId === action.id) {
        activeId = pickTopNonMinimized(nextWindows, state.ids);
      }
      return {
        ...state,
        windows: nextWindows,
        activeId,
        snapPreview: null,
      };
    }
    case "restore": {
      const w = state.windows[action.id];
      if (!w || !w.isMinimized) return state;
      const z = state.zCounter;
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: { ...w, isMinimized: false, zIndex: z },
        },
        zCounter: z + 1,
        activeId: action.id,
      };
    }
    case "maximize": {
      const w = state.windows[action.id];
      if (!w || w.isMinimized || !w.options.maximizable) return state;
      const prev: AppWindowBounds = {
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
      };
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: {
            ...w,
            isMaximized: true,
            previousBounds: prev,
            x: 0,
            y: 0,
            width: action.containerWidth,
            height: action.containerHeight,
          },
        },
      };
    }
    case "unmaximize": {
      const w = state.windows[action.id];
      if (!w || !w.isMaximized) return state;
      const b = w.previousBounds ?? {
        x: 40,
        y: 40,
        width: w.width,
        height: w.height,
      };
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: {
            ...w,
            isMaximized: false,
            previousBounds: null,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
          },
        },
      };
    }
    case "applySnap": {
      const w = state.windows[action.id];
      if (!w) return state;
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: {
            ...w,
            isMaximized: false,
            x: action.target.x,
            y: action.target.y,
            width: action.target.width,
            height: action.target.height,
          },
        },
        snapPreview: null,
      };
    }
    case "updateWindow": {
      const w = state.windows[action.id];
      if (!w) return state;
      const theme =
        action.patch.theme !== undefined
          ? { ...w.options.theme, ...action.patch.theme }
          : w.options.theme;
      let options = { ...w.options, theme };
      if (action.patch.headerActions !== undefined) {
        options = { ...options, headerActions: action.patch.headerActions };
      }
      return {
        ...state,
        windows: {
          ...state.windows,
          [action.id]: {
            ...w,
            ...(action.patch.title !== undefined ? { title: action.patch.title } : {}),
            ...(action.patch.children !== undefined ? { children: action.patch.children } : {}),
            options,
          },
        },
      };
    }
    case "setSnapPreview": {
      return { ...state, snapPreview: action.target };
    }
    case "constrainAll": {
      const { containerWidth: cw, containerHeight: ch } = action;
      const next: Record<string, ManagedAppWindow> = { ...state.windows };
      for (const id of state.ids) {
        const w = next[id];
        if (!w || w.isMinimized) continue;
        if (w.isMaximized) {
          next[id] = {
            ...w,
            x: 0,
            y: 0,
            width: cw,
            height: ch,
          };
        } else if (w.options.constrainToViewport) {
          const minW = w.minWidth;
          const minH = w.minHeight;
          let width = Math.min(w.width, cw);
          let height = Math.min(w.height, ch);
          width = Math.max(minW, width);
          height = Math.max(minH, height);
          const maxX = Math.max(0, cw - width);
          const maxY = Math.max(0, ch - height);
          next[id] = {
            ...w,
            x: Math.min(Math.max(0, w.x), maxX),
            y: Math.min(Math.max(0, w.y), maxY),
            width,
            height,
          };
        }
      }
      return { ...state, windows: next };
    }
    default:
      return state;
  }
}

export function createInitialAppWindowManagerState(): AppWindowManagerState {
  return { ...initialState };
}
