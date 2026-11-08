import { describe, expect, it } from "vitest";

import { DOCK_EDGE_BAND_PX, edgeAt } from "@/lib/dock/edge-zone";

describe("edgeAt", () => {
  const w = 1000;
  const h = 800;

  it("returns null when away from every edge", () => {
    expect(edgeAt(400, 300, w, h)).toBeNull();
    expect(edgeAt(DOCK_EDGE_BAND_PX + 1, DOCK_EDGE_BAND_PX + 1, w, h)).toBeNull();
  });

  it("returns an edge inside the 40px band", () => {
    expect(edgeAt(10, 400, w, h)).toBe("left");
    expect(edgeAt(w - 10, 400, w, h)).toBe("right");
    expect(edgeAt(400, 10, w, h)).toBe("top");
    expect(edgeAt(400, h - 10, w, h)).toBe("bottom");
  });

  it("picks the nearer edge in a corner band", () => {
    expect(edgeAt(5, 20, w, h)).toBe("left");
    expect(edgeAt(20, 5, w, h)).toBe("top");
  });

  it("ignores invalid geometry", () => {
    expect(edgeAt(0, 0, 0, h)).toBeNull();
    expect(edgeAt(0, 0, w, h, 0)).toBeNull();
  });
});
