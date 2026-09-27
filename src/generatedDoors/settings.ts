import OBR from "@owlbear-rodeo/sdk";
import { GENERATED_DOOR_SETTINGS_KEY } from "../constants";
import { DEFAULT_GENERATED_DOOR_SPEC, type GeneratedDoorSpec } from "./types";
import { parseGeneratedDoorSpec } from "./metadata";

export function readGeneratedDoorSettings(metadata: Record<string, unknown>, dpi = 100): GeneratedDoorSpec {
  const raw = metadata[GENERATED_DOOR_SETTINGS_KEY];
  const stored = parseGeneratedDoorSpec(raw);
  if (!stored) return { ...DEFAULT_GENERATED_DOOR_SPEC, width: dpi, thickness: dpi * 0.25 };
  const sourceDpi = raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).settingsDpi === "number"
    ? (raw as Record<string, number>).settingsDpi
    : 100;
  const ratio = sourceDpi > 0 ? dpi / sourceDpi : 1;
  const scaled = ratio === 1 ? stored : {
    ...stored,
    width: stored.width * ratio,
    ...(stored.thickness !== undefined ? { thickness: stored.thickness * ratio } : {}),
    ...(stored.depth !== undefined ? { depth: stored.depth * ratio } : {}),
  };
  const legacyDefaults = stored.type === "swing" && stored.leaves === "single" && stored.style === "plain" && stored.width === 100 && stored.thickness === 18 && stored.openAngle === 0 && stored.color.toLowerCase() === "#8b5a2b";
  return legacyDefaults ? { ...scaled, thickness: dpi * 0.25, openAngle: 90 } : scaled;
}
export async function getGeneratedDoorSettings(dpi = 100) { return readGeneratedDoorSettings(await OBR.player.getMetadata(), dpi); }
export async function setGeneratedDoorSettings(spec: GeneratedDoorSpec, dpi = 100) { await OBR.player.setMetadata({ [GENERATED_DOOR_SETTINGS_KEY]: { ...spec, settingsDpi: dpi } }); }
