import type {
  DockEdge,
  DockGroupNode,
  DockLayout,
  DockNode,
  DockPlacement,
  DockSplitNode,
  DockSplitPreset,
  DockTabId,
  DockTabLocation,
} from "@/lib/dock/types";

const MIN_RATIO = 0.08;
const MAX_RATIO = 0.92;

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

export function splitDisplayRatio(node: DockSplitNode, span: number): number {
  if (span > 0 && node.firstPx != null && Number.isFinite(node.firstPx)) {
    return clampRatio(node.firstPx / span);
  }
  if (span > 0 && node.secondPx != null && Number.isFinite(node.secondPx)) {
    return clampRatio(1 - node.secondPx / span);
  }
  return clampRatio(node.ratio);
}

export function collectTabs(node: DockNode): DockTabId[] {
  if (node.type === "group") return [...node.tabs];
  return [...collectTabs(node.first), ...collectTabs(node.second)];
}

export function findGroup(node: DockNode, groupId: string): DockGroupNode | null {
  if (node.type === "group") return node.id === groupId ? node : null;
  return findGroup(node.first, groupId) ?? findGroup(node.second, groupId);
}

export function firstGroup(node: DockNode): DockGroupNode {
  if (node.type === "group") return node;
  return firstGroup(node.first);
}

export function locateTab(layout: DockLayout, tabId: DockTabId): DockTabLocation {
  if (layout.floated.includes(tabId)) return { kind: "float" };
  const group = findTabGroup(layout.root, tabId);
  if (!group) return { kind: "closed" };
  return { kind: "group", groupId: group.id, active: group.activeId === tabId };
}

function findTabGroup(node: DockNode, tabId: DockTabId): DockGroupNode | null {
  if (node.type === "group") return node.tabs.includes(tabId) ? node : null;
  return findTabGroup(node.first, tabId) ?? findTabGroup(node.second, tabId);
}

