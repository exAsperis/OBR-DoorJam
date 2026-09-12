import { Command, type Item, type Path, type Shape } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import { DYNAMIC_FOG_DOORS_KEY, enumerateDoors, findDoorCandidates, lookupDoor, parseDynamicFogDoors } from "./adapter";

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

describe("Dynamic Fog adapter", () => {
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
});
