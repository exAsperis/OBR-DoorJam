import OBR, { isImage, type Item, type ToolEvent } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { linkNearestDoorAndChooseArtwork } from "../doorJam/linking";
import { readDoorJamMetadata } from "../doorJam/metadata";

export const DOORJAM_TOOL_ID = `${EXTENSION_ID}/tool`;
export const OPERATE_MODE_ID = `${DOORJAM_TOOL_ID}/operate`;
export const LINK_MODE_ID = `${DOORJAM_TOOL_ID}/link`;

async function canUseTool(): Promise<boolean> {
  return await OBR.player.getRole() === "GM" && await OBR.scene.isReady();
}

async function notify(message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") {
  await OBR.notification.show(message, variant);
}

export async function operateDoorTarget(target: Item | undefined): Promise<void> {
  if (!await canUseTool() || !target || !isImage(target) || !readDoorJamMetadata(target)) return;
  const result = await toggleLinkedDoorState(target.id);
  if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
}

export async function linkDoorTarget(target: Item | undefined): Promise<void> {
  if (!await canUseTool() || !target || !isImage(target)) return;
  try {
    const result = await linkNearestDoorAndChooseArtwork(target);
    if (!result.ok) { await notify(result.message, "ERROR"); return; }
    if (result.artworkRequested && !result.artworkSet) {
      await notify("Door linked. Choose Set Open Door Image when you are ready to finish setup.");
      return;
    }
    await notify(`Door linked (${Math.round(result.distance)}px away).`);
  } catch {
    await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR");
  }
}

const targetCursor = (modeId: string) => [{ cursor: "pointer", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [modeId] } }];

export async function setupDoorJamTool(): Promise<() => void> {
  await OBR.tool.create({
    id: DOORJAM_TOOL_ID,
    icons: [{ icon: "/icon.svg", label: "DoorJam", filter: { roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] },
    defaultMode: OPERATE_MODE_ID,
    shortcut: "J",
  });
  await OBR.tool.createMode({
    id: OPERATE_MODE_ID,
    icons: [{ icon: "/tool-operate.svg", label: "Operate Door", filter: { activeTools: [DOORJAM_TOOL_ID], roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] },
    cursors: targetCursor(OPERATE_MODE_ID),
    onToolClick: async (_context, event: ToolEvent) => { await operateDoorTarget(event.target); return false; },
  });
  await OBR.tool.createMode({
    id: LINK_MODE_ID,
    icons: [{ icon: "/tool-link.svg", label: "Link Door", filter: { activeTools: [DOORJAM_TOOL_ID], roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] },
    cursors: targetCursor(LINK_MODE_ID),
    onToolClick: async (_context, event: ToolEvent) => { await linkDoorTarget(event.target); return false; },
  });
  return () => {
    void OBR.tool.removeMode(OPERATE_MODE_ID);
    void OBR.tool.removeMode(LINK_MODE_ID);
    void OBR.tool.remove(DOORJAM_TOOL_ID);
  };
}
