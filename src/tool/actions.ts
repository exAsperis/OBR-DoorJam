import OBR, { isImage, type Image, type Item, type ToolEvent } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { chooseDoorArtwork } from "../doorJam/artwork";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { linkNearestDoorAndChooseArtwork } from "../doorJam/linking";
import { readDoorJamMetadata, removeDoorJamMetadata } from "../doorJam/metadata";

export const DOORJAM_TOOL_ID = `${EXTENSION_ID}/tool`;
export const modeId = (action: DoorActionName) => `${DOORJAM_TOOL_ID}/${action}`;

async function selectedDoorImage(target: Item | undefined, action: DoorActionName): Promise<Image | null> {
  if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady()) || !target || !isImage(target)) return null;
  const configured = Boolean(readDoorJamMetadata(target));
  if (action !== "link" && !configured) return null;
  return target;
}

async function notify(message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") {
  await OBR.notification.show(message, variant);
}

export async function performDoorAction(action: DoorActionName, target: Item | undefined): Promise<void> {
  const image = await selectedDoorImage(target, action);
  if (!image) return;
  if (action === "link") {
    const relinking = Boolean(readDoorJamMetadata(image));
    try {
      const result = await linkNearestDoorAndChooseArtwork(image);
      if (!result.ok) { await notify(result.message, "ERROR"); return; }
      if (result.artworkRequested && !result.artworkSet) {
        await notify("Door linked. Choose Set Open Door Image when you are ready to finish setup.");
        return;
      }
      await notify(relinking ? "DoorJam link updated." : `Door linked (${Math.round(result.distance)}px away).`);
    } catch { await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR"); }
    return;
  }
  if (action === "operate") {
    const result = await toggleLinkedDoorState(image.id);
    if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
    return;
  }
  if (action === "setOpen" || action === "setClosed") {
    const state = action === "setOpen" ? "open" : "closed";
    if (await chooseDoorArtwork(image.id, state)) await notify(`${state === "open" ? "Open" : "Closed"} door artwork saved.`);
    return;
  }
  await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); });
  await notify("DoorJam link removed. Dynamic Fog was not changed.");
}

const actions = Object.keys(DOOR_ACTIONS) as DoorActionName[];
const targetCursor = (action: DoorActionName) => [{ cursor: "pointer", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [modeId(action)] } }];

export async function setupDoorJamTool(): Promise<() => void> {
  await OBR.tool.create({
    id: DOORJAM_TOOL_ID,
    icons: [{ icon: "/icon.svg", label: "DoorJam", filter: { roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] },
    defaultMode: modeId("operate"),
    shortcut: "J",
  });
  for (const action of actions) {
    const definition = DOOR_ACTIONS[action];
    await OBR.tool.createMode({
      id: modeId(action),
      icons: [{ icon: definition.icon, label: definition.label, filter: { activeTools: [DOORJAM_TOOL_ID], roles: ["GM"] } }],
      disabled: { roles: ["PLAYER"] },
      cursors: targetCursor(action),
      onToolClick: async (_context, event: ToolEvent) => { await performDoorAction(action, event.target); return false; },
    });
  }
  return () => {
    for (const action of actions) void OBR.tool.removeMode(modeId(action));
    void OBR.tool.remove(DOORJAM_TOOL_ID);
  };
}
