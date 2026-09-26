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
  lookupDoor, parseDynamicFogDoors, selectDoorCandidate, setDoorState, updateDoorGeometry, chooseAutomaticDoor,
  resolveManualDoorTarget, DYNAMIC_FOG_DOOR_INDEX_KEY,
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

  it("rejects malformed external metadata without throwing", async () => {
    expect(parseDynamicFogDoors([{ open: "yes" }])).toEqual([null]);
    expect(await enumerateDoors([fogPath({})])).toEqual({ doors: [], invalidGeometry: false });
  });

  it("enumerates a door and evaluates its transformed midpoint", async () => {
    const item = fogPath([{ open: false, start: { index: 0, distance: 20 }, end: { index: 0, distance: 60 } }]);
    expect((await enumerateDoors([item])).doors[0]).toMatchObject({ ref: { fogItemId: "fog-1", doorIndex: 0 }, open: false, position: { x: 140, y: 50 } });
  });

  it("enumerates doors attached to Dynamic Fog shape drawings", async () => {
    const item = fogRectangle([{ open: true, start: { index: 0, distance: 10 }, end: { index: 0, distance: 50 } }]);
    const found = (await enumerateDoors([item])).doors[0];
    expect(found).toMatchObject({ ref: { fogItemId: "fog-1", doorIndex: 0 }, open: true });
    expect(found.position.x).toBeCloseTo(130); expect(found.position.y).toBeCloseTo(50);
  });

  it("reports deleted and out-of-range door references", () => {
    const items: Item[] = [fogPath([])];
    expect(lookupDoor(items, { fogItemId: "missing", doorIndex: 0 })).toEqual({ ok: false, reason: "missing-item" });
    expect(lookupDoor(items, { fogItemId: "fog-1", doorIndex: 2 })).toEqual({ ok: false, reason: "missing-door" });
  });

  it("finds the contour span crossing a selected item's bounds", async () => {
    const candidates = await findDoorCandidates([fogPath([])], {
      min: { x: 120, y: 40 }, max: { x: 160, y: 60 }, width: 40, height: 20, center: { x: 140, y: 50 },
    });
    expect(candidates).toHaveLength(1); expect(candidates[0]).toMatchObject({ itemId: "fog-1", start: { index: 0 } });
    expect(candidates[0].start.distance).toBeCloseTo(20); expect(candidates[0].end.distance).toBeCloseTo(60);
  });

  it("selects a single boundary", async () => {
    expect(await selectDoorCandidate([fogLine("only", [-10, 0], [10, 0])], bounds)).toMatchObject({ ok: true, candidate: { itemId: "only" } });
  });

  it("selects one deterministic owner for adjacent rectangles sharing an edge", async () => {
    const left = { ...fogRectangle([]), id: "left", position: { x: -100, y: -25 } };
    const right = { ...fogRectangle([]), id: "right", position: { x: 0, y: -25 } };
    expect(await selectDoorCandidate([right, left], bounds)).toMatchObject({ ok: true, candidate: { itemId: "left" } });
  });

  it("accepts a shared boundary drawn in reverse", async () => {
    const result = await selectDoorCandidate([
      fogLine("b", [-10, 0], [10, 0]), fogLine("a", [10, 0], [-10, 0]),
    ], bounds);
    expect(result).toMatchObject({ ok: true, candidate: { itemId: "a" } });
  });

  it("rejects curved boundaries that only appear coincident under the old approximation", async () => {
    const left = fogCurve("left", [{ x: -20, y: -20 }, { x: 0, y: -20 }, { x: 0, y: 20 }, { x: -20, y: 20 }]);
    const right = fogCurve("right", [{ x: 0, y: -20 }, { x: 20, y: -20 }, { x: 20, y: 20 }, { x: 0, y: 20 }]);
    expect(await selectDoorCandidate([right, left], bounds)).toEqual({ ok: false, reason: "no-intersection" });
  });

  it("keeps valid siblings and preserves their original indices", async () => {
    const item = fogPath([
      { open: false, start: { index: 0, distance: 1 }, end: { index: 0, distance: 5 } },
      { broken: true },
      { open: true, start: { index: 0, distance: 20 }, end: { index: 0, distance: 30 } },
    ]);
    const parsed = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
    expect(parsed?.[0]).not.toBeNull(); expect(parsed?.[1]).toBeNull(); expect(parsed?.[2]).not.toBeNull();
    expect((await enumerateDoors([item])).doors.map((door) => door.ref.doorIndex)).toEqual([0, 2]);
  });

  it("chooses overlap before proximity and reports overlap ambiguity", () => {
    const located = (id: string, x: number, y = 0) => ({ ref: { fogItemId: id, doorIndex: 0 }, open: false, position: { x, y }, geometry: {
      start: { x, y }, end: { x: x + 10, y }, midpoint: { x: x + 5, y }, worldPoints: [{ x, y }, { x: x + 10, y }],
      bounds: { min: { x, y }, max: { x: x + 10, y }, width: 10, height: 0, center: { x: x + 5, y } },
    } });
    const longBounds = { min: { x: 0, y: -10 }, max: { x: 1000, y: 10 }, width: 1000, height: 20, center: { x: 500, y: 0 } };
    expect(chooseAutomaticDoor([located("inside", 20), located("near", 1050)], longBounds, 225)).toMatchObject({ ok: true, method: "overlap", door: { ref: { fogItemId: "inside" } } });
    expect(chooseAutomaticDoor([located("a", 20), located("b", 40)], longBounds, 225)).toMatchObject({ ok: false, reason: "ambiguous-overlap" });
  });

  it("uses bounds-to-segment proximity and reports equally plausible nearby doors", () => {
    const make = (id: string, y: number) => ({ ref: { fogItemId: id, doorIndex: 0 }, open: false, position: { x: 5, y }, geometry: { start: { x: 0, y }, end: { x: 10, y }, midpoint: { x: 5, y }, worldPoints: [{ x: 0, y }, { x: 10, y }], bounds: { min: { x: 0, y }, max: { x: 10, y }, width: 10, height: 0, center: { x: 5, y } } } });
    const box = { min: { x: 0, y: 0 }, max: { x: 10, y: 10 }, width: 10, height: 10, center: { x: 5, y: 5 } };
    expect(chooseAutomaticDoor([make("one", 20)], box, 225)).toMatchObject({ ok: true, method: "nearby", door: { distance: 10 } });
    expect(chooseAutomaticDoor([make("a", 20), make("b", -10)], box, 225)).toMatchObject({ ok: false, reason: "ambiguous-nearby" });
    expect(chooseAutomaticDoor([make("far", 500)], box, 225)).toEqual({ ok: false, reason: "none" });
  });

  it("resolves exact manual overlay references and rejects invalid parents and indices", () => {
    const parent = fogPath([{ open: false, start: { index: 0, distance: 1 }, end: { index: 0, distance: 5 } }]);
    const target = { attachedTo: parent.id, metadata: { [DYNAMIC_FOG_DOOR_INDEX_KEY]: 0 } };
    expect(resolveManualDoorTarget(target, [parent])).toEqual({ ok: true, ref: { fogItemId: "fog-1", doorIndex: 0 } });
    expect(resolveManualDoorTarget({ ...target, metadata: { [DYNAMIC_FOG_DOOR_INDEX_KEY]: -1 } }, [parent])).toMatchObject({ ok: false, reason: "invalid-target" });
    expect(resolveManualDoorTarget(target, [])).toMatchObject({ ok: false, reason: "missing-parent" });
    expect(resolveManualDoorTarget(target, [{ ...parent, layer: "MAP" }])).toMatchObject({ ok: false, reason: "invalid-parent" });
    expect(resolveManualDoorTarget({ ...target, metadata: { [DYNAMIC_FOG_DOOR_INDEX_KEY]: 2 } }, [parent])).toMatchObject({ ok: false, reason: "missing-door" });
  });

  it.each([
    ["nearby parallel boundaries", [fogLine("a", [-10, -0.1], [10, -0.1]), fogLine("b", [-10, 0.1], [10, 0.1])]],
    ["crossing boundaries", [fogLine("a", [-10, 0], [10, 0]), fogLine("b", [0, -10], [0, 10])]],
    ["a shared boundary plus a distinct third", [fogLine("a", [-10, 0], [10, 0]), fogLine("b", [10, 0], [-10, 0]), fogLine("c", [-10, 0.1], [10, 0.1])]],
    ["partial overlap", [fogLine("a", [-10, 0], [2, 0]), fogLine("b", [-2, 0], [10, 0])]],
  ])("rejects %s", async (_name, items) => {
    expect(await selectDoorCandidate(items, bounds)).toEqual({ ok: false, reason: "ambiguous-intersection" });
  });

  it("compares transformed boundaries in world coordinates", async () => {
    const coincident = [
      fogLine("a", [-10, 0], [10, 0], { position: { x: 2, y: 0 }, rotation: 90, scale: { x: 1, y: 2 } }),
      fogLine("b", [10, 0], [-10, 0], { position: { x: 2, y: 0 }, rotation: 90, scale: { x: 1, y: 2 } }),
    ];
    const verticalBounds = { min: { x: 1, y: -5 }, max: { x: 3, y: 5 }, width: 2, height: 10, center: { x: 2, y: 0 } };
    expect(await selectDoorCandidate(coincident, verticalBounds)).toMatchObject({ ok: true });
    expect(await selectDoorCandidate([...coincident.slice(0, 1), { ...coincident[1], position: { x: 2.1, y: 0 } }], verticalBounds))
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

  it("updates only the selected door geometry in place", async () => {
    const item = fogLine("fog", [-20, 0], [20, 0]);
    const doors = [
      { open: true, start: { index: 0, distance: 2 }, end: { index: 0, distance: 8 } },
      { open: false, start: { index: 0, distance: 20 }, end: { index: 0, distance: 28 } },
    ];
    item.metadata = { unrelated: { keep: true }, [DYNAMIC_FOG_DOORS_KEY]: doors };
    mocks.items = [item];
    const geometry = { position: structuredClone(item.position), commands: structuredClone(item.commands) };
    const result = await updateDoorGeometry(
      { fogItemId: "fog", doorIndex: 0 },
      { start: { index: 0, distance: 2 }, end: { index: 0, distance: 8 } },
      { start: { index: 0, distance: 4 }, end: { index: 0, distance: 12 } },
      40,
    );
    expect(result).toEqual({ ok: true, ref: { fogItemId: "fog", doorIndex: 0 } });
    expect(doors).toEqual([
      { open: true, start: { index: 0, distance: 4 }, end: { index: 0, distance: 12 } },
      { open: false, start: { index: 0, distance: 20 }, end: { index: 0, distance: 28 } },
    ]);
    expect(item.metadata.unrelated).toEqual({ keep: true });
    expect({ position: item.position, commands: item.commands }).toEqual(geometry);
  });

  it("rejects overlapping, stale, and invalid geometry without partial mutation", async () => {
    const item = fogLine("fog", [-20, 0], [20, 0]);
    const doors = [
      { open: false, start: { index: 0, distance: 2 }, end: { index: 0, distance: 8 } },
      { open: true, start: { index: 0, distance: 12 }, end: { index: 0, distance: 18 } },
    ];
    item.metadata[DYNAMIC_FOG_DOORS_KEY] = doors;
    mocks.items = [item];
    const snapshot = structuredClone(doors);
    expect(await updateDoorGeometry({ fogItemId: "fog", doorIndex: 0 }, snapshot[0], { start: { index: 0, distance: 6 }, end: { index: 0, distance: 14 } }, 40))
      .toEqual({ ok: false, reason: "overlapping-door" });
    expect(await updateDoorGeometry({ fogItemId: "fog", doorIndex: 0 }, { start: { index: 0, distance: 1 }, end: { index: 0, distance: 8 } }, { start: { index: 0, distance: 3 }, end: { index: 0, distance: 9 } }, 40))
      .toEqual({ ok: false, reason: "stale-edit" });
    expect(await updateDoorGeometry({ fogItemId: "fog", doorIndex: 0 }, snapshot[0], { start: { index: 0, distance: 4 }, end: { index: 1, distance: 9 } }, 40))
      .toEqual({ ok: false, reason: "invalid-geometry" });
    expect(doors).toEqual(snapshot);
  });

  it("preserves an open-state change made during editing", async () => {
    const item = fogLine("fog", [-20, 0], [20, 0]);
    const door = { open: true, start: { index: 0, distance: 2 }, end: { index: 0, distance: 8 } };
    item.metadata[DYNAMIC_FOG_DOORS_KEY] = [door];
    mocks.items = [item];
    expect(await updateDoorGeometry({ fogItemId: "fog", doorIndex: 0 }, { start: { ...door.start }, end: { ...door.end } }, { start: { index: 0, distance: 3 }, end: { index: 0, distance: 9 } }, 40)).toMatchObject({ ok: true });
    expect(door.open).toBe(true);
  });
});
