import OBR, { isCurve, isLine, isPath, isShape, type BoundingBox, type Item, type Vector2 } from "@owlbear-rodeo/sdk";
import { areCoincidentDoorSpans, canvasContourSpansWithinBounds, getDoorWorldGeometry } from "./geometry";
import { doorSpansOverlap, MIN_DOOR_LENGTH, type DoorEditProposal } from "./editGeometry";
import { geometryFingerprint } from "./editContour";
import type { ContourMarker, DoorLookupResult, DynamicFogAutoMatchResult, DynamicFogDoor, DynamicFogDoorRef, LocatedDynamicFogDoor } from "./types";

export const DYNAMIC_FOG_DOORS_KEY = "rodeo.owlbear.dynamic-fog/doors";
export const DYNAMIC_FOG_DOOR_INDEX_KEY = "rodeo.owlbear.dynamic-fog/door-index";

function isMarker(value: unknown): value is { distance: number; index: number } {
  if (!value || typeof value !== "object") return false;
  const marker = value as Record<string, unknown>;
  return Number.isFinite(marker.distance) && Number.isInteger(marker.index) && Number(marker.index) >= 0;
}

export function parseDynamicFogDoor(value: unknown): DynamicFogDoor | null {
  if (!value || typeof value !== "object") return null;
  const door = value as Record<string, unknown>;
  return typeof door.open === "boolean" && isMarker(door.start) && isMarker(door.end)
    ? { open: door.open, start: { ...door.start }, end: { ...door.end } } : null;
}

export function parseDynamicFogDoors(value: unknown): Array<DynamicFogDoor | null> | null {
  if (!Array.isArray(value)) return null;
  return value.map(parseDynamicFogDoor);
}

export async function enumerateDoors(items: Item[]): Promise<{ doors: LocatedDynamicFogDoor[]; invalidGeometry: boolean }> {
  const located: LocatedDynamicFogDoor[] = [];
  let invalidGeometry = false;
  for (const source of items) {
    const item = structuredClone(source) as Item;
    if (item.layer !== "FOG" || (!isLine(item) && !isCurve(item) && !isPath(item) && !isShape(item))) continue;
    const doors = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
    if (!doors) continue;
    for (let doorIndex = 0; doorIndex < doors.length; doorIndex += 1) {
      const door = doors[doorIndex]; if (!door) continue;
      const geometry = await getDoorWorldGeometry(item, door.start, door.end);
      if (geometry) located.push({ ref: { fogItemId: String(item.id), doorIndex }, open: door.open, position: geometry.midpoint, geometry });
      else invalidGeometry = true;
    }
  }
  return { doors: located, invalidGeometry };
}

export async function getDynamicFogDoors(): Promise<LocatedDynamicFogDoor[]> {
  return (await enumerateDoors(await OBR.scene.items.getItems((item) => item.layer === "FOG"))).doors;
}

export async function findNearestDoorIn(items: Item[], position: Vector2): Promise<(LocatedDynamicFogDoor & { distance: number }) | null> {
  let nearest: (LocatedDynamicFogDoor & { distance: number }) | null = null;
  for (const door of (await enumerateDoors(items)).doors) {
    const distance = Math.hypot(door.position.x - position.x, door.position.y - position.y);
    if (!nearest || distance < nearest.distance) nearest = { ...door, distance };
  }
  return nearest;
}

export async function findNearestDoor(position: Vector2) {
  const doors = await getDynamicFogDoors();
  let nearest: (LocatedDynamicFogDoor & { distance: number }) | null = null;
  for (const door of doors) {
    const distance = Math.hypot(door.position.x - position.x, door.position.y - position.y);
    if (!nearest || distance < nearest.distance) nearest = { ...door, distance };
  }
  return nearest;
}

function pointBoundsDistance(point: Vector2, bounds: BoundingBox): number {
  const dx = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
  const dy = Math.max(bounds.min.y - point.y, 0, point.y - bounds.max.y);
  return Math.hypot(dx, dy);
}

