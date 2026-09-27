import { Command, type PathCommand } from "@owlbear-rodeo/sdk";
import { deriveDoorStrokeColor } from "./colors";
import { getDoorDetailMetrics } from "./metrics";
import type { DoorDetailMetrics, DoorRenderContext, GeneratedDoorGeometry, GeneratedDoorSpec } from "./types";

export function appendRect(out: PathCommand[], x: number, y: number, width: number, height: number) {
  out.push([Command.MOVE, x, y], [Command.LINE, x + width, y], [Command.LINE, x + width, y + height], [Command.LINE, x, y + height], [Command.CLOSE]);
}
export function appendRectCounterClockwise(out: PathCommand[], x: number, y: number, width: number, height: number) {
  out.push([Command.MOVE, x, y], [Command.LINE, x, y + height], [Command.LINE, x + width, y + height], [Command.LINE, x + width, y], [Command.CLOSE]);
}
export function appendRoundedRect(out: PathCommand[], x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  out.push([Command.MOVE, x + r, y], [Command.LINE, x + width - r, y], [Command.QUAD, x + width, y, x + width, y + r], [Command.LINE, x + width, y + height - r], [Command.QUAD, x + width, y + height, x + width - r, y + height], [Command.LINE, x + r, y + height], [Command.QUAD, x, y + height, x, y + height - r], [Command.LINE, x, y + r], [Command.QUAD, x, y, x + r, y], [Command.CLOSE]);
}
export function appendLine(out: PathCommand[], x1: number, y1: number, x2: number, y2: number) { out.push([Command.MOVE, x1, y1], [Command.LINE, x2, y2]); }
export function appendCircleOrRing(out: PathCommand[], cx: number, cy: number, r: number) {
  const k = 0.55228475 * r;
  out.push([Command.MOVE, cx + r, cy], [Command.CUBIC, cx + r, cy + k, cx + k, cy + r, cx, cy + r], [Command.CUBIC, cx - k, cy + r, cx - r, cy + k, cx - r, cy], [Command.CUBIC, cx - r, cy - k, cx - k, cy - r, cx, cy - r], [Command.CUBIC, cx + k, cy - r, cx + r, cy - k, cx + r, cy], [Command.CLOSE]);
}
export function appendPanel(out: PathCommand[], x: number, y: number, width: number, height: number, inset: number) { appendRoundedRect(out, x + inset, y + inset, width - inset * 2, height - inset * 2, inset * 0.45); }
export function appendPlankLines(out: PathCommand[], x: number, y: number, width: number, height: number, target: number) {
  const count = Math.max(1, Math.round(Math.abs(width) / target));
  for (let index = 1; index < count; index += 1) appendLine(out, x + width * index / count, y, x + width * index / count, y + height);
}
export function appendHingeMarks(out: PathCommand[], x: number, y: number, thickness: number, metrics: DoorDetailMetrics) {
  appendCircleOrRing(out, x, y, Math.max(metrics.strokeWidth, thickness / 2));
}
export function appendTrapHingeMarks(out: PathCommand[], x: number, y: number, depth: number, metrics: DoorDetailMetrics) {
  appendLine(out, x, y - Math.min(depth / 2, metrics.hingeSize), x, y + Math.min(depth / 2, metrics.hingeSize));
  appendCircleOrRing(out, x, y, metrics.hingeSize * 0.28);
}
export function appendHandleMark(out: PathCommand[], x: number, y: number, metrics: DoorDetailMetrics) { appendCircleOrRing(out, x, y, metrics.handleSize); }

