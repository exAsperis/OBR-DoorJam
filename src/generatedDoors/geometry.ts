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
export function appendOrientedOval(out: PathCommand[], cx: number, cy: number, alongRadius: number, normalRadius: number, ux: number, uy: number, nx: number, ny: number) {
  const k = 0.55228475; const point = (along: number, normal: number) => ({ x: cx + ux * along + nx * normal, y: cy + uy * along + ny * normal });
  const a = point(alongRadius, 0), b = point(0, normalRadius), c = point(-alongRadius, 0), d = point(0, -normalRadius);
  const c1 = point(alongRadius, k * normalRadius), c2 = point(k * alongRadius, normalRadius), c3 = point(-k * alongRadius, normalRadius), c4 = point(-alongRadius, k * normalRadius), c5 = point(-alongRadius, -k * normalRadius), c6 = point(-k * alongRadius, -normalRadius), c7 = point(k * alongRadius, -normalRadius), c8 = point(alongRadius, -k * normalRadius);
  out.push([Command.MOVE, a.x, a.y], [Command.CUBIC, c1.x, c1.y, c2.x, c2.y, b.x, b.y], [Command.CUBIC, c3.x, c3.y, c4.x, c4.y, c.x, c.y], [Command.CUBIC, c5.x, c5.y, c6.x, c6.y, d.x, d.y], [Command.CUBIC, c7.x, c7.y, c8.x, c8.y, a.x, a.y], [Command.CLOSE]);
}
export function appendPanel(out: PathCommand[], x: number, y: number, width: number, height: number, inset: number) { appendRoundedRect(out, x + inset, y + inset, width - inset * 2, height - inset * 2, inset * 0.45); }
export function appendPlankLines(out: PathCommand[], x: number, y: number, width: number, height: number, target: number) {
  const count = Math.max(2, Math.round(Math.abs(width) / target));
  for (let index = 1; index < count; index += 1) appendLine(out, x + width * index / count, y, x + width * index / count, y + height);
}
function repeatCount(length: number, target: number, minimum = 2) { return Math.max(minimum, Math.round(Math.abs(length) / target)); }
function detailRadius(m: DoorDetailMetrics) { return Math.max(m.strokeWidth * 0.72, m.inset * 0.11); }
function appendVerticalRivets(out: PathCommand[], x: number, y: number, width: number, height: number, m: DoorDetailMetrics) {
  const columns = repeatCount(width, m.targetPlankSpacing), rows = repeatCount(height, m.targetPlankSpacing, 3), radius = m.strokeWidth * 0.18;
  for (let column = 0; column < columns; column += 1) for (let row = 1; row < rows; row += 1) appendCircleOrRing(out, x + width * (column + 0.5) / columns, y + height * row / rows, radius);
}
function appendBarTops(out: PathCommand[], pointAt: (distance: number) => { x: number; y: number }, start: number, end: number, m: DoorDetailMetrics) {
  const span = Math.max(0, end - start); if (!span) return;
  const count = repeatCount(span, m.targetPlankSpacing, 3), radius = detailRadius(m);
  for (let index = 0; index < count; index += 1) { const point = pointAt(start + span * (index + 0.5) / count); appendCircleOrRing(out, point.x, point.y, radius); }
}
export function appendHingeMarks(out: PathCommand[], x: number, y: number, thickness: number, metrics: DoorDetailMetrics) {
  appendCircleOrRing(out, x, y, Math.max(metrics.strokeWidth, thickness / 2));
  appendCircleOrRing(out, x, y, Math.max(metrics.strokeWidth * 0.75, thickness * 0.06));
}
export function appendTrapHingeMarks(out: PathCommand[], x: number, y: number, depth: number, metrics: DoorDetailMetrics) {
  appendLine(out, x, y - Math.min(depth / 2, metrics.hingeSize), x, y + Math.min(depth / 2, metrics.hingeSize));
  appendCircleOrRing(out, x, y, metrics.hingeSize * 0.28);
}
export function appendHandleMark(out: PathCommand[], x: number, y: number, metrics: DoorDetailMetrics) { appendCircleOrRing(out, x, y, metrics.handleSize); }

