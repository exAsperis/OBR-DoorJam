import { Command, MathM, isPath, type Item, type PathCommand, type Vector2 } from "@owlbear-rodeo/sdk";
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

function contours(commands: PathCommand[]): Vector2[][] {
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
  if (!isPath(item) || !Number.isInteger(marker.index) || marker.index < 0) return null;
  const contour = contours(item.commands)[marker.index];
  const local = contour ? atDistance(contour, marker.distance) : null;
  return local ? toWorld(item, local) : null;
}

export function doorMidpoint(item: Item, start: ContourMarker, end: ContourMarker): Vector2 | null {
  const a = markerPosition(item, start);
  const b = markerPosition(item, end);
  return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}
