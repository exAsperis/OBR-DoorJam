import OBR, { buildShape, type ToolEvent } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
import { DYNAMIC_FOG_DOOR_INDEX_KEY, enumerateDoors, resolveManualDoorTarget } from "../dynamicFog/adapter";
import { linkDynamicFogDoor } from "../doorJam/linking";
import { openDoorImagesPopover } from "../doorJam/imagesPopover";
import { DOORJAM_TOOL_ID, modeId } from "./ids";

export const DYNAMIC_FOG_SELECTION_MODE_ID = modeId("selectDynamicFog");
const MARKER_KEY = `${EXTENSION_ID}/dynamic-fog-selection-marker`;
let pendingImageId: string | null = null;

export function getPendingDynamicFogSelection(): string | null { return pendingImageId; }
export function clearPendingDynamicFogSelection(): void { pendingImageId = null; }

async function clearMarkers(): Promise<void> {
  const markers = await OBR.scene.local.getItems((item) => item.metadata[MARKER_KEY] === true);
  if (markers.length) await OBR.scene.local.deleteItems(markers.map((item) => item.id));
}

async function renderMarkers(): Promise<void> {
  await clearMarkers();
  const items = await OBR.scene.items.getItems((item) => item.layer === "FOG");
  const { doors } = await enumerateDoors(items);
  const scale = await OBR.viewport.getScale(); const size = 34 / Math.max(scale, 0.01);
  const markers = doors.map((door) => buildShape().id(`${EXTENSION_ID}/dynamic-fog-selection/${door.ref.fogItemId}/${door.ref.doorIndex}`)
    .name("DoorJam Dynamic Fog door selector").attachedTo(door.ref.fogItemId).layer("CONTROL")
    .position(door.geometry.midpoint).width(size).height(size).shapeType("CIRCLE")
    .fillColor(door.open ? "#85ff66" : "#ff4d4d").fillOpacity(0.35).strokeColor("#ffffff").strokeWidth(Math.max(2, size / 10))
    .locked(true).disableHit(false).metadata({ [MARKER_KEY]: true, [DYNAMIC_FOG_DOOR_INDEX_KEY]: door.ref.doorIndex }).build());
  if (markers.length) await OBR.scene.local.addItems(markers);
}

async function cancel(activateOperate = true): Promise<void> {
  clearPendingDynamicFogSelection(); await clearMarkers();
  if (activateOperate) await OBR.tool.activateMode(DOORJAM_TOOL_ID, modeId("operate"));
}

export async function beginDynamicFogSelection(imageId: string, message = "Click the Dynamic Fog door you want to link."): Promise<void> {
  pendingImageId = String(imageId);
  await OBR.tool.activateMode(DOORJAM_TOOL_ID, DYNAMIC_FOG_SELECTION_MODE_ID);
  await OBR.notification.show(message, "DEFAULT");
}

export async function setupDynamicFogSelectionMode(): Promise<() => void> {
  await OBR.tool.removeMode(DYNAMIC_FOG_SELECTION_MODE_ID);
  await OBR.tool.createMode({
    id: DYNAMIC_FOG_SELECTION_MODE_ID,
    icons: [{ icon: "/tool-link.svg", label: "Select Dynamic Fog Door", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [DYNAMIC_FOG_SELECTION_MODE_ID], roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] }, cursors: [{ cursor: "crosshair", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [DYNAMIC_FOG_SELECTION_MODE_ID] } }],
    onToolClick: async (_context, event: ToolEvent) => {
      const imageId = pendingImageId;
      const target = event.target;
      const targetSnapshot = target ? { attachedTo: typeof target.attachedTo === "string" ? String(target.attachedTo) : undefined, metadata: { [DYNAMIC_FOG_DOOR_INDEX_KEY]: target.metadata[DYNAMIC_FOG_DOOR_INDEX_KEY] } } : undefined;
      if (!imageId || !targetSnapshot?.attachedTo) return false;
      const parents = await OBR.scene.items.getItems([targetSnapshot.attachedTo]);
      const resolved = resolveManualDoorTarget(targetSnapshot, parents);
      if (!resolved.ok) return false;
      const image = (await OBR.scene.items.getItems([imageId]))[0];
      if (!image) { await cancel(); return false; }
      const result = await linkDynamicFogDoor(image, resolved.ref);
      await cancel();
      if (!result.ok) await OBR.notification.show(result.message, "ERROR");
      else {
        await OBR.notification.show(result.warning ? "Door linked, but Dynamic Fog could not synchronize its initial state." : "Door image linked to Dynamic Fog door.", result.warning ? "ERROR" : "DEFAULT");
        if (result.needsOpenArtwork) await openDoorImagesPopover(image.id);
      }
      return false;
    },
    onKeyDown: (_context, event) => { if (event.key === "Escape") void cancel(); },
    onActivate: () => { if (pendingImageId) void renderMarkers(); else void OBR.tool.activateMode(DOORJAM_TOOL_ID, modeId("operate")); },
    onDeactivate: () => { clearPendingDynamicFogSelection(); void clearMarkers(); },
  });
  return () => { clearPendingDynamicFogSelection(); void clearMarkers(); void OBR.tool.removeMode(DYNAMIC_FOG_SELECTION_MODE_ID); };
}
