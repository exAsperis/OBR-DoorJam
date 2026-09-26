import { type CanvasKit, type ContourMeasure } from "canvaskit-wasm";
import { MathM, isCurve, isLine, isPath, isShape, type Item, type Vector2 } from "@owlbear-rodeo/sdk";
import type { ContourMarker } from "./types";
import { drawingToSkPath, getCanvasKit } from "./geometry";

export interface EditableContour {
  index: number;
  length: number;
  pointAt(distance: number): Vector2;
  project(worldPosition: Vector2): { distance: number; worldPosition: Vector2; worldError: number };
  segment(startDistance: number, endDistance: number): Vector2[];
  dispose(): void;
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
  const path = drawingToSkPath(ck, item);
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
