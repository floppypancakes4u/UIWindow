# @spify/app-window

A draggable, resizable, snappable **multi-window manager for React**. Open floating
windows that hold arbitrary content, with focus/z-index stacking, minimize-to-tray,
maximize, edge/corner snapping, focus-trapped modals, and `localStorage` position/size
persistence. The window system is completely domain-agnostic — it renders whatever
`ReactNode` you hand it.

## Install

```bash
npm install @spify/app-window
```

`react` and `react-dom` (>=18) are peer dependencies.

## Styling (Tailwind)

The window chrome colors come from an inline theme, but the controls, minimized tray,
snap preview, modal backdrop, and layout use **Tailwind utility classes** (the default
`zinc` / `sky` / `yellow` palette — no custom colors). Add the bundled preset so Tailwind
doesn't purge those classes:

```js
// tailwind.config.{js,ts}
module.exports = {
  presets: [require("@spify/app-window/tailwind-preset")],
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    // the preset already adds ./node_modules/@spify/app-window/dist/**
  ],
};
```

> Not using Tailwind? You'd need to provide equivalent CSS for the utility classes used
> by the components. The preset path is the supported route today.

## Usage

Wrap a **sized, positioned** region in the provider (it sets `position: relative;
height/width: 100%; overflow: hidden` on its host), then open windows from anywhere
inside it via the hook.

```tsx
import {
  AppWindowManagerProvider,
  useAppWindowManager,
} from "@spify/app-window";

export function App() {
  return (
    <div style={{ height: "100vh" }}>
      <AppWindowManagerProvider>
        <Toolbar />
      </AppWindowManagerProvider>
    </div>
  );
}

function Toolbar() {
  const wm = useAppWindowManager();
  return (
    <button
      onClick={() =>
        wm.openWindow({
          title: "Hello",
          children: <p>Any React content here.</p>,
          width: 480,
          height: 320,
        })
      }
    >
      Open window
    </button>
  );
}
```

### Manager API (`useAppWindowManager()`)

| Method | Description |
|--------|-------------|
| `openWindow(req)` | Open a window; returns its id. |
| `closeWindow(id, { force })` | Close a window (honors `closable` / `onClose` unless `force`). |
| `closeAll({ force })` | Close every window. |
| `focusWindow(id)` | Raise + focus a window. |
| `restoreWindow(id)` | Restore a minimized window, then focus it. No-op if it is not minimized. |
| `getWindow(id)` | Read the managed window record. |
| `updateWindow(id, patch)` | Patch `title`, `children`, `theme`, or `headerActions`. |

### `openWindow` request (`AppWindowOpenRequest`)

`title` and `children` are required; everything else is optional. Highlights:

- **Geometry:** `width`, `height`, `minWidth`, `minHeight`, `x`, `y`
- **Controls:** `resizable`, `closable`, `minimizable`, `maximizable`, `draggable`,
  `controlOrder`
- **Behavior:** `modal`, `trapFocus`, `closeOnEscape`, `constrainToViewport`,
  `snapThreshold` (px from edges; `0` disables snapping)
- **Persistence:** `persistKey`, `rememberState`, `clearStateOnDestroy`
- **Styling:** `theme` (partial `AppWindowTheme`), `style` / `bodyStyle` / `headerStyle`,
  `className` / `bodyClassName` / `headerClassName`, `ariaLabel`
- **Custom header controls:** `headerActions` — a node or `(api) => node`
- **Lifecycle callbacks:** `onCreate`, `onFocus`, `onMove(Start|End)`, `onResize(End)`,
  `onMinimize`, `onRestore`, `onMaximize`, `onClose` (return `false` to veto close)

### Theming

Pass a partial `AppWindowTheme` per window via `theme`, or start from
`APP_WINDOW_BASE_THEME` (dark zinc panel). Theme values are inline styles (colors,
borders, shadows, opacity).

## Next.js (App Router)

The package ships a built bundle that already carries the `"use client"` directive, so it
works in Server Component trees without extra config. Render
`<AppWindowManagerProvider>` inside a client boundary as usual.

## License

MIT
