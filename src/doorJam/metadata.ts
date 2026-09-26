import type { ImageContent, ImageGrid, Item } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY } from "../constants";

export interface DynamicFogLink { fogItemId: string; doorIndex: number }
export interface SmokeLink { provider?: "smoke"; doorItemId: string }
export type SmokeDoorRef = SmokeLink;
export interface StageManagerElevatorLink { itemIds: readonly string[] }
export interface DoorJamLinks {
  dynamicFog?: DynamicFogLink;
  smoke?: SmokeLink;
  stageManager?: StageManagerElevatorLink;
}
export type DoorLinkKind = keyof DoorJamLinks;
export interface DoorImageState { image: ImageContent; grid: ImageGrid }
export interface DoorJamMetadata {
  version: 4;
  links?: DoorJamLinks;
  closedImage: DoorImageState;
  openImage?: DoorImageState;
  renderedState: "open" | "closed";
  locked?: boolean;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function readLinks(value: unknown): DoorJamLinks | undefined {
  const source = object(value);
  if (!source) return undefined;
  const links: DoorJamLinks = {};
  const dynamicFog = object(source.dynamicFog);
  if (dynamicFog && typeof dynamicFog.fogItemId === "string" && Number.isInteger(dynamicFog.doorIndex))
    links.dynamicFog = { fogItemId: dynamicFog.fogItemId, doorIndex: Number(dynamicFog.doorIndex) };
  const smoke = object(source.smoke);
  if (smoke && typeof smoke.doorItemId === "string") links.smoke = { doorItemId: smoke.doorItemId };
  const stageManager = object(source.stageManager);
  if (stageManager) {
    const itemIds = Array.isArray(stageManager.itemIds)
      ? [...new Set(stageManager.itemIds.filter((itemId): itemId is string => typeof itemId === "string" && itemId.length > 0))]
      : typeof stageManager.itemId === "string" && stageManager.itemId.length > 0
        ? [stageManager.itemId]
        : [];
    if (itemIds.length) links.stageManager = { itemIds };
  }
  return Object.keys(links).length ? links : undefined;
}

export function readDoorJamMetadata(item: Item): DoorJamMetadata | null {
  const data = object(item.metadata[DOORJAM_METADATA_KEY]);
  if (!data || ![1, 2, 3, 4].includes(Number(data.version))) return null;
  const closedImage = object(data.closedImage);
  const image = object(closedImage?.image);
  if (typeof image?.url !== "string" || !closedImage?.grid || typeof closedImage.grid !== "object"
    || (data.renderedState !== "open" && data.renderedState !== "closed")) return null;
  let links = Number(data.version) === 4 ? readLinks(data.links) : undefined;
  if (Number(data.version) < 4) {
    const legacy = object(data.fogDoor);
    if (legacy?.provider === "smoke" && typeof legacy.doorItemId === "string") links = { smoke: { doorItemId: legacy.doorItemId } };
    else if (legacy && typeof legacy.fogItemId === "string" && Number.isInteger(legacy.doorIndex))
      links = { dynamicFog: { fogItemId: legacy.fogItemId, doorIndex: Number(legacy.doorIndex) } };
    else if (Number(data.version) === 1) return null;
  }
  return {
    version: 4,
    ...(links ? { links } : {}),
    closedImage: data.closedImage as unknown as DoorImageState,
    ...(data.openImage ? { openImage: data.openImage as DoorImageState } : {}),
    renderedState: data.renderedState,
    ...(typeof data.locked === "boolean" ? { locked: data.locked } : {}),
  };
}

export function writeDoorJamMetadata(item: Item, metadata: Omit<DoorJamMetadata, "version"> | DoorJamMetadata | (Record<string, unknown> & { version?: number })): void {
  item.metadata[DOORJAM_METADATA_KEY] = { ...metadata, version: 4 };
}
export function removeDoorJamMetadata(item: Item): void { delete item.metadata[DOORJAM_METADATA_KEY]; }
export function getDoorLinkKinds(metadata: DoorJamMetadata): DoorLinkKind[] {
  return (["dynamicFog", "smoke", "stageManager"] as const).filter((kind) => Boolean(metadata.links?.[kind]));
}
export function countDoorLinks(metadata: DoorJamMetadata): number { return getDoorLinkKinds(metadata).length; }
export function removeDoorLink(item: Item, metadata: DoorJamMetadata, kind: DoorLinkKind): void {
  const links = { ...metadata.links };
  delete links[kind];
  writeDoorJamMetadata(item, { ...metadata, links: Object.keys(links).length ? links : undefined });
}
/** @deprecated Use removeDoorLink with an explicit kind. */
export function removeFogDoorLink(item: Item, metadata: DoorJamMetadata | Record<string, unknown>): void {
  const normalized = "links" in metadata ? metadata as DoorJamMetadata : readDoorJamMetadata({ metadata: { [DOORJAM_METADATA_KEY]: metadata } } as unknown as Item);
  if (!normalized) return;
  const kind = normalized.links?.dynamicFog ? "dynamicFog" : normalized.links?.smoke ? "smoke" : null;
  if (kind) removeDoorLink(item, normalized, kind);
}
export function setDoorLocked(item: Item, metadata: DoorJamMetadata, locked: boolean): void {
  writeDoorJamMetadata(item, { ...metadata, locked });
}
