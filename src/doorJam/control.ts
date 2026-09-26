import OBR, { isImage } from "@owlbear-rodeo/sdk";
import { DOORJAM_OPERATE_CHANNEL } from "../constants";
import { setStageManagerElevatorDisabled } from "../stageManager/adapter";
import { renderDoorImage } from "./artwork";
import { readDoorJamMetadata, type DoorLinkKind } from "./metadata";
import { setDynamicFogDoorState, setSmokeLinkedDoorState } from "./providers";
import { getDoorJamSettings } from "./settings";
import { withDoorSynchronizationSuppressed } from "./synchronization";

export interface DoorIntegrationWarning { integration: DoorLinkKind; message: string }
export type DoorStateCommandResult =
  | { ok: true; warnings?: DoorIntegrationWarning[] }
  | { ok: false; reason: "invalid-image" | "invalid-link" | "missing-open-artwork" | "locked" | "player-operation-disabled" | "update-failed" | "render-failed"; warnings?: DoorIntegrationWarning[] };

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
  return withDoorSynchronizationSuppressed(image.id, async () => {
  if (await renderDoorImage(image.id, open) !== "updated") return { ok: false, reason: "render-failed" } as DoorStateCommandResult;
  const updates: Array<Promise<{ kind: DoorLinkKind; ok: boolean; message?: string }>> = [];
  const guarded = async (kind: DoorLinkKind, update: () => Promise<{ ok: boolean; reason?: string; message?: string }>) => {
    try {
      const result = await update();
      return { kind, ok: result.ok, message: result.message ?? result.reason };
    } catch (error) {
      return { kind, ok: false, message: error instanceof Error ? error.message : "update failed" };
    }
  };
  if (metadata.links?.dynamicFog) updates.push(guarded("dynamicFog", () => setDynamicFogDoorState(metadata.links!.dynamicFog!, open)));
  if (metadata.links?.smoke) updates.push(guarded("smoke", () => setSmokeLinkedDoorState(metadata.links!.smoke!, open)));
  for (const itemId of metadata.links?.stageManager?.itemIds ?? [])
    updates.push(guarded("stageManager", () => setStageManagerElevatorDisabled(itemId, !open)));
  const results = await Promise.all(updates);
  const warnings = results.flatMap((result) => result.ok ? [] : [{
    integration: result.kind,
    message: result.message ?? "The linked integration could not be synchronized.",
  }]);
  return warnings.length ? { ok: true, warnings } : { ok: true };
  });
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
  } catch { return { ok: false, reason: "update-failed" }; }
}

export async function toggleLinkedDoorState(imageId: string): Promise<DoorStateCommandResult> {
  try {
    const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return { ok: false, reason: "invalid-link" };
    return setLinkedDoorState(imageId, metadata.renderedState !== "open");
  } catch { return { ok: false, reason: "update-failed" }; }
}

export async function handlePlayerDoorOperation(imageId: string, open?: boolean): Promise<DoorStateCommandResult> {
  try {
    const image = (await OBR.scene.items.getItems([imageId]))[0];
    if (!image || !isImage(image)) return { ok: false, reason: "invalid-image" };
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return { ok: false, reason: "invalid-link" };
    return operateLocally(imageId, typeof open === "boolean" ? open : metadata.renderedState !== "open", true);
  } catch { return { ok: false, reason: "update-failed" }; }
}

export function doorStateErrorMessage(reason: Exclude<DoorStateCommandResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "invalid-image": return "The DoorJam image no longer exists.";
    case "invalid-link": return "This image is not configured as a DoorJam door.";
    case "missing-open-artwork": return "Set the open door image first.";
    case "locked": return "This door is locked.";
    case "player-operation-disabled": return "The GM has disabled player door operation for this scene.";
    case "render-failed": return "DoorJam could not render this door's artwork.";
    default: return "DoorJam could not update this door.";
  }
}
