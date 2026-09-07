import OBR, { buildShape } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";

const HIGHLIGHT_ID = `${EXTENSION_ID}/door-highlight`;
let request = 0;

async function deleteHighlight(): Promise<void> {
  try { await OBR.scene.local.deleteItems([HIGHLIGHT_ID]); } catch { /* It may not exist. */ }
}

export async function clearDoorHighlight(): Promise<void> {
  request += 1;
  await deleteHighlight();
}

export async function showDoorHighlight(imageId: string): Promise<void> {
  const currentRequest = ++request;
  await deleteHighlight();
  try {
    if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) return;
    const bounds = await OBR.scene.items.getItemBounds([imageId]);
    if (currentRequest !== request) return;
    const outline = buildShape()
      .id(HIGHLIGHT_ID).name("DoorJam door highlight").shapeType("RECTANGLE")
      .width(Math.max(bounds.width, 1)).height(Math.max(bounds.height, 1)).position(bounds.min)
      .fillOpacity(0).strokeColor("#ff00c8").strokeOpacity(1).strokeWidth(4)
      .layer("POPOVER").disableHit(true).locked(true).build();
    await OBR.scene.local.addItems([outline]);
    if (currentRequest !== request) await deleteHighlight();
  } catch {
    // Highlighting is optional and must not disrupt door controls.
  }
}
