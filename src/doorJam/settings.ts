import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import { DOORJAM_SETTINGS_KEY } from "../constants";

export interface DoorJamSceneSettings { playersCanOperate: boolean }

export function readDoorJamSettings(metadata: Metadata): DoorJamSceneSettings {
  const value = metadata[DOORJAM_SETTINGS_KEY];
  if (!value || typeof value !== "object") return { playersCanOperate: true };
  return { playersCanOperate: (value as { playersCanOperate?: unknown }).playersCanOperate !== false };
}

export async function getDoorJamSettings(): Promise<DoorJamSceneSettings> {
  if (!(await OBR.scene.isReady())) return { playersCanOperate: true };
  return readDoorJamSettings(await OBR.scene.getMetadata());
}

export async function setPlayersCanOperate(playersCanOperate: boolean): Promise<boolean> {
  if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) return false;
  await OBR.scene.setMetadata({ [DOORJAM_SETTINGS_KEY]: { playersCanOperate } });
  return true;
}
