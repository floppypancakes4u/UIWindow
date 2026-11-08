/** A content id. The dock stores ids, not React nodes. */
export type DockTabId = string;

export type DockEdge = "left" | "right" | "top" | "bottom";

export type DockSplitPreset = "right" | "bottom" | "quad";

export interface DockGroupNode {
  type: "group";
  id: string;
  tabs: DockTabId[];
  activeId: DockTabId;
}

export interface DockSplitNode {
  type: "split";
  id: string;
  /** `row` places children side by side. `column` stacks them. */
  direction: "row" | "column";
  /** Fraction of the span given to the first child, used after the user drags. */
  ratio: number;
  /** Keep the first child at this pixel size until the user drags the divider. */
  firstPx?: number;
  /** Keep the second child at this pixel size until the user drags the divider. */
  secondPx?: number;
  first: DockNode;
  second: DockNode;
}

export type DockNode = DockGroupNode | DockSplitNode;

export interface DockLayout {
  root: DockNode;
  /** Tab ids currently shown in a floating window instead of the tree. */
  floated: DockTabId[];
}

export interface DockPlacement {
  /** Append here when this group is already in the tree. */
  groupId?: string;
  /** Otherwise split this group. Falls back to the first group. */
  splitGroupId?: string;
  edge?: DockEdge;
  /** First-child fraction used when no pixel size is set. */
  ratio?: number;
  /** Pixel size of the new group along the split. */
  sizePx?: number;
  newGroupId: string;
  newSplitId: string;
  /** Index on the target tab bar. Omit to append. */
  index?: number;
  /** When false, a newly opened tab does not become the active tab. */
  activate?: boolean;
}

export interface DockTabLocation {
  kind: "group" | "float" | "closed";
  groupId?: string;
  active?: boolean;
}
