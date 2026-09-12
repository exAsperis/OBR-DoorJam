import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";

export const DOOR_IMAGES_POPOVER_ID = `${EXTENSION_ID}/images-popover`;

export async function openDoorImagesPopover(imageId: string): Promise<void> {
  const bounds = await OBR.scene.items.getItemBounds([imageId]);
  const point = await OBR.viewport.transformPoint(bounds.center);
  await OBR.popover.close(DOOR_IMAGES_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({
    id: DOOR_IMAGES_POPOVER_ID,
    url: `/image-settings.html?imageId=${encodeURIComponent(imageId)}`,
    width: 320,
    height: 230,
    anchorReference: "POSITION",
    anchorPosition: { left: point.x, top: point.y },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" },
    transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
  });
}
