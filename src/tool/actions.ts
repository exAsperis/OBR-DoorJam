import OBR, { isImage, type Image, type Item, type ToolEvent } from "@owlbear-rodeo/sdk";
import { DOORJAM_TOOL_PREFERENCES_KEY } from "../constants";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { linkNearbyDoorOrCreate } from "../doorJam/linking";
import { providerName } from "../doorJam/providers";
import { readDoorJamMetadata, removeDoorJamMetadata, removeFogDoorLink, setDoorLocked } from "../doorJam/metadata";
import { getDoorJamSettings, setPlayersCanOperate } from "../doorJam/settings";
import { handleDoorOverlayDoubleClick } from "../doorJam/overlays";
import { getToolPreferences, readToolPreferences, type DoorJamToolPreferences } from "./preferences";
import { openToolSettingsPopover, TOOL_SETTINGS_ACTION_ID } from "./settingsPopover";
import { DYNAMIC_FOG_EDITOR_MODE_ID, setupDynamicFogEditorMode } from "./dynamicFogEditor";
import { DOORJAM_TOOL_ID, modeId } from "./ids";

export { DOORJAM_TOOL_ID, modeId } from "./ids";
export const DOORJAM_TOOL_SHORTCUT = "J";
export const PLAYER_OPERATION_SHORTCUT = "X";
export const DOOR_ACTION_SHORTCUTS: Record<DoorActionName, string> = {
  operate: "O",
  lock: "L",
  setImages: "I",
  link: "Y",
  linkSmoke: "K",
  unlink: "B",
  remove: "R",
};

async function selectedDoorImage(target: Item | undefined, action: DoorActionName): Promise<Image | null> {
  const role = await OBR.player.getRole();
  if (!(await OBR.scene.isReady()) || !target || !isImage(target)) return null;
  if (role !== "GM" && action !== "operate") return null;
  const configured = Boolean(readDoorJamMetadata(target));
  if (action !== "link" && action !== "linkSmoke" && action !== "setImages" && !configured) return null;
  const metadata = readDoorJamMetadata(target);
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
  if (action === "link" || action === "linkSmoke") {
    const smoke = action === "linkSmoke";
    try {
      const result = await linkNearbyDoorOrCreate(image, () => notify(`No existing ${smoke ? "Smoke & Spectre" : "Dynamic Fog"} door found in range. Attempting safe creation.`), smoke ? "smoke" : "dynamic-fog");
      if (!result.ok) { await notify(result.message, "ERROR"); return; }
      await notify(result.outcome === "linked-existing" ? `Door image linked to ${smoke ? "Smoke & Spectre" : "Dynamic Fog"}.` : `New ${smoke ? "Smoke & Spectre" : "Dynamic Fog"} door created and linked.`);
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
    const linkedMetadata = readDoorJamMetadata(image);
    await OBR.scene.items.updateItems([image.id], (items) => {
      const item = items[0];
      if (!item) return;
      const metadata = readDoorJamMetadata(item);
      if (metadata) removeFogDoorLink(item, metadata);
    });
    await notify(`${linkedMetadata?.fogDoor ? providerName(linkedMetadata.fogDoor) : "Fog"} link removed. DoorJam artwork was preserved.`);
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

export async function setupDoorJamTool(suppliedPreferences?: DoorJamToolPreferences): Promise<() => void> {
  const role = await OBR.player.getRole();
  const preferences = suppliedPreferences ?? await getToolPreferences();
  await Promise.all([...actions.map((action) => modeId(action)), ...legacyModeIds].map((id) => OBR.tool.removeMode(id)));
  await OBR.tool.removeMode(DYNAMIC_FOG_EDITOR_MODE_ID);
  await OBR.tool.removeAction(PLAYER_OPERATION_ACTION_ID);
  await OBR.tool.removeAction(TOOL_SETTINGS_ACTION_ID);
  await OBR.tool.remove(DOORJAM_TOOL_ID);
  await OBR.tool.create({
    id: DOORJAM_TOOL_ID,
    icons: [{ icon: "/icon.svg", label: "DoorJam", filter: { roles: ["GM", "PLAYER"] } }],
    defaultMode: modeId("operate"),
    defaultMetadata: { [DOORJAM_TOOL_PREFERENCES_KEY]: preferences },
    shortcut: DOORJAM_TOOL_SHORTCUT,
  });
  let removeDynamicFogEditor: (() => void) | undefined;
  for (const action of actions) {
    if (role !== "GM" && action !== "operate") continue;
    const definition = DOOR_ACTIONS[action];
    const providerPreference = action === "link" ? "dynamicFog" : action === "linkSmoke" ? "smoke" : null;
    const visibilityMetadata = providerPreference
      ? [{ key: [DOORJAM_TOOL_PREFERENCES_KEY, providerPreference], value: true }]
      : action === "unlink"
        ? [
            { key: [DOORJAM_TOOL_PREFERENCES_KEY, "dynamicFog"], value: true, coordinator: "||" as const },
            { key: [DOORJAM_TOOL_PREFERENCES_KEY, "smoke"], value: true },
          ]
        : undefined;
    await OBR.tool.createMode({
      id: modeId(action),
      icons: [{ icon: definition.icon, label: definition.label, filter: {
        activeTools: [DOORJAM_TOOL_ID], roles: action === "operate" ? ["GM", "PLAYER"] : ["GM"],
        ...(visibilityMetadata ? { metadata: visibilityMetadata } : {}),
      } }],
      disabled: action === "operate" ? undefined : { roles: ["PLAYER"] },
      shortcut: DOOR_ACTION_SHORTCUTS[action],
      cursors: targetCursor(action),
      onActivate: providerPreference || action === "unlink" ? (context) => {
        const current = readToolPreferences(context.metadata);
        const enabled = providerPreference ? current[providerPreference] : current.dynamicFog || current.smoke;
        if (!enabled) void OBR.tool.activateMode(DOORJAM_TOOL_ID, modeId("operate"));
      } : undefined,
      onToolClick: async (_context, event: ToolEvent) => { await performDoorAction(action, event.target); return false; },
      onToolDoubleClick: async (_context, event: ToolEvent) => await handleDoorOverlayDoubleClick(event) ? false : undefined,
    });
    if (role === "GM" && action === "link") removeDynamicFogEditor = await setupDynamicFogEditorMode();
  }
  let removeSettings: (() => void) | undefined;
  if (role === "GM") {
    await registerPlayerOperationAction();
    await OBR.tool.createAction({
      id: TOOL_SETTINGS_ACTION_ID,
      icons: [{ icon: "/settings.svg", label: "DoorJam Tool Settings", filter: { activeTools: [DOORJAM_TOOL_ID], roles: ["GM"] } }],
      disabled: { roles: ["PLAYER"] },
      onClick: (_context, elementId) => void openToolSettingsPopover(elementId),
    });
    removeSettings = OBR.scene.onMetadataChange(() => void registerPlayerOperationAction().catch(() => undefined));
  }
  return () => {
    removeDynamicFogEditor?.();
    for (const action of actions) if (role === "GM" || action === "operate") void OBR.tool.removeMode(modeId(action));
    removeSettings?.();
    if (role === "GM") void OBR.tool.removeAction(PLAYER_OPERATION_ACTION_ID);
    if (role === "GM") void OBR.tool.removeAction(TOOL_SETTINGS_ACTION_ID);
    void OBR.tool.remove(DOORJAM_TOOL_ID);
  };
}
