"use client";

import type { Dispatch, RefObject } from "react";
import { createContext, useContext } from "react";

import type { AppWindowManagerAction } from "@/lib/app-window/app-window-reducer";
import type { AppWindowInstanceApi, SnapTarget } from "@/lib/app-window/types";

export interface AppWindowManagerInternalValue {
  hostRef: RefObject<HTMLDivElement | null>;
  containerWidth: number;
  containerHeight: number;
  activeId: string | null;
  dispatch: Dispatch<AppWindowManagerAction>;
  setSnapPreview: (target: SnapTarget | null) => void;
  buildApi: (id: string) => AppWindowInstanceApi;
  isTopModalFor: (id: string) => boolean;
  persistWindowById: (id: string) => void;
}

const AppWindowInternalContext = createContext<AppWindowManagerInternalValue | null>(null);

export function useAppWindowManagerInternal(): AppWindowManagerInternalValue {
  const v = useContext(AppWindowInternalContext);
  if (!v) {
    throw new Error("useAppWindowManagerInternal must be used within AppWindowManagerProvider");
  }
  return v;
}

export { AppWindowInternalContext };
