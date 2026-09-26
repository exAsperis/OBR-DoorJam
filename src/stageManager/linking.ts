import OBR, { isImage, type BoundingBox, type Image, type Item } from "@owlbear-rodeo/sdk";
import { snapshotArtwork } from "../doorJam/artwork";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { readDoorJamMetadata, writeDoorJamMetadata } from "../doorJam/metadata";
import { listStageManagerElevators, setStageManagerElevatorDisabled, type StageManagerElevator } from "./adapter";
import { openStageManagerLinkPopover } from "./linkPopover";

export interface ElevatorCandidate extends StageManagerElevator { self: boolean; overlaps: boolean; distance: number }
export type LinkStageManagerResult = { ok: true; needsOpenArtwork: boolean; warning?: string } | { ok: false; message: string };

function overlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;
}
function distance(a: BoundingBox, b: BoundingBox): number {
  const dx = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, 0);
  const dy = Math.max(a.min.y - b.max.y, b.min.y - a.max.y, 0);
  return Math.hypot(dx, dy);
}
export async function rankElevatorCandidates(door: Image, elevators: StageManagerElevator[]): Promise<ElevatorCandidate[]> {
  const items = await OBR.scene.items.getItems(elevators.map((elevator) => elevator.itemId));
  const byId = new Map(items.map((item) => [item.id, item]));
  const doorBounds = await OBR.scene.items.getItemBounds([door.id]);
  const candidates = await Promise.all(elevators.map(async (elevator) => {
    const item = byId.get(elevator.itemId);
    const bounds = item ? await OBR.scene.items.getItemBounds([item.id]) : null;
    const self = elevator.itemId === door.id;
    return { ...elevator, self, overlaps: self || Boolean(bounds && overlap(doorBounds, bounds)), distance: self ? 0 : bounds ? distance(doorBounds, bounds) : Number.POSITIVE_INFINITY };
  }));
  return candidates.sort((a, b) => Number(b.self) - Number(a.self) || Number(b.overlaps) - Number(a.overlaps) || a.distance - b.distance || a.name.localeCompare(b.name));
}

export async function linkStageManagerElevator(imageId: string, elevatorItemId: string): Promise<LinkStageManagerResult> {
  const image = (await OBR.scene.items.getItems([imageId]))[0];
  if (!image || !isImage(image)) return { ok: false, message: "The DoorJam image no longer exists." };
  let needsOpenArtwork = true;
  let desiredOpen = false;
  await OBR.scene.items.updateItems([imageId], (items) => {
    const target = items[0];
    if (!target || !isImage(target)) return;
    const existing = readDoorJamMetadata(target);
    needsOpenArtwork = !existing?.openImage;
    desiredOpen = existing?.renderedState === "open";
    writeDoorJamMetadata(target, {
      version: 4,
      links: { ...existing?.links, stageManager: { itemIds: [...new Set([...(existing?.links?.stageManager?.itemIds ?? []), elevatorItemId])] } },
      closedImage: existing?.closedImage ?? snapshotArtwork(target),
      openImage: existing?.openImage,
      renderedState: existing?.renderedState ?? "closed",
      locked: existing?.locked,
    });
  });
  const synchronized = await setStageManagerElevatorDisabled(elevatorItemId, !desiredOpen);
  return synchronized.ok ? { ok: true, needsOpenArtwork } : { ok: true, needsOpenArtwork, warning: synchronized.message };
}

export async function unlinkStageManagerElevator(imageId: string, elevatorItemId: string): Promise<boolean> {
  let removed = false;
  await OBR.scene.items.updateItems([imageId], (items) => {
    const target = items[0];
    if (!target || !isImage(target)) return;
    const existing = readDoorJamMetadata(target);
    if (!existing?.links?.stageManager?.itemIds.includes(elevatorItemId)) return;
    const itemIds = existing.links.stageManager.itemIds.filter((itemId) => itemId !== elevatorItemId);
    const links = { ...existing.links };
    if (itemIds.length) links.stageManager = { itemIds };
    else delete links.stageManager;
    writeDoorJamMetadata(target, { ...existing, links });
    removed = true;
  });
  return removed;
}

export async function discoverAndLinkStageManager(image: Image): Promise<LinkStageManagerResult | { ok: true; choosing: true }> {
  const listed = await listStageManagerElevators();
  if (!listed.ok) return { ok: false, message: listed.message };
  if (!listed.value.length) return { ok: false, message: "No Stage Manager Elevators are configured in this scene." };
  const candidates = await rankElevatorCandidates(image, listed.value);
  if (readDoorJamMetadata(image)?.links?.stageManager) {
    await openStageManagerLinkPopover(image.id);
    return { ok: true, choosing: true };
  }
  const automatic = candidates.find((candidate) => candidate.self) ?? (candidates.filter((candidate) => candidate.overlaps).length === 1
    ? candidates.find((candidate) => candidate.overlaps) : undefined);
  if (automatic) return linkStageManagerElevator(image.id, automatic.itemId);
  await openStageManagerLinkPopover(image.id);
  return { ok: true, choosing: true };
}

export async function finishStageManagerLink(imageId: string, elevatorItemId: string): Promise<LinkStageManagerResult> {
  const result = await linkStageManagerElevator(imageId, elevatorItemId);
  if (result.ok && result.needsOpenArtwork) await openDoorImagesPopover(imageId);
  return result;
}
