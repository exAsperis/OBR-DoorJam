import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { LINK_DISTANCE_THRESHOLD } from "../constants";
import { createDynamicFogDoor, findNearestDoor } from "../dynamicFog/adapter";
import { chooseSmokeDoor, createSmokeDoor } from "../smoke/adapter";
import { snapshotArtwork } from "./artwork";
import { readDoorJamMetadata, writeDoorJamMetadata, type DynamicFogLink, type SmokeLink } from "./metadata";
import { setDynamicFogDoorState, setSmokeLinkedDoorState } from "./providers";

export type LinkResult = { ok: true; outcome: "linked-existing" | "created-new"; distance: number; doorCount: number; needsOpenArtwork: boolean } | { ok: false; message: string };
export type DoorProvider = "dynamic-fog" | "smoke";

export async function linkNearbyDoorOrCreate(image: Image, onCreateAttempt?: () => unknown | Promise<unknown>, provider: DoorProvider = "dynamic-fog"): Promise<LinkResult> {
  if (provider === "smoke") return linkSmokeDoorOrCreate(image, onCreateAttempt);
  const bounds = await OBR.scene.items.getItemBounds([image.id]);
  const nearest = await findNearestDoor({ x: bounds.center.x, y: bounds.center.y });
  if (nearest && nearest.distance <= LINK_DISTANCE_THRESHOLD) return linkNearestDoor(image);
  await onCreateAttempt?.();
  return createAndLinkDoor(image);
}

async function saveLink(image: Image, kind: "dynamicFog" | "smoke", link: DynamicFogLink | SmokeLink): Promise<boolean> {
  let needsOpenArtwork = true;
  let desiredOpen = false;
  await OBR.scene.items.updateItems([image.id], (items) => {
    const target = items[0];
    if (!target || !isImage(target)) return;
    const existing = readDoorJamMetadata(target);
    needsOpenArtwork = !existing?.openImage;
    desiredOpen = existing?.renderedState === "open";
    const persistedLink = kind === "smoke" ? { doorItemId: (link as SmokeLink).doorItemId } : { fogItemId: (link as DynamicFogLink).fogItemId, doorIndex: (link as DynamicFogLink).doorIndex };
    writeDoorJamMetadata(target, { version: 4, links: { ...existing?.links, [kind]: persistedLink }, closedImage: existing?.closedImage ?? snapshotArtwork(target), openImage: existing?.openImage, renderedState: existing?.renderedState ?? "closed", locked: existing?.locked });
  });
  if (kind === "dynamicFog") await setDynamicFogDoorState(link as DynamicFogLink, desiredOpen);
  else await setSmokeLinkedDoorState(link as SmokeLink, desiredOpen);
  return needsOpenArtwork;
}

export async function linkSmokeDoorOrCreate(image: Image, onCreateAttempt?: () => unknown | Promise<unknown>): Promise<LinkResult> {
  const bounds = await OBR.scene.items.getItemBounds([image.id]);
  const items = await OBR.scene.items.getItems();
  const found = chooseSmokeDoor(items, bounds);
  if (found.ok) {
    const needsOpenArtwork = await saveLink(image, "smoke", found.door.ref);
    return { ok: true, outcome: "linked-existing", distance: found.door.distance, doorCount: 1, needsOpenArtwork };
  }
  if (found.reason === "ambiguous") return { ok: false, message: "More than one plausible Smoke & Spectre door is near this image. Move or resize the image and try again." };
  await onCreateAttempt?.();
  const created = await createSmokeDoor(bounds);
  if (!created.ok) {
    const messages = {
      "no-intersection": "No existing Smoke door or unambiguous straight obstruction was found at this image.",
      "ambiguous-intersection": "More than one Smoke obstruction could form this door. Move or resize the image and try again.",
      "unsupported-geometry": "This Smoke obstruction cannot be split safely. Only straight lines with wall remaining on both sides are supported.",
      "attached-items": "This Smoke obstruction has attached items and cannot be split safely.",
      "update-failed": "Smoke door creation failed and the original obstruction was preserved.",
      duplicate: "Smoke door creation is already in progress for this image.",
    } as const;
    return { ok: false, message: messages[created.reason] };
  }
  const needsOpenArtwork = await saveLink(image, "smoke", created.ref);
  return { ok: true, outcome: "created-new", distance: 0, doorCount: 1, needsOpenArtwork };
}

export async function linkNearestDoor(image: Image): Promise<LinkResult> {
  const bounds = await OBR.scene.items.getItemBounds([image.id]);
  const nearest = await findNearestDoor({ x: bounds.center.x, y: bounds.center.y });
  if (!nearest) return { ok: false, message: "No valid Dynamic Fog doors were found in this scene." };
  if (nearest.distance > LINK_DISTANCE_THRESHOLD) return { ok: false, message: `Nearest Dynamic Fog door is ${Math.round(nearest.distance)}px away (limit ${LINK_DISTANCE_THRESHOLD}px). Move the image closer and try again.` };
  const needsOpenArtwork = await saveLink(image, "dynamicFog", nearest.ref);
  return { ok: true, outcome: "linked-existing", distance: nearest.distance, doorCount: (await OBR.scene.items.getItems((item) => item.layer === "FOG")).length, needsOpenArtwork };
}

export async function createAndLinkDoor(image: Image): Promise<LinkResult> {
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
  const needsOpenArtwork = await saveLink(image, "dynamicFog", created.ref);
  return { ok: true, outcome: "created-new", distance: 0, doorCount: 1, needsOpenArtwork };
}
