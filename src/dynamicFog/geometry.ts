import {
  Command,
  MathM,
  isCurve,
  isLine,
  isPath,
  isShape,
  type Curve,
  type BoundingBox,
  type Item,
  type PathCommand,
  type Vector2,
} from "@owlbear-rodeo/sdk";
import CanvasKitInit, { type CanvasKit, type ContourMeasure, type Path as SkPath } from "canvaskit-wasm";
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";
import type { ContourMarker, DynamicFogDoorGeometry } from "./types";

declare const process: { cwd(): string; versions?: { node?: string } } | undefined;

let canvasKitPromise: Promise<CanvasKit> | undefined;
export const getCanvasKit = () => canvasKitPromise ??= CanvasKitInit({ locateFile: () =>
  typeof process !== "undefined" && process.versions?.node ? `${process.cwd()}${wasmUrl}` : wasmUrl });

function cardinalControlPoints(p0: Vector2, p1: Vector2, p2: Vector2, tension: number): [Vector2, Vector2] {
  const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const total = d01 + d12;
  if (total <= 0) return [{ ...p0 }, { ...p0 }];
  const delta = { x: p2.x - p0.x, y: p2.y - p0.y };
  return [
    { x: p1.x - delta.x * tension * d01 / total, y: p1.y - delta.y * tension * d01 / total },
    { x: p1.x + delta.x * tension * d12 / total, y: p1.y + delta.y * tension * d12 / total },
  ];
}

/** Exact port of Dynamic Fog's CardinalSpline.addToSkPath. */
function addCardinalSpline(path: SkPath, points: Vector2[], tension: number, closed: boolean): void {
  if (!points.length) return;
  path.moveTo(points[0].x, points[0].y);
  if (tension !== 0 && points.length > 2) {
    const expand = (values: Vector2[]) => {
      const result: Vector2[] = [];
      for (let i = 1; i < values.length - 1; i += 1) {
        const [a, b] = cardinalControlPoints(values[i - 1], values[i], values[i + 1], tension);
        if (!Number.isNaN(a.x)) result.push(a, values[i], b);
      }
      return result;
    };
    let controls: Vector2[];
    if (closed) {
      const first = cardinalControlPoints(points.at(-1)!, points[0], points[1], tension);
      const last = cardinalControlPoints(points.at(-2)!, points.at(-1)!, points[0], tension);
      controls = [first[1], ...expand(points), last[0], points.at(-1)!, last[1], first[0], points[0]];
    } else controls = expand(points);
    if (!closed && controls.length > 1) path.quadTo(controls[0].x, controls[0].y, controls[1].x, controls[1].y);
    for (let i = closed ? 0 : 2; i < controls.length - 1; i += 3) {
      const a = controls[i], b = controls[i + 1], end = controls[i + 2];
      if ([a.x, a.y, b.x, b.y, end.x, end.y].every(Number.isFinite)) path.cubicTo(a.x, a.y, b.x, b.y, end.x, end.y);
    }
    if (!closed && controls.length) {
      const control = controls.at(-1)!; const end = points.at(-1)!;
      path.quadTo(control.x, control.y, end.x, end.y);
    }
  } else for (const value of points.slice(1)) path.lineTo(value.x, value.y);
  if (closed) path.close();
}

