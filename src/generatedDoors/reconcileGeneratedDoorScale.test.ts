import type { Item, Path } from "@owlbear-rodeo/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateDoorGeometry } from "./geometry";
import { readGeneratedDoorSpec, writeGeneratedDoorSpec } from "./metadata";
import {
  GeneratedDoorScaleReconciler,
  isCollapsedGeneratedDoorScale,
  reconcileGeneratedDoorItem,
} from "./reconcileGeneratedDoorScale";
import type { GeneratedDoorSpec } from "./types";

const mocks = vi.hoisted(() => ({ updateItems: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", async (original) => {
  const actual = await original<typeof import("@owlbear-rodeo/sdk")>();
  return { ...actual, default: { ...actual.default, scene: { items: { updateItems: mocks.updateItems } } } };
});

const dpi = 100;
const spec: GeneratedDoorSpec = {
  version: 1,
  type: "swing",
  leaves: "single",
  style: "plain",
  width: 100,
  thickness: 25,
  color: "#8b5a2b",
  hingeSide: "left",
  openAngle: 90,
  placementRotation: 0,
};

function door(id: string, scale = { x: 1, y: 1 }) {
  // Generated doors are initially closed; reconciliation renders swing geometry
  // with a zero angle until DoorJam metadata marks the door open.
  const geometry = generateDoorGeometry({ ...spec, openAngle: 0 }, { dpi });
  const item = {
    id,
    type: "PATH",
    metadata: {},
    commands: geometry.commands,
    style: { fillColor: geometry.fillColor, fillOpacity: 1, strokeColor: geometry.strokeColor, strokeOpacity: 1, strokeWidth: geometry.strokeWidth, strokeDash: [] },
    fillRule: geometry.fillRule ?? "nonzero",
    scale,
    position: { x: 10, y: 20 },
    rotation: 0,
    name: "DoorJam Door",
  } as unknown as Path;
  writeGeneratedDoorSpec(item, spec);
  return item;
}

describe("generated door collapsed-scale reconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.updateItems.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it.each([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }])("preserves a temporarily collapsed item at $x/$y", (scale) => {
    const item = door("collapsed", scale);
    const commands = structuredClone(item.commands);
    expect(isCollapsedGeneratedDoorScale(scale)).toBe(true);
    expect(reconcileGeneratedDoorItem(item, dpi)).toBe(false);
    expect(readGeneratedDoorSpec(item)).toEqual(spec);
    expect(item.commands).toEqual(commands);
    expect(item.scale).toEqual(scale);
    expect(item.position).toEqual({ x: 10, y: 20 });
  });

  it("cancels a pending resize when the item is sent off stage", async () => {
    const item = door("pending", { x: 2, y: 1 });
    const reconciler = new GeneratedDoorScaleReconciler(150);
    reconciler.observe([item], dpi);
    item.scale = { x: 0, y: 0 };
    reconciler.observe([item], dpi);
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.updateItems).not.toHaveBeenCalled();
    reconciler.cancel();
  });

  it("rechecks collapsed scale inside a reconciliation already in flight", async () => {
    const item = door("race", { x: 2, y: 1 });
    mocks.updateItems.mockImplementation(async (_ids: string[], update: (items: Item[]) => void) => {
      item.scale = { x: 0, y: 0 };
      update([item]);
    });
    const reconciler = new GeneratedDoorScaleReconciler(150);
    reconciler.observe([item], dpi);
    await vi.advanceTimersByTimeAsync(200);
    expect(mocks.updateItems).toHaveBeenCalledOnce();
    expect(readGeneratedDoorSpec(item)).toEqual(spec);
    expect(item.scale).toEqual({ x: 0, y: 0 });
    reconciler.cancel();
  });

  it("leaves a restored unit scale alone and reconciles a restored non-unit scale", () => {
    const restored = door("restored");
    expect(reconcileGeneratedDoorItem(restored, dpi)).toBe(false);
    expect(readGeneratedDoorSpec(restored)).toEqual(spec);
    restored.scale = { x: 2, y: 1.5 };
    expect(reconcileGeneratedDoorItem(restored, dpi)).toBe(true);
    expect(readGeneratedDoorSpec(restored)).toMatchObject({ width: 200, thickness: 37.5 });
    expect(restored.scale).toEqual({ x: 1, y: 1 });
  });
});
