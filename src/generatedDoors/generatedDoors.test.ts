import { Command, type Item, type Path } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import { deriveDoorStrokeColor } from "./colors";
import { applyGeneratedDoorUpdate } from "./createGeneratedDoor";
import { generateDoorGeometry } from "./geometry";
import { readGeneratedDoorSpec, writeGeneratedDoorSpec } from "./metadata";
import { getDoorDetailMetrics } from "./metrics";
import { absorbScaleIntoSpec } from "./reconcileGeneratedDoorScale";
import { pathCommandsToSvgD } from "./svgPreview";
import { DEFAULT_GENERATED_DOOR_SPEC, type GeneratedDoorSpec } from "./types";

const dpi = 100;
const base = (overrides: Partial<GeneratedDoorSpec> = {}): GeneratedDoorSpec => ({ version: 1, type: "single-swing", style: "plain", width: 100, thickness: 16, color: "#8b5a2b", hingeSide: "left", openAngle: 0, placementRotation: 0, ...overrides });
const points = (spec: GeneratedDoorSpec) => generateDoorGeometry(spec, { dpi }).commands.flatMap((command) => command.slice(1)).filter((value): value is number => typeof value === "number");

describe("generated door geometry", () => {
  it("defaults to one grid cell wide, quarter-cell thick, and ninety degrees open", () => { expect(DEFAULT_GENERATED_DOOR_SPEC).toMatchObject({ width: 100, thickness: 25, openAngle: 90 }); });
  it("generates a valid nonempty single swing path", () => { const value = generateDoorGeometry(base(), { dpi }); expect(value.commands.length).toBeGreaterThan(4); expect(value.commands.some((c) => c[0] === Command.CLOSE)).toBe(true); });
  it("renders both double-swing leaves in one command set", () => { const commands = generateDoorGeometry(base({ type: "double-swing" }), { dpi }).commands; expect(commands.filter((c) => c[0] === Command.CLOSE).length).toBeGreaterThanOrEqual(6); });
  it("opens both double-swing leaves in the same direction", () => { const coordinates = points(base({ type: "double-swing", openAngle: 90 })); const ys = coordinates.filter((_, index) => index % 2 === 1); expect(Math.max(...ys)).toBeGreaterThan(40); expect(Math.min(...ys)).toBeGreaterThan(-10); });
  it("keeps sliding geometry free of hinge-sized endpoint marks", () => { const slide = generateDoorGeometry(base({ type: "single-slide" }), { dpi }).commands; const swing = generateDoorGeometry(base(), { dpi }).commands; expect(slide.length).toBeLessThan(swing.length); });
  it("uses trap depth independently of width", () => { const shallow = points(base({ type: "trap", depth: 40 })); const deep = points(base({ type: "trap", depth: 90 })); expect(Math.max(...deep.filter((_, i) => i % 2))).toBeGreaterThan(Math.max(...shallow.filter((_, i) => i % 2))); });
  it("mirrors left and right hinge placement", () => { const left = points(base({ hingeSide: "left" })); const right = points(base({ hingeSide: "right" })); expect(Math.min(...left)).toBeCloseTo(-Math.max(...right), 3); });
  it("changes leaf position between zero and ninety degrees", () => { expect(points(base({ openAngle: 0 }))).not.toEqual(points(base({ openAngle: 90 }))); const ninety = points(base({ openAngle: 90 })); expect(Math.max(...ninety)).toBeGreaterThan(80); });
  it("does not scale fixed hardware proportionally with width", () => { const a = getDoorDetailMetrics(base({ width: 100 }), dpi); const b = getDoorDetailMetrics(base({ width: 900 }), dpi); expect(b.handleSize).toBe(a.handleSize); expect(b.hingeSize).toBe(a.hingeSize); });
  it("adds repeated planks as width grows", () => { const narrow = generateDoorGeometry(base({ style: "planked", width: 100 }), { dpi }).commands.length; const wide = generateDoorGeometry(base({ style: "planked", width: 400 }), { dpi }).commands.length; expect(wide).toBeGreaterThan(narrow); });
  it("changes thickness-dependent metrics", () => { expect(getDoorDetailMetrics(base({ thickness: 8 }), dpi).strokeWidth).toBeLessThan(getDoorDetailMetrics(base({ thickness: 35 }), dpi).strokeWidth); });
  it("derives colors deterministically", () => { expect(deriveDoorStrokeColor("#abcdef")).toBe(deriveDoorStrokeColor("#abcdef")); expect(deriveDoorStrokeColor("#abcdef")).not.toBe("#abcdef"); });
  it("converts every emitted command type to SVG", () => { for (const type of ["single-swing", "double-swing", "single-slide", "double-slide", "trap"] as const) { const d = pathCommandsToSvgD(generateDoorGeometry(base({ type, ...(type === "trap" ? { depth: 80 } : {}) }), { dpi }).commands); expect(d).toMatch(/^M/); expect(d).toContain("Z"); } });
});

describe("generated door canonical state", () => {
  it("absorbs normal scale into width/thickness", () => { const next = absorbScaleIntoSpec(base(), { x: 2, y: -3 }, dpi); expect(next.width).toBe(200); expect(next.thickness).toBe(48); });
  it("absorbs trap scale into width/depth and permits a 1/1 resting state", () => { const next = absorbScaleIntoSpec(base({ type: "trap", depth: 60 }), { x: -2, y: .5 }, dpi); expect(next.width).toBe(200); expect(next.depth).toBe(30); });
  it("preserves item identity and unrelated metadata during edit", () => { const item = { id: "stable-id", type: "PATH", metadata: { "other/extension": { keep: true } }, commands: [], style: { fillColor: "#000", fillOpacity: 1, strokeColor: "#000", strokeOpacity: 1, strokeWidth: 1, strokeDash: [] }, fillRule: "nonzero", scale: { x: 2, y: 2 }, name: "old" } as unknown as Path; expect(applyGeneratedDoorUpdate(item, base({ color: "#123456" }), dpi)).toBe(true); expect(item.id).toBe("stable-id"); expect(item.metadata["other/extension"]).toEqual({ keep: true }); expect(item.scale).toEqual({ x: 1, y: 1 }); });
  it("reads only versioned generated metadata and leaves ordinary doors unaffected", () => { const ordinary = { metadata: { "other": true } } as unknown as Item; expect(readGeneratedDoorSpec(ordinary)).toBeNull(); writeGeneratedDoorSpec(ordinary, base()); expect(readGeneratedDoorSpec(ordinary)).toEqual(base()); expect(ordinary.metadata.other).toBe(true); });
});
