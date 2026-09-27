import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { applyGeneratedDoorUpdate } from "./createGeneratedDoor";
import { readGeneratedDoorSpec } from "./metadata";
import { clampDimension } from "./metrics";
import type { GeneratedDoorSpec } from "./types";

export function absorbScaleIntoSpec(spec: GeneratedDoorSpec, scale: { x: number; y: number }, dpi: number): GeneratedDoorSpec {
  return spec.type === "trap"
    ? { ...spec, width: clampDimension(spec.width * Math.abs(scale.x), dpi), depth: clampDimension((spec.depth ?? dpi) * Math.abs(scale.y), dpi) }
    : { ...spec, width: clampDimension(spec.width * Math.abs(scale.x), dpi), thickness: clampDimension((spec.thickness ?? dpi * 0.16) * Math.abs(scale.y), dpi) };
}
const isUnitScale = (scale: { x: number; y: number }) => Math.abs(scale.x - 1) < 0.0001 && Math.abs(scale.y - 1) < 0.0001;
const sameScale = (left: { x: number; y: number }, right: { x: number; y: number }) => Math.abs(left.x - right.x) < 0.0001 && Math.abs(left.y - right.y) < 0.0001;

export function reconcileGeneratedDoorItem(item: Item, dpi: number): boolean {
  const spec = readGeneratedDoorSpec(item);
  if (!spec || isUnitScale(item.scale)) return false;
  return applyGeneratedDoorUpdate(item, absorbScaleIntoSpec(spec, item.scale, dpi), dpi);
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
      const current = { x: item.scale.x, y: item.scale.y };
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
