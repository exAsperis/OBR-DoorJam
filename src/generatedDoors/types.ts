import type { PathCommand } from "@owlbear-rodeo/sdk";

export type GeneratedDoorType = "single-swing" | "double-swing" | "single-slide" | "double-slide" | "trap";
export type GeneratedDoorStyle = "plain" | "paneled" | "planked";
export interface GeneratedDoorSpec {
  version: 1; type: GeneratedDoorType; style: GeneratedDoorStyle; width: number;
  thickness?: number; depth?: number; color: string; hingeSide?: "left" | "right";
  openAngle?: number; placementRotation: number;
}
export interface DoorRenderContext { dpi: number }
export interface GeneratedDoorGeometry { commands: PathCommand[]; fillColor: string; strokeColor: string; strokeWidth: number; fillRule?: "nonzero" | "evenodd" }
export interface DoorDetailMetrics { strokeWidth: number; cornerRadius: number; hingeSize: number; handleSize: number; inset: number; targetPlankSpacing: number }

export const DEFAULT_GENERATED_DOOR_SPEC: GeneratedDoorSpec = {
  version: 1, type: "single-swing", style: "plain", width: 100, thickness: 25,
  color: "#8b5a2b", hingeSide: "left", openAngle: 90, placementRotation: 0,
};
