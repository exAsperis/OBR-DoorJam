import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { LINK_DISTANCE_THRESHOLD } from "../constants";
import { createDynamicFogDoor, findNearestDoor } from "../dynamicFog/adapter";
import { chooseOpenArtwork, snapshotArtwork } from "./artwork";
import { readDoorJamMetadata, writeDoorJamMetadata } from "./metadata";

export type LinkResult = { ok: true; outcome: "linked-existing" | "created-new"; distance: number; doorCount: number } | { ok: false; message: string };
export type LinkAndArtworkResult = LinkResult & { artworkRequested?: boolean; artworkSet?: boolean };

export async function linkNearbyDoorOrCreate(image: Image, onCreateAttempt?: () => unknown | Promise<unknown>): Promise<LinkAndArtworkResult> {
  const bounds = await OBR.scene.items.getItemBounds([image.id]);
  const nearest = await findNearestDoor({ x: bounds.center.x, y: bounds.center.y });
  if (nearest && nearest.distance <= LINK_DISTANCE_THRESHOLD) return linkNearestDoorAndChooseArtwork(image);
  await onCreateAttempt?.();
  return createAndLinkDoor(image);
}

export async function linkNearestDoor(image: Image): Promise<LinkResult> {
  const bounds = await OBR.scene.items.getItemBounds([image.id]);
  const nearest = await findNearestDoor({ x: bounds.center.x, y: bounds.center.y });
  if (!nearest) return { ok: false, message: "No valid Dynamic Fog doors were found in this scene." };
  if (nearest.distance > LINK_DISTANCE_THRESHOLD) return { ok: false, message: `Nearest Dynamic Fog door is ${Math.round(nearest.distance)}px away (limit ${LINK_DISTANCE_THRESHOLD}px). Move the image closer and try again.` };
  await OBR.scene.items.updateItems([image.id], (items) => {
    const target = items[0];
    if (!target || !isImage(target)) return;
    const existing = readDoorJamMetadata(target);
    writeDoorJamMetadata(target, {
      version: 2,
      fogDoor: nearest.ref,
      closedImage: existing?.closedImage ?? snapshotArtwork(target),
      openImage: existing?.openImage,
      renderedState: "closed",
      locked: existing?.locked,
    });
  });
  return { ok: true, outcome: "linked-existing", distance: nearest.distance, doorCount: (await OBR.scene.items.getItems((item) => item.layer === "FOG")).length };
}

export async function linkNearestDoorAndChooseArtwork(image: Image): Promise<LinkAndArtworkResult> {
  const result = await linkNearestDoor(image);
  if (!result.ok) return result;
  const linked = (await OBR.scene.items.getItems([image.id]))[0];
  const metadata = linked ? readDoorJamMetadata(linked) : null;
  if (!metadata || metadata.openImage) return result;
  const artworkSet = await chooseOpenArtwork(image.id);
  return { ...result, artworkRequested: true, artworkSet };
}

export async function createAndLinkDoor(image: Image): Promise<LinkAndArtworkResult> {
  const created = await createDynamicFogDoor(await OBR.scene.items.getItemBounds([image.id]));
  if (!created.ok) {
    const messages = {
      "no-intersection": "The selected image does not intersect a supported Dynamic Fog edge.",
      "ambiguous-intersection": "The selected image intersects more than one fog edge. Move or resize it so only one edge crosses it.",
      "invalid-format": "The intersecting Dynamic Fog item has an unsupported door format.",
      "missing-item": "The intersecting Dynamic Fog item is no longer available.",
    } as const;
    return { ok: false, message: messages[created.reason] };
  }
  await OBR.scene.items.updateItems([image.id], (items) => {
    const target = items[0];
    if (!target || !isImage(target)) return;
    const existing = readDoorJamMetadata(target);
    writeDoorJamMetadata(target, {
      version: 2,
      fogDoor: created.ref,
      closedImage: existing?.closedImage ?? snapshotArtwork(target),
      openImage: existing?.openImage,
      renderedState: "closed",
      locked: existing?.locked,
    });
  });
  const artworkSet = readDoorJamMetadata(image)?.openImage ? undefined : await chooseOpenArtwork(image.id);
  return { ok: true, outcome: "created-new", distance: 0, doorCount: 1, artworkRequested: artworkSet !== undefined, artworkSet };
}