function decorate(out: PathCommand[], spec: GeneratedDoorSpec, x: number, y: number, width: number, height: number, m: DoorDetailMetrics) {
  if (spec.style === "planked" || spec.style === "reinforced") appendPlankLines(out, x, y, width, height, m.targetPlankSpacing);
  if (spec.style === "reinforced") { const count = repeatCount(width, m.targetPlankSpacing), radius = detailRadius(m); for (let index = 0; index < count; index += 1) { const rivetX = x + width * (index + 0.5) / count; appendCircleOrRing(out, rivetX, y, radius); appendCircleOrRing(out, rivetX, y + height, radius); } }
  if (spec.style === "bars") { const cap = Math.min(m.inset * 2.2, width * 0.28); appendBarTops(out, (distance) => ({ x: x + distance, y: y + height / 2 }), cap, width - cap, m); }
}
function appendInsetSlab(out: PathCommand[], x: number, y: number, width: number, height: number, m: DoorDetailMetrics) {
  const cap = Math.min(m.inset * 2.2, width * 0.28), indent = Math.min(height * 0.1, m.inset * 0.3);
  if (width <= cap * 2 || height <= indent * 2) { appendRoundedRect(out, x, y, width, height, m.cornerRadius); return; }
  out.push([Command.MOVE, x, y], [Command.LINE, x + cap, y], [Command.LINE, x + cap, y + indent], [Command.LINE, x + width - cap, y + indent], [Command.LINE, x + width - cap, y], [Command.LINE, x + width, y], [Command.LINE, x + width, y + height], [Command.LINE, x + width - cap, y + height], [Command.LINE, x + width - cap, y + height - indent], [Command.LINE, x + cap, y + height - indent], [Command.LINE, x + cap, y + height], [Command.LINE, x, y + height], [Command.CLOSE]);
}
function appendSlidingLeaf(out: PathCommand[], spec: GeneratedDoorSpec, x: number, y: number, width: number, height: number, m: DoorDetailMetrics) {
  if (spec.style === "paneled" || spec.style === "bars") appendInsetSlab(out, x, y, width, height, m); else appendRoundedRect(out, x, y, width, height, m.cornerRadius);
  decorate(out, spec, x, y, width, height, m);
}
function rotatedPoint(hx: number, angle: number, length: number, openDirection: number) { const sign = hx < 0 ? 1 : -1; return { x: hx + sign * length * Math.cos(angle), y: openDirection * length * Math.sin(angle) }; }
function appendSwingLeaf(out: PathCommand[], hingeX: number, length: number, thickness: number, angleDeg: number, m: DoorDetailMetrics, spec: GeneratedDoorSpec, openDirection = hingeX < 0 ? 1 : -1) {
  const angle = angleDeg * Math.PI / 180; const sign = hingeX < 0 ? 1 : -1;
  const ux = sign * Math.cos(angle), uy = openDirection * Math.sin(angle), nx = -uy, ny = ux;
  const half = thickness / 2; const end = { x: hingeX + ux * length, y: uy * length }; const slabStart = { x: hingeX + ux * half, y: uy * half };
  const point = (distance: number, normal: number) => ({ x: hingeX + ux * distance + nx * normal, y: uy * distance + ny * normal });
  const cap = Math.min(m.inset * 2.2, (length - half) * 0.28), insetHalf = half - Math.min(thickness * 0.1, m.inset * 0.3);
  const points = (spec.style === "paneled" || spec.style === "bars") && length - half > cap * 2 ? [point(half, half), point(half + cap, half), point(half + cap, insetHalf), point(length - cap, insetHalf), point(length - cap, half), point(length, half), point(length, -half), point(length - cap, -half), point(length - cap, -insetHalf), point(half + cap, -insetHalf), point(half + cap, -half), point(half, -half)] : [{ x: slabStart.x + nx * half, y: slabStart.y + ny * half }, { x: end.x + nx * half, y: end.y + ny * half }, { x: end.x - nx * half, y: end.y - ny * half }, { x: slabStart.x - nx * half, y: slabStart.y - ny * half }];
  out.push([Command.MOVE, points[0].x, points[0].y], ...points.slice(1).map((p) => [Command.LINE, p.x, p.y] as PathCommand), [Command.CLOSE]);
  if (spec.style === "planked" || spec.style === "reinforced") { const count = Math.max(1, Math.round(length / m.targetPlankSpacing)); for (let i = 1; i < count; i++) { const p = rotatedPoint(hingeX, angle, length * i / count, openDirection); appendLine(out, p.x + nx * half, p.y + ny * half, p.x - nx * half, p.y - ny * half); } if (spec.style === "reinforced") { const radius = detailRadius(m); for (let i = 0; i < count; i++) { const p = rotatedPoint(hingeX, angle, length * (i + 0.5) / count, openDirection); appendCircleOrRing(out, p.x + nx * half, p.y + ny * half, radius); appendCircleOrRing(out, p.x - nx * half, p.y - ny * half, radius); } } }
  if (spec.style === "bars") appendBarTops(out, (distance) => point(distance, 0), half + cap, length - cap, m);
  appendHingeMarks(out, hingeX, 0, thickness, m);
  if (spec.showKnob) { const knob = { x: end.x - ux * m.inset * 2.2, y: end.y - uy * m.inset * 2.2 }; const normalRadius = m.handleSize * 0.62, alongRadius = m.handleSize * 1.15, offset = half + normalRadius; appendOrientedOval(out, knob.x + nx * offset, knob.y + ny * offset, alongRadius, normalRadius, ux, uy, nx, ny); appendOrientedOval(out, knob.x - nx * offset, knob.y - ny * offset, alongRadius, normalRadius, ux, uy, nx, ny); }
}
export function generateSingleSwingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const side = spec.hingeSide ?? "left"; appendSwingLeaf(out, side === "left" ? -spec.width / 2 : spec.width / 2, spec.width, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); return out; }
export function generateDoubleSwingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics): PathCommand[] { const out: PathCommand[] = []; const gap = Math.min(m.inset * 0.35, spec.width * 0.03); const leaf = spec.width / 2 - gap / 2; appendSwingLeaf(out, -spec.width / 2, leaf, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); appendSwingLeaf(out, spec.width / 2, leaf, spec.thickness!, spec.openAngle ?? 0, m, spec, 1); return out; }
export function generateSingleSlidingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const t = spec.thickness!, fraction = open ? (spec.openWidth ?? 100) / 100 : 0, direction = spec.opensToward === "left" ? -1 : 1; const x = -spec.width / 2 + direction * fraction * spec.width; appendSlidingLeaf(out, spec, x, -t / 2, spec.width, t, m); return out; }
export function generateDoubleSlidingDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const t = spec.thickness!, fraction = open ? (spec.openWidth ?? 100) / 100 : 0; const half = spec.width / 2, leftX = -spec.width / 2 - fraction * half, rightX = fraction * half; appendSlidingLeaf(out, spec, leftX, -t / 2, half, t, m); appendSlidingLeaf(out, spec, rightX, -t / 2, half, t, m); return out; }
export function generatePocketDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const t = spec.thickness!, fraction = open ? (spec.openWidth ?? 100) / 100 : 0; if (spec.leaves === "double") { const half = spec.width / 2, stub = Math.min(half * 0.3, Math.max(t, m.inset * 1.2)), leafWidth = half - fraction * (half - stub), leftX = -spec.width / 2, rightX = spec.width / 2 - leafWidth; appendSlidingLeaf(out, spec, leftX, -t / 2, leafWidth, t, m); appendSlidingLeaf(out, spec, rightX, -t / 2, leafWidth, t, m); return out; } const stub = Math.min(spec.width * 0.16, Math.max(t, m.inset * 1.2)), width = spec.width - fraction * (spec.width - stub), x = spec.opensToward === "left" ? -spec.width / 2 : spec.width / 2 - width; appendSlidingLeaf(out, spec, x, -t / 2, width, t, m); return out; }
function decorateTrapLeaf(out: PathCommand[], spec: GeneratedDoorSpec, x: number, y: number, width: number, height: number, m: DoorDetailMetrics) { if (spec.style === "planked" || spec.style === "reinforced") { appendPlankLines(out, x, y, width, height, m.targetPlankSpacing); if (spec.style === "reinforced") appendVerticalRivets(out, x, y, width, height, m); } else if (spec.style === "paneled") { const size = Math.max(1, Math.min(width, height) - m.inset * 2); appendRoundedRect(out, x + (width - size) / 2, y + (height - size) / 2, size, size, m.cornerRadius * 0.6); } }
export function generateTrapDoor(spec: GeneratedDoorSpec, m: DoorDetailMetrics, open = false): PathCommand[] { const out: PathCommand[] = []; const d = spec.depth!; appendRoundedRect(out, -spec.width / 2, -d / 2, spec.width, d, m.cornerRadius); const x = -spec.width / 2 + m.inset, y = -d / 2 + m.inset, w = spec.width - m.inset * 2, h = d - m.inset * 2, edge = Math.max(m.strokeWidth * 2, Math.min(h, m.inset)); if (open) { appendRectCounterClockwise(out, x, y, w, h); if (spec.leaves === "double") { appendRect(out, x, y, w, edge); appendRect(out, x, y + h - edge, w, edge); } else appendRect(out, x, y, w, edge); } else { if (spec.style === "bars") { appendRectCounterClockwise(out, x, y, w, h); const count = repeatCount(w, m.targetPlankSpacing, 3); for (let index = 1; index <= count; index += 1) { const barX = x + w * index / (count + 1); appendLine(out, barX, y, barX, y + h); } } else { appendLine(out, x, y, x + w, y); appendLine(out, x + w, y, x + w, y + h); appendLine(out, x + w, y + h, x, y + h); appendLine(out, x, y + h, x, y); } if (spec.leaves === "double") { appendLine(out, x, 0, x + w, 0); decorateTrapLeaf(out, spec, x, y, w, h / 2, m); decorateTrapLeaf(out, spec, x, 0, w, h / 2, m); if (spec.showKnob) { appendLine(out, -m.handleSize, -m.inset / 2, m.handleSize, -m.inset / 2); appendLine(out, -m.handleSize, m.inset / 2, m.handleSize, m.inset / 2); } } else { decorateTrapLeaf(out, spec, x, y, w, h, m); if (spec.showKnob) { const handleY = y + h - m.inset / 2; appendLine(out, -m.handleSize * 1.8, handleY, m.handleSize * 1.8, handleY); } } } if (spec.leaves === "double") { appendTrapHingeMarks(out, -spec.width / 4, y, d, m); appendTrapHingeMarks(out, spec.width / 4, y, d, m); appendTrapHingeMarks(out, -spec.width / 4, y + h, d, m); appendTrapHingeMarks(out, spec.width / 4, y + h, d, m); } else { appendTrapHingeMarks(out, -spec.width / 4, y, d, m); appendTrapHingeMarks(out, spec.width / 4, y, d, m); } return out; }
export function generateDoorGeometry(spec: GeneratedDoorSpec, context: DoorRenderContext): GeneratedDoorGeometry {
  const normalized = { ...spec, width: Math.max(1, spec.width), thickness: Math.max(1, spec.thickness ?? context.dpi * 0.16), depth: Math.max(1, spec.depth ?? context.dpi) };
  const m = getDoorDetailMetrics(normalized, context.dpi);
  normalized.openAngle = Math.min(135, Math.max(0, normalized.openAngle ?? 0));
  normalized.openWidth = Math.min(100, Math.max(0, normalized.openWidth ?? 100));
  const commands = normalized.type === "swing" ? normalized.leaves === "double" ? generateDoubleSwingDoor(normalized, m) : generateSingleSwingDoor(normalized, m) : normalized.type === "slide" ? normalized.leaves === "double" ? generateDoubleSlidingDoor(normalized, m, context.open) : generateSingleSlidingDoor(normalized, m, context.open) : normalized.type === "pocket" ? generatePocketDoor(normalized, m, context.open) : generateTrapDoor(normalized, m, context.open);
  return { commands, fillColor: normalized.color, strokeColor: deriveDoorStrokeColor(normalized.color), strokeWidth: m.strokeWidth, fillRule: "nonzero" };
}