/** Build the same local-space CanvasKit path used by Dynamic Fog 0.39.x. */
export function drawingToSkPath(ck: CanvasKit, item: Item): SkPath | null {
  if (isPath(item)) {
    const path = ck.Path.MakeFromCmds(item.commands.flat());
    if (path) path.setFillType(item.fillRule === "nonzero" ? ck.FillType.Winding : ck.FillType.EvenOdd);
    return path;
  }
  const path = new ck.Path();
  if (isLine(item)) { path.moveTo(item.startPosition.x, item.startPosition.y); path.lineTo(item.endPosition.x, item.endPosition.y); }
  else if (isCurve(item)) addCardinalSpline(path, item.points, item.style.tension, item.style.fillOpacity > 0 || Boolean(item.style.closed));
  else if (isShape(item)) {
    if (item.shapeType === "RECTANGLE") path.addRect(ck.XYWHRect(0, 0, item.width, item.height));
    else if (item.shapeType === "CIRCLE") path.addOval(ck.XYWHRect(-item.width / 2, -item.height / 2, item.width, item.height));
    else if (item.shapeType === "TRIANGLE") { path.moveTo(0, 0); path.lineTo(item.width / 2, item.height); path.lineTo(-item.width / 2, item.height); path.close(); }
    else if (item.shapeType === "HEXAGON") {
      const radius = Math.min(item.width, item.height) / 2;
      for (let i = 0; i < 6; i += 1) { const angle = -Math.PI / 2 + i * Math.PI / 3; const p = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }; if (i) path.lineTo(p.x, p.y); else path.moveTo(p.x, p.y); }
      path.close();
    } else { path.delete(); return null; }
  } else { path.delete(); return null; }
  return path;
}

function point(command: PathCommand): Vector2 | null {
  switch (command[0]) {
    case Command.MOVE:
    case Command.LINE: return { x: command[1], y: command[2] };
    case Command.QUAD:
    case Command.CONIC: return { x: command[3], y: command[4] };
    case Command.CUBIC: return { x: command[5], y: command[6] };
    default: return null;
  }
}

function lerp(a: Vector2, b: Vector2, t: number): Vector2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function sampleSegment(start: Vector2, command: PathCommand): Vector2[] {
  const samples: Vector2[] = [];
  const steps = command[0] === Command.LINE ? 1 : 24;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (command[0] === Command.QUAD || command[0] === Command.CONIC) {
      const control = { x: command[1], y: command[2] };
      const end = { x: command[3], y: command[4] };
      const a = lerp(start, control, t);
      const b = lerp(control, end, t);
      samples.push(lerp(a, b, t));
    } else if (command[0] === Command.CUBIC) {
      const c1 = { x: command[1], y: command[2] };
      const c2 = { x: command[3], y: command[4] };
      const end = { x: command[5], y: command[6] };
      const a = lerp(start, c1, t);
      const b = lerp(c1, c2, t);
      const c = lerp(c2, end, t);
      samples.push(lerp(lerp(a, b, t), lerp(b, c, t), t));
    } else {
      const end = point(command);
      if (end) samples.push(end);
    }
  }
  return samples;
}

function pathContours(commands: PathCommand[]): Vector2[][] {
  const result: Vector2[][] = [];
  let current: Vector2[] = [];
  let cursor: Vector2 | null = null;
  let start: Vector2 | null = null;
  for (const command of commands) {
    if (command[0] === Command.MOVE) {
      if (current.length) result.push(current);
      cursor = point(command);
      start = cursor;
      current = cursor ? [cursor] : [];
    } else if (command[0] === Command.CLOSE) {
      if (cursor && start) current.push(start);
      if (current.length) result.push(current);
      current = [];
      cursor = null;
      start = null;
    } else if (cursor) {
      const samples = sampleSegment(cursor, command);
      current.push(...samples);
      cursor = samples.at(-1) ?? cursor;
    }
  }
  if (current.length) result.push(current);
  return result;
}

function closed(points: Vector2[]): Vector2[] {
  return points.length ? [...points, points[0]] : points;
}

function shapeContour(item: Item): Vector2[] | null {
  if (!isShape(item)) return null;
  if (item.shapeType === "RECTANGLE") {
    return closed([{ x: 0, y: 0 }, { x: item.width, y: 0 }, { x: item.width, y: item.height }, { x: 0, y: item.height }]);
  }
  if (item.shapeType === "TRIANGLE") {
    return closed([{ x: 0, y: 0 }, { x: item.width / 2, y: item.height }, { x: -item.width / 2, y: item.height }]);
  }
  const sides = item.shapeType === "HEXAGON" ? 6 : 64;
  const rx = item.shapeType === "HEXAGON" ? Math.min(item.width, item.height) / 2 : item.width / 2;
  const ry = item.shapeType === "HEXAGON" ? rx : item.height / 2;
  return closed(Array.from({ length: sides }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / sides;
    return { x: Math.cos(angle) * rx, y: Math.sin(angle) * ry };
  }));
}

