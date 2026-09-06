import type { Vector2 } from "@owlbear-rodeo/sdk";

export interface ContourMarker {
  distance: number;
  index: number;
}

export interface DynamicFogDoor {
  open: boolean;
  start: ContourMarker;
  end: ContourMarker;
}

export interface DynamicFogDoorRef {
  fogItemId: string;
  doorIndex: number;
}

export interface LocatedDynamicFogDoor {
  ref: DynamicFogDoorRef;
  open: boolean;
  position: Vector2;
}

export type DoorLookupResult =
  | { ok: true; door: DynamicFogDoor }
  | { ok: false; reason: "missing-item" | "missing-door" | "invalid-format" };
