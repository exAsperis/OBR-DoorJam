import OBR from "@owlbear-rodeo/sdk";
import { useEffect, useMemo, useState } from "react";
import { GENERATED_DOOR_POPOVER_MOVE_CHANNEL, GENERATED_DOOR_SETTINGS_CHANNEL } from "../constants";
import { generateDoorGeometry } from "../generatedDoors/geometry";
import { readGeneratedDoorSpec } from "../generatedDoors/metadata";
import { getGeneratedDoorSettings, setGeneratedDoorSettings } from "../generatedDoors/settings";
import { pathCommandsToSvgD } from "../generatedDoors/svgPreview";
import type { GeneratedDoorSpec } from "../generatedDoors/types";
import { updateGeneratedDoor } from "../generatedDoors/createGeneratedDoor";
import { applyOwlbearTheme } from "../theme";
import { closeGeneratedDoorPopover, GENERATED_DOOR_POPOVER_ID } from "../generatedDoors/popover";

const labels = { swing: "Swing", slide: "Slide", pocket: "Pocket", trap: "Trap" } as const;
function NumberField({ value, min, max, step, label, onCommit }: { value: number; min: number; max?: number; step: number; label: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const parsed = Number(draft); if (!Number.isFinite(parsed)) { setDraft(String(value)); return; } const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed)); setDraft(String(next)); onCommit(next); };
  return <input aria-label={label} type="number" min={min} max={max} step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") { commit(); event.currentTarget.blur(); } if (event.key === "Escape") { setDraft(String(value)); event.currentTarget.blur(); } }}/>;
}
export function GeneratedDoorPopover() {
  const itemId = new URLSearchParams(location.search).get("itemId"); const [dpi, setDpi] = useState(100); const [spec, setSpec] = useState<GeneratedDoorSpec | null>(null); const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { let active = true, removeTheme: (() => void) | undefined; OBR.onReady(async () => { applyOwlbearTheme(await OBR.theme.getTheme()); removeTheme = OBR.theme.onChange(applyOwlbearTheme); const sceneDpi = await OBR.scene.grid.getDpi(); let value = await getGeneratedDoorSettings(sceneDpi); if (itemId) { const item = (await OBR.scene.items.getItems([itemId]))[0]; const stored = readGeneratedDoorSpec(item); if (stored && item) value = { ...stored, placementRotation: item.rotation }; } if (active) { setDpi(sceneDpi); setSpec(value); } }); return () => { active = false; removeTheme?.(); }; }, [itemId]);
  const openGeometry = useMemo(() => spec ? generateDoorGeometry(spec, { dpi, open: true }) : null, [spec, dpi]);
  const closedGeometry = useMemo(() => spec ? generateDoorGeometry(spec.type === "swing" ? { ...spec, openAngle: 0 } : spec, { dpi, open: false }) : null, [spec, dpi]);
  if (!spec || !openGeometry || !closedGeometry) return <main>Loading…</main>;
  const change = async (next: GeneratedDoorSpec, updateRotation = false) => { setSpec(next); if (itemId) await updateGeneratedDoor(itemId, next, dpi, updateRotation); else { await setGeneratedDoorSettings(next, dpi); await OBR.broadcast.sendMessage(GENERATED_DOOR_SETTINGS_CHANNEL, next, { destination: "LOCAL" }); } };
  const cells = (pixels: number | undefined, fallback: number) => Number(((pixels ?? fallback) / dpi).toFixed(2));
  let dragStart: { x: number; y: number } | null = null;
  const startDrag = (event: React.PointerEvent<HTMLElement>) => { dragStart = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); };
  const endDrag = (event: React.PointerEvent<HTMLElement>) => { if (!dragStart) return; const dx = event.clientX - dragStart.x, dy = event.clientY - dragStart.y; dragStart = null; if (Math.abs(dx) + Math.abs(dy) > 2) void OBR.broadcast.sendMessage(GENERATED_DOOR_POPOVER_MOVE_CHANNEL, { dx, dy, itemId }, { destination: "LOCAL" }); };
  const viewBox = `${-spec.width * 1.1} ${-(spec.type === "trap" ? spec.depth ?? dpi : spec.width) * 1.1} ${spec.width * 2.2} ${(spec.type === "trap" ? spec.depth ?? dpi : spec.width) * 2.2}`;
  const toggleCollapsed = async () => { const next = !collapsed; setCollapsed(next); await OBR.popover.setHeight(GENERATED_DOOR_POPOVER_ID, next ? 58 : 600); };
  return <main className={collapsed ? "collapsed" : undefined}><header onPointerDown={startDrag} onPointerUp={endDrag}><h1>{itemId ? "Edit Generated Door" : "Generate Door"}</h1><div className="header-actions"><button className="collapse" type="button" aria-label={collapsed ? "Expand" : "Collapse"} aria-expanded={!collapsed} onPointerDown={(event) => event.stopPropagation()} onClick={() => void toggleCollapsed()}>{collapsed ? "▸" : "▾"}</button>{itemId && <button className="close" type="button" aria-label="Close" onPointerDown={(event) => event.stopPropagation()} onClick={() => void closeGeneratedDoorPopover()}>×</button>}</div></header><section className="popover-content" hidden={collapsed}><div className="previews"><figure><figcaption>Closed</figcaption><svg viewBox={viewBox}><path d={pathCommandsToSvgD(closedGeometry.commands)} fill={closedGeometry.fillColor} stroke={closedGeometry.strokeColor} strokeWidth={closedGeometry.strokeWidth} fillRule={closedGeometry.fillRule}/></svg></figure><figure><figcaption>Open</figcaption><svg viewBox={viewBox}><path d={pathCommandsToSvgD(openGeometry.commands)} fill={openGeometry.fillColor} stroke={openGeometry.strokeColor} strokeWidth={openGeometry.strokeWidth} fillRule={openGeometry.fillRule}/></svg></figure></div>
    <label>Door type<select value={spec.type} onChange={(e) => void change({ ...spec, type: e.target.value as GeneratedDoorSpec["type"] })}>{Object.entries(labels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Leaves<select value={spec.leaves} onChange={(e) => void change({ ...spec, leaves: e.target.value as GeneratedDoorSpec["leaves"] })}><option value="single">Single</option><option value="double">Double</option></select></label>
    <label>Style<select value={spec.style} onChange={(e) => void change({ ...spec, style: e.target.value as GeneratedDoorSpec["style"] })}><option value="plain">Plain</option><option value="paneled">Paneled</option><option value="planked">Planked</option></select></label>
    <label>Color<input type="color" value={spec.color} onChange={(e) => void change({ ...spec, color: e.target.value })}/></label>
    {(spec.type === "swing" || spec.type === "trap") && <label className="switch-row"><span>Knob / latch</span><span className="switch"><input type="checkbox" checked={spec.showKnob === true} onChange={(e) => void change({ ...spec, showKnob: e.target.checked })}/><span className="switch-track" aria-hidden="true"/></span></label>}
    <label>Width (grid cells)<NumberField label="Width in grid cells" min={0.04} step={0.1} value={cells(spec.width, dpi)} onCommit={(value) => void change({ ...spec, width: value * dpi })}/></label>
    {spec.type === "trap" ? <label>Depth (grid cells)<NumberField label="Depth in grid cells" min={0.04} step={0.1} value={cells(spec.depth, dpi)} onCommit={(value) => void change({ ...spec, depth: value * dpi })}/></label> : <label>Thickness (grid cells)<NumberField label="Thickness in grid cells" min={0.04} step={0.01} value={cells(spec.thickness, dpi*.25)} onCommit={(value) => void change({ ...spec, thickness: value * dpi })}/></label>}
    {spec.type === "swing" && spec.leaves === "single" && <label>Hinge side<select value={spec.hingeSide ?? "left"} onChange={(e) => void change({ ...spec, hingeSide: e.target.value as "left"|"right" })}><option value="left">Left</option><option value="right">Right</option></select></label>}
    {spec.type === "swing" && <label>Open angle<span className="slider-value"><input aria-label="Open angle slider" type="range" min="0" max="135" step="1" value={spec.openAngle ?? 0} onChange={(e) => void change({ ...spec, openAngle: Number(e.target.value) })}/><NumberField label="Open angle in degrees" min={0} max={135} step={1} value={spec.openAngle ?? 0} onCommit={(value) => void change({ ...spec, openAngle: value })}/></span></label>}
    <label>Rotation<span className="slider-value"><input aria-label="Rotation slider" type="range" min="-180" max="180" step="1" value={spec.placementRotation} onChange={(e) => void change({ ...spec, placementRotation: Number(e.target.value) }, true)}/><NumberField label="Rotation in degrees" min={-180} max={180} step={1} value={spec.placementRotation} onCommit={(value) => void change({ ...spec, placementRotation: value }, true)}/></span></label></section>
  </main>;
}