function cardinalPoint(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2, tension: number, t: number): Vector2 {
  const scale = (1 - tension) / 2;
  const m1 = { x: (p2.x - p0.x) * scale, y: (p2.y - p0.y) * scale };
  const m2 = { x: (p3.x - p1.x) * scale, y: (p3.y - p1.y) * scale };
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: (2 * t3 - 3 * t2 + 1) * p1.x + (t3 - 2 * t2 + t) * m1.x + (-2 * t3 + 3 * t2) * p2.x + (t3 - t2) * m2.x,
    y: (2 * t3 - 3 * t2 + 1) * p1.y + (t3 - 2 * t2 + t) * m1.y + (-2 * t3 + 3 * t2) * p2.y + (t3 - t2) * m2.y,
  };
}

function curveContour(curve: Curve): Vector2[] {
  if (curve.points.length < 2) return [...curve.points];
  const isClosed = curve.style.fillOpacity > 0 || Boolean(curve.style.closed);
  const input = curve.points;
  const result: Vector2[] = [input[0]];
  const segmentCount = isClosed ? input.length : input.length - 1;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const p0 = input[(segment - 1 + input.length) % input.length];
    const p1 = input[segment];
    const p2 = input[(segment + 1) % input.length];
    const p3 = input[(segment + 2) % input.length];
    const start = !isClosed && segment === 0 ? p1 : p0;
    const end = !isClosed && segment === segmentCount - 1 ? p2 : p3;
    for (let step = 1; step <= 24; step += 1) result.push(cardinalPoint(start, p1, p2, end, curve.style.tension, step / 24));
  }
  return isClosed ? closed(result.slice(0, -1)) : result;
}

export function drawingContours(item: Item): Vector2[][] {
  if (isPath(item)) return pathContours(item.commands);
  if (isLine(item)) return [[item.startPosition, item.endPosition]];
  if (isShape(item)) {
    const contour = shapeContour(item);
    return contour ? [contour] : [];
  }
  if (isCurve(item)) return [curveContour(item)];
  return [];
}

function clipSegmentToBounds(a: Vector2, b: Vector2, bounds: BoundingBox): [number, number] | null {
  let start = 0;
  let end = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - bounds.min.x], [dx, bounds.max.x - a.x], [-dy, a.y - bounds.min.y], [dy, bounds.max.y - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return null;
  }
  return [start, end];
}

export interface ContourSpan {
  start: ContourMarker;
  end: ContourMarker;
  worldLength: number;
  worldPoints: Vector2[];
}

export function contourSpansWithinBounds(item: Item, bounds: BoundingBox): ContourSpan[] {
  const spans: ContourSpan[] = [];
  drawingContours(item).forEach((points, index) => {
    let distance = 0;
    let active: ContourSpan | null = null;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      const localStart = points[pointIndex - 1];
      const localEnd = points[pointIndex];
      const localLength = Math.hypot(localEnd.x - localStart.x, localEnd.y - localStart.y);
      const worldStart = toWorld(item, localStart);
      const worldEnd = toWorld(item, localEnd);
      const clipped = clipSegmentToBounds(worldStart, worldEnd, bounds);
      if (clipped && localLength > 0) {
        const [segmentStart, segmentEnd] = clipped;
        const startDistance = distance + localLength * segmentStart;
        const endDistance = distance + localLength * segmentEnd;
        const worldLength = Math.hypot(worldEnd.x - worldStart.x, worldEnd.y - worldStart.y) * (segmentEnd - segmentStart);
        const clippedWorldStart = lerp(worldStart, worldEnd, segmentStart);
        const clippedWorldEnd = lerp(worldStart, worldEnd, segmentEnd);
        if (active && Math.abs(active.end.distance - startDistance) < 1e-5) {
          active.end.distance = endDistance;
          active.worldLength += worldLength;
          active.worldPoints.push(clippedWorldStart, clippedWorldEnd);
        } else {
          active = {
            start: { index, distance: startDistance },
            end: { index, distance: endDistance },
            worldLength,
            worldPoints: [clippedWorldStart, clippedWorldEnd],
          };
          spans.push(active);
        }
      } else active = null;
      distance += localLength;
    }
  });
  return spans.filter((span) => span.worldLength > 1);
}

