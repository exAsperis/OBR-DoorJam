import type { ImageContent, ImageGrid, Item } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY } from "../constants";
import type { DynamicFogDoorRef } from "../dynamicFog/types";

export interface SmokeDoorRef {
  provider: "smoke";
  doorItemId: string;
}

export type FogDoorLink = ({ provider: "dynamic-fog" } & Omit<DynamicFogDoorRef, "provider">) | SmokeDoorRef;

export interface DoorImageState { image: ImageContent; grid: ImageGrid }
export interface DoorJamMetadata {
  version: 3;
  fogDoor?: FogDoorLink;
  closedImage: DoorImageState;
  openImage?: DoorImageState;
  renderedState: "open" | "closed";
  locked?: boolean;
}

export function readDoorJamMetadata(item: Item): DoorJamMetadata | null {
  const value = item.metadata[DOORJAM_METADATA_KEY];
  if (!value || typeof value !== "object") return null;
  const data = value as Omit<Partial<DoorJamMetadata>, "version"> & { version?: number };
  if (data.version !== 1 && data.version !== 2 && data.version !== 3) return null;
  if (data.version === 1 && !data.fogDoor) return null;
  let fogDoor: FogDoorLink | undefined;
  if (data.fogDoor) {
    const link = data.fogDoor as unknown as Record<string, unknown>;
    if (link.provider === "smoke") {
      if (typeof link.doorItemId !== "string") return null;
      fogDoor = { provider: "smoke", doorItemId: link.doorItemId };
    } else {
      if (typeof link.fogItemId !== "string" || !Number.isInteger(link.doorIndex)) return null;
      fogDoor = { provider: "dynamic-fog", fogItemId: link.fogItemId, doorIndex: Number(link.doorIndex) };
    }
  }
  if (!data.closedImage?.image?.url || !data.closedImage.grid || (data.renderedState !== "open" && data.renderedState !== "closed")) return null;
  return { ...data, version: 3, fogDoor } as DoorJamMetadata;
}

export function writeDoorJamMetadata(item: Item, metadata: Omit<DoorJamMetadata, "version"> | DoorJamMetadata): void {
  item.metadata[DOORJAM_METADATA_KEY] = { ...metadata, version: 3 };
}

export function removeDoorJamMetadata(item: Item): void {
  delete item.metadata[DOORJAM_METADATA_KEY];
}

export function removeFogDoorLink(item: Item, metadata: DoorJamMetadata): void {
  const { fogDoor: _fogDoor, ...standalone } = metadata;
  writeDoorJamMetadata(item, standalone);
}

export function setDoorLocked(item: Item, metadata: DoorJamMetadata, locked: boolean): void {
  writeDoorJamMetadata(item, { ...metadata, locked });
}
