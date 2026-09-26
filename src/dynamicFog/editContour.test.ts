import CanvasKitInit from "canvaskit-wasm";
import { Command, type Curve, type Line, type Path, type Shape } from "@owlbear-rodeo/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { createEditableContour } from "./editContour";

declare const process: { cwd(): string };

let ck: Awaited<ReturnType<typeof CanvasKitInit>>;
const common = { layer: "FOG" as const, name: "Fog", visible: true, locked: false, createdUserId: "gm", zIndex: 0, lastModified: "", lastModifiedUserId: "gm", metadata: {}, position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } };
const style = { fillColor: "#000", fillOpacity: 0, strokeColor: "#000", strokeOpacity: 1, strokeWidth: 1, strokeDash: [] };
const line = (overrides: Partial<Line> = {}): Line => ({ ...common, id: "line", type: "LINE", startPosition: { x: 0, y: 0 }, endPosition: { x: 100, y: 0 }, style, ...overrides });

beforeAll(async () => { ck = await CanvasKitInit({ locateFile: () => `${process.cwd()}/node_modules/canvaskit-wasm/bin/canvaskit.wasm` }); });

describe("editable native contours", () => {
  it("uses native distances for straight, rotated, and nonuniformly scaled lines", () => {
    const base = createEditableContour(ck, line(), { index: 0, distance: 50 })!;
    expect(base.length).toBeCloseTo(100);
    expect(base.pointAt(50)).toEqual({ x: 50, y: 0 });
    base.dispose();
    const transformed = createEditableContour(ck, line({ position: { x: 10, y: 20 }, rotation: 90, scale: { x: 2, y: 3 } }), { index: 0, distance: 50 })!;
    expect(transformed.length).toBeCloseTo(100);
    expect(transformed.pointAt(50).x).toBeCloseTo(10);
    expect(transformed.pointAt(50).y).toBeCloseTo(120);
    expect(transformed.project({ x: 10, y: 170 }).distance).toBeCloseTo(75, 1);
    transformed.dispose();
  });

  it("supports shapes, curved paths, cardinal splines, and multiple contours", () => {
    const rectangle: Shape = { ...common, id: "shape", type: "SHAPE", width: 20, height: 10, shapeType: "RECTANGLE", style };
    const shapeContour = createEditableContour(ck, rectangle, { index: 0, distance: 5 })!;
    expect(shapeContour.length).toBeCloseTo(60);
    shapeContour.dispose();
    const path: Path = { ...common, id: "path", type: "PATH", commands: [[Command.MOVE, 0, 0], [Command.QUAD, 50, 100, 100, 0], [Command.MOVE, 200, 0], [Command.LINE, 250, 0]], style, fillRule: "nonzero" };
    const curved = createEditableContour(ck, path, { index: 0, distance: 1 })!;
    const center = curved.pointAt(curved.length / 2);
    expect(center.y).toBeGreaterThan(40);
    expect(curved.project(center).distance).toBeCloseTo(curved.length / 2, 1);
    curved.dispose();
    const second = createEditableContour(ck, path, { index: 1, distance: 1 })!;
    expect(second.length).toBeCloseTo(50);
    second.dispose();
    const curve: Curve = { ...common, id: "curve", type: "CURVE", points: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], style: { ...style, tension: 0.5, closed: false } };
    const spline = createEditableContour(ck, curve, { index: 0, distance: 1 })!;
    expect(spline.length).toBeGreaterThan(100);
    expect(spline.segment(spline.length, 0)[0]).toEqual(spline.pointAt(spline.length));
    spline.dispose();
  });

  it("rejects missing contours and out-of-range markers", () => {
    expect(createEditableContour(ck, line(), { index: 2, distance: 0 })).toBeNull();
    expect(createEditableContour(ck, line(), { index: 0, distance: 101 })).toBeNull();
  });
});
