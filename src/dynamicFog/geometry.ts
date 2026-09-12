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
import type { ContourMarker } from "./types";

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

export interface ContourSpan { start: ContourMarker; end: ContourMarker; worldLength: number }

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
        if (active && Math.abs(active.end.distance - startDistance) < 1e-5) {
          active.end.distance = endDistance;
          active.worldLength += worldLength;
        } else {
          active = { start: { index, distance: startDistance }, end: { index, distance: endDistance }, worldLength };
          spans.push(active);
        }
      } else active = null;
      distance += localLength;
    }
  });
  return spans.filter((span) => span.worldLength > 1);
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
