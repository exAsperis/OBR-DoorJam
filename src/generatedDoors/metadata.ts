import type { Item } from "@owlbear-rodeo/sdk";
import { GENERATED_DOOR_METADATA_KEY } from "../constants";
import type { GeneratedDoorLeaves, GeneratedDoorSpec, GeneratedDoorStyle, GeneratedDoorType } from "./types";
const types: GeneratedDoorType[] = ["swing", "slide", "pocket", "trap"];
const styles: GeneratedDoorStyle[] = ["plain", "paneled", "planked"];
export function parseGeneratedDoorSpec(value: unknown): GeneratedDoorSpec | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const legacyType = typeof data.type === "string" ? data.type : ""; const legacyPocket = data.style === "pocket" && (legacyType === "single-slide" || legacyType === "double-slide");
  const migratedType: GeneratedDoorType | null = legacyPocket ? "pocket" : legacyType === "single-swing" || legacyType === "double-swing" ? "swing" : legacyType === "single-slide" || legacyType === "double-slide" ? "slide" : types.includes(legacyType as GeneratedDoorType) ? legacyType as GeneratedDoorType : null;
  const migratedLeaves: GeneratedDoorLeaves = data.leaves === "double" || legacyType.startsWith("double-") ? "double" : "single";
  if (data.version !== 1 || !migratedType || (!legacyPocket && !styles.includes(data.style as GeneratedDoorStyle)) || typeof data.width !== "number" || !Number.isFinite(data.width) || typeof data.color !== "string") return null;
  return { version: 1, type: migratedType, leaves: migratedLeaves, style: legacyPocket ? "plain" : data.style as GeneratedDoorStyle, width: data.width, ...(typeof data.thickness === "number" ? { thickness: data.thickness } : {}), ...(typeof data.depth === "number" ? { depth: data.depth } : {}), color: data.color, ...(data.hingeSide === "left" || data.hingeSide === "right" ? { hingeSide: data.hingeSide } : {}), ...(typeof data.openAngle === "number" ? { openAngle: data.openAngle } : {}), ...(typeof data.showKnob === "boolean" ? { showKnob: data.showKnob } : {}), placementRotation: typeof data.placementRotation === "number" ? data.placementRotation : 0 };
}
export function readGeneratedDoorSpec(item: Item | undefined): GeneratedDoorSpec | null { return parseGeneratedDoorSpec(item?.metadata[GENERATED_DOOR_METADATA_KEY]); }
export function writeGeneratedDoorSpec(item: Item, spec: GeneratedDoorSpec) { item.metadata[GENERATED_DOOR_METADATA_KEY] = { ...spec, version: 1 }; }
