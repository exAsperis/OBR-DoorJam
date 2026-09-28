import type { PathCommand } from "@owlbear-rodeo/sdk";

export type GeneratedDoorType = "swing" | "slide" | "pocket" | "trap";
export type GeneratedDoorLeaves = "single" | "double";
export type GeneratedDoorStyle = "plain" | "paneled" | "planked" | "reinforced" | "bars";
export interface GeneratedDoorSpec {
  version: 1; type: GeneratedDoorType; leaves: GeneratedDoorLeaves; style: GeneratedDoorStyle; width: number;
  thickness?: number; depth?: number; color: string; hingeSide?: "left" | "right";
  openAngle?: number; opensToward?: "left" | "right"; openWidth?: number; showKnob?: boolean; placementRotation: number;
}
export interface DoorRenderContext { dpi: number; open?: boolean }
export interface GeneratedDoorGeometry { commands: PathCommand[]; fillColor: string; strokeColor: string; strokeWidth: number; fillRule?: "nonzero" | "evenodd" }
export interface DoorDetailMetrics { strokeWidth: number; cornerRadius: number; hingeSize: number; handleSize: number; inset: number; targetPlankSpacing: number }

export const DEFAULT_GENERATED_DOOR_SPEC: GeneratedDoorSpec = {
  version: 1, type: "swing", leaves: "single", style: "plain", width: 100, thickness: 25,
  color: "#8b5a2b", hingeSide: "left", openAngle: 90, opensToward: "right", openWidth: 100, showKnob: false, placementRotation: 0,
};
