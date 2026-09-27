import type { DoorDetailMetrics, GeneratedDoorSpec } from "./types";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function getDoorDetailMetrics(spec: GeneratedDoorSpec, dpi: number): DoorDetailMetrics {
  const cross = spec.type === "trap" ? spec.depth ?? dpi : spec.thickness ?? dpi * 0.16;
  const inset = clamp(cross * 0.25, dpi * 0.04, dpi * 0.14);
  const trapPlankCount = Math.max(3, Math.round(spec.width / (dpi / 3)));
  return {
    strokeWidth: clamp(cross * 0.12, dpi * 0.018, dpi * 0.055),
    cornerRadius: clamp(cross * 0.22, dpi * 0.025, dpi * 0.09),
    hingeSize: clamp(cross * 0.32, dpi * 0.035, dpi * 0.11),
    handleSize: clamp(cross * 0.2, dpi * 0.025, dpi * 0.075),
    inset,
    targetPlankSpacing: spec.type === "trap" ? Math.max(1, (spec.width - inset * 2) / trapPlankCount) : clamp(dpi * 0.28, cross * 1.2, dpi * 0.55),
  };
}
export const clampDimension = (value: number, dpi: number) => clamp(Math.abs(value), Math.max(2, dpi * 0.04), dpi * 100);
