import type { Item } from "@owlbear-rodeo/sdk";
import { GENERATED_DOOR_METADATA_KEY } from "../constants";
import type { GeneratedDoorSpec, GeneratedDoorStyle, GeneratedDoorType } from "./types";
const types: GeneratedDoorType[] = ["single-swing", "double-swing", "single-slide", "double-slide", "trap"];
const styles: GeneratedDoorStyle[] = ["plain", "paneled", "planked"];
export function parseGeneratedDoorSpec(value: unknown): GeneratedDoorSpec | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !types.includes(data.type as GeneratedDoorType) || !styles.includes(data.style as GeneratedDoorStyle) || typeof data.width !== "number" || !Number.isFinite(data.width) || typeof data.color !== "string") return null;
  return { version: 1, type: data.type as GeneratedDoorType, style: data.style as GeneratedDoorStyle, width: data.width, ...(typeof data.thickness === "number" ? { thickness: data.thickness } : {}), ...(typeof data.depth === "number" ? { depth: data.depth } : {}), color: data.color, ...(data.hingeSide === "left" || data.hingeSide === "right" ? { hingeSide: data.hingeSide } : {}), ...(typeof data.openAngle === "number" ? { openAngle: data.openAngle } : {}), placementRotation: typeof data.placementRotation === "number" ? data.placementRotation : 0 };
}
export function readGeneratedDoorSpec(item: Item | undefined): GeneratedDoorSpec | null { return parseGeneratedDoorSpec(item?.metadata[GENERATED_DOOR_METADATA_KEY]); }
export function writeGeneratedDoorSpec(item: Item, spec: GeneratedDoorSpec) { item.metadata[GENERATED_DOOR_METADATA_KEY] = { ...spec, version: 1 }; }
