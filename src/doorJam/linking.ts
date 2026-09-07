import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { LINK_DISTANCE_THRESHOLD } from "../constants";
import { findNearestDoor } from "../dynamicFog/adapter";
import { chooseOpenArtwork, snapshotArtwork } from "./artwork";
import { readDoorJamMetadata, writeDoorJamMetadata } from "./metadata";

export type LinkResult = { ok: true; distance: number; doorCount: number } | { ok: false; message: string };
export type LinkAndArtworkResult = LinkResult & { artworkRequested?: boolean; artworkSet?: boolean };

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
      version: 1,
      fogDoor: nearest.ref,
      closedImage: existing?.closedImage ?? snapshotArtwork(target),
      openImage: existing?.openImage,
      renderedState: "closed",
    });
  });
  return { ok: true, distance: nearest.distance, doorCount: (await OBR.scene.items.getItems((item) => item.layer === "FOG")).length };
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
