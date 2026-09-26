import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
export const BREAK_LINK_POPOVER_ID = `${EXTENSION_ID}/break-link-popover`;
export async function openBreakLinkPopover(imageId: string): Promise<void> {
  const bounds = await OBR.scene.items.getItemBounds([imageId]); const point = await OBR.viewport.transformPoint(bounds.center);
  await OBR.popover.close(BREAK_LINK_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({ id: BREAK_LINK_POPOVER_ID, url: `/break-link.html?imageId=${encodeURIComponent(imageId)}`, width: 320, height: 260,
    anchorReference: "POSITION", anchorPosition: { left: point.x, top: point.y }, anchorOrigin: { horizontal: "CENTER", vertical: "TOP" }, transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" } });
}
