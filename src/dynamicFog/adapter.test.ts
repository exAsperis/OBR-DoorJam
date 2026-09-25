import { Command, type Curve, type Item, type Path, type Shape } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ items: [] as Item[], getItems: vi.fn(), updateItems: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", async (original) => {
  const sdk = await original<typeof import("@owlbear-rodeo/sdk")>();
  return {
    ...sdk,
    default: { scene: { items: { getItems: mocks.getItems, updateItems: mocks.updateItems } } },
  };
});

import {
  DYNAMIC_FOG_DOORS_KEY, createDynamicFogDoor, enumerateDoors, findDoorCandidates, getDoorState,
  lookupDoor, parseDynamicFogDoors, selectDoorCandidate, setDoorState,
} from "./adapter";

function fogPath(metadataValue: unknown): Path {
  return {
    id: "fog-1", type: "PATH", layer: "FOG", name: "Fog", visible: true, locked: false,
    createdUserId: "gm", zIndex: 0, lastModified: "", lastModifiedUserId: "gm",
    position: { x: 100, y: 50 }, rotation: 0, scale: { x: 1, y: 1 },
    metadata: { [DYNAMIC_FOG_DOORS_KEY]: metadataValue },
    commands: [[Command.MOVE, 0, 0], [Command.LINE, 100, 0]],
    style: { fillColor: "#000", fillOpacity: 0, strokeColor: "#000", strokeOpacity: 1, strokeWidth: 1, strokeDash: [] },
    fillRule: "nonzero",
  };
}

function fogRectangle(metadataValue: unknown): Shape {
  const base = fogPath(metadataValue);
  return {
    ...base,
    type: "SHAPE",
    width: 100,
    height: 50,
    shapeType: "RECTANGLE",
  };
}

const bounds = {
  min: { x: -5, y: -5 }, max: { x: 5, y: 5 }, width: 10, height: 10, center: { x: 0, y: 0 },
};

function fogLine(id: string, start: [number, number], end: [number, number], transform: Partial<Pick<Path, "position" | "rotation" | "scale">> = {}): Path {
  return {
    ...fogPath([]), id, position: transform.position ?? { x: 0, y: 0 }, rotation: transform.rotation ?? 0,
    scale: transform.scale ?? { x: 1, y: 1 },
    commands: [[Command.MOVE, ...start], [Command.LINE, ...end]],
  };
}

function fogCurve(id: string, points: Curve["points"]): Curve {
  const base = fogPath([]);
  return {
    ...base,
    id,
    type: "CURVE",
    position: { x: 0, y: 0 },
    points,
    style: { ...base.style, closed: true, tension: 1, fillOpacity: 1 },
  };
}

