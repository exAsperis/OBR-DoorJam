import OBR, { isImage, type Image, type ImageContent, type ImageGrid } from "@owlbear-rodeo/sdk";
import { readDoorJamMetadata, writeDoorJamMetadata, type DoorImageState } from "./metadata";

export function snapshotArtwork(image: Image): DoorImageState {
  return { image: { ...image.image }, grid: { ...image.grid, offset: { ...image.grid.offset } } };
}

export function applyArtwork(image: Image, artwork: DoorImageState): void {
  const oldWidth = image.image.width / image.grid.dpi;
  const oldHeight = image.image.height / image.grid.dpi;
  const newWidth = artwork.image.width / artwork.grid.dpi;
  const newHeight = artwork.image.height / artwork.grid.dpi;
  image.scale = {
    x: newWidth > 0 ? image.scale.x * oldWidth / newWidth : image.scale.x,
    y: newHeight > 0 ? image.scale.y * oldHeight / newHeight : image.scale.y,
  };
  image.image = { ...artwork.image };
  image.grid = { ...artwork.grid, offset: { ...artwork.grid.offset } };
}

export async function chooseDoorArtwork(imageId: string, state: "open" | "closed"): Promise<boolean> {
  const [asset] = await OBR.assets.downloadImages(false, undefined, "PROP");
  if (!asset) return false;
  await OBR.scene.items.updateItems([imageId], (items) => {
    const image = items[0];
    if (!image || !isImage(image)) return;
    const metadata = readDoorJamMetadata(image);
    if (!metadata) {
      const artwork = { image: asset.image, grid: asset.grid };
      if (state === "closed") {
        applyArtwork(image, artwork);
        return;
      }
      writeDoorJamMetadata(image, {
        version: 2,
        closedImage: snapshotArtwork(image),
        openImage: artwork,
        renderedState: "closed",
      });
      return;
    }
    const artwork = { image: asset.image, grid: asset.grid };
    metadata[state === "open" ? "openImage" : "closedImage"] = artwork;
    if (metadata.renderedState === state) applyArtwork(image, artwork);
    writeDoorJamMetadata(image, metadata);
  });
  return true;
}

export async function swapDoorArtwork(imageId: string): Promise<boolean> {
  let swapped = false;
  await OBR.scene.items.updateItems([imageId], (items) => {
    const image = items[0];
    if (!image || !isImage(image)) return;
    const metadata = readDoorJamMetadata(image);
    if (!metadata?.openImage || !metadata.closedImage) return;
    const openImage = metadata.openImage;
    metadata.openImage = metadata.closedImage;
    metadata.closedImage = openImage;
    applyArtwork(image, metadata.renderedState === "open" ? metadata.openImage : metadata.closedImage);
    writeDoorJamMetadata(image, metadata);
    swapped = true;
  });
  return swapped;
}

export async function renderDoorImage(imageId: string, open: boolean): Promise<"updated" | "missing-artwork" | "invalid-image"> {
  let result: "updated" | "missing-artwork" | "invalid-image" = "invalid-image";
  await OBR.scene.items.updateItems([imageId], (items) => {
    const image = items[0];
    if (!image || !isImage(image)) return;
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return;
    const artwork = open ? metadata.openImage : metadata.closedImage;
    if (!artwork) { result = "missing-artwork"; return; }
    if (metadata.renderedState !== (open ? "open" : "closed") || image.image.url !== artwork.image.url) applyArtwork(image, artwork);
    metadata.renderedState = open ? "open" : "closed";
    writeDoorJamMetadata(image, metadata);
    result = "updated";
  });
  return result;
}
