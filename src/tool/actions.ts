import OBR, { isImage, type Image, type Item, type ToolEvent } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { linkNearbyDoorOrCreate } from "../doorJam/linking";
import { getDoorState } from "../dynamicFog/adapter";
import { readDoorJamMetadata, removeDoorJamMetadata, removeFogDoorLink, setDoorLocked } from "../doorJam/metadata";
import { getDoorJamSettings, setPlayersCanOperate } from "../doorJam/settings";
import { handleDoorOverlayDoubleClick } from "../doorJam/overlays";

export const DOORJAM_TOOL_ID = `${EXTENSION_ID}/tool`;
export const modeId = (action: DoorActionName) => `${DOORJAM_TOOL_ID}/${action}`;
export const DOORJAM_TOOL_SHORTCUT = "J";
export const PLAYER_OPERATION_SHORTCUT = "X";
export const DOOR_ACTION_SHORTCUTS: Record<DoorActionName, string> = {
  operate: "O",
  lock: "L",
  setImages: "I",
  link: "&",
  unlink: "?",
  remove: "R",
};

async function selectedDoorImage(target: Item | undefined, action: DoorActionName): Promise<Image | null> {
  const role = await OBR.player.getRole();
  if (!(await OBR.scene.isReady()) || !target || !isImage(target)) return null;
  if (role !== "GM" && action !== "operate") return null;
  const configured = Boolean(readDoorJamMetadata(target));
  if (action !== "link" && action !== "setImages" && !configured) return null;
  const metadata = readDoorJamMetadata(target);
  if (action === "link" && metadata?.fogDoor && (await getDoorState(metadata.fogDoor)).ok) return null;
  if (action === "unlink" && !metadata?.fogDoor) return null;
  if (action === "remove" && (!metadata || metadata.fogDoor)) return null;
  return target;
}

async function notify(message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") {
  await OBR.notification.show(message, variant);
}

export async function performDoorAction(action: DoorActionName, target: Item | undefined): Promise<void> {
  const image = await selectedDoorImage(target, action);
  if (!image) return;
  if (action === "link") {
    try {
      const result = await linkNearbyDoorOrCreate(image, () => notify("No existing Dynamic Fog door found in range. Attempting to create new Dynamic Fog door."));
      if (!result.ok) { await notify(result.message, "ERROR"); return; }
      await notify(result.outcome === "linked-existing" ? "Door image linked to Dynamic Fog door." : "New Dynamic Fog door created. Door image linked.");
      if (result.needsOpenArtwork) await openDoorImagesPopover(image.id);
    } catch { await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR"); }
    return;
  }
  if (action === "operate") {
    const result = await toggleLinkedDoorState(image.id);
    if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
    return;
  }
  if (action === "setImages") {
    await openDoorImagesPopover(image.id);
    return;
  }
  if (action === "unlink") {
    await OBR.scene.items.updateItems([image.id], (items) => {
      const item = items[0];
      if (!item) return;
      const metadata = readDoorJamMetadata(item);
      if (metadata) removeFogDoorLink(item, metadata);
    });
    await notify("Dynamic Fog link removed. DoorJam artwork was preserved.");
    return;
  }
  if (action === "lock") {
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return;
    await OBR.scene.items.updateItems([image.id], (items) => {
      const item = items[0];
      if (!item) return;
      const current = readDoorJamMetadata(item);
      if (current) setDoorLocked(item, current, current.locked !== true);
    });
    return;
  }
  await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); });
  await notify("DoorJam door removed. The displayed image was preserved.");
}

const actions = Object.keys(DOOR_ACTIONS) as DoorActionName[];
const legacyModeIds = [`${DOORJAM_TOOL_ID}/setOpen`, `${DOORJAM_TOOL_ID}/setClosed`];
const targetCursor = (action: DoorActionName) => [{ cursor: "pointer", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [modeId(action)] } }];

const PLAYER_OPERATION_ACTION_ID = `${DOORJAM_TOOL_ID}/player-operation`;

async function registerPlayerOperationAction(): Promise<void> {
  const allowed = (await getDoorJamSettings()).playersCanOperate;
  await OBR.tool.createAction({
    id: PLAYER_OPERATION_ACTION_ID,
    icons: [{
      icon: allowed ? "/no-operate.svg" : "/allow-operate.svg",
      label: allowed ? "Prevent Player Door Operation" : "Allow Player Door Operation",
      filter: { activeTools: [DOORJAM_TOOL_ID], roles: ["GM"] },
    }],
    disabled: { roles: ["PLAYER"] },
    shortcut: PLAYER_OPERATION_SHORTCUT,
    onClick: async () => {
      const current = (await getDoorJamSettings()).playersCanOperate;
      if (await setPlayersCanOperate(!current)) {
        await registerPlayerOperationAction();
      }
    },
  });
}

export async function setupDoorJamTool(): Promise<() => void> {
  const role = await OBR.player.getRole();
  await Promise.all([...actions.map((action) => modeId(action)), ...legacyModeIds].map((id) => OBR.tool.removeMode(id)));
  await OBR.tool.removeAction(PLAYER_OPERATION_ACTION_ID);
  await OBR.tool.remove(DOORJAM_TOOL_ID);
  await OBR.tool.create({
    id: DOORJAM_TOOL_ID,
    icons: [{ icon: "/icon.svg", label: "DoorJam", filter: { roles: ["GM", "PLAYER"] } }],
    defaultMode: modeId("operate"),
    shortcut: DOORJAM_TOOL_SHORTCUT,
  });
  for (const action of actions) {
    if (role !== "GM" && action !== "operate") continue;
    const definition = DOOR_ACTIONS[action];
    await OBR.tool.createMode({
      id: modeId(action),
      icons: [{ icon: definition.icon, label: definition.label, filter: { activeTools: [DOORJAM_TOOL_ID], roles: action === "operate" ? ["GM", "PLAYER"] : ["GM"] } }],
      disabled: action === "operate" ? undefined : { roles: ["PLAYER"] },
      shortcut: DOOR_ACTION_SHORTCUTS[action],
      cursors: targetCursor(action),
      onToolClick: async (_context, event: ToolEvent) => { await performDoorAction(action, event.target); return false; },
      onToolDoubleClick: async (_context, event: ToolEvent) => await handleDoorOverlayDoubleClick(event) ? false : undefined,
    });
  }
  let removeSettings: (() => void) | undefined;
  if (role === "GM") {
    await registerPlayerOperationAction();
    removeSettings = OBR.scene.onMetadataChange(() => void registerPlayerOperationAction().catch(() => undefined));
  }
  return () => {
    for (const action of actions) if (role === "GM" || action === "operate") void OBR.tool.removeMode(modeId(action));
    removeSettings?.();
    if (role === "GM") void OBR.tool.removeAction(PLAYER_OPERATION_ACTION_ID);
    void OBR.tool.remove(DOORJAM_TOOL_ID);
  };
}
