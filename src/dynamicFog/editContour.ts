import CanvasKitInit, { type CanvasKit, type ContourMeasure, type Path as SkPath } from "canvaskit-wasm";
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";
import { Command, MathM, isCurve, isLine, isPath, isShape, type Item, type Vector2 } from "@owlbear-rodeo/sdk";
import type { ContourMarker } from "./types";

export interface EditableContour {
  index: number;
  length: number;
  pointAt(distance: number): Vector2;
  project(worldPosition: Vector2): { distance: number; worldPosition: Vector2; worldError: number };
  segment(startDistance: number, endDistance: number): Vector2[];
  dispose(): void;
}

let canvasKitPromise: Promise<CanvasKit> | undefined;
const getCanvasKit = () => canvasKitPromise ??= CanvasKitInit({ locateFile: () => wasmUrl });

function controlPoints(p0: Vector2, p1: Vector2, p2: Vector2, tension: number): [Vector2, Vector2] {
  const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const total = d01 + d12;
  if (total <= 0) return [{ ...p0 }, { ...p0 }];
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const a = tension * d01 / total;
  const b = tension * d12 / total;
  return [{ x: p1.x - dx * a, y: p1.y - dy * a }, { x: p1.x + dx * b, y: p1.y + dy * b }];
}

function addCurve(path: SkPath, points: Vector2[], tension: number, closed: boolean) {
  if (!points.length) return;
  path.moveTo(points[0].x, points[0].y);
  if (tension === 0 || points.length <= 2) {
    for (const point of points.slice(1)) path.lineTo(point.x, point.y);
  } else {
    const controls = points.map((point, index) => controlPoints(points[(index - 1 + points.length) % points.length], point, points[(index + 1) % points.length], tension));
    if (closed) {
      for (let index = 0; index < points.length; index += 1) {
        const next = (index + 1) % points.length;
        path.cubicTo(controls[index][1].x, controls[index][1].y, controls[next][0].x, controls[next][0].y, points[next].x, points[next].y);
      }
    } else {
      path.quadTo(controls[1][0].x, controls[1][0].y, points[1].x, points[1].y);
      for (let index = 1; index < points.length - 2; index += 1) path.cubicTo(controls[index][1].x, controls[index][1].y, controls[index + 1][0].x, controls[index + 1][0].y, points[index + 1].x, points[index + 1].y);
      if (points.length > 2) path.quadTo(controls.at(-2)![1].x, controls.at(-2)![1].y, points.at(-1)!.x, points.at(-1)!.y);
    }
  }
  if (closed) path.close();
}

function itemPath(ck: CanvasKit, item: Item): SkPath | null {
  if (isPath(item)) return ck.Path.MakeFromCmds(item.commands.flat());
  const path = new ck.Path();
  if (isLine(item)) { path.moveTo(item.startPosition.x, item.startPosition.y); path.lineTo(item.endPosition.x, item.endPosition.y); }
  else if (isCurve(item)) addCurve(path, item.points, item.style.tension, item.style.fillOpacity > 0 || Boolean(item.style.closed));
  else if (isShape(item)) {
    if (item.shapeType === "RECTANGLE") path.addRect(ck.XYWHRect(0, 0, item.width, item.height));
    else if (item.shapeType === "CIRCLE") path.addOval(ck.XYWHRect(-item.width / 2, -item.height / 2, item.width, item.height));
    else if (item.shapeType === "TRIANGLE") { path.moveTo(0, 0); path.lineTo(item.width / 2, item.height); path.lineTo(-item.width / 2, item.height); path.close(); }
    else if (item.shapeType === "HEXAGON") { const r = Math.min(item.width, item.height) / 2; path.addPoly(Array.from({ length: 12 }, (_, i) => { const a = -Math.PI / 2 + Math.floor(i / 2) * Math.PI / 3; return i % 2 ? Math.sin(a) * r : Math.cos(a) * r; }), true); }
    else { path.delete(); return null; }
  } else { path.delete(); return null; }
  return path;
}

function toWorld(item: Item, local: Vector2): Vector2 {
  return MathM.decompose(MathM.multiply(MathM.fromItem(item), MathM.fromPosition(local))).position;
}

export async function getEditableContour(item: Item, marker: ContourMarker): Promise<EditableContour | null> {
  if (!Number.isInteger(marker.index) || marker.index < 0) return null;
  const ck = await getCanvasKit();
  return createEditableContour(ck, item, marker);
}

export function createEditableContour(ck: CanvasKit, item: Item, marker: ContourMarker): EditableContour | null {
  if (!Number.isInteger(marker.index) || marker.index < 0) return null;
  const path = itemPath(ck, item);
  if (!path) return null;
  const iterator = new ck.ContourMeasureIter(path, false, 1);
  let measure: ContourMeasure | null = iterator.next();
  for (let index = 0; measure && index < marker.index; index += 1) { measure.delete(); measure = iterator.next(); }
  iterator.delete();
  if (!measure) { path.delete(); return null; }
  const length = measure.length();
  if (!Number.isFinite(length) || length < 2 || marker.distance < 0 || marker.distance > length) { measure.delete(); path.delete(); return null; }
  const pointAt = (distance: number) => { const point = measure!.getPosTan(Math.max(0, Math.min(length, distance))); return toWorld(item, { x: point[0], y: point[1] }); };
  return {
    index: marker.index,
    length,
    pointAt,
    project(worldPosition) {
      let bestDistance = 0;
      let bestPoint = pointAt(0);
      let bestError = Infinity;
      const evaluate = (distance: number) => { const world = pointAt(distance); const error = Math.hypot(world.x - worldPosition.x, world.y - worldPosition.y); if (error < bestError) { bestDistance = distance; bestPoint = world; bestError = error; } };
      const step = Math.max(length / 256, 0.5);
      for (let distance = 0; distance <= length; distance += step) evaluate(distance);
      evaluate(length);
      let precision = step / 2;
      while (precision > 0.01) { evaluate(Math.max(0, bestDistance - precision)); evaluate(Math.min(length, bestDistance + precision)); precision /= 2; }
      return { distance: bestDistance, worldPosition: bestPoint, worldError: bestError };
    },
    segment(startDistance, endDistance) {
      const start = Math.min(startDistance, endDistance);
      const end = Math.max(startDistance, endDistance);
      const count = Math.max(2, Math.ceil((end - start) / 4) + 1);
      const points = Array.from({ length: count }, (_, index) => pointAt(start + (end - start) * index / (count - 1)));
      return startDistance <= endDistance ? points : points.reverse();
    },
    dispose() { measure?.delete(); measure = null; path.delete(); },
  };
}

export function geometryFingerprint(item: Item): string {
  const drawing = isLine(item) ? { startPosition: item.startPosition, endPosition: item.endPosition }
    : isCurve(item) ? { points: item.points, style: { tension: item.style.tension, closed: item.style.closed, fillOpacity: item.style.fillOpacity } }
      : isPath(item) ? { commands: item.commands, fillRule: item.fillRule }
        : isShape(item) ? { shapeType: item.shapeType, width: item.width, height: item.height } : null;
  return JSON.stringify({ type: item.type, drawing, position: item.position, rotation: item.rotation, scale: item.scale });
}
