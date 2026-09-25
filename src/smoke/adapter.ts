import OBR, { MathM, buildCurve, buildLine, isCurve, isLine, type BoundingBox, type Curve, type Item, type Line, type Metadata, type Vector2 } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
import type { SmokeDoorRef } from "../doorJam/metadata";
import { drawingContours } from "../dynamicFog/geometry";

export const SMOKE_KEYS = {
  vision: "com.battle-system.smoke/isVisionLine",
  blocking: "com.battle-system.smoke/blocking",
  doubleSided: "com.battle-system.smoke/doubleSided",
  door: "com.battle-system.smoke/isDoor",
  open: "com.battle-system.smoke/doorOpen",
  disabled: "com.battle-system.smoke/disabled",
} as const;
const OPERATION_KEY = `${EXTENSION_ID}/smoke-operation`;
export const SMOKE_LINK_TOLERANCE = 25;
export const SMOKE_DOOR_STROKE_COLOR = "#00ff00";
const MIN_REMAINDER = 2;
const inFlight = new Set<string>();

export type SmokeLookupResult = { ok: true; open: boolean } | { ok: false; reason: "missing-item" | "invalid-format" | "update-failed" };

type StraightSmokeObstruction = Line | Curve;

export function isSmokeObstruction(item: Item): item is StraightSmokeObstruction {
  return (isLine(item) || isCurve(item)) && item.metadata[SMOKE_KEYS.vision] === true;
}

function isStraightSmokeObstruction(item: Item): item is StraightSmokeObstruction {
  if (!isSmokeObstruction(item)) return false;
  return isLine(item) || (item.points.length === 2 && item.style.closed !== true && item.style.fillOpacity === 0);
}

export function isSmokeDoor(item: Item): item is Line | Curve {
  return (isLine(item) || isCurve(item)) && item.metadata[SMOKE_KEYS.door] === true;
}

export function lookupSmokeDoor(items: Item[], ref: SmokeDoorRef): SmokeLookupResult {
  const item = items.find((candidate) => candidate.id === ref.doorItemId);
  if (!item) return { ok: false, reason: "missing-item" };
  if (!isSmokeDoor(item)) return { ok: false, reason: "invalid-format" };
  return { ok: true, open: item.metadata[SMOKE_KEYS.open] === true };
}

export async function getSmokeDoorState(ref: SmokeDoorRef): Promise<SmokeLookupResult> {
  return lookupSmokeDoor(await OBR.scene.items.getItems([ref.doorItemId]), ref);
}

export async function setSmokeDoorState(ref: SmokeDoorRef, open: boolean): Promise<SmokeLookupResult> {
  let result: SmokeLookupResult = { ok: false, reason: "missing-item" };
  try {
    await OBR.scene.items.updateItems([ref.doorItemId], (items) => {
      const item = items[0];
      if (!item) return;
      if (!isSmokeDoor(item)) { result = { ok: false, reason: "invalid-format" }; return; }
      const currentOpen = item.metadata[SMOKE_KEYS.open] === true;
      if (currentOpen === open) { result = { ok: true, open }; return; }
      if (open) {
        item.metadata[SMOKE_KEYS.open] = true;
        item.metadata[SMOKE_KEYS.disabled] = true;
      } else {
        delete item.metadata[SMOKE_KEYS.open];
        delete item.metadata[SMOKE_KEYS.disabled];
      }
      result = { ok: true, open };
    });
    return result;
  } catch { return { ok: false, reason: "update-failed" }; }
}

function worldPoint(item: Item, point: Vector2): Vector2 {
  return MathM.decompose(MathM.multiply(MathM.fromItem(item), MathM.fromPosition(point))).position;
}

function midpoint(line: Line): Vector2 {
  const a = worldPoint(line, line.startPosition);
  const b = worldPoint(line, line.endPosition);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function pointBoundsDistance(point: Vector2, bounds: BoundingBox): number {
  const dx = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
  const dy = Math.max(bounds.min.y - point.y, 0, point.y - bounds.max.y);
  return Math.hypot(dx, dy);
}

function pointSegmentDistance(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function segmentBoundsDistance(a: Vector2, b: Vector2, bounds: BoundingBox): number {
  if (clip(a, b, bounds)) return 0;
  const corners = [
    bounds.min,
    { x: bounds.max.x, y: bounds.min.y },
    bounds.max,
    { x: bounds.min.x, y: bounds.max.y },
  ];
  return Math.min(pointBoundsDistance(a, bounds), pointBoundsDistance(b, bounds), ...corners.map((corner) => pointSegmentDistance(corner, a, b)));
}

function doorWorldSegments(door: Line | Curve): Array<[Vector2, Vector2]> {
  return drawingContours(door).flatMap((points) => points.slice(1).map((point, index) => [worldPoint(door, points[index]), worldPoint(door, point)] as [Vector2, Vector2]));
}

function doorPosition(door: Line | Curve): Vector2 {
  const segments = doorWorldSegments(door);
  if (!segments.length) return door.position;
  const points = [segments[0][0], ...segments.map((segment) => segment[1])];
  const total = segments.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0);
  let remaining = total / 2;
  for (const [a, b] of segments) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length) return length === 0 ? a : lerp(a, b, remaining / length);
    remaining -= length;
  }
  return points.at(-1) ?? door.position;
}