function replaceGroup(node: DockNode, groupId: string, replacement: DockNode): DockNode {
  if (node.type === "group") return node.id === groupId ? replacement : node;
  const first = replaceGroup(node.first, groupId, replacement);
  const second = replaceGroup(node.second, groupId, replacement);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

/** Remove a tab. An empty group collapses into its sibling. A null root means nothing remains. */
function removeTab(node: DockNode, tabId: DockTabId): DockNode | null {
  if (node.type === "group") {
    if (!node.tabs.includes(tabId)) return node;
    const tabs = node.tabs.filter((id) => id !== tabId);
    if (tabs.length === 0) return null;
    return {
      ...node,
      tabs,
      activeId: tabs.includes(node.activeId) ? node.activeId : tabs[tabs.length - 1]!,
    };
  }
  const first = removeTab(node.first, tabId);
  const second = removeTab(node.second, tabId);
  if (first === node.first && second === node.second) return node;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

function replaceTabId(node: DockNode, fromId: DockTabId, toId: DockTabId): DockNode {
  if (node.type === "group") {
    if (!node.tabs.includes(fromId) || node.tabs.includes(toId)) return node;
    return {
      ...node,
      tabs: node.tabs.map((id) => (id === fromId ? toId : id)),
      activeId: node.activeId === fromId ? toId : node.activeId,
    };
  }
  const first = replaceTabId(node.first, fromId, toId);
  const second = replaceTabId(node.second, fromId, toId);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function insertTab(node: DockNode, groupId: string, tabId: DockTabId, index: number, activate = true): DockNode {
  if (node.type === "group") {
    if (node.id !== groupId) return node;
    const tabs = node.tabs.filter((id) => id !== tabId);
    const at = Math.max(0, Math.min(index, tabs.length));
    tabs.splice(at, 0, tabId);
    const activeId = activate || node.tabs.length === 0 ? tabId : node.activeId;
    return { ...node, tabs, activeId: tabs.includes(activeId) ? activeId : tabId };
  }
  const first = insertTab(node.first, groupId, tabId, index, activate);
  const second = insertTab(node.second, groupId, tabId, index, activate);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

function withoutFloated(layout: DockLayout, tabId: DockTabId): DockLayout {
  if (!layout.floated.includes(tabId)) return layout;
  return { ...layout, floated: layout.floated.filter((id) => id !== tabId) };
}

function emptyRoot(permanentIds: readonly DockTabId[]): DockGroupNode {
  const tabs = [...permanentIds];
  return { type: "group", id: "main", tabs, activeId: tabs[0] ?? "" };
}

export function moveTab(layout: DockLayout, tabId: DockTabId, groupId: string, index: number): DockLayout {
  const from = findTabGroup(layout.root, tabId);
  if (!from) return layout;
  if (!findGroup(layout.root, groupId)) return layout;
  if (from.id === groupId) {
    return { ...layout, root: insertTab(removeTab(layout.root, tabId) ?? layout.root, groupId, tabId, index) };
  }
  const removed = removeTab(layout.root, tabId);
  if (!removed || !findGroup(removed, groupId)) return layout;
  return { ...withoutFloated(layout, tabId), root: insertTab(removed, groupId, tabId, index) };
}

export function splitOffTab(
  layout: DockLayout,
  tabId: DockTabId,
  groupId: string,
  edge: DockEdge,
  newGroupId: string,
  newSplitId: string,
  sizePx?: number
): DockLayout {
  const source = findTabGroup(layout.root, tabId);
  const target = findGroup(layout.root, groupId);
  if (!source || !target) return layout;
  const remaining = target.tabs.filter((id) => id !== tabId);
  if (remaining.length === 0) return layout;

  const removed = removeTab(layout.root, tabId);
  const liveTarget = removed ? findGroup(removed, groupId) : null;
  if (!removed || !liveTarget) return layout;

  const lead = edge === "left" || edge === "top";
  const created: DockGroupNode = { type: "group", id: uniqueId(removed, newGroupId), tabs: [tabId], activeId: tabId };
  const split: DockSplitNode = {
    type: "split",
    id: uniqueId(removed, newSplitId),
    direction: edge === "left" || edge === "right" ? "row" : "column",
    ratio: lead ? 0.32 : 0.68,
    ...(sizePx != null ? (lead ? { firstPx: sizePx } : { secondPx: sizePx }) : {}),
    first: lead ? created : liveTarget,
    second: lead ? liveTarget : created,
  };
  return { ...withoutFloated(layout, tabId), root: replaceGroup(removed, liveTarget.id, split) };
}

function uniqueId(node: DockNode, requested: string): string {
  const used = new Set(collectIds(node));
  if (!used.has(requested)) return requested;
  let n = 2;
  while (used.has(`${requested}-${n}`)) n += 1;
  return `${requested}-${n}`;
}

function collectIds(node: DockNode): string[] {
  if (node.type === "group") return [node.id];
  return [node.id, ...collectIds(node.first), ...collectIds(node.second)];
}

export function setSplitRatio(layout: DockLayout, splitId: string, ratio: number): DockLayout {
  const next = clampRatio(ratio);
  let changed = false;
  const root = mapSplit(layout.root, (node) => {
    if (node.id !== splitId) return node;
    changed = true;
    const { firstPx: _first, secondPx: _second, ...rest } = node;
    return { ...rest, ratio: next };
  });
  if (!changed) return layout;
  return { ...layout, root };
}

function mapSplit(node: DockNode, visit: (node: DockSplitNode) => DockSplitNode): DockNode {
  if (node.type === "group") return node;
  const visited = visit(node);
  const first = mapSplit(visited.first, visit);
  const second = mapSplit(visited.second, visit);
  if (visited === node && first === node.first && second === node.second) return node;
  return { ...visited, first, second };
}

export function activateTab(layout: DockLayout, tabId: DockTabId): DockLayout {
  const group = findTabGroup(layout.root, tabId);
  if (!group || group.activeId === tabId) return layout;
  const root = replaceGroup(layout.root, group.id, { ...group, activeId: tabId });
  return { ...layout, root };
}

export function closeTab(
  layout: DockLayout,
  tabId: DockTabId,
  closable: (id: DockTabId) => boolean
): DockLayout {
  if (!closable(tabId)) return layout;
  if (layout.floated.includes(tabId)) return withoutFloated(layout, tabId);
  if (!findTabGroup(layout.root, tabId)) return layout;
  const root = removeTab(layout.root, tabId);
  if (!root) return { ...layout, root: emptyRoot([]) };
  return { ...layout, root };
}

export function popOutTab(layout: DockLayout, tabId: DockTabId): DockLayout {
  if (layout.floated.includes(tabId)) return layout;
  if (!findTabGroup(layout.root, tabId)) return layout;
  const root = removeTab(layout.root, tabId) ?? emptyRoot([]);
  return { root, floated: [...layout.floated, tabId] };
}

/** Float a tab whether it is docked or closed. No-ops when already floated. */
export function floatTab(layout: DockLayout, tabId: DockTabId): DockLayout {
  if (layout.floated.includes(tabId)) return layout;
  if (findTabGroup(layout.root, tabId)) {
    const root = removeTab(layout.root, tabId) ?? emptyRoot([]);
    return { root, floated: [...layout.floated, tabId] };
  }
  return { ...layout, floated: [...layout.floated, tabId] };
}

export function dockTab(
  layout: DockLayout,
  tabId: DockTabId,
  placement: DockPlacement
): DockLayout {
  const base = withoutFloated(layout, tabId);
  if (findTabGroup(base.root, tabId)) return moveOrSplit(base, tabId, placement);
  return openTab(base, tabId, placement).layout;
}

function moveOrSplit(layout: DockLayout, tabId: DockTabId, placement: DockPlacement): DockLayout {
  if (placement.edge && placement.groupId) {
    return splitOffTab(layout, tabId, placement.groupId, placement.edge, placement.newGroupId, placement.newSplitId, placement.sizePx);
  }
  if (placement.groupId) return moveTab(layout, tabId, placement.groupId, placement.index ?? Number.MAX_SAFE_INTEGER);
  return layout;
}

export function openTab(
  layout: DockLayout,
  tabId: DockTabId,
  placement: DockPlacement
): { layout: DockLayout; where: "group" | "float" } {
  const location = locateTab(layout, tabId);
  if (location.kind === "float") return { layout, where: "float" };
  if (location.kind === "group") return { layout: activateTab(layout, tabId), where: "group" };

  const requested = placement.groupId && findGroup(layout.root, placement.groupId) ? placement.groupId : null;
  if (requested) {
    return {
      layout: { ...layout, root: insertTab(layout.root, requested, tabId, placement.index ?? Number.MAX_SAFE_INTEGER, placement.activate !== false) },
      where: "group",
    };
  }
  if (!placement.edge) {
    const group = firstGroup(layout.root);
    return {
      layout: { ...layout, root: insertTab(layout.root, group.id, tabId, placement.index ?? Number.MAX_SAFE_INTEGER, placement.activate !== false) },
      where: "group",
    };
  }

  const targetId = placement.splitGroupId && findGroup(layout.root, placement.splitGroupId)
    ? placement.splitGroupId
    : firstGroup(layout.root).id;
  const edge = placement.edge ?? "right";
  const lead = edge === "left" || edge === "top";
  const created: DockGroupNode = {
    type: "group",
    id: uniqueId(layout.root, placement.newGroupId),
    tabs: [tabId],
    activeId: tabId,
  };
  const target = findGroup(layout.root, targetId)!;
  const split: DockSplitNode = {
    type: "split",
    id: uniqueId(layout.root, placement.newSplitId),
    direction: edge === "left" || edge === "right" ? "row" : "column",
    ratio: placement.ratio ?? (lead ? 0.32 : 0.68),
    ...(placement.sizePx != null ? (lead ? { firstPx: placement.sizePx } : { secondPx: placement.sizePx }) : {}),
    first: lead ? created : target,
    second: lead ? target : created,
  };
  return { layout: { ...layout, root: replaceGroup(layout.root, target.id, split) }, where: "group" };
}

/**
 * Focus an already-open tab, or replace the current preview tab and mark the new one as preview.
 * Same-group replacement swaps the tab in place so the pane does not collapse.
 */
export function openPreviewTab(
  layout: DockLayout,
  tabId: DockTabId,
  placement: DockPlacement,
  previewId: DockTabId | null,
  closable: (id: DockTabId) => boolean = () => true,
): { layout: DockLayout; previewId: DockTabId | null } {
  const location = locateTab(layout, tabId);
  if (location.kind === "float") return { layout, previewId };
  if (location.kind === "group") return { layout: activateTab(layout, tabId), previewId };

  const targetId = placement.groupId && findGroup(layout.root, placement.groupId)
    ? placement.groupId
    : firstGroup(layout.root).id;
  let next = layout;
  if (previewId && previewId !== tabId && closable(previewId)) {
    const previewLoc = locateTab(next, previewId);
    if (previewLoc.kind === "group" && previewLoc.groupId === targetId) {
      return { layout: { ...next, root: replaceTabId(next.root, previewId, tabId) }, previewId: tabId };
    }
    if (previewLoc.kind !== "closed") next = closeTab(next, previewId, closable);
  }
  const opened = openTab(next, tabId, { ...placement, groupId: targetId, activate: true });
  return { layout: opened.layout, previewId: tabId };
}

/** Open a missing tab without stealing focus from the tab the user is already on. */
export function ensureTab(layout: DockLayout, tabId: DockTabId, placement: DockPlacement): DockLayout {
  if (locateTab(layout, tabId).kind !== "closed") return layout;
  return openTab(layout, tabId, { ...placement, activate: false }).layout;
}

export function toggleTab(
  layout: DockLayout,
  tabId: DockTabId,
  placement: DockPlacement,
  closable: (id: DockTabId) => boolean
): { layout: DockLayout; action: "focused" | "closed" | "float" } {
  const location = locateTab(layout, tabId);
  if (location.kind === "float") return { layout, action: "float" };
  if (location.kind === "group" && location.active) {
    if (!closable(tabId)) return { layout, action: "focused" };
    return { layout: closeTab(layout, tabId, closable), action: "closed" };
  }
  return { layout: openTab(layout, tabId, placement).layout, action: "focused" };
}

export function splitGroupPreset(layout: DockLayout, groupId: string, preset: DockSplitPreset): DockLayout {
  const group = findGroup(layout.root, groupId);
  if (!group || group.tabs.length < 2) return layout;
  const tabs = [...group.tabs];
  if (preset === "right" || preset === "bottom" || tabs.length === 2) {
    const edge: DockEdge = preset === "bottom" ? "bottom" : "right";
    const moving = group.activeId || tabs[tabs.length - 1]!;
    return splitOffTab(layout, moving, groupId, edge, `${groupId}-split-pane`, `${groupId}-split`);
  }
  const [a, b, c, d, ...rest] = tabs;
  const quad = columnOf(
    rowOf(pane(`${groupId}-a`, [a!]), pane(`${groupId}-b`, [b!]), `${groupId}-top`),
    d
      ? rowOf(pane(`${groupId}-c`, [c!]), pane(`${groupId}-d`, [d, ...rest]), `${groupId}-bottom`)
      : pane(`${groupId}-c`, [c!, ...rest]),
    `${groupId}-quad`
  );
  return { ...layout, root: replaceGroup(layout.root, groupId, quad) };
}

function pane(id: string, tabs: DockTabId[]): DockGroupNode {
  return { type: "group", id, tabs, activeId: tabs[0]! };
}

function rowOf(first: DockNode, second: DockNode, id: string): DockSplitNode {
  return { type: "split", id, direction: "row", ratio: 0.5, first, second };
}

function columnOf(first: DockNode, second: DockNode, id: string): DockSplitNode {
  return { type: "split", id, direction: "column", ratio: 0.5, first, second };
}

export function flattenDock(layout: DockLayout, groupId: string, activeId?: string): DockGroupNode {
  const tabs = collectTabs(layout.root);
  const active = activeId && tabs.includes(activeId) ? activeId : tabs[0] ?? "";
  return { type: "group", id: groupId, tabs, activeId: active };
}

export function sanitizeDockLayout(
  saved: unknown,
  knownIds: readonly DockTabId[],
  permanentIds: readonly DockTabId[],
  fallback: DockLayout
): DockLayout {
  const parsed = parseLayout(saved);
  if (!parsed) return fallback;
  const known = new Set(knownIds);
  const base = parsed;
  const seen = new Set<string>();
  const floated = base.floated.filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
  const floatedSet = new Set(floated);
  const stripped = stripNode(base.root, known, floatedSet, new Set<string>());
  let root = stripped ?? emptyRoot([]);
  for (const id of permanentIds) {
    if (!known.has(id)) continue;
    if (floatedSet.has(id) || findTabGroup(root, id)) continue;
    const group = firstGroup(root);
    root = insertTab(root, group.id, id, 0);
  }
  if (collectTabs(root).length === 0 && floated.length === 0 && permanentIds.length === 0) {
    return fallback;
  }
  return { root, floated };
}

function stripNode(
  node: DockNode,
  known: Set<string>,
  floated: Set<string>,
  seen: Set<string>
): DockNode | null {
  if (node.type === "group") {
    const tabs = node.tabs.filter((id) => known.has(id) && !floated.has(id) && !seen.has(id) && seen.add(id));
    if (tabs.length === 0) return null;
    return {
      type: "group",
      id: node.id || "group",
      tabs,
      activeId: tabs.includes(node.activeId) ? node.activeId : tabs[0]!,
    };
  }
  const first = stripNode(node.first, known, floated, seen);
  const second = stripNode(node.second, known, floated, seen);
  if (!first) return second;
  if (!second) return first;
  return {
    type: "split",
    id: node.id || "split",
    direction: node.direction === "column" ? "column" : "row",
    ratio: clampRatio(node.ratio),
    ...(numberOrUndefined(node.firstPx) != null ? { firstPx: numberOrUndefined(node.firstPx) } : {}),
    ...(numberOrUndefined(node.secondPx) != null ? { secondPx: numberOrUndefined(node.secondPx) } : {}),
    first,
    second,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseLayout(saved: unknown): DockLayout | null {
  if (!saved || typeof saved !== "object") return null;
  const record = saved as { root?: unknown; floated?: unknown };
  const root = parseNode(record.root);
  if (!root) return null;
  const floated = Array.isArray(record.floated) ? record.floated.filter((id): id is string => typeof id === "string") : [];
  return { root, floated };
}

function parseNode(value: unknown): DockNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { type?: unknown };
  if (record.type === "group") {
    const group = value as { id?: unknown; tabs?: unknown; activeId?: unknown };
    const tabs = Array.isArray(group.tabs) ? group.tabs.filter((id): id is string => typeof id === "string") : [];
    if (tabs.length === 0 || typeof group.id !== "string") return null;
    return {
      type: "group",
      id: group.id,
      tabs,
      activeId: typeof group.activeId === "string" && tabs.includes(group.activeId) ? group.activeId : tabs[0]!,
    };
  }
  if (record.type === "split") {
    const split = value as DockSplitNode;
    const first = parseNode(split.first);
    const second = parseNode(split.second);
    if (!first || !second || typeof split.id !== "string") return null;
    return {
      type: "split",
      id: split.id,
      direction: split.direction === "column" ? "column" : "row",
      ratio: typeof split.ratio === "number" ? split.ratio : 0.5,
      ...(numberOrUndefined(split.firstPx) != null ? { firstPx: numberOrUndefined(split.firstPx) } : {}),
      ...(numberOrUndefined(split.secondPx) != null ? { secondPx: numberOrUndefined(split.secondPx) } : {}),
      first,
      second,
    };
  }
  return null;
}