function pointSegmentDistance(point: Vector2, a: Vector2, b: Vector2): number {
  const dx = b.x - a.x, dy = b.y - a.y; const length = dx * dx + dy * dy;
  if (!length) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length));
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function geometryBoundsDistance(door: LocatedDynamicFogDoor, bounds: BoundingBox): number {
  const corners = [bounds.min, { x: bounds.max.x, y: bounds.min.y }, bounds.max, { x: bounds.min.x, y: bounds.max.y }];
  let nearest = Math.min(...door.geometry.worldPoints.map((point) => pointBoundsDistance(point, bounds)));
  for (let index = 1; index < door.geometry.worldPoints.length; index += 1) {
    const a = door.geometry.worldPoints[index - 1], b = door.geometry.worldPoints[index];
    const crosses = !(Math.max(a.x, b.x) < bounds.min.x || Math.min(a.x, b.x) > bounds.max.x || Math.max(a.y, b.y) < bounds.min.y || Math.min(a.y, b.y) > bounds.max.y)
      && [
        [bounds.min, { x: bounds.max.x, y: bounds.min.y }], [{ x: bounds.max.x, y: bounds.min.y }, bounds.max],
        [bounds.max, { x: bounds.min.x, y: bounds.max.y }], [{ x: bounds.min.x, y: bounds.max.y }, bounds.min],
      ].some(([c, d]) => {
        const cross = (p: Vector2, q: Vector2, r: Vector2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
      });
    if (crosses) return 0;
    nearest = Math.min(nearest, ...corners.map((corner) => pointSegmentDistance(corner, a, b)));
  }
  return nearest;
}

export function chooseAutomaticDoor(doors: LocatedDynamicFogDoor[], bounds: BoundingBox, threshold: number, invalidGeometry = false): DynamicFogAutoMatchResult {
  const ranked = doors.map((door) => ({ door, distance: geometryBoundsDistance(door, bounds) }));
  const overlaps = ranked.filter(({ distance }) => distance <= 1e-6);
  if (overlaps.length === 1) return { ok: true, door: { ...overlaps[0].door, distance: 0 }, method: "overlap" };
  if (overlaps.length > 1) return { ok: false, reason: "ambiguous-overlap", candidates: overlaps.map(({ door }) => door) };
  const nearby = ranked.filter(({ distance }) => distance <= threshold).sort((a, b) => a.distance - b.distance);
  if (nearby.length === 1 || (nearby.length > 1 && nearby[1].distance - nearby[0].distance > 1)) return { ok: true, door: { ...nearby[0].door, distance: nearby[0].distance }, method: "nearby" };
  if (nearby.length > 1) return { ok: false, reason: "ambiguous-nearby", candidates: nearby.map(({ door }) => door) };
  return { ok: false, reason: invalidGeometry ? "invalid-geometry" : "none" };
}

export async function findAutomaticDoor(bounds: BoundingBox, threshold: number): Promise<DynamicFogAutoMatchResult> {
  const result = await enumerateDoors(await OBR.scene.items.getItems((item) => item.layer === "FOG"));
  return chooseAutomaticDoor(result.doors, bounds, threshold, result.invalidGeometry);
}

export type ManualDoorTargetResult = { ok: true; ref: DynamicFogDoorRef } | { ok: false; reason: "invalid-target" | "missing-parent" | "invalid-parent" | "missing-door" };

export function resolveManualDoorTarget(target: { attachedTo?: string; metadata: Record<string, unknown> } | undefined, sharedItems: Item[]): ManualDoorTargetResult {
  const rawIndex = target?.metadata[DYNAMIC_FOG_DOOR_INDEX_KEY];
  const attachedTo = target?.attachedTo;
  if (!Number.isInteger(rawIndex) || Number(rawIndex) < 0 || typeof attachedTo !== "string" || !attachedTo) return { ok: false, reason: "invalid-target" };
  const parent = sharedItems.find((item) => item.id === attachedTo);
  if (!parent) return { ok: false, reason: "missing-parent" };
  if (parent.layer !== "FOG" || (!isLine(parent) && !isCurve(parent) && !isPath(parent) && !isShape(parent))) return { ok: false, reason: "invalid-parent" };
  const doors = parseDynamicFogDoors(parent.metadata[DYNAMIC_FOG_DOORS_KEY]);
  if (!doors?.[Number(rawIndex)]) return { ok: false, reason: "missing-door" };
  return { ok: true, ref: { fogItemId: String(attachedTo), doorIndex: Number(rawIndex) } };
}

export function lookupDoor(items: Item[], ref: DynamicFogDoorRef): DoorLookupResult {
  const item = items.find((candidate) => candidate.id === ref.fogItemId);
  if (!item) return { ok: false, reason: "missing-item" };
  const doors = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
  if (!doors) return { ok: false, reason: "invalid-format" };
  const door = doors[ref.doorIndex];
  return door ? { ok: true, door } : { ok: false, reason: "missing-door" };
}

export async function getDoorState(ref: DynamicFogDoorRef): Promise<DoorLookupResult> {
  return lookupDoor(await OBR.scene.items.getItems([ref.fogItemId]), ref);
}

export async function setDoorState(ref: DynamicFogDoorRef, open: boolean): Promise<DoorLookupResult> {
  let result: DoorLookupResult = { ok: false, reason: "missing-item" };
  await OBR.scene.items.updateItems([ref.fogItemId], (items) => {
    const item = items[0];
    if (!item) return;
    const doors = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
    if (!doors) { result = { ok: false, reason: "invalid-format" }; return; }
    const door = doors[ref.doorIndex];
    if (!door) { result = { ok: false, reason: "missing-door" }; return; }
    const updated = { ...door, open };
    (item.metadata[DYNAMIC_FOG_DOORS_KEY] as unknown[])[ref.doorIndex] = updated;
    result = { ok: true, door: updated };
  });
  return result;
}

export type CreateDoorResult =
  | { ok: true; ref: DynamicFogDoorRef }
  | { ok: false; reason: "no-intersection" | "ambiguous-intersection" | "invalid-format" | "missing-item" };

export type UpdateDoorGeometryResult =
  | { ok: true; ref: DynamicFogDoorRef }
  | { ok: false; reason: "missing-item" | "missing-door" | "invalid-format" | "invalid-geometry" | "overlapping-door" | "stale-edit" | "update-failed" };

const SAME_CONTOUR_DOOR_GAP = 0.5;
const sameMarker = (a: ContourMarker, b: ContourMarker) => a.index === b.index && a.distance === b.distance;

export async function updateDoorGeometry(ref: DynamicFogDoorRef, original: DoorEditProposal, proposed: DoorEditProposal, contourLength: number, originalFingerprint?: string): Promise<UpdateDoorGeometryResult> {
  if (!Number.isFinite(contourLength) || contourLength < MIN_DOOR_LENGTH || proposed.start.index !== proposed.end.index
    || proposed.start.index < 0 || !Number.isFinite(proposed.start.distance) || !Number.isFinite(proposed.end.distance)
    || proposed.start.distance < 0 || proposed.end.distance < 0 || proposed.start.distance > contourLength
    || proposed.end.distance > contourLength || Math.abs(proposed.end.distance - proposed.start.distance) < MIN_DOOR_LENGTH) {
    return { ok: false, reason: "invalid-geometry" };
  }
  let result: UpdateDoorGeometryResult = { ok: false, reason: "missing-item" };
  try {
    await OBR.scene.items.updateItems([ref.fogItemId], (items) => {
      const item = items[0];
      if (!item) return;
      if (item.layer !== "FOG" || (!isLine(item) && !isCurve(item) && !isPath(item) && !isShape(item))) { result = { ok: false, reason: "invalid-geometry" }; return; }
      if (originalFingerprint && geometryFingerprint(item) !== originalFingerprint) { result = { ok: false, reason: "stale-edit" }; return; }
      const doors = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
      if (!doors) { result = { ok: false, reason: "invalid-format" }; return; }
      const door = doors[ref.doorIndex];
      if (!door) { result = { ok: false, reason: "missing-door" }; return; }
      if (!sameMarker(door.start, original.start) || !sameMarker(door.end, original.end)) { result = { ok: false, reason: "stale-edit" }; return; }
      if (doors.some((other, index) => Boolean(other) && index !== ref.doorIndex && doorSpansOverlap(proposed, other!, SAME_CONTOUR_DOOR_GAP))) { result = { ok: false, reason: "overlapping-door" }; return; }
      const raw = item.metadata[DYNAMIC_FOG_DOORS_KEY] as unknown[];
      raw[ref.doorIndex] = { ...door, start: { ...proposed.start }, end: { ...proposed.end } };
      result = { ok: true, ref };
    });
  } catch { return { ok: false, reason: "update-failed" }; }
  return result;
}

async function findGeometricDoorCandidates(items: Item[], bounds: BoundingBox) {
  const snapshots = items.map((item) => structuredClone(item) as Item);
  const candidates = await Promise.all(snapshots.map(async (item) => item.layer === "FOG"
    ? (await canvasContourSpansWithinBounds(item, bounds)).map((span) => ({ itemId: item.id, start: span.start, end: span.end, worldPoints: span.worldPoints })) : []));
  return candidates.flat();
}

export async function findDoorCandidates(items: Item[], bounds: BoundingBox) {
  return (await findGeometricDoorCandidates(items, bounds)).map(({ itemId, start, end }) => ({ itemId, start, end }));
}

export async function selectDoorCandidate(items: Item[], bounds: BoundingBox): Promise<
  | { ok: true; candidate: { itemId: string; start: ContourMarker; end: ContourMarker } }
  | { ok: false; reason: "no-intersection" | "ambiguous-intersection" }> {
  const candidates = await findGeometricDoorCandidates(items, bounds);
  if (candidates.length === 0) return { ok: false, reason: "no-intersection" };
  if (candidates.length === 1) return { ok: true, candidate: candidates[0] };
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (!areCoincidentDoorSpans(candidates[i].worldPoints, candidates[j].worldPoints)) {
        return { ok: false, reason: "ambiguous-intersection" };
      }
    }
  }
  const sorted = [...candidates].sort((a, b) => {
    if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;
    if (a.start.index !== b.start.index) return a.start.index - b.start.index;
    return a.start.distance - b.start.distance;
  });
  return { ok: true, candidate: sorted[0] };
}

export async function createDynamicFogDoor(bounds: BoundingBox): Promise<CreateDoorResult> {
  const fogItems = await OBR.scene.items.getItems((item) => item.layer === "FOG");
  const selection = await selectDoorCandidate(fogItems, bounds);
  if (!selection.ok) return selection;
  const candidate = selection.candidate;
  let result: CreateDoorResult = { ok: false, reason: "missing-item" };
  await OBR.scene.items.updateItems([candidate.itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const current = item.metadata[DYNAMIC_FOG_DOORS_KEY];
    if (current !== undefined && !Array.isArray(current)) { result = { ok: false, reason: "invalid-format" }; return; }
    const doors = current === undefined ? [] : [...current];
    const doorIndex = doors.length;
    doors.push({ open: false, start: candidate.start, end: candidate.end }); item.metadata[DYNAMIC_FOG_DOORS_KEY] = doors;
    result = { ok: true, ref: { fogItemId: item.id, doorIndex } };
  });
  return result;
}
