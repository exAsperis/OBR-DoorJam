import type { Curve, Item, Line } from "@owlbear-rodeo/sdk";
import type { SmokeDoorRef } from "../doorJam/metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ items: [] as Item[], updateItems: vi.fn(), getItems: vi.fn(), addItems: vi.fn(), deleteItems: vi.fn(), getItemAttachments: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", async (original) => {
  const actual = await original<typeof import("@owlbear-rodeo/sdk")>();
  const buildCurve = () => {
    const item: Record<string, unknown> = { id: crypto.randomUUID(), type: "CURVE", createdUserId: "gm", lastModified: "", lastModifiedUserId: "gm" };
    const builder: Record<string, unknown> = {};
    for (const key of ["points", "style", "name", "metadata", "position", "rotation", "scale", "visible", "locked", "layer", "zIndex", "description", "attachedTo", "disableHit", "disableAutoZIndex", "disableAttachmentBehavior"]) {
      builder[key] = (value: unknown) => { item[key] = value; return builder; };
    }
    builder.build = () => item;
    return builder;
  };
  return {
    ...actual,
    buildCurve,
    default: { scene: { items: { updateItems: mocks.updateItems, getItems: mocks.getItems, addItems: mocks.addItems, deleteItems: mocks.deleteItems, getItemAttachments: mocks.getItemAttachments } } },
  };
});

import { SMOKE_DOOR_STROKE_COLOR, SMOKE_KEYS, chooseSmokeDoor, createSmokeDoor, isSmokeDoor, lookupSmokeDoor, setSmokeDoorState } from "./adapter";

function line(id: string, metadata: Record<string, unknown>, start = { x: 0, y: 0 }, end = { x: 100, y: 0 }): Line {
  return {
    id, type: "LINE", name: id, layer: "DRAWING", visible: true, locked: true, createdUserId: "gm", zIndex: 0,
    lastModified: "", lastModifiedUserId: "gm", position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 },
    metadata, startPosition: start, endPosition: end,
    style: { strokeColor: "#000", strokeOpacity: 1, strokeWidth: 2, strokeDash: [] },
  };
}

function curve(id: string, metadata: Record<string, unknown>, points = [{ x: 0, y: 0 }, { x: 100, y: 0 }]): Curve {
  return {
    id, type: "CURVE", name: id, layer: "POINTER", visible: true, locked: true, createdUserId: "gm", zIndex: 0,
    lastModified: "", lastModifiedUserId: "gm", position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, metadata, points,
    style: { fillColor: "#000", fillOpacity: 0, strokeColor: "#000", strokeOpacity: 1, strokeWidth: 2, strokeDash: [], tension: 0, closed: false },
  };
}

