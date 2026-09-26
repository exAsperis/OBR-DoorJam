import type { BoundingBox, Vector2 } from "@owlbear-rodeo/sdk";

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
  provider?: "dynamic-fog";
  fogItemId: string;
  doorIndex: number;
}

export interface LocatedDynamicFogDoor {
  ref: DynamicFogDoorRef;
  open: boolean;
  position: Vector2;
  geometry: DynamicFogDoorGeometry;
}

export interface DynamicFogDoorGeometry {
  start: Vector2;
  end: Vector2;
  midpoint: Vector2;
  worldPoints: Vector2[];
  bounds: BoundingBox;
}

export type DynamicFogAutoMatchResult =
  | { ok: true; door: LocatedDynamicFogDoor & { distance: number }; method: "overlap" | "nearby" }
  | { ok: false; reason: "none" | "ambiguous-overlap" | "ambiguous-nearby" | "invalid-geometry"; candidates?: LocatedDynamicFogDoor[] };

export type DoorLookupResult =
  | { ok: true; door: DynamicFogDoor }
  | { ok: false; reason: "missing-item" | "missing-door" | "invalid-format" };