function decorate(out: PathCommand[], spec: GeneratedDoorSpec, x: number, y: number, width: number, height: number, m: DoorDetailMetrics) {
  if (spec.style === "planked") appendPlankLines(out, x, y, width, height, m.targetPlankSpacing);
  if (spec.style === "paneled") {
    const halves = width > m.targetPlankSpacing * 2.2 ? 2 : 1;
    for (let i = 0; i < halves; i += 1) appendPanel(out, x + width * i / halves, y, width / halves, height, m.inset);
  }
}
function rotatedPoint(hx: number, angle: number, length: number, openDirection: number) { const sign = hx < 0 ? 1 : -1; return { x: hx + sign * length * Math.cos(angle), y: openDirection * length * Math.sin(angle) }; }
function appendSwingLeaf(out: PathCommand[], hingeX: number, length: number, thickness: number, angleDeg: number, m: DoorDetailMetrics, spec: GeneratedDoorSpec, openDirection = hingeX < 0 ? 1 : -1) {
  const angle = angleDeg * Math.PI / 180; const sign = hingeX < 0 ? 1 : -1;
  const ux = sign * Math.cos(angle), uy = openDirection * Math.sin(angle), nx = -uy, ny = ux;
  const half = thickness / 2; const end = { x: hingeX + ux * length, y: uy * length }; const slabStart = { x: hingeX + ux * half, y: uy * half };
  const points = [{ x: slabStart.x + nx * half, y: slabStart.y + ny * half }, { x: end.x + nx * half, y: end.y + ny * half }, { x: end.x - nx * half, y: end.y - ny * half }, { x: slabStart.x - nx * half, y: slabStart.y - ny * half }];
  out.push([Command.MOVE, points[0].x, points[0].y], ...points.slice(1).map((p) => [Command.LINE, p.x, p.y] as PathCommand), [Command.CLOSE]);
  if (spec.style === "planked") { const count = Math.max(1, Math.round(length / m.targetPlankSpacing)); for (let i = 1; i < count; i++) { const p = rotatedPoint(hingeX, angle, length * i / count, openDirection); appendLine(out, p.x + nx * half, p.y + ny * half, p.x - nx * half, p.y - ny * half); } }
  appendHingeMarks(out, hingeX, 0, thickness, m);
  if (spec.showKnob) { const knob = { x: end.x - ux * m.inset, y: end.y - uy * m.inset }; const offset = half + m.handleSize; appendHandleMark(out, knob.x + nx * offset, knob.y + ny * offset, m); appendHandleMark(out, knob.x - nx * offset, knob.y - ny * offset, m); }
}
export function generateSingleSwingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const side = spec.hingeSide ?? "left"; appendSwingLeaf(out, side === "left" ? -spec.width / 2 : spec.width / 2, spec.width, spec.thickness!, spec.openAngle ?? 0, m, spec); return out; }
export function generateDoubleSwingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const gap = Math.min(m.inset * 0.35, spec.width * 0.03); const leaf = spec.width / 2 - gap / 2; appendSwingLeaf(out, -spec.width / 2, leaf, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); appendSwingLeaf(out, spec.width / 2, leaf, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); return out; }
export function generateSingleSlidingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const t = spec.thickness!; const offset = open ? spec.width : 0; appendLine(out, -spec.width / 2, -t / 2 - m.inset, spec.width * 1.5, -t / 2 - m.inset); appendRoundedRect(out, -spec.width / 2 + offset, -t / 2, spec.width, t, m.cornerRadius); decorate(out, spec, -spec.width / 2 + offset, -t / 2, spec.width, t, m); return out; }
export function generateDoubleSlidingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const t = spec.thickness!; const half = spec.width / 2; const leftX = -spec.width / 2 - (open ? half : 0), rightX = open ? spec.width / 2 : 0; appendLine(out, -spec.width, -t / 2 - m.inset, spec.width, -t / 2 - m.inset); appendRoundedRect(out, leftX, -t / 2, half, t, m.cornerRadius); decorate(out, spec, leftX, -t / 2, half, t, m); appendRoundedRect(out, rightX, -t / 2, half, t, m.cornerRadius); decorate(out, spec, rightX, -t / 2, half, t, m); return out; }
export function generateTrapDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const d = spec.depth!; appendRoundedRect(out, -spec.width / 2, -d / 2, spec.width, d, m.cornerRadius); const x = -spec.width / 2 + m.inset, y = -d / 2 + m.inset, w = spec.width - m.inset * 2, h = d - m.inset * 2; if (open) { appendRectCounterClockwise(out, x, y, w, h); const edge = Math.max(m.strokeWidth * 2, Math.min(h, m.inset)); appendRect(out, x, y, w, edge); } else { appendLine(out, x, y, x + w, y); appendLine(out, x + w, y, x + w, y + h); appendLine(out, x + w, y + h, x, y + h); appendLine(out, x, y + h, x, y); decorate(out, spec, x, y, w, h, m); if (spec.showKnob) appendHandleMark(out, 0, d / 2 - m.inset * 1.5, m); } appendTrapHingeMarks(out, -spec.width / 4, y, d, m); appendTrapHingeMarks(out, spec.width / 4, y, d, m); return out; }
export function generateDoorGeometry(spec: GeneratedDoorSpec, context: DoorRenderContext): GeneratedDoorGeometry {
  const normalized = { ...spec, width: Math.max(1, spec.width), thickness: Math.max(1, spec.thickness ?? context.dpi * 0.16), depth: Math.max(1, spec.depth ?? context.dpi) };
  const m = getDoorDetailMetrics(normalized, context.dpi);
  normalized.openAngle = Math.min(135, Math.max(0, normalized.openAngle ?? 0));
  const commands = normalized.type === "single-swing" ? generateSingleSwingDoor(normalized, m) : normalized.type === "double-swing" ? generateDoubleSwingDoor(normalized, m) : normalized.type === "single-slide" ? generateSingleSlidingDoor(normalized, m, context.open) : normalized.type === "double-slide" ? generateDoubleSlidingDoor(normalized, m, context.open) : generateTrapDoor(normalized, m, context.open);
  return { commands, fillColor: normalized.color, strokeColor: deriveDoorStrokeColor(normalized.color), strokeWidth: m.strokeWidth, fillRule: "nonzero" };
}
