export interface DockTheme {
  bar: string;
  barText: string;
  tabActive: string;
  tabText: string;
  muted: string;
  border: string;
  accent: string;
  preview: string;
  body: string;
}

/** Zinc chrome used when a host does not pass its own colors. */
export const DOCK_DEFAULT_THEME: DockTheme = {
  bar: "#18181b",
  barText: "#fafafa",
  tabActive: "#27272a",
  tabText: "#e4e4e7",
  muted: "#a1a1aa",
  border: "#3f3f46",
  accent: "#38bdf8",
  preview: "rgba(56, 189, 248, 0.28)",
  body: "#09090b",
};
