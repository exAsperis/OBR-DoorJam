import OBR, { buildPath, isPath, type Item, type Path } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY, GENERATED_DOOR_METADATA_KEY } from "../constants";
import { generateDoorGeometry } from "./geometry";
import { writeGeneratedDoorSpec } from "./metadata";
import type { GeneratedDoorSpec } from "./types";

export function generatedDoorName(type: GeneratedDoorSpec["type"], leaves: GeneratedDoorSpec["leaves"] = "single"): string {
  return type === "trap" ? leaves === "double" ? "DoorJam Double Trap Door" : "DoorJam Trap Door" : type === "slide" || type === "pocket" ? leaves === "double" ? "DoorJam Double Sliding Door" : "DoorJam Sliding Door" : leaves === "double" ? "DoorJam Double Door" : "DoorJam Door";
}
export function buildGeneratedDoorPath(spec: GeneratedDoorSpec, dpi: number, position = { x: 0, y: 0 }, rotation = spec.placementRotation, opacity = 1, id?: string): Path {
  const geometry = generateDoorGeometry(spec.type === "swing" ? { ...spec, openAngle: 0 } : spec, { dpi, open: false });
  const builder = buildPath(); if (id) builder.id(id);
  return builder.name(generatedDoorName(spec.type, spec.leaves)).commands(geometry.commands).fillRule(geometry.fillRule ?? "nonzero")
    .fillColor(geometry.fillColor).fillOpacity(opacity).strokeColor(geometry.strokeColor).strokeOpacity(opacity).strokeWidth(geometry.strokeWidth).strokeDash([])
    .position(position).rotation(rotation).scale({ x: 1, y: 1 }).layer("PROP")
    .metadata({ [GENERATED_DOOR_METADATA_KEY]: { ...spec, version: 1 }, [DOORJAM_METADATA_KEY]: { version: 4, renderedState: "closed" } }).build();
}
export async function createGeneratedDoor(spec: GeneratedDoorSpec, position: { x: number; y: number }, rotation: number, dpi: number): Promise<Path> {
  const path = buildGeneratedDoorPath({ ...spec, placementRotation: rotation }, dpi, position, rotation);
  await OBR.scene.items.addItems([path]); return path;
}
export function applyGeneratedDoorUpdate(item: Item, spec: GeneratedDoorSpec, dpi: number, updateRotation = false): boolean {
  if (!isPath(item)) return false;
  const doorMetadata = item.metadata[DOORJAM_METADATA_KEY]; const renderedOpen = Boolean(doorMetadata && typeof doorMetadata === "object" && (doorMetadata as { renderedState?: string }).renderedState === "open");
  applyGeneratedDoorGeometry(item, spec.type === "swing" && !renderedOpen ? { ...spec, openAngle: 0 } : spec, dpi, renderedOpen);
  item.name = generatedDoorName(spec.type, spec.leaves); item.scale = { x: 1, y: 1 };
  if (updateRotation) item.rotation = spec.placementRotation;
  writeGeneratedDoorSpec(item, spec);
  return true;
}
export function applyGeneratedDoorGeometry(item: Item, spec: GeneratedDoorSpec, dpi: number, open = false): boolean {
  if (!isPath(item)) return false; const geometry = generateDoorGeometry(spec, { dpi, open });
  item.commands = geometry.commands; item.style = { ...item.style, fillColor: geometry.fillColor, strokeColor: geometry.strokeColor, strokeWidth: geometry.strokeWidth };
  item.fillRule = geometry.fillRule ?? "nonzero"; return true;
}
export async function updateGeneratedDoor(itemId: string, spec: GeneratedDoorSpec, dpi: number, updateRotation = false): Promise<void> {
  await OBR.scene.items.updateItems([itemId], (items) => { if (items[0]) applyGeneratedDoorUpdate(items[0], spec, dpi, updateRotation); });
}
