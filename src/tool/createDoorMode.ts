import OBR, { isPath, type Path, type ToolEvent, type Vector2 } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID, GENERATED_DOOR_SETTINGS_CHANNEL } from "../constants";
import { buildGeneratedDoorPath, createGeneratedDoor } from "../generatedDoors/createGeneratedDoor";
import { closeGeneratedDoorPopover, openGeneratedDoorPopover } from "../generatedDoors/popover";
import { getGeneratedDoorSettings } from "../generatedDoors/settings";
import type { GeneratedDoorSpec } from "../generatedDoors/types";
import { DOORJAM_TOOL_ID, modeId } from "./ids";

export const CREATE_DOOR_MODE_ID = modeId("createDoor");
export const GENERATED_DOOR_GHOST_ID = `${EXTENSION_ID}/generated-door-ghost`;
type Drag = { start: Vector2; current: Vector2 };

export async function setupCreateDoorMode(): Promise<() => void> {
  let active = false, dpi = 100; let spec: GeneratedDoorSpec = await getGeneratedDoorSettings(); let drag: Drag | null = null; let pointer: Vector2 | null = null;
  const clearGhost = async () => { const items = await OBR.scene.local.getItems((item) => item.id === GENERATED_DOOR_GHOST_ID); if (items.length) await OBR.scene.local.deleteItems([GENERATED_DOOR_GHOST_ID]); };
  const fitted = () => {
    if (!drag) return { spec, position: pointer, rotation: spec.placementRotation };
    const dx = drag.current.x - drag.start.x, dy = drag.current.y - drag.start.y;
    if (spec.type !== "trap") return { spec: { ...spec, width: Math.max(dpi * 0.04, Math.hypot(dx, dy)) }, position: { x: (drag.start.x + drag.current.x) / 2, y: (drag.start.y + drag.current.y) / 2 }, rotation: Math.atan2(dy, dx) * 180 / Math.PI };
    const radians = -spec.placementRotation * Math.PI / 180; const localX = dx * Math.cos(radians) - dy * Math.sin(radians); const localY = dx * Math.sin(radians) + dy * Math.cos(radians);
    return { spec: { ...spec, width: Math.max(dpi * 0.04, Math.abs(localX)), depth: Math.max(dpi * 0.04, Math.abs(localY)) }, position: { x: (drag.start.x + drag.current.x) / 2, y: (drag.start.y + drag.current.y) / 2 }, rotation: spec.placementRotation };
  };
  const renderGhost = async () => {
    if (!active || !pointer) return; const fit = fitted(); if (!fit.position) return;
    const next = buildGeneratedDoorPath(fit.spec, dpi, fit.position, fit.rotation, 0.42, GENERATED_DOOR_GHOST_ID); next.name = "DoorJam door preview"; next.layer = "CONTROL"; next.locked = true; next.disableHit = true;
    const current = await OBR.scene.local.getItems<Path>((item) => item.id === GENERATED_DOOR_GHOST_ID);
    if (!current.length) await OBR.scene.local.addItems([next]); else await OBR.scene.local.updateItems(current, (items) => { const item = items[0]; if (!item || !isPath(item)) return; item.commands = next.commands; item.style = next.style; item.fillRule = next.fillRule; item.position = next.position; item.rotation = next.rotation; item.scale = { x: 1, y: 1 }; }, true);
  };
  const commit = async () => { if (!drag) return; const fit = fitted(); const distance = Math.hypot(drag.current.x - drag.start.x, drag.current.y - drag.start.y); const click = distance < 4 / Math.max(await OBR.viewport.getScale(), 0.01); const final = click ? { spec, position: drag.start, rotation: spec.placementRotation } : fit; drag = null; if (final.position) await createGeneratedDoor(final.spec, final.position, final.rotation, dpi); await renderGhost(); };
  const removeSettings = OBR.broadcast.onMessage(GENERATED_DOOR_SETTINGS_CHANNEL, (event) => { if (!event.data || typeof event.data !== "object") return; spec = event.data as GeneratedDoorSpec; void renderGhost(); });
  await OBR.tool.removeMode(CREATE_DOOR_MODE_ID);
  await OBR.tool.createMode({ id: CREATE_DOOR_MODE_ID, icons: [{ icon: "/tool-create-door.svg", label: "Create Door", filter: { activeTools: [DOORJAM_TOOL_ID], roles: ["GM"] } }], disabled: { roles: ["PLAYER"] }, preventDrag: { activeTools: [DOORJAM_TOOL_ID], activeModes: [CREATE_DOOR_MODE_ID] }, cursors: [{ cursor: "crosshair", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [CREATE_DOOR_MODE_ID] } }],
    onActivate: () => { active = true; void (async () => { dpi = await OBR.scene.grid.getDpi(); spec = await getGeneratedDoorSettings(); await openGeneratedDoorPopover(); })(); },
    onDeactivate: () => { active = false; drag = null; pointer = null; void clearGhost(); void closeGeneratedDoorPopover(); },
    onToolDown: (_context, event: ToolEvent) => { pointer = event.pointerPosition; drag = { start: event.pointerPosition, current: event.pointerPosition }; void renderGhost(); },
    onToolMove: (_context, event: ToolEvent) => { pointer = event.pointerPosition; if (drag) drag.current = event.pointerPosition; void renderGhost(); },
    onToolUp: (_context, event: ToolEvent) => { pointer = event.pointerPosition; if (drag) drag.current = event.pointerPosition; void commit(); },
    onToolDragCancel: () => { drag = null; void renderGhost(); }, onKeyDown: (_context, event) => { if (event.key === "Escape") { drag = null; void renderGhost(); } },
  });
  return () => { active = false; removeSettings(); void clearGhost(); void closeGeneratedDoorPopover(); void OBR.tool.removeMode(CREATE_DOOR_MODE_ID); };
}