/** Numerical tolerance for coincident boundaries, not the doorway cutting buffer. */
const COINCIDENT_BOUNDARY_EPSILON = 1e-3;

function distanceSquared(a: Vector2, b: Vector2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointSegmentDistanceSquared(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distanceSquared(point, a);
  const projection = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return distanceSquared(point, { x: a.x + t * dx, y: a.y + t * dy });
}

function pointPolylineDistanceSquared(point: Vector2, polyline: Vector2[]): number {
  let nearest = Infinity;
  for (let i = 1; i < polyline.length; i += 1) {
    nearest = Math.min(nearest, pointSegmentDistanceSquared(point, polyline[i - 1], polyline[i]));
  }
  return nearest;
}

function followsPolyline(source: Vector2[], reference: Vector2[], toleranceSquared: number): boolean {
  for (let i = 1; i < source.length; i += 1) {
    const a = source[i - 1];
    const b = source[i];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      if (pointPolylineDistanceSquared(lerp(a, b, t), reference) > toleranceSquared) return false;
    }
  }
  return true;
}

/** Determine whether two clipped fog boundaries describe the same doorway. */
export function areCoincidentDoorSpans(a: Vector2[], b: Vector2[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  const toleranceSquared = COINCIDENT_BOUNDARY_EPSILON * COINCIDENT_BOUNDARY_EPSILON;
  const aStart = a[0];
  const aEnd = a[a.length - 1];
  const bStart = b[0];
  const bEnd = b[b.length - 1];
  const sameDirection = distanceSquared(aStart, bStart) <= toleranceSquared
    && distanceSquared(aEnd, bEnd) <= toleranceSquared;
  const oppositeDirection = distanceSquared(aStart, bEnd) <= toleranceSquared
    && distanceSquared(aEnd, bStart) <= toleranceSquared;
  if (!sameDirection && !oppositeDirection) return false;
  return followsPolyline(a, b, toleranceSquared) && followsPolyline(b, a, toleranceSquared);
}

function atDistance(points: Vector2[], distance: number): Vector2 | null {
  if (!points.length || !Number.isFinite(distance) || distance < 0) return null;
  let remaining = distance;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length) return length === 0 ? b : lerp(a, b, remaining / length);
    remaining -= length;
  }
  return points.at(-1) ?? null;
}

function toWorld(item: Item, local: Vector2): Vector2 {
  return MathM.decompose(MathM.multiply(MathM.fromItem(item), MathM.fromPosition(local))).position;
}

export function markerPosition(item: Item, marker: ContourMarker): Vector2 | null {
  if (!Number.isInteger(marker.index) || marker.index < 0) return null;
  const contour = drawingContours(item)[marker.index];
  const local = contour ? atDistance(contour, marker.distance) : null;
  return local ? toWorld(item, local) : null;
}

export function doorMidpoint(item: Item, start: ContourMarker, end: ContourMarker): Vector2 | null {
  const a = markerPosition(item, start);
  const b = markerPosition(item, end);
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

function boundsOf(points: Vector2[]): BoundingBox {
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const min = { x: Math.min(...xs), y: Math.min(...ys) }; const max = { x: Math.max(...xs), y: Math.max(...ys) };
  return { min, max, width: max.x - min.x, height: max.y - min.y, center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 } };
}

