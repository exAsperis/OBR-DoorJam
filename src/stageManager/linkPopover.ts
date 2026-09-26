import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
export const STAGE_MANAGER_LINK_POPOVER_ID = `${EXTENSION_ID}/stage-manager-link-popover`;
export async function openStageManagerLinkPopover(imageId: string): Promise<void> {
  const bounds = await OBR.scene.items.getItemBounds([imageId]);
  const point = await OBR.viewport.transformPoint(bounds.center);
  await OBR.popover.close(STAGE_MANAGER_LINK_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({
    id: STAGE_MANAGER_LINK_POPOVER_ID, url: `/elevator-link.html?imageId=${encodeURIComponent(imageId)}`,
    width: 340, height: 360, anchorReference: "POSITION", anchorPosition: { left: point.x, top: point.y },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" }, transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
  });
}
