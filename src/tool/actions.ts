import OBR, { isImage, type Image, type Item, type ToolEvent } from "@owlbear-rodeo/sdk";
import { DOORJAM_TOOL_PREFERENCES_KEY } from "../constants";
import { DOOR_ACTIONS, type DoorActionName } from "../doorJam/actions";
import { doorStateErrorMessage, toggleLinkedDoorState } from "../doorJam/control";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { linkNearbyDoorOrCreate } from "../doorJam/linking";
import { countDoorLinks, readDoorJamMetadata, removeDoorJamMetadata, setDoorLocked } from "../doorJam/metadata";
import { INTEGRATION_NAMES } from "../doorJam/providers";
import { breakDoorLinkInteractive } from "../doorJam/breakLink";
import { discoverAndLinkStageManager } from "../stageManager/linking";
import { getDoorJamSettings, setPlayersCanOperate } from "../doorJam/settings";
import { getDoorOverlayDoorId, handleDoorOverlayDoubleClick } from "../doorJam/overlays";
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
  linkStageManager: "U",
  unlink: "B",
  remove: "R",
};

async function selectedDoorImage(target: Item | undefined, action: DoorActionName): Promise<Image | null> {
  const role = await OBR.player.getRole();
  if (!(await OBR.scene.isReady()) || !target) return null;
  if (role !== "GM" && action !== "operate") return null;
  let image: Image | null = isImage(target) ? target : null;
  if (!image) {
    const doorId = getDoorOverlayDoorId(target);
    if (!doorId) return null;
    const backingItem = (await OBR.scene.items.getItems([doorId]))[0];
    if (!backingItem || !isImage(backingItem)) return null;
    image = backingItem;
  }
  const configured = Boolean(readDoorJamMetadata(image));
  if (action !== "link" && action !== "linkSmoke" && action !== "linkStageManager" && action !== "setImages" && !configured) return null;
  const metadata = readDoorJamMetadata(image);
  if (action === "unlink" && (!metadata || countDoorLinks(metadata) === 0)) return null;
  return image;
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
      await notify(result.warning ? `Door linked, but ${smoke ? "Smoke & Spectre!" : "Dynamic Fog"} could not synchronize its initial state.` : result.outcome === "linked-existing" ? `Door image linked to ${smoke ? "Smoke & Spectre" : "Dynamic Fog"}.` : `New ${smoke ? "Smoke & Spectre" : "Dynamic Fog"} door created and linked.`, result.warning ? "ERROR" : "DEFAULT");
      if (result.needsOpenArtwork) await openDoorImagesPopover(image.id);
    } catch { await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR"); }
    return;
  }
  if (action === "linkStageManager") {
    const result = await discoverAndLinkStageManager(image);
    if (!result.ok) await notify(result.message, "ERROR");
    else if (!("choosing" in result)) {
      await notify(result.warning ? "Door linked, but Stage Manager could not update the Elevator." : "Door linked to Stage Manager Elevator.", result.warning ? "ERROR" : "DEFAULT");
      if (result.needsOpenArtwork) await openDoorImagesPopover(image.id);
    }
    return;
  }
  if (action === "operate") {
    const result = await toggleLinkedDoorState(image.id);
    if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
    else if (result.warnings?.length) await notify(`Door changed state, but ${result.warnings.map((warning) => `${INTEGRATION_NAMES[warning.integration]} (${warning.message})`).join(" and ")} could not update.`, "ERROR");
    return;
  }
  if (action === "setImages") {
    await openDoorImagesPopover(image.id);
    return;
  }
  if (action === "unlink") {
    await breakDoorLinkInteractive(image.id);
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
  // Existing Owlbear tool metadata can survive registration. Write the
  // normalized fail-open preferences so upgrades gain the Stage Manager key.
  await OBR.tool.setMetadata(DOORJAM_TOOL_ID, { [DOORJAM_TOOL_PREFERENCES_KEY]: preferences });
  let removeDynamicFogEditor: (() => void) | undefined;
  for (const action of actions) {
    if (role !== "GM" && action !== "operate") continue;
    const definition = DOOR_ACTIONS[action];
    const providerPreference = action === "link" ? "dynamicFog" : action === "linkSmoke" ? "smoke" : action === "linkStageManager" ? "stageManager" : null;
    const visibilityMetadata = providerPreference
      ? [{ key: [DOORJAM_TOOL_PREFERENCES_KEY, providerPreference], value: true }]
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
      onActivate: providerPreference ? (context) => {
        const current = readToolPreferences(context.metadata);
        const enabled = current[providerPreference];
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