function clip(a: Vector2, b: Vector2, bounds: BoundingBox): [number, number] | null {
  let lo = 0; let hi = 1;
  const dx = b.x - a.x; const dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - bounds.min.x], [dx, bounds.max.x - a.x], [-dy, a.y - bounds.min.y], [dy, bounds.max.y - a.y]]) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
    if (lo > hi) return null;
  }
  return [lo, hi];
}

export type LocatedSmokeDoor = { ref: SmokeDoorRef; open: boolean; position: Vector2; intersects: boolean; distance: number };

export function findSmokeDoorCandidates(items: Item[], bounds: BoundingBox): LocatedSmokeDoor[] {
  return items.filter(isSmokeDoor).map((door) => {
    const segments = doorWorldSegments(door);
    const distance = segments.length ? Math.min(...segments.map(([a, b]) => segmentBoundsDistance(a, b, bounds))) : pointBoundsDistance(door.position, bounds);
    return { ref: { provider: "smoke" as const, doorItemId: door.id }, open: door.metadata[SMOKE_KEYS.open] === true, position: doorPosition(door), intersects: distance === 0, distance };
  }).filter((candidate) => candidate.intersects || candidate.distance <= SMOKE_LINK_TOLERANCE)
    .sort((a, b) => Number(b.intersects) - Number(a.intersects) || a.distance - b.distance);
}

export type FindSmokeResult = { ok: true; door: LocatedSmokeDoor } | { ok: false; reason: "not-found" | "ambiguous" };
export function chooseSmokeDoor(items: Item[], bounds: BoundingBox): FindSmokeResult {
  const candidates = findSmokeDoorCandidates(items, bounds);
  if (!candidates.length) return { ok: false, reason: "not-found" };
  const preferred = candidates.filter((candidate) => candidate.intersects === candidates[0].intersects);
  if (preferred.length > 1 && Math.abs(preferred[0].distance - preferred[1].distance) < SMOKE_LINK_TOLERANCE) return { ok: false, reason: "ambiguous" };
  return { ok: true, door: candidates[0] };
}

function itemBuilderProperties<T extends ReturnType<typeof buildLine> | ReturnType<typeof buildCurve>>(builder: T, source: StraightSmokeObstruction, metadata: Metadata, name: string): T {
  let configured = builder.name(name).metadata(structuredClone(metadata)).position(source.position).rotation(source.rotation).scale(source.scale)
    .visible(source.visible).locked(source.locked).layer(source.layer).zIndex(source.zIndex) as T;
  if (source.description !== undefined) configured = configured.description(source.description) as T;
  if (source.attachedTo !== undefined) configured = configured.attachedTo(source.attachedTo) as T;
  if (source.disableHit !== undefined) configured = configured.disableHit(source.disableHit) as T;
  if (source.disableAutoZIndex !== undefined) configured = configured.disableAutoZIndex(source.disableAutoZIndex) as T;
  if (source.disableAttachmentBehavior !== undefined) configured = configured.disableAttachmentBehavior([...source.disableAttachmentBehavior]) as T;
  return configured;
}

function obstructionFrom(source: StraightSmokeObstruction, start: Vector2, end: Vector2, metadata: Metadata, name: string): StraightSmokeObstruction {
  const strokeColor = metadata[SMOKE_KEYS.door] === true ? SMOKE_DOOR_STROKE_COLOR : source.style.strokeColor;
  if (isCurve(source)) {
    const style = { ...structuredClone(source.style), strokeColor };
    return itemBuilderProperties(buildCurve().points([start, end]).style(style), source, metadata, name).build();
  }
  const style = { ...structuredClone(source.style), strokeColor };
  return itemBuilderProperties(buildLine().startPosition(start).endPosition(end).style(style), source, metadata, name).build();
}

