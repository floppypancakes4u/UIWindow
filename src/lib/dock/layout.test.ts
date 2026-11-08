import { describe, expect, it } from "vitest";

import {
  closeTab,
  dockTab,
  ensureTab,
  flattenDock,
  locateTab,
  moveTab,
  openTab,
  popOutTab,
  floatTab,
  sanitizeDockLayout,
  setSplitRatio,
  splitDisplayRatio,
  splitGroupPreset,
  splitOffTab,
  toggleTab,
  openPreviewTab,
} from "@/lib/dock/layout";
import type { DockLayout, DockPlacement } from "@/lib/dock/types";

const closable = (id: string) => id !== "map";

function layout(): DockLayout {
  return {
    floated: [],
    root: {
      type: "split",
      id: "root-split",
      direction: "column",
      ratio: 0.75,
      secondPx: 168,
      first: { type: "group", id: "main", tabs: ["map", "layers"], activeId: "map" },
      second: {
        type: "split",
        id: "bottom",
        direction: "row",
        ratio: 0.5,
        first: { type: "group", id: "progress", tabs: ["progress"], activeId: "progress" },
        second: { type: "group", id: "pipeline", tabs: ["pipeline"], activeId: "pipeline" },
      },
    },
  };
}

const place: DockPlacement = {
  groupId: "lists",
  splitGroupId: "main",
  edge: "left",
  sizePx: 320,
  newGroupId: "lists",
  newSplitId: "lists-split",
};

describe("dock layout", () => {
  it("moves a tab onto another group's bar", () => {
    const next = moveTab(layout(), "layers", "pipeline", 0);
    expect(next.root).toMatchObject({
      first: { tabs: ["map"], activeId: "map" },
      second: { second: { tabs: ["layers", "pipeline"], activeId: "layers" } },
    });
  });

  it("reorders a tab inside its own group", () => {
    const next = moveTab(layout(), "map", "main", 1);
    expect(next.root).toMatchObject({ first: { tabs: ["layers", "map"], activeId: "map" } });
  });

  it("splits a group when a tab is dropped on an edge and then resizes", () => {
    const split = splitOffTab(layout(), "layers", "main", "right", "side", "side-split", 320);
    expect(split.root).toMatchObject({
      first: {
        type: "split",
        direction: "row",
        secondPx: 320,
        first: { id: "main", tabs: ["map"] },
        second: { id: "side", tabs: ["layers"] },
      },
    });
    const mainSplit = split.root.type === "split" ? split.root.first : null;
    expect(mainSplit?.type).toBe("split");
    if (mainSplit?.type !== "split") return;
    expect(splitDisplayRatio(mainSplit, 1000)).toBeCloseTo(0.68);
    const resized = setSplitRatio(split, mainSplit.id, 0.4);
    const after = resized.root.type === "split" ? resized.root.first : null;
    expect(after).toMatchObject({ ratio: 0.4 });
    expect(after).not.toHaveProperty("secondPx");
    expect(after).not.toHaveProperty("firstPx");
  });

  it("does not split a group that would be left empty", () => {
    const next = splitOffTab(layout(), "pipeline", "pipeline", "left", "side", "side-split");
    expect(next).toEqual(layout());
  });

  it("closes the last tab in a group and collapses the split", () => {
    const next = closeTab(layout(), "pipeline", closable);
    expect(next.root).toMatchObject({
      second: { id: "progress", tabs: ["progress"] },
    });
  });

  it("refuses to close a permanent tab", () => {
    const next = closeTab(layout(), "map", closable);
    expect(next).toEqual(layout());
  });

  it("pops a tab out of the tree and docks it back", () => {
    const floated = popOutTab(layout(), "pipeline");
    expect(floated.floated).toEqual(["pipeline"]);
    expect(floated.root).toMatchObject({ second: { id: "progress", tabs: ["progress"] } });
    const back = dockTab(floated, "pipeline", {
      groupId: "progress",
      newGroupId: "unused",
      newSplitId: "unused-split",
    });
    expect(back.floated).toEqual([]);
    expect(back.root).toMatchObject({
      second: { tabs: ["progress", "pipeline"], activeId: "pipeline" },
    });
  });

  it("floats a closed tab without needing a group first", () => {
    const floated = floatTab(layout(), "entities");
    expect(floated.floated).toEqual(["entities"]);
    expect(locateTab(floated, "entities").kind).toBe("float");
    expect(floatTab(floated, "entities")).toEqual(floated);
  });

  it("floats a docked tab the same way popOut does", () => {
    const floated = floatTab(layout(), "pipeline");
    expect(floated).toEqual(popOutTab(layout(), "pipeline"));
  });

  it("opens a new tab by splitting the main group, then focuses it", () => {
    const opened = openTab(layout(), "entities", place);
    expect(opened.where).toBe("group");
    expect(opened.layout.root).toMatchObject({
      first: {
        type: "split",
        firstPx: 320,
        first: { id: "lists", tabs: ["entities"], activeId: "entities" },
        second: { id: "main", tabs: ["map", "layers"] },
      },
    });
    const again = openTab(opened.layout, "signals", place);
    expect(again.layout.root).toMatchObject({
      first: {
        first: { tabs: ["entities", "signals"], activeId: "signals" },
      },
    });
    const closed = toggleTab(again.layout, "signals", place, closable);
    expect(closed.action).toBe("closed");
    expect(closed.layout.root).toMatchObject({
      first: { first: { tabs: ["entities"], activeId: "entities" } },
    });
  });

  it("focuses a floating tab instead of opening a second copy", () => {
    const floated = popOutTab(layout(), "layers");
    const again = openTab(floated, "layers", place);
    expect(again.where).toBe("float");
    expect(again.layout.floated).toEqual(["layers"]);
  });

  it("restores a missing permanent tab and drops unknown ids", () => {
    const saved = {
      root: {
        type: "group",
        id: "only",
        tabs: ["gone", "pipeline"],
        activeId: "gone",
      },
      floated: ["also-gone"],
    };
    const next = sanitizeDockLayout(saved, ["map", "pipeline", "progress"], ["map"], layout());
    expect(next.floated).toEqual([]);
    expect(next.root).toMatchObject({ tabs: ["map", "pipeline"], activeId: "map" });
  });

  it("keeps a floated permanent tab out of the tree", () => {
    const saved = {
      root: { type: "group", id: "only", tabs: ["pipeline"], activeId: "pipeline" },
      floated: ["map"],
    };
    const next = sanitizeDockLayout(saved, ["map", "pipeline"], ["map"], layout());
    expect(next.floated).toEqual(["map"]);
    expect(next.root).toMatchObject({ tabs: ["pipeline"] });
  });

  it("falls back when the saved value is not a layout", () => {
    const fallback = layout();
    expect(sanitizeDockLayout(null, ["map"], ["map"], fallback)).toBe(fallback);
  });

  it("flattens every docked tab into one group", () => {
    const flat = flattenDock(layout(), "mobile", "pipeline");
    expect(flat.tabs).toEqual(["map", "layers", "progress", "pipeline"]);
    expect(flat.activeId).toBe("pipeline");
  });

  it("splits the active tab to the right and can build a quad", () => {
    const start: DockLayout = {
      floated: [],
      root: { type: "group", id: "main", tabs: ["a", "b", "c", "d"], activeId: "b" },
    };
    const right = splitGroupPreset(start, "main", "right");
    expect(right.root).toMatchObject({
      direction: "row",
      first: { tabs: ["a", "c", "d"] },
      second: { tabs: ["b"] },
    });
    const quad = splitGroupPreset(start, "main", "quad");
    expect(quad.root).toMatchObject({
      direction: "column",
      first: { direction: "row", first: { tabs: ["a"] }, second: { tabs: ["b"] } },
      second: { direction: "row", first: { tabs: ["c"] }, second: { tabs: ["d"] } },
    });
  });
});

