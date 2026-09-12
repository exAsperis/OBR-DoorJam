import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import { lookupDoor } from "../dynamicFog/adapter";
import { applyArtwork } from "./artwork";
import { readDoorJamMetadata, writeDoorJamMetadata } from "./metadata";

let syncing = false;

export async function synchronizeFromItems(items: Item[]): Promise<void> {
  if (syncing) return;
  const changes = items.filter(isImage).flatMap((image) => {
    const metadata = readDoorJamMetadata(image);
    if (!metadata?.fogDoor) return [];
    const lookup = lookupDoor(items, metadata.fogDoor);
    if (!lookup.ok) return [];
    const desired = lookup.door.open ? "open" : "closed";
    const artwork = lookup.door.open ? metadata.openImage : metadata.closedImage;
    return metadata.renderedState !== desired && artwork ? [{ id: image.id, desired, artwork }] : [];
  });
  if (!changes.length) return;
  syncing = true;
  try {
    await OBR.scene.items.updateItems(changes.map((change) => change.id), (images) => {
      for (const image of images) {
        if (!isImage(image)) continue;
        const change = changes.find((candidate) => candidate.id === image.id);
        const metadata = readDoorJamMetadata(image);
        if (!change || !metadata) continue;
        applyArtwork(image, change.artwork);
        metadata.renderedState = change.desired as "open" | "closed";
        writeDoorJamMetadata(image, metadata);
      }
    });
  } finally { syncing = false; }
}

export async function synchronizeScene(): Promise<void> {
  if (await OBR.scene.isReady()) await synchronizeFromItems(await OBR.scene.items.getItems());
}