describe("Dynamic Fog adapter", () => {
  beforeEach(() => {
    mocks.items = [];
    mocks.getItems.mockReset().mockImplementation(async (filter?: string[] | ((item: Item) => boolean)) => {
      if (Array.isArray(filter)) return mocks.items.filter((item) => filter.includes(item.id));
      return typeof filter === "function" ? mocks.items.filter(filter) : mocks.items;
    });
    mocks.updateItems.mockReset().mockImplementation(async (ids: string[], update: (items: Item[]) => void) => {
      update(mocks.items.filter((item) => ids.includes(item.id)));
    });
  });

  it("rejects malformed external metadata without throwing", () => {
    expect(parseDynamicFogDoors([{ open: "yes" }])).toBeNull();
    expect(enumerateDoors([fogPath({})])).toEqual([]);
  });

  it("enumerates a door and evaluates its transformed midpoint", () => {
    const item = fogPath([{ open: false, start: { index: 0, distance: 20 }, end: { index: 0, distance: 60 } }]);
    expect(enumerateDoors([item])).toEqual([{ ref: { fogItemId: "fog-1", doorIndex: 0 }, open: false, position: { x: 140, y: 50 } }]);
  });

  it("enumerates doors attached to Dynamic Fog shape drawings", () => {
    const item = fogRectangle([{ open: true, start: { index: 0, distance: 10 }, end: { index: 0, distance: 50 } }]);
    expect(enumerateDoors([item])).toEqual([{ ref: { fogItemId: "fog-1", doorIndex: 0 }, open: true, position: { x: 130, y: 50 } }]);
  });

  it("reports deleted and out-of-range door references", () => {
    const items: Item[] = [fogPath([])];
    expect(lookupDoor(items, { fogItemId: "missing", doorIndex: 0 })).toEqual({ ok: false, reason: "missing-item" });
    expect(lookupDoor(items, { fogItemId: "fog-1", doorIndex: 2 })).toEqual({ ok: false, reason: "missing-door" });
  });

  it("finds the contour span crossing a selected item's bounds", () => {
    const candidates = findDoorCandidates([fogPath([])], {
      min: { x: 120, y: 40 }, max: { x: 160, y: 60 }, width: 40, height: 20, center: { x: 140, y: 50 },
    });
    expect(candidates).toEqual([{
      itemId: "fog-1",
      start: { index: 0, distance: 20 },
      end: { index: 0, distance: 60 },
    }]);
  });

  it("selects a single boundary", () => {
    expect(selectDoorCandidate([fogLine("only", [-10, 0], [10, 0])], bounds)).toMatchObject({ ok: true, candidate: { itemId: "only" } });
  });

  it("selects one deterministic owner for adjacent rectangles sharing an edge", () => {
    const left = { ...fogRectangle([]), id: "left", position: { x: -100, y: -25 } };
    const right = { ...fogRectangle([]), id: "right", position: { x: 0, y: -25 } };
    expect(selectDoorCandidate([right, left], bounds)).toMatchObject({ ok: true, candidate: { itemId: "left" } });
  });

  it("accepts a shared boundary drawn in reverse", () => {
    const result = selectDoorCandidate([
      fogLine("b", [-10, 0], [10, 0]), fogLine("a", [10, 0], [-10, 0]),
    ], bounds);
    expect(result).toMatchObject({ ok: true, candidate: { itemId: "a" } });
  });

  it("accepts adjacent closed curves sharing a reversed edge", () => {
    const left = fogCurve("left", [{ x: -20, y: -20 }, { x: 0, y: -20 }, { x: 0, y: 20 }, { x: -20, y: 20 }]);
    const right = fogCurve("right", [{ x: 0, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: 0, y: 20 }]);
    expect(selectDoorCandidate([right, left], bounds)).toMatchObject({ ok: true, candidate: { itemId: "left" } });
  });

  it.each([
    ["nearby parallel boundaries", [fogLine("a", [-10, -0.1], [10, -0.1]), fogLine("b", [-10, 0.1], [10, 0.1])]],
    ["crossing boundaries", [fogLine("a", [-10, 0], [10, 0]), fogLine("b", [0, -10], [0, 10])]],
    ["a shared boundary plus a distinct third", [fogLine("a", [-10, 0], [10, 0]), fogLine("b", [10, 0], [-10, 0]), fogLine("c", [-10, 0.1], [10, 0.1])]],
    ["partial overlap", [fogLine("a", [-10, 0], [2, 0]), fogLine("b", [-2, 0], [10, 0])]],
  ])("rejects %s", (_name, items) => {
    expect(selectDoorCandidate(items, bounds)).toEqual({ ok: false, reason: "ambiguous-intersection" });
  });

  it("compares transformed boundaries in world coordinates", () => {
    const coincident = [
      fogLine("a", [-10, 0], [10, 0], { position: { x: 2, y: 0 }, rotation: 90, scale: { x: 1, y: 2 } }),
      fogLine("b", [10, 0], [-10, 0], { position: { x: 2, y: 0 }, rotation: 90, scale: { x: 1, y: 2 } }),
    ];
    const verticalBounds = { min: { x: 1, y: -5 }, max: { x: 3, y: 5 }, width: 2, height: 10, center: { x: 2, y: 0 } };
    expect(selectDoorCandidate(coincident, verticalBounds)).toMatchObject({ ok: true });
    expect(selectDoorCandidate([...coincident.slice(0, 1), { ...coincident[1], position: { x: 2.1, y: 0 } }], verticalBounds))
      .toEqual({ ok: false, reason: "ambiguous-intersection" });
  });

  it("creates one door on one coincident fog item and preserves state operations", async () => {
    mocks.items = [fogLine("b", [-10, 0], [10, 0]), fogLine("a", [10, 0], [-10, 0])];
    const created = await createDynamicFogDoor(bounds);
    expect(created).toEqual({ ok: true, ref: { fogItemId: "a", doorIndex: 0 } });
    expect(mocks.items.flatMap((item) => parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]) ?? [])).toHaveLength(1);
    if (!created.ok) throw new Error("Expected door creation");
    expect(await getDoorState(created.ref)).toMatchObject({ ok: true, door: { open: false } });
    expect(await setDoorState(created.ref, true)).toMatchObject({ ok: true, door: { open: true } });
  });

  it("does not mutate metadata when creation is ambiguous", async () => {
    mocks.items = [fogLine("a", [-10, -0.1], [10, -0.1]), fogLine("b", [-10, 0.1], [10, 0.1])];
    expect(await createDynamicFogDoor(bounds)).toEqual({ ok: false, reason: "ambiguous-intersection" });
    expect(mocks.updateItems).not.toHaveBeenCalled();
    expect(mocks.items.every((item) => item.metadata[DYNAMIC_FOG_DOORS_KEY] instanceof Array
      && (item.metadata[DYNAMIC_FOG_DOORS_KEY] as unknown[]).length === 0)).toBe(true);
  });
});
