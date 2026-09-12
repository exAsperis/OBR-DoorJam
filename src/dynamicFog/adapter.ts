import OBR, { type BoundingBox, type Item, type Vector2 } from "@owlbear-rodeo/sdk";
import { contourSpansWithinBounds, doorMidpoint } from "./geometry";
import type { DoorLookupResult, DynamicFogDoor, DynamicFogDoorRef, LocatedDynamicFogDoor } from "./types";

export const DYNAMIC_FOG_DOORS_KEY = "rodeo.owlbear.dynamic-fog/doors";

function isMarker(value: unknown): value is { distance: number; index: number } {
  if (!value || typeof value !== "object") return false;
  const marker = value as Record<string, unknown>;
  return Number.isFinite(marker.distance) && Number.isInteger(marker.index) && Number(marker.index) >= 0;
}

export function parseDynamicFogDoors(value: unknown): DynamicFogDoor[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const door = entry as Record<string, unknown>;
    return typeof door.open === "boolean" && isMarker(door.start) && isMarker(door.end);
  }) ? value as DynamicFogDoor[] : null;
}

export function enumerateDoors(items: Item[]): LocatedDynamicFogDoor[] {
  const located: LocatedDynamicFogDoor[] = [];
  for (const item of items) {
    if (item.layer !== "FOG") continue;
    const doors = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
    if (!doors) continue;
    doors.forEach((door, doorIndex) => {
      const position = doorMidpoint(item, door.start, door.end);
      if (position) located.push({ ref: { fogItemId: item.id, doorIndex }, open: door.open, position });
    });
  }
  return located;
}

export async function getDynamicFogDoors(): Promise<LocatedDynamicFogDoor[]> {
  return enumerateDoors(await OBR.scene.items.getItems((item) => item.layer === "FOG"));
}

export function findNearestDoorIn(items: Item[], position: Vector2): (LocatedDynamicFogDoor & { distance: number }) | null {
  let nearest: (LocatedDynamicFogDoor & { distance: number }) | null = null;
  for (const door of enumerateDoors(items)) {
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
    door.open = open;
    result = { ok: true, door };
  });
  return result;
}

export type CreateDoorResult =
  | { ok: true; ref: DynamicFogDoorRef }
  | { ok: false; reason: "no-intersection" | "ambiguous-intersection" | "invalid-format" | "missing-item" };

export function findDoorCandidates(items: Item[], bounds: BoundingBox) {
  return items.flatMap((item) => item.layer === "FOG"
    ? contourSpansWithinBounds(item, bounds).map((span) => ({ itemId: item.id, start: span.start, end: span.end }))
    : []);
}

export async function createDynamicFogDoor(bounds: BoundingBox): Promise<CreateDoorResult> {
  const fogItems = await OBR.scene.items.getItems((item) => item.layer === "FOG");
  const candidates = findDoorCandidates(fogItems, bounds);
  if (candidates.length === 0) return { ok: false, reason: "no-intersection" };
  if (candidates.length !== 1) return { ok: false, reason: "ambiguous-intersection" };
  const candidate = candidates[0];
  let result: CreateDoorResult = { ok: false, reason: "missing-item" };
  await OBR.scene.items.updateItems([candidate.itemId], (items) => {
    const item = items[0];
    if (!item) return;
    const current = item.metadata[DYNAMIC_FOG_DOORS_KEY];
    const doors = current === undefined ? [] : parseDynamicFogDoors(current);
    if (!doors) { result = { ok: false, reason: "invalid-format" }; return; }
    const doorIndex = doors.length;
    doors.push({ open: false, start: candidate.start, end: candidate.end });
    item.metadata[DYNAMIC_FOG_DOORS_KEY] = doors;
    result = { ok: true, ref: { fogItemId: item.id, doorIndex } };
  });
  return result;
}