function endpoints(item: StraightSmokeObstruction): [Vector2, Vector2] {
  return isLine(item) ? [item.startPosition, item.endPosition] : [item.points[0], item.points[1]];
}

function setEnd(item: Item | undefined, end: Vector2): void {
  if (item && isLine(item)) item.endPosition = end;
  else if (item && isCurve(item) && item.points.length === 2) item.points = [item.points[0], end];
}

function doorMetadata(source: Metadata, operationId: string): Metadata {
  const metadata = structuredClone(source);
  metadata[SMOKE_KEYS.vision] = true;
  metadata[SMOKE_KEYS.door] = true;
  metadata[SMOKE_KEYS.blocking] = true;
  metadata[SMOKE_KEYS.doubleSided] = true;
  delete metadata[SMOKE_KEYS.open];
  delete metadata[SMOKE_KEYS.disabled];
  metadata[OPERATION_KEY] = operationId;
  return metadata;
}

function wallMetadata(source: Metadata, operationId: string): Metadata {
  const metadata = structuredClone(source);
  delete metadata[SMOKE_KEYS.door];
  delete metadata[SMOKE_KEYS.open];
  delete metadata[SMOKE_KEYS.disabled];
  metadata[OPERATION_KEY] = operationId;
  return metadata;
}

function lerp(a: Vector2, b: Vector2, t: number): Vector2 { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

export type CreateSmokeResult = { ok: true; ref: SmokeDoorRef } | { ok: false; reason: "no-intersection" | "ambiguous-intersection" | "unsupported-geometry" | "attached-items" | "update-failed" | "duplicate" };

async function splitLine(line: StraightSmokeObstruction, span: [number, number], operationId: string): Promise<CreateSmokeResult> {
  if (span[0] <= 0 || span[1] >= 1) return { ok: false, reason: "unsupported-geometry" };
  const [start, end] = endpoints(line);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length * span[0] < MIN_REMAINDER || length * (1 - span[1]) < MIN_REMAINDER) return { ok: false, reason: "unsupported-geometry" };
  const attachmentTree = await OBR.scene.items.getItemAttachments([line.id]);
  if (attachmentTree.some((item) => item.id !== line.id)) return { ok: false, reason: "attached-items" };
  const doorStart = lerp(start, end, span[0]);
  const doorEnd = lerp(start, end, span[1]);
  const wall = obstructionFrom(line, doorEnd, end, wallMetadata(line.metadata, operationId), `${line.name} (split)`);
  const door = obstructionFrom(line, doorStart, doorEnd, doorMetadata(line.metadata, operationId), `${line.name} Door`);
  try {
    await OBR.scene.items.addItems([wall, door]);
    const persisted = await OBR.scene.items.getItems([wall.id, door.id]);
    if (persisted.length !== 2 || !persisted.some((item) => isSmokeDoor(item))) throw new Error("validation");
    await OBR.scene.items.updateItems([line.id], (items) => setEnd(items[0], doorStart));
    await OBR.scene.items.updateItems([wall.id, door.id], (items) => { for (const item of items) delete item.metadata[OPERATION_KEY]; });
    return { ok: true, ref: { provider: "smoke", doorItemId: door.id } };
  } catch {
    try { await OBR.scene.items.updateItems([line.id], (items) => setEnd(items[0], end)); } catch { /* best-effort rollback */ }
    try { await OBR.scene.items.deleteItems([wall.id, door.id]); } catch { /* best-effort rollback */ }
    return { ok: false, reason: "update-failed" };
  }
}

export async function createSmokeDoor(bounds: BoundingBox): Promise<CreateSmokeResult> {
  const operationKey = `${bounds.center.x}:${bounds.center.y}:${bounds.width}:${bounds.height}`;
  if (inFlight.has(operationKey)) return { ok: false, reason: "duplicate" };
  inFlight.add(operationKey);
  try {
    const items = await OBR.scene.items.getItems();
    const lines = items.filter((item): item is StraightSmokeObstruction => isStraightSmokeObstruction(item) && !isSmokeDoor(item));
    const intersections = lines.flatMap((line) => {
      const [start, end] = endpoints(line);
      const span = clip(worldPoint(line, start), worldPoint(line, end), bounds);
      return span ? [{ line, span }] : [];
    });
    if (intersections.length > 1) return { ok: false, reason: "ambiguous-intersection" };
    if (intersections.length === 1) return splitLine(intersections[0].line, intersections[0].span, crypto.randomUUID());
    return { ok: false, reason: "no-intersection" };
  } finally { inFlight.delete(operationKey); }
}