function contourMeasure(ck: CanvasKit, path: SkPath, index: number): ContourMeasure | null {
  const iterator = new ck.ContourMeasureIter(path, false, 1);
  let measure: ContourMeasure | null = iterator.next();
  for (let current = 0; measure && current < index; current += 1) { measure.delete(); measure = iterator.next(); }
  iterator.delete();
  return measure;
}

export async function getDoorWorldGeometry(item: Item, start: ContourMarker, end: ContourMarker): Promise<DynamicFogDoorGeometry | null> {
  if (start.index !== end.index || !Number.isInteger(start.index) || start.index < 0) return null;
  const ck = await getCanvasKit(); const path = drawingToSkPath(ck, item);
  if (!path) return null;
  let measure: ContourMeasure | null = null;
  try {
    measure = contourMeasure(ck, path, start.index);
    if (!measure) return null;
    const length = measure.length(); const from = Math.min(start.distance, end.distance); const to = Math.max(start.distance, end.distance);
    if (![length, from, to].every(Number.isFinite) || from < 0 || to > length || to <= from) return null;
    const count = Math.max(2, Math.ceil((to - from) / 2) + 1);
    const worldPoints = Array.from({ length: count }, (_, index) => {
      const position = measure!.getPosTan(from + (to - from) * index / (count - 1));
      return toWorld(item, { x: position[0], y: position[1] });
    });
    if (start.distance > end.distance) worldPoints.reverse();
    const first = worldPoints[0], last = worldPoints.at(-1)!;
    const middlePosition = measure.getPosTan((from + to) / 2);
    return { start: first, end: last, midpoint: toWorld(item, { x: middlePosition[0], y: middlePosition[1] }), worldPoints, bounds: boundsOf(worldPoints) };
  } finally { measure?.delete(); path.delete(); }
}

/** CanvasKit-compatible creation spans. Marker distances remain local contour distances. */
export async function canvasContourSpansWithinBounds(item: Item, bounds: BoundingBox): Promise<ContourSpan[]> {
  const ck = await getCanvasKit(); const path = drawingToSkPath(ck, item);
  if (!path) return [];
  const spans: ContourSpan[] = []; const iterator = new ck.ContourMeasureIter(path, false, 1);
  let measure: ContourMeasure | null = iterator.next(); let contourIndex = 0;
  try {
    while (measure) {
      const length = measure.length(); const step = Math.max(0.5, Math.min(2, length / 256 || 0.5));
      let previousDistance = 0; let raw = measure.getPosTan(0); let previous = toWorld(item, { x: raw[0], y: raw[1] }); let active: ContourSpan | null = null;
      for (let distance = Math.min(step, length); previousDistance < length; distance = Math.min(distance + step, length)) {
        raw = measure.getPosTan(distance); const current = toWorld(item, { x: raw[0], y: raw[1] }); const clipped = clipSegmentToBounds(previous, current, bounds);
        if (clipped) {
          const [a, b] = clipped; const startDistance = previousDistance + (distance - previousDistance) * a; const endDistance = previousDistance + (distance - previousDistance) * b;
          const worldStart = lerp(previous, current, a); const worldEnd = lerp(previous, current, b); const worldLength = Math.hypot(worldEnd.x - worldStart.x, worldEnd.y - worldStart.y);
          if (active && Math.abs(active.end.distance - startDistance) < 1e-4) { active.end.distance = endDistance; active.worldLength += worldLength; active.worldPoints.push(worldEnd); }
          else { active = { start: { index: contourIndex, distance: startDistance }, end: { index: contourIndex, distance: endDistance }, worldLength, worldPoints: [worldStart, worldEnd] }; spans.push(active); }
        } else active = null;
        previous = current; previousDistance = distance; if (distance === length) break;
      }
      measure.delete(); measure = iterator.next(); contourIndex += 1;
    }
  } finally { measure?.delete(); iterator.delete(); path.delete(); }
  return spans.filter((span) => span.worldLength > 1);
}
