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
export class GeneratedDoorScaleReconciler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private normalizing = new Set<string>();
  constructor(private readonly debounceMs = 150) {}
  observe(items: Item[], dpi: number) {
    for (const item of items) {
      const spec = readGeneratedDoorSpec(item); if (!spec || this.normalizing.has(item.id)) continue;
      if (Math.abs(item.scale.x - 1) < 0.0001 && Math.abs(item.scale.y - 1) < 0.0001) continue;
      const old = this.timers.get(item.id); if (old) clearTimeout(old);
      this.timers.set(item.id, setTimeout(() => void this.reconcile(item.id, dpi), this.debounceMs));
    }
  }
  async reconcile(itemId: string, dpi: number) {
    if (this.normalizing.has(itemId)) return; this.normalizing.add(itemId);
    try { await OBR.scene.items.updateItems([itemId], (items) => { const item = items[0]; const spec = readGeneratedDoorSpec(item); if (!item || !spec) return; applyGeneratedDoorUpdate(item, absorbScaleIntoSpec(spec, item.scale, dpi), dpi); }); }
    finally { this.normalizing.delete(itemId); this.timers.delete(itemId); }
  }
  cancel() { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.normalizing.clear(); }
  isNormalizing(id: string) { return this.normalizing.has(id); }
}
