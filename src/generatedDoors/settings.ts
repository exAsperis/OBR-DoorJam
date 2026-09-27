import OBR from "@owlbear-rodeo/sdk";
import { GENERATED_DOOR_SETTINGS_KEY } from "../constants";
import { DEFAULT_GENERATED_DOOR_SPEC, type GeneratedDoorSpec } from "./types";
import { parseGeneratedDoorSpec } from "./metadata";

export function readGeneratedDoorSettings(metadata: Record<string, unknown>): GeneratedDoorSpec {
  const stored = parseGeneratedDoorSpec(metadata[GENERATED_DOOR_SETTINGS_KEY]);
  if (!stored) return { ...DEFAULT_GENERATED_DOOR_SPEC };
  const legacyDefaults = stored.type === "single-swing" && stored.style === "plain" && stored.width === 100 && stored.thickness === 18 && stored.openAngle === 0 && stored.color.toLowerCase() === "#8b5a2b";
  return legacyDefaults ? { ...stored, thickness: 25, openAngle: 90 } : stored;
}
export async function getGeneratedDoorSettings() { return readGeneratedDoorSettings(await OBR.player.getMetadata()); }
export async function setGeneratedDoorSettings(spec: GeneratedDoorSpec) { await OBR.player.setMetadata({ [GENERATED_DOOR_SETTINGS_KEY]: spec }); }
