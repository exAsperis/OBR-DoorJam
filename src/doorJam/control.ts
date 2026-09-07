import OBR, { isImage } from "@owlbear-rodeo/sdk";
import { getDoorState, setDoorState } from "../dynamicFog/adapter";
import { renderDoorImage } from "./artwork";
import { readDoorJamMetadata } from "./metadata";

export type DoorStateCommandResult =
  | { ok: true }
  | { ok: false; reason: "invalid-image" | "invalid-link" | "missing-open-artwork" | "update-failed" | "render-failed" };

export async function setLinkedDoorState(imageId: string, open: boolean): Promise<DoorStateCommandResult> {
  try {
    const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return { ok: false, reason: "invalid-link" };
    if (open && !metadata.openImage) return { ok: false, reason: "missing-open-artwork" };
    if (!(await getDoorState(metadata.fogDoor)).ok) return { ok: false, reason: "invalid-link" };
    if (!(await setDoorState(metadata.fogDoor, open)).ok) return { ok: false, reason: "update-failed" };
    return await renderDoorImage(image.id, open) === "updated" ? { ok: true } : { ok: false, reason: "render-failed" };
  } catch {
    return { ok: false, reason: "update-failed" };
  }
}

export async function toggleLinkedDoorState(imageId: string): Promise<DoorStateCommandResult> {
  try {
    const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return { ok: false, reason: "invalid-link" };
    const current = await getDoorState(metadata.fogDoor);
    if (!current.ok) return { ok: false, reason: "invalid-link" };
    return setLinkedDoorState(imageId, !current.door.open);
  } catch {
    return { ok: false, reason: "update-failed" };
  }
}

export function doorStateErrorMessage(reason: Exclude<DoorStateCommandResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "invalid-image": return "The DoorJam image no longer exists.";
    case "invalid-link": return "The linked Dynamic Fog door is no longer valid. Relink this image.";
    case "missing-open-artwork": return "Set the open door image first.";
    case "render-failed": return "The fog door changed, but DoorJam could not render its artwork.";
    default: return "Dynamic Fog could not update this door. Try relinking it.";
  }
}
