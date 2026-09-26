import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import { resolveFogProviderState } from "./providers";
import { applyArtwork } from "./artwork";
import { readDoorJamMetadata, writeDoorJamMetadata } from "./metadata";

let generation = 0;
const suppressedDoorIds = new Set<string>();

export async function withDoorSynchronizationSuppressed<T>(imageId: string, operation: () => Promise<T>): Promise<T> {
  suppressedDoorIds.add(imageId);
  try { return await operation(); }
  finally { suppressedDoorIds.delete(imageId); }
}

export async function synchronizeFromItems(items: Item[]): Promise<void> {
  const request = ++generation;
  const changes = items.filter(isImage).flatMap((image) => {
    if (suppressedDoorIds.has(image.id)) return [];
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return [];
    const lookup = resolveFogProviderState(items, metadata);
    if (!lookup?.ok) return [];
    const desired = lookup.open ? "open" : "closed";
    const artwork = lookup.open ? metadata.openImage : metadata.closedImage;
    return metadata.renderedState !== desired && artwork ? [{ id: image.id, desired, artwork }] : [];
  });
  if (!changes.length) return;
  try {
    if (request !== generation) return;
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
  } finally { /* a newer generation supersedes this update */ }
}

export async function synchronizeScene(): Promise<void> {
  if (await OBR.scene.isReady()) await synchronizeFromItems(await OBR.scene.items.getItems());
}
