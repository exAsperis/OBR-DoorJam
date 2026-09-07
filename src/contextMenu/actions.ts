import OBR, { isImage, type ContextMenuContext, type Image } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY, EXTENSION_ID } from "../constants";
import { chooseOpenArtwork } from "../doorJam/artwork";
import { doorStateErrorMessage, setLinkedDoorState } from "../doorJam/control";
import { linkNearestDoorAndChooseArtwork } from "../doorJam/linking";
import { removeDoorJamMetadata } from "../doorJam/metadata";

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

async function linkAndNotify(image: Image, relinking = false) {
  try {
    const result = await linkNearestDoorAndChooseArtwork(image);
    if (!result.ok) { await notify(result.message, "ERROR"); return; }
    if (result.artworkRequested && !result.artworkSet) {
      await notify(`${relinking ? "Link updated" : "Door linked"}. Choose Set Open Door Image to finish setup.`);
      return;
    }
    await notify(relinking ? "DoorJam link updated." : `Linked to nearest Dynamic Fog door (${Math.round(result.distance)}px away).`);
  } catch {
    await notify("DoorJam could not link this image. Check Dynamic Fog and try again.", "ERROR");
  }
}

export async function setupContextMenu(): Promise<() => void> {
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/link`, icons: [{ icon, label: "Link to Dynamic Fog Door", filter: { ...imageFilter, every: [...imageFilter.every, { key: ["metadata", DOORJAM_METADATA_KEY], value: undefined }] } }],
    onClick: async (context) => {
      const image = await selectedImage(context); if (!image) return;
      await linkAndNotify(image);
    },
  });
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/relink`, icons: [{ icon, label: "Relink Dynamic Fog Door", filter: configuredFilter }],
    onClick: async (context) => { const image = await selectedImage(context); if (!image) return; await linkAndNotify(image, true); },
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
        const result = await setLinkedDoorState(image.id, open);
        if (!result.ok) await notify(doorStateErrorMessage(result.reason), "ERROR");
      },
    });
  }
  await OBR.contextMenu.create({
    id: `${EXTENSION_ID}/context-menu/unlink`, icons: [{ icon, label: "Unlink DoorJam Door", filter: configuredFilter }],
    onClick: async (context) => { const image = await selectedImage(context); if (!image) return; await OBR.scene.items.updateItems([image.id], (items) => { if (items[0]) removeDoorJamMetadata(items[0]); }); await notify("DoorJam link removed. Dynamic Fog was not changed."); },
  });
  return () => { for (const id of ids) void OBR.contextMenu.remove(`${EXTENSION_ID}/context-menu/${id}`); };
}
