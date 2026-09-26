import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";

export const DYNAMIC_FOG_LINK_POPOVER_ID = `${EXTENSION_ID}/dynamic-fog-link-popover`;
export const DYNAMIC_FOG_LINK_CHOICE_CHANNEL = `${EXTENSION_ID}/dynamic-fog-link-choice`;

export async function openDynamicFogLinkPopover(imageId: string, reason: string): Promise<void> {
  const bounds = await OBR.scene.items.getItemBounds([imageId]); const point = await OBR.viewport.transformPoint(bounds.center);
  await OBR.popover.close(DYNAMIC_FOG_LINK_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open({ id: DYNAMIC_FOG_LINK_POPOVER_ID, url: `/dynamic-fog-link.html?imageId=${encodeURIComponent(imageId)}&reason=${encodeURIComponent(reason)}`,
    width: 330, height: 250, anchorReference: "POSITION", anchorPosition: { left: point.x, top: point.y },
    anchorOrigin: { horizontal: "CENTER", vertical: "TOP" }, transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" } });
}
