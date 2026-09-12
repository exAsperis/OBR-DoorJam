import OBR, { isImage } from "@owlbear-rodeo/sdk";
import { DOORJAM_OPERATE_CHANNEL } from "../constants";
import { getDoorState, setDoorState } from "../dynamicFog/adapter";
import { renderDoorImage } from "./artwork";
import { readDoorJamMetadata } from "./metadata";
import { getDoorJamSettings } from "./settings";

export type DoorStateCommandResult =
  | { ok: true }
  | { ok: false; reason: "invalid-image" | "invalid-link" | "missing-open-artwork" | "locked" | "player-operation-disabled" | "update-failed" | "render-failed" };

async function playerMayOperate(locked: boolean): Promise<DoorStateCommandResult | null> {
  if (await OBR.player.getRole() === "GM") return null;
  if (locked) return { ok: false, reason: "locked" };
  if (!(await getDoorJamSettings()).playersCanOperate) return { ok: false, reason: "player-operation-disabled" };
  return null;
}

async function operateLocally(imageId: string, open: boolean, enforcePlayerPolicy: boolean): Promise<DoorStateCommandResult> {
  const image = (await OBR.scene.items.getItems([imageId]))[0];
  if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
  const metadata = readDoorJamMetadata(image);
  if (!metadata) return { ok: false, reason: "invalid-link" };
  if (enforcePlayerPolicy) {
    if (metadata.locked === true) return { ok: false, reason: "locked" };
    if (!(await getDoorJamSettings()).playersCanOperate) return { ok: false, reason: "player-operation-disabled" };
  }
  if (open && !metadata.openImage) return { ok: false, reason: "missing-open-artwork" };
  if (metadata.fogDoor) {
    const current = await getDoorState(metadata.fogDoor);
    if (current.ok && !(await setDoorState(metadata.fogDoor, open)).ok) return { ok: false, reason: "update-failed" };
  }
  return await renderDoorImage(image.id, open) === "updated" ? { ok: true } : { ok: false, reason: "render-failed" };
}

export async function setLinkedDoorState(imageId: string, open: boolean): Promise<DoorStateCommandResult> {
  try {
    const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return { ok: false, reason: "invalid-link" };
    const denied = await playerMayOperate(metadata.locked === true);
    if (denied) return denied;
    if (await OBR.player.getRole() === "PLAYER") {
      await OBR.broadcast.sendMessage(DOORJAM_OPERATE_CHANNEL, { imageId, open }, { destination: "REMOTE" });
      return { ok: true };
    }
    return operateLocally(imageId, open, false);
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
    const denied = await playerMayOperate(metadata.locked === true);
    if (denied) return denied;
    if (metadata.fogDoor) {
      const current = await getDoorState(metadata.fogDoor);
      if (current.ok) return setLinkedDoorState(imageId, !current.door.open);
    }
    return setLinkedDoorState(imageId, metadata.renderedState !== "open");
  } catch {
    return { ok: false, reason: "update-failed" };
  }
}

export async function handlePlayerDoorOperation(imageId: string, open?: boolean): Promise<DoorStateCommandResult> {
  try {
    const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return { ok: false, reason: "invalid-link" };
    const desired = typeof open === "boolean" ? open : metadata.renderedState !== "open";
    return operateLocally(imageId, desired, true);
  } catch {
    return { ok: false, reason: "update-failed" };
  }
}

export function doorStateErrorMessage(reason: Exclude<DoorStateCommandResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "invalid-image": return "The DoorJam image no longer exists.";
    case "invalid-link": return "This image is not configured as a DoorJam door.";
    case "missing-open-artwork": return "Set the open door image first.";
    case "locked": return "This door is locked by the GM.";
    case "player-operation-disabled": return "The GM has disabled player door operation for this scene.";
    case "render-failed": return "DoorJam could not render this door's artwork.";
    default: return "Dynamic Fog could not update this door. Try relinking it.";
  }
}