describe("ensureTab", () => {
  it("inserts a missing tab without changing the active tab", () => {
    const next = ensureTab(layout(), "tracks", { groupId: "main", newGroupId: "tracks", newSplitId: "tracks-split" });
    const main = next.root.type === "split" && next.root.first.type === "group" ? next.root.first : null;
    expect(main?.tabs).toEqual(["map", "layers", "tracks"]);
    expect(main?.activeId).toBe("map");
  });

  it("leaves a tab where it already sits", () => {
    const current = layout();
    const next = ensureTab(current, "layers", { groupId: "pipeline", newGroupId: "layers", newSplitId: "layers-split" });
    expect(next).toBe(current);
  });
});

describe("openPreviewTab", () => {
  const previewPlace: DockPlacement = { groupId: "main", newGroupId: "preview", newSplitId: "preview-split" };

  it("focuses an existing tab without dropping the preview", () => {
    const opened = openPreviewTab(layout(), "entities", previewPlace, null);
    expect(opened.previewId).toBe("entities");
    const focused = openPreviewTab(opened.layout, "layers", previewPlace, opened.previewId);
    expect(focused.previewId).toBe("entities");
    expect(focused.layout.root).toMatchObject({
      first: { tabs: ["map", "layers", "entities"], activeId: "layers" },
    });
  });

  it("replaces a preview in the same pane", () => {
    const opened = openPreviewTab(layout(), "entities", previewPlace, null);
    const next = openPreviewTab(opened.layout, "signals", previewPlace, opened.previewId);
    expect(next.previewId).toBe("signals");
    expect(next.layout.root).toMatchObject({
      first: { tabs: ["map", "layers", "signals"], activeId: "signals" },
    });
  });

  it("closes a preview in another pane and opens in the requested pane", () => {
    const opened = openPreviewTab(layout(), "entities", previewPlace, null);
    const next = openPreviewTab(
      opened.layout,
      "signals",
      { groupId: "pipeline", newGroupId: "unused", newSplitId: "unused-split" },
      opened.previewId,
    );
    expect(next.previewId).toBe("signals");
    expect(next.layout.root).toMatchObject({
      first: { tabs: ["map", "layers"], activeId: "layers" },
      second: { second: { tabs: ["pipeline", "signals"], activeId: "signals" } },
    });
  });
});
