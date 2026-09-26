import OBR, { type Metadata } from "@owlbear-rodeo/sdk";
import { DOORJAM_TOOL_PREFERENCES_KEY } from "../constants";

export interface DoorJamToolPreferences {
  dynamicFog: boolean;
  smoke: boolean;
}

export const DEFAULT_TOOL_PREFERENCES: DoorJamToolPreferences = { dynamicFog: true, smoke: true };

export function readToolPreferences(metadata: Metadata): DoorJamToolPreferences {
  const value = metadata[DOORJAM_TOOL_PREFERENCES_KEY];
  if (!value || typeof value !== "object") return { ...DEFAULT_TOOL_PREFERENCES };
  const stored = value as { dynamicFog?: unknown; smoke?: unknown };
  return {
    dynamicFog: stored.dynamicFog !== false,
    smoke: stored.smoke !== false,
  };
}

export async function getToolPreferences(): Promise<DoorJamToolPreferences> {
  return readToolPreferences(await OBR.player.getMetadata());
}

export async function setToolPreferences(preferences: DoorJamToolPreferences): Promise<void> {
  await OBR.player.setMetadata({ [DOORJAM_TOOL_PREFERENCES_KEY]: preferences });
}
