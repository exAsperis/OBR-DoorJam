import type { ImageContent, ImageGrid, Item } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY } from "../constants";
import type { DynamicFogDoorRef } from "../dynamicFog/types";

export interface DoorImageState { image: ImageContent; grid: ImageGrid }
export interface DoorJamMetadata {
  version: 1;
  fogDoor: DynamicFogDoorRef;
  closedImage: DoorImageState;
  openImage?: DoorImageState;
  renderedState: "open" | "closed";
}

export function readDoorJamMetadata(item: Item): DoorJamMetadata | null {
  const value = item.metadata[DOORJAM_METADATA_KEY];
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<DoorJamMetadata>;
  if (data.version !== 1 || !data.fogDoor || typeof data.fogDoor.fogItemId !== "string" || !Number.isInteger(data.fogDoor.doorIndex)) return null;
  if (!data.closedImage?.image?.url || !data.closedImage.grid || (data.renderedState !== "open" && data.renderedState !== "closed")) return null;
  return data as DoorJamMetadata;
}

export function writeDoorJamMetadata(item: Item, metadata: DoorJamMetadata): void {
  item.metadata[DOORJAM_METADATA_KEY] = metadata;
}

export function removeDoorJamMetadata(item: Item): void {
  delete item.metadata[DOORJAM_METADATA_KEY];
}
