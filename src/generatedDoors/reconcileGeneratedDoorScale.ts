import OBR, { Command, isPath, type Item, type PathCommand } from "@owlbear-rodeo/sdk";
import { DOORJAM_METADATA_KEY } from "../constants";
import { applyGeneratedDoorUpdate } from "./createGeneratedDoor";
import { generateDoorGeometry } from "./geometry";
import { readGeneratedDoorSpec } from "./metadata";
import { clampDimension } from "./metrics";
import type { GeneratedDoorSpec } from "./types";

export function absorbScaleIntoSpec(spec: GeneratedDoorSpec, scale: { x: number; y: number }, dpi: number): GeneratedDoorSpec {
  return spec.type === "trap"
    ? { ...spec, width: clampDimension(spec.width * Math.abs(scale.x), dpi), depth: clampDimension((spec.depth ?? dpi) * Math.abs(scale.y), dpi) }
    : { ...spec, width: clampDimension(spec.width * Math.abs(scale.x), dpi), thickness: clampDimension((spec.thickness ?? dpi * 0.16) * Math.abs(scale.y), dpi) };
}
const isUnitScale = (scale: { x: number; y: number }) => Math.abs(scale.x - 1) < 0.001 && Math.abs(scale.y - 1) < 0.001;
const sameScale = (left: { x: number; y: number }, right: { x: number; y: number }) => Math.abs(left.x - right.x) < 0.0001 && Math.abs(left.y - right.y) < 0.0001;
const COLLAPSED_SCALE_EPSILON = 0.001;

/**
 * A zero scale is also used by extensions such as Stage Manager to hide an
 * item temporarily. It is not a meaningful generated-door dimension.
 */
export function isCollapsedGeneratedDoorScale(scale: { x: number; y: number }) {
  return Math.abs(scale.x) < COLLAPSED_SCALE_EPSILON || Math.abs(scale.y) < COLLAPSED_SCALE_EPSILON;
}

function commandBounds(commands: PathCommand[]) {
  const points: Array<{ x: number; y: number }> = [];
  for (const command of commands) {
    const count = command[0] === Command.CUBIC ? 6 : command[0] === Command.QUAD || command[0] === Command.CONIC ? 4 : command[0] === Command.MOVE || command[0] === Command.LINE ? 2 : 0;
    for (let index = 1; index <= count; index += 2) points.push({ x: command[index] as number, y: command[index + 1] as number });
  }
  if (!points.length) return null;
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { width: maxX - minX, height: maxY - minY, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } };
}

function renderedGeometry(item: Item, spec: GeneratedDoorSpec, dpi: number) {
  const doorMetadata = item.metadata[DOORJAM_METADATA_KEY];
  const open = Boolean(doorMetadata && typeof doorMetadata === "object" && (doorMetadata as { renderedState?: string }).renderedState === "open");
  const renderSpec = spec.type === "swing" && !open ? { ...spec, openAngle: 0 } : spec;
  return generateDoorGeometry(renderSpec, { dpi, open });
}

export function detectGeneratedDoorScale(item: Item, spec: GeneratedDoorSpec, dpi: number) {
  const nativeScale = { x: Math.abs(item.scale.x), y: Math.abs(item.scale.y) };
  if (!isPath(item)) return nativeScale;
  const expected = commandBounds(renderedGeometry(item, spec, dpi).commands);
  const actual = commandBounds(item.commands);
  if (!expected || !actual || expected.width <= 0 || expected.height <= 0) return nativeScale;
  return { x: nativeScale.x * actual.width / expected.width, y: nativeScale.y * actual.height / expected.height };
}

export function reconcileGeneratedDoorItem(item: Item, dpi: number): boolean {
  const spec = readGeneratedDoorSpec(item);
  if (!spec) return false;
  if (isCollapsedGeneratedDoorScale(item.scale)) return false;
  const effectiveScale = detectGeneratedDoorScale(item, spec, dpi);
  if (isUnitScale(effectiveScale)) return false;
  const nextSpec = absorbScaleIntoSpec(spec, effectiveScale, dpi);
  if (isPath(item)) {
    const currentBounds = commandBounds(item.commands);
    const nextBounds = commandBounds(renderedGeometry(item, nextSpec, dpi).commands);
    if (currentBounds && nextBounds) {
      const localDelta = {
        x: currentBounds.center.x * item.scale.x - nextBounds.center.x,
        y: currentBounds.center.y * item.scale.y - nextBounds.center.y,
      };
      const radians = item.rotation * Math.PI / 180;
      item.position = {
        x: item.position.x + localDelta.x * Math.cos(radians) - localDelta.y * Math.sin(radians),
        y: item.position.y + localDelta.x * Math.sin(radians) + localDelta.y * Math.cos(radians),
      };
    }
  }
  return applyGeneratedDoorUpdate(item, nextSpec, dpi);
}
export class GeneratedDoorScaleReconciler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private normalizing = new Set<string>();
  private previousScales = new Map<string, { x: number; y: number }>();
  constructor(private readonly debounceMs = 150) {}
  observe(items: Item[], dpi: number) {
    const present = new Set(items.map((item) => item.id));
    for (const id of this.previousScales.keys()) if (!present.has(id)) { this.previousScales.delete(id); this.clearTimer(id); }
    for (const item of items) {
      const spec = readGeneratedDoorSpec(item);
      if (!spec) continue;
      if (isCollapsedGeneratedDoorScale(item.scale)) {
        this.previousScales.set(item.id, { x: Math.abs(item.scale.x), y: Math.abs(item.scale.y) });
        this.clearTimer(item.id);
        continue;
      }
      const current = detectGeneratedDoorScale(item, spec, dpi);
      const previous = this.previousScales.get(item.id);
      this.previousScales.set(item.id, current);
      if (this.normalizing.has(item.id)) continue;
      if (isUnitScale(current)) { this.clearTimer(item.id); continue; }
      if (previous && sameScale(previous, current) && this.timers.has(item.id)) continue;
      this.clearTimer(item.id);
      this.timers.set(item.id, setTimeout(() => { void this.reconcile(item.id, dpi).catch(() => undefined); }, this.debounceMs));
    }
  }
  async reconcile(itemId: string, dpi: number) {
    if (this.normalizing.has(itemId)) return; this.normalizing.add(itemId);
    try { await OBR.scene.items.updateItems([itemId], (items) => { const item = items[0]; if (item && reconcileGeneratedDoorItem(item, dpi)) this.previousScales.set(itemId, { x: 1, y: 1 }); }); }
    finally { this.normalizing.delete(itemId); this.timers.delete(itemId); }
  }
  private clearTimer(id: string) { const timer = this.timers.get(id); if (timer) clearTimeout(timer); this.timers.delete(id); }
  cancel() { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.normalizing.clear(); this.previousScales.clear(); }
  isNormalizing(id: string) { return this.normalizing.has(id); }
}