describe("Smoke adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateItems.mockImplementation(async (ids: string[], update: (items: Item[]) => void) => update(mocks.items.filter((item) => ids.includes(item.id))));
    mocks.getItems.mockImplementation(async (ids?: string[]) => ids ? mocks.items.filter((item) => ids.includes(item.id)) : mocks.items);
    mocks.addItems.mockImplementation(async (items: Item[]) => { mocks.items.push(...items); });
    mocks.deleteItems.mockImplementation(async (ids: string[]) => { mocks.items = mocks.items.filter((item) => !ids.includes(item.id)); });
    mocks.getItemAttachments.mockImplementation(async (ids: string[]) => mocks.items.filter((item) => ids.includes(item.id)));
  });

  it("recognizes only metadata-marked Smoke doors and reads missing open as closed", () => {
    const door = line("door", { [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.door]: true });
    expect(isSmokeDoor(door)).toBe(true);
    expect(lookupSmokeDoor([door], { provider: "smoke", doorItemId: "door" })).toEqual({ ok: true, open: false });
    expect(isSmokeDoor(line("wall", { [SMOKE_KEYS.vision]: true }))).toBe(false);
  });

  it("finds Smoke's CURVE item in the POINTER layer by its nearest segment", () => {
    const door = curve("pointer-layer-door", { [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.door]: true }, [{ x: 0, y: 0 }, { x: 0, y: 300 }]);
    const bounds = { min: { x: 20, y: 285 }, max: { x: 60, y: 325 }, center: { x: 40, y: 305 }, width: 40, height: 40 };
    expect(chooseSmokeDoor([door], bounds)).toMatchObject({ ok: true, door: { ref: { doorItemId: door.id }, distance: 20 } });
  });

  it("splits Smoke's straight two-point CURVE obstruction and creates a CURVE door", async () => {
    const wall = curve("wall", { [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.blocking]: true, thirdParty: { kept: true } }, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    mocks.items = [wall];
    const result = await createSmokeDoor({ min: { x: 40, y: -10 }, max: { x: 60, y: 10 }, center: { x: 50, y: 0 }, width: 20, height: 20 });
    expect(result.ok).toBe(true);
    expect(wall.points).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const created = mocks.items.filter((item) => item.id !== wall.id);
    expect(created).toHaveLength(2);
    expect(created.every((item) => item.type === "CURVE" && item.layer === "POINTER")).toBe(true);
    const door = created.find(isSmokeDoor);
    expect(door).toMatchObject({ type: "CURVE", points: [{ x: 40, y: 0 }, { x: 60, y: 0 }], style: { strokeColor: SMOKE_DOOR_STROKE_COLOR }, metadata: { [SMOKE_KEYS.door]: true, thirdParty: { kept: true } } });
    expect(created.find((item) => !isSmokeDoor(item))).toMatchObject({ style: { strokeColor: "#000" } });
  });

  it("does not create a door across a gap between separate obstructions", async () => {
    const left = curve("left", { [SMOKE_KEYS.vision]: true }, [{ x: 0, y: 0 }, { x: 35, y: 0 }]);
    const right = curve("right", { [SMOKE_KEYS.vision]: true }, [{ x: 65, y: 0 }, { x: 100, y: 0 }]);
    mocks.items = [left, right];
    const result = await createSmokeDoor({ min: { x: 40, y: -10 }, max: { x: 60, y: 10 }, center: { x: 50, y: 0 }, width: 20, height: 20 });
    expect(result).toEqual({ ok: false, reason: "no-intersection" });
    expect(mocks.addItems).not.toHaveBeenCalled();
    expect(mocks.items).toEqual([left, right]);
  });

  it("opens while preserving unrelated metadata", async () => {
    const door = line("door", { [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.door]: true, thirdParty: { value: 7 } });
    mocks.items = [door];
    const ref: SmokeDoorRef = { provider: "smoke", doorItemId: "door" };
    expect(await setSmokeDoorState(ref, true)).toEqual({ ok: true, open: true });
    expect(door.metadata).toMatchObject({ [SMOKE_KEYS.open]: true, [SMOKE_KEYS.disabled]: true, thirdParty: { value: 7 } });
  });

  it("closes a canonical Smoke door by removing both door-state flags", async () => {
    const door = line("door", { [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.door]: true, [SMOKE_KEYS.open]: true, [SMOKE_KEYS.disabled]: true, unrelated: "preserved" });
    mocks.items = [door];
    expect(await setSmokeDoorState({ provider: "smoke", doorItemId: "door" }, false)).toEqual({ ok: true, open: false });
    expect(door.metadata).toEqual({ [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.door]: true, unrelated: "preserved" });
  });

  it("prefers an intersecting door and rejects ambiguous intersections", () => {
    const metadata = { [SMOKE_KEYS.vision]: true, [SMOKE_KEYS.door]: true };
    const bounds = { min: { x: 40, y: -10 }, max: { x: 60, y: 10 }, center: { x: 50, y: 0 }, width: 20, height: 20 };
    expect(chooseSmokeDoor([line("door", metadata)], bounds)).toMatchObject({ ok: true, door: { ref: { doorItemId: "door" }, intersects: true } });
    expect(chooseSmokeDoor([line("a", metadata), line("b", metadata, { x: 0, y: 1 }, { x: 100, y: 1 })], bounds)).toEqual({ ok: false, reason: "ambiguous" });
  });
});
