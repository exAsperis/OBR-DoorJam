import OBR, { isImage, type ContextMenuContext, type Image } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY, EXTENSION_ID } from "../constants";
import { chooseOpenArtwork, renderDoorImage } from "../doorJam/artwork";
import { linkNearestDoor } from "../doorJam/linking";
import { readDoorJamMetadata, removeDoorJamMetadata } from "../doorJam/metadata";
import { getDoorState, setDoorState } from "../dynamicFog/adapter";

const ids = ["link", "relink", "set-open", "open", "close", "unlink"] as const;
const icon = "/icon.svg";
const imageFilter = { min: 1, max: 1, roles: ["GM" as const], permissions: ["UPDATE" as const], every: [{ key: "type", value: "IMAGE" }] };
const configuredFilter = { ...imageFilter, every: [...imageFilter.every, { key: ["metadata", DOORJAM_METADATA_KEY], value: undefined, operator: "!=" as const }] };

async function selectedImage(context: ContextMenuContext): Promise<Image | null> {
  if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) return null;
  const item = context.items[0];
  return item && isImage(item) ? item : null;
}

async function notify(message: string, variant: "DEFAULT" | "ERROR" = "DEFAULT") {
  await OBR.notification.show(message, variant);
}

export async function setupContextMenu(): Promise<() => void> {
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/link`, icons: [{ icon, label: "Link to Dynamic Fog Door", filter: { ...imageFilter, every: [...imageFilter.every, { key: ["metadata", DOORJAM_METADATA_KEY], value: undefined }] } }],
    onClick: async (context) => {
      const image = await selectedImage(context); if (!image) return;
      try { const result = await linkNearestDoor(image); await notify(result.ok ? `Linked to nearest Dynamic Fog door (${Math.round(result.distance)}px away).` : result.message, result.ok ? "DEFAULT" : "ERROR"); }
      catch { await notify("DoorJam could not inspect Dynamic Fog. Check that the extension and scene are available.", "ERROR"); }
    },
  });
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/relink`, icons: [{ icon, label: "Relink Dynamic Fog Door", filter: configuredFilter }],
    onClick: async (context) => { const image = await selectedImage(context); if (!image) return; const result = await linkNearestDoor(image); await notify(result.ok ? "DoorJam link updated." : result.message, result.ok ? "DEFAULT" : "ERROR"); },
  });
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/set-open`, icons: [{ icon, label: "Set Open Door Image", filter: configuredFilter }],
    onClick: async (context) => { const image = await selectedImage(context); if (image && await chooseOpenArtwork(image.id)) await notify("Open door artwork saved."); },
  });
  for (const [action, open] of [["open", true], ["close", false]] as const) {
    await OBR.contextMenu.create({
      id: `${EXTENSION_ID}/context-menu/${action}`,
      icons: [{ icon, label: open ? "Open Door" : "Close Door", filter: { ...configuredFilter, every: [...configuredFilter.every, { key: ["metadata", DOORJAM_METADATA_KEY, "renderedState"], value: open ? "closed" : "open" }] } }],
      onClick: async (context) => {
        const image = await selectedImage(context); if (!image) return;
        const metadata = readDoorJamMetadata(image); if (!metadata) return;
        const current = await getDoorState(metadata.fogDoor);
        if (!current.ok) { await notify("The linked Dynamic Fog door is no longer valid. Use Relink Dynamic Fog Door.", "ERROR"); return; }
        if (open && !metadata.openImage) { await notify("Set the open door image first.", "ERROR"); return; }
        const result = await setDoorState(metadata.fogDoor, open);
        if (!result.ok) { await notify("Dynamic Fog rejected the door update. Relink this image and try again.", "ERROR"); return; }
        const rendered = await renderDoorImage(image.id, open);
        if (rendered !== "updated") await notify("The fog door changed, but DoorJam could not render the configured artwork.", "ERROR");
      },
    });
  }
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/unlink`, icons: [{ icon, label: "Unlink DoorJam Door", filter: configuredFilter }],
    onClick: async (context) => { const image = await selectedImage(context); if (!image) return; await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); }); await notify("DoorJam link removed. Dynamic Fog was not changed."); },
  });
  return () => { for (const id of ids) void OBR.contextMenu.remove(`${EXTENSION_ID}/context-menu/${id}`); };
}
