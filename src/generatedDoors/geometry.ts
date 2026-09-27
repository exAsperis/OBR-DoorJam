import { Command, type PathCommand } from "@owlbear-rodeo/sdk";
import { deriveDoorStrokeColor } from "./colors";
import { getDoorDetailMetrics } from "./metrics";
import type { DoorDetailMetrics, DoorRenderContext, GeneratedDoorGeometry, GeneratedDoorSpec } from "./types";

export function appendRect(out: PathCommand[], x: number, y: number, width: number, height: number) {
  out.push([Command.MOVE, x, y], [Command.LINE, x + width, y], [Command.LINE, x + width, y + height], [Command.LINE, x, y + height], [Command.CLOSE]);
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
  appendLine(out, x, y - Math.min(thickness / 2, metrics.hingeSize), x, y + Math.min(thickness / 2, metrics.hingeSize));
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
  const half = thickness / 2; const end = { x: hingeX + ux * length, y: uy * length };
  const points = [{ x: hingeX + nx * half, y: ny * half }, { x: end.x + nx * half, y: end.y + ny * half }, { x: end.x - nx * half, y: end.y - ny * half }, { x: hingeX - nx * half, y: -ny * half }];
  out.push([Command.MOVE, points[0].x, points[0].y], ...points.slice(1).map((p) => [Command.LINE, p.x, p.y] as PathCommand), [Command.CLOSE]);
  if (spec.style === "planked") { const count = Math.max(1, Math.round(length / m.targetPlankSpacing)); for (let i = 1; i < count; i++) { const p = rotatedPoint(hingeX, angle, length * i / count, openDirection); appendLine(out, p.x + nx * half, p.y + ny * half, p.x - nx * half, p.y - ny * half); } }
  appendHingeMarks(out, hingeX, 0, thickness, m); appendHandleMark(out, end.x - ux * m.inset, end.y - uy * m.inset, m);
}
export function generateSingleSwingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const side = spec.hingeSide ?? "left"; appendSwingLeaf(out, side === "left" ? -spec.width / 2 : spec.width / 2, spec.width, spec.thickness!, spec.openAngle ?? 0, m, spec); return out; }
export function generateDoubleSwingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const gap = Math.min(m.inset * 0.35, spec.width * 0.03); const leaf = spec.width / 2 - gap / 2; appendSwingLeaf(out, -spec.width / 2, leaf, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); appendSwingLeaf(out, spec.width / 2, leaf, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); return out; }
export function generateSingleSlidingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const t = spec.thickness!; appendRoundedRect(out, -spec.width / 2, -t / 2, spec.width, t, m.cornerRadius); decorate(out, spec, -spec.width / 2, -t / 2, spec.width, t, m); appendLine(out, -spec.width / 2, -t / 2 - m.inset, spec.width / 2, -t / 2 - m.inset); appendHandleMark(out, spec.width / 2 - m.inset * 1.5, 0, m); return out; }
export function generateDoubleSlidingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out = generateSingleSlidingDoor(spec, m); appendLine(out, 0, -spec.thickness! / 2, 0, spec.thickness! / 2); appendHandleMark(out, -m.inset, 0, m); return out; }
export function generateTrapDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const d = spec.depth!; appendRoundedRect(out, -spec.width / 2, -d / 2, spec.width, d, m.cornerRadius); appendRect(out, -spec.width / 2 + m.inset, -d / 2 + m.inset, spec.width - m.inset * 2, d - m.inset * 2); decorate(out, spec, -spec.width / 2 + m.inset, -d / 2 + m.inset, spec.width - m.inset * 2, d - m.inset * 2, m); appendHingeMarks(out, -spec.width / 4, -d / 2 + m.inset, d, m); appendHingeMarks(out, spec.width / 4, -d / 2 + m.inset, d, m); appendHandleMark(out, 0, d / 2 - m.inset * 1.5, m); return out; }
export function generateDoorGeometry(spec: GeneratedDoorSpec, context: DoorRenderContext): GeneratedDoorGeometry {
  const normalized = { ...spec, width: Math.max(1, spec.width), thickness: Math.max(1, spec.thickness ?? context.dpi * 0.16), depth: Math.max(1, spec.depth ?? context.dpi) };
  const m = getDoorDetailMetrics(normalized, context.dpi);
  const commands = normalized.type === "single-swing" ? generateSingleSwingDoor(normalized, m) : normalized.type === "double-swing" ? generateDoubleSwingDoor(normalized, m) : normalized.type === "single-slide" ? generateSingleSlidingDoor(normalized, m) : normalized.type === "double-slide" ? generateDoubleSlidingDoor(normalized, m) : generateTrapDoor(normalized, m);
  return { commands, fillColor: normalized.color, strokeColor: deriveDoorStrokeColor(normalized.color), strokeWidth: m.strokeWidth, fillRule: "evenodd" };
}
