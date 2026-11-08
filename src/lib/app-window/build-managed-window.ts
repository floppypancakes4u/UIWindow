import {
  clampBoundsToContainer,
  defaultPositionForSize,
  getStorageKey,
  loadPersistedWindowState,
} from "@/lib/app-window/app-window-helpers";
import {
  APP_WINDOW_BASE_THEME,
  APP_WINDOW_DEFAULT_OPTIONS,
  type AppWindowOpenRequest,
  type ManagedAppWindow,
  type ResolvedAppWindowOptions,
} from "@/lib/app-window/types";

export function buildManagedAppWindow(
  req: AppWindowOpenRequest,
  containerWidth: number,
  containerHeight: number,
  zIndex: number,
  optionsArg?: { containerMeasured?: boolean }
): ManagedAppWindow {
  const containerMeasured = optionsArg?.containerMeasured ?? true;
  const id =
    req.id ?? `window_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const { title, children, theme: themePatch, ...restWithId } = req;
  const rest = { ...restWithId };
  delete rest.id;
  const options: ResolvedAppWindowOptions = {
    ...APP_WINDOW_DEFAULT_OPTIONS,
    ...rest,
    trapFocus: rest.trapFocus ?? !!rest.modal,
    theme: { ...APP_WINDOW_BASE_THEME, ...themePatch },
    persistKey: rest.persistKey ?? null,
  };

  const minW = options.minWidth ?? APP_WINDOW_DEFAULT_OPTIONS.minWidth;
  const minH = options.minHeight ?? APP_WINDOW_DEFAULT_OPTIONS.minHeight;
  let width = Math.max(minW, options.width ?? APP_WINDOW_DEFAULT_OPTIONS.width);
  let height = Math.max(minH, options.height ?? APP_WINDOW_DEFAULT_OPTIONS.height);
  let isMaximized = false;
  let isMinimized = false;
  let x: number | null | undefined = options.x;
  let y: number | null | undefined = options.y;

  const storageKey = getStorageKey(options.persistKey ?? "", id);
  let wasRestoredFromPersistence = false;
  if (options.rememberState) {
    const p = loadPersistedWindowState(storageKey);
    if (p) {
      wasRestoredFromPersistence = true;
      if (Number.isFinite(p.width)) width = Math.max(minW, p.width as number);
      if (Number.isFinite(p.height)) height = Math.max(minH, p.height as number);
      if (Number.isFinite(p.x)) x = p.x as number;
      if (Number.isFinite(p.y)) y = p.y as number;
      if (p.isMaximized && options.maximizable) isMaximized = true;
      if (p.isMinimized) isMinimized = true;
    }
  }

  const defaultPos = defaultPositionForSize(containerWidth, containerHeight, width, height);
  if (x === null || x === undefined) x = defaultPos.x;
  if (y === null || y === undefined) y = defaultPos.y;

  if (isMaximized) {
    x = 0;
    y = 0;
    width = containerWidth;
    height = containerHeight;
  }

  if (
    !isMinimized &&
    !isMaximized &&
    options.constrainToViewport &&
    (containerMeasured || !wasRestoredFromPersistence)
  ) {
    const c = clampBoundsToContainer(
      x as number,
      y as number,
      width,
      height,
      containerWidth,
      containerHeight,
      minW,
      minH
    );
    x = c.x;
    y = c.y;
    width = c.width;
    height = c.height;
  }

  return {
    id,
    title,
    children,
    zIndex,
    x: x!,
    y: y!,
    width,
    height,
    minWidth: minW,
    minHeight: minH,
    isMinimized,
    isMaximized,
    previousBounds: null,
    options,
    wasRestoredFromPersistence,
  };
}
