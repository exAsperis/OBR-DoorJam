import type { ContourMarker, DynamicFogDoor } from "./types";
import type { Vector2 } from "@owlbear-rodeo/sdk";

export type DoorEditHandle = "start" | "end" | "move";
export interface DoorEditProposal { start: ContourMarker; end: ContourMarker }
export type DoorEditResult = { ok: true; proposal: DoorEditProposal } | { ok: false; reason: "invalid-contour" | "invalid-distance" | "invalid-length" };
export const MIN_DOOR_LENGTH = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function proposeDoorEdit(door: DynamicFogDoor, handle: DoorEditHandle, pointerDistance: number, dragAnchorDistance: number, contourLength: number): DoorEditResult {
  const { start, end } = door;
  if (start.index !== end.index || start.index < 0) return { ok: false, reason: "invalid-contour" };
  if (![start.distance, end.distance, pointerDistance, dragAnchorDistance, contourLength].every(Number.isFinite)) return { ok: false, reason: "invalid-distance" };
  if (start.distance < 0 || end.distance < 0 || start.distance > contourLength || end.distance > contourLength || contourLength < MIN_DOOR_LENGTH) return { ok: false, reason: "invalid-distance" };
  if (Math.abs(end.distance - start.distance) < MIN_DOOR_LENGTH) return { ok: false, reason: "invalid-length" };
  const direction = end.distance >= start.distance ? 1 : -1;
  let nextStart = start.distance;
  let nextEnd = end.distance;
  if (handle === "start") {
    nextStart = direction > 0
      ? clamp(pointerDistance, 0, end.distance - MIN_DOOR_LENGTH)
      : clamp(pointerDistance, end.distance + MIN_DOOR_LENGTH, contourLength);
  } else if (handle === "end") {
    nextEnd = direction > 0
      ? clamp(pointerDistance, start.distance + MIN_DOOR_LENGTH, contourLength)
      : clamp(pointerDistance, 0, start.distance - MIN_DOOR_LENGTH);
  } else {
    const requestedDelta = pointerDistance - dragAnchorDistance;
    const first = Math.min(start.distance, end.distance);
    const last = Math.max(start.distance, end.distance);
    const delta = clamp(requestedDelta, -first, contourLength - last);
    nextStart += delta;
    nextEnd += delta;
  }
  if (nextStart < 0 || nextEnd < 0 || nextStart > contourLength || nextEnd > contourLength || Math.abs(nextEnd - nextStart) < MIN_DOOR_LENGTH) return { ok: false, reason: "invalid-length" };
  return { ok: true, proposal: { start: { index: start.index, distance: nextStart }, end: { index: end.index, distance: nextEnd } } };
}

export function doorSpansOverlap(a: DoorEditProposal, b: DoorEditProposal, minimumGap = 0): boolean {
  if (a.start.index !== a.end.index || b.start.index !== b.end.index) return true;
  if (a.start.index !== b.start.index) return false;
  const aMin = Math.min(a.start.distance, a.end.distance);
  const aMax = Math.max(a.start.distance, a.end.distance);
  const bMin = Math.min(b.start.distance, b.end.distance);
  const bMax = Math.max(b.start.distance, b.end.distance);
  return aMin < bMax + minimumGap && aMax > bMin - minimumGap;
}

export function chooseDoorEditHandle(pointer: Vector2, handles: Array<{ handle: DoorEditHandle; position: Vector2 }>, tolerance: number): DoorEditHandle | null {
  if (!Number.isFinite(tolerance) || tolerance <= 0) return null;
  const ranked = handles.map(({ handle, position }) => ({ handle, distance: Math.hypot(position.x - pointer.x, position.y - pointer.y) }))
    .filter((entry) => entry.distance <= tolerance).sort((a, b) => a.distance - b.distance);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[1].distance - ranked[0].distance <= tolerance * 0.2) return null;
  return ranked[0].handle;
}
