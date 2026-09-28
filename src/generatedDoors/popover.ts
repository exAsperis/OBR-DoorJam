import OBR from "@owlbear-rodeo/sdk";
import { EXTENSION_ID, GENERATED_DOOR_POPOVER_MOVE_CHANNEL } from "../constants";
export const GENERATED_DOOR_POPOVER_ID = `${EXTENSION_ID}/generated-door-popover`;
const TOOL_RAIL_CLEARANCE = 72;
let anchorPosition = { left: 0, top: 72 };
function definition(itemId?: string) { return { id: GENERATED_DOOR_POPOVER_ID, url: `/generated-door.html${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ""}`, width: 340, height: 600,
  anchorReference: "POSITION" as const, anchorPosition, anchorOrigin: { horizontal: "RIGHT" as const, vertical: "TOP" as const }, transformOrigin: { horizontal: "RIGHT" as const, vertical: "TOP" as const }, disableClickAway: true }; }
export async function openGeneratedDoorPopover(itemId?: string) {
  const width = await OBR.viewport.getWidth();
  anchorPosition = { left: Math.max(360, width - TOOL_RAIL_CLEARANCE), top: 72 };
  await OBR.popover.close(GENERATED_DOOR_POPOVER_ID).catch(() => undefined);
  await OBR.popover.open(definition(itemId));
}
export async function closeGeneratedDoorPopover() { await OBR.popover.close(GENERATED_DOOR_POPOVER_ID).catch(() => undefined); }
export function setupGeneratedDoorPopoverMovement(): () => void {
  return OBR.broadcast.onMessage(GENERATED_DOOR_POPOVER_MOVE_CHANNEL, (event) => { const data = event.data as { dx?: unknown; dy?: unknown; itemId?: unknown }; const dx = data?.dx, dy = data?.dy; if (typeof dx !== "number" || typeof dy !== "number") return; void (async () => { const width = await OBR.viewport.getWidth(); const height = await OBR.viewport.getHeight(); anchorPosition = { left: Math.min(width - TOOL_RAIL_CLEARANCE, Math.max(348, anchorPosition.left + dx)), top: Math.min(Math.max(8, height - 80), Math.max(8, anchorPosition.top + dy)) }; await OBR.popover.open(definition(typeof data.itemId === "string" ? data.itemId : undefined)); })(); });
}
