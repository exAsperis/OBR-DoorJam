import OBR, { Command, buildPath, buildShape, type Item, type PathCommand, type ToolEvent, type Vector2 } from "@owlbear-rodeo/sdk";
import { DOORJAM_TOOL_PREFERENCES_KEY, EXTENSION_ID } from "../constants";
import { DYNAMIC_FOG_DOORS_KEY, parseDynamicFogDoors, updateDoorGeometry } from "../dynamicFog/adapter";
import { geometryFingerprint, getEditableContour, type EditableContour } from "../dynamicFog/editContour";
import { chooseDoorEditHandle, doorSpansOverlap, proposeDoorEdit, type DoorEditHandle, type DoorEditProposal } from "../dynamicFog/editGeometry";
import type { DynamicFogDoor, DynamicFogDoorRef } from "../dynamicFog/types";
import { DOORJAM_TOOL_ID, modeId } from "./ids";
import { readToolPreferences } from "./preferences";

export const DYNAMIC_FOG_EDITOR_ACTION = "editDynamicFog";
export const DYNAMIC_FOG_EDITOR_MODE_ID = modeId(DYNAMIC_FOG_EDITOR_ACTION);
const CONTROL_KEY = `${EXTENSION_ID}/dynamic-fog-editor-control`;
const DOOR_INDICATOR_COLOR = "#00ff66";

interface Session {
  ref: DynamicFogDoorRef;
  original: DoorEditProposal;
  proposal: DoorEditProposal;
  contour: EditableContour;
  fingerprint: string;
  siblingDoors: DynamicFogDoor[];
  hitTolerance: number;
  drag?: { handle: DoorEditHandle; anchor: number };
}

const cloneProposal = (door: DynamicFogDoor): DoorEditProposal => ({ start: { ...door.start }, end: { ...door.end } });
const midpointDistance = (proposal: DoorEditProposal) => (proposal.start.distance + proposal.end.distance) / 2;
const sessionKey = (session: Session) => `${session.ref.fogItemId}-${session.ref.doorIndex}`;

function controlItems(session: Session, handleSize: number) {
  const { proposal, contour } = session;
  const start = contour.pointAt(proposal.start.distance);
  const end = contour.pointAt(proposal.end.distance);
  const move = contour.pointAt(midpointDistance(proposal));
  const points = contour.segment(proposal.start.distance, proposal.end.distance);
  const commands: PathCommand[] = points.map((point, index) => [index === 0 ? Command.MOVE : Command.LINE, point.x, point.y]);
  const key = sessionKey(session);
  const base = (suffix: string, position: Vector2, color: string) => buildShape()
    .id(`${EXTENSION_ID}/dynamic-fog-editor-${suffix}-${key}`).name("DoorJam Dynamic Fog editor handle")
    .layer("CONTROL").position(position).width(handleSize).height(handleSize)
    .shapeType("CIRCLE").fillColor(color).fillOpacity(0.9).strokeColor("#ffffff").strokeWidth(2)
    .locked(true).disableHit(true).metadata({ [CONTROL_KEY]: true }).build();
  const preview = buildPath().id(`${EXTENSION_ID}/dynamic-fog-editor-preview-${key}`)
    .name("DoorJam Dynamic Fog door preview").layer("CONTROL")
    .commands(commands).fillOpacity(0).strokeColor(DOOR_INDICATOR_COLOR).strokeWidth(Math.max(3, handleSize / 5))
    .locked(true).disableHit(true).metadata({ [CONTROL_KEY]: true }).build();
  return [preview, base("start", start, "#ffcc33"), base("end", end, "#ff7433"), base("move", move, DOOR_INDICATOR_COLOR)];
}

async function deleteControls() {
  const existing = await OBR.scene.local.getItems((item) => Boolean(item.metadata[CONTROL_KEY]));
  if (existing.length) await OBR.scene.local.deleteItems(existing.map((item) => item.id));
}

async function renderControls(sessions: Session[]) {
  const scale = await OBR.viewport.getScale();
  const size = 22 / Math.max(scale, 0.01);
  for (const session of sessions) session.hitTolerance = 18 / Math.max(scale, 0.01);
  await deleteControls();
  const controls = sessions.flatMap((session) => controlItems(session, size));
  if (controls.length) await OBR.scene.local.addItems(controls);
}

async function createSessions(items: Item[]): Promise<Session[]> {
  const sessions: Session[] = [];
  for (const item of items) {
    const doors = parseDynamicFogDoors(item.metadata[DYNAMIC_FOG_DOORS_KEY]);
    if (!doors) continue;
    for (let doorIndex = 0; doorIndex < doors.length; doorIndex += 1) {
      const door = doors[doorIndex];
      const contour = await getEditableContour(item, door.start);
      if (!contour || door.end.index !== door.start.index || door.end.distance > contour.length) {
        contour?.dispose();
        continue;
      }
      sessions.push({
        ref: { provider: "dynamic-fog", fogItemId: item.id, doorIndex },
        original: cloneProposal(door), proposal: cloneProposal(door), contour,
        fingerprint: geometryFingerprint(item),
        siblingDoors: doors.map((candidate) => ({ ...candidate, start: { ...candidate.start }, end: { ...candidate.end } })),
        hitTolerance: 0,
      });
    }
  }
  return sessions;
}

export async function setupDynamicFogEditorMode(): Promise<() => void> {
  let sessions: Session[] = [];
  let active = false;
  let generation = 0;
  const disposeSessions = (values: Session[]) => values.forEach((session) => session.contour.dispose());
  const clear = async () => { generation += 1; disposeSessions(sessions); sessions = []; await deleteControls(); };
  const notifyError = (message: string) => OBR.notification.show(message, "ERROR");

  const loadAll = async (items?: Item[]) => {
    const request = ++generation;
    const next = await createSessions(items ?? await OBR.scene.items.getItems());
    if (!active || request !== generation) { disposeSessions(next); return; }
    disposeSessions(sessions);
    sessions = next;
    await renderControls(sessions);
  };

  const nearestHandle = (pointer: Vector2): { session: Session; handle: DoorEditHandle } | null => {
    let nearest: { session: Session; handle: DoorEditHandle; distanceSquared: number } | null = null;
    for (const session of sessions) {
      const positions: Array<{ handle: DoorEditHandle; position: Vector2 }> = [
        { handle: "start", position: session.contour.pointAt(session.proposal.start.distance) },
        { handle: "end", position: session.contour.pointAt(session.proposal.end.distance) },
        { handle: "move", position: session.contour.pointAt(midpointDistance(session.proposal)) },
      ];
      const handle = chooseDoorEditHandle(pointer, positions, session.hitTolerance);
      const position = positions.find((candidate) => candidate.handle === handle)?.position;
      if (!handle || !position) continue;
      const distanceSquared = (pointer.x - position.x) ** 2 + (pointer.y - position.y) ** 2;
      if (!nearest || distanceSquared < nearest.distanceSquared) nearest = { session, handle, distanceSquared };
    }
    return nearest && { session: nearest.session, handle: nearest.handle };
  };

  const dragStart = (event: ToolEvent) => {
    const hit = nearestHandle(event.pointerPosition);
    if (!hit) return;
    hit.session.drag = { handle: hit.handle, anchor: hit.session.contour.project(event.pointerPosition).distance };
  };
  const dragMove = async (event: ToolEvent) => {
    const current = sessions.find((session) => session.drag);
    if (!current?.drag) return;
    const projected = current.contour.project(event.pointerPosition);
    const result = proposeDoorEdit({ open: false, ...current.original }, current.drag.handle, projected.distance, current.drag.anchor, current.contour.length);
    if (!result.ok || current.siblingDoors.some((door, index) => index !== current.ref.doorIndex && doorSpansOverlap(result.proposal, door, 0.5))) return;
    current.proposal = result.proposal;
    await renderControls(sessions);
  };
  const dragEnd = async () => {
    const current = sessions.find((session) => session.drag);
    if (!current?.drag) return;
    current.drag = undefined;
    if (current.proposal.start.distance === current.original.start.distance && current.proposal.end.distance === current.original.end.distance) return;
    if (!(await OBR.scene.isReady())) { await clear(); return; }
    const result = await updateDoorGeometry(current.ref, current.original, current.proposal, current.contour.length, current.fingerprint);
    if (!result.ok) {
      await notifyError(result.reason === "stale-edit" ? "The door or fog drawing changed. Select it again before editing." : "DoorJam could not save this Dynamic Fog door edit.");
    }
    await loadAll();
  };
  const dragCancel = async () => {
    const current = sessions.find((session) => session.drag);
    if (!current) return;
    current.drag = undefined;
    current.proposal = { start: { ...current.original.start }, end: { ...current.original.end } };
    await renderControls(sessions);
  };

  await OBR.tool.createMode({
    id: DYNAMIC_FOG_EDITOR_MODE_ID,
    icons: [{ icon: "/tool-edit-dynamic-fog.svg", label: "Edit Dynamic Fog Door", filter: {
      activeTools: [DOORJAM_TOOL_ID], roles: ["GM"],
      metadata: [{ key: [DOORJAM_TOOL_PREFERENCES_KEY, "dynamicFog"], value: true }],
    } }],
    disabled: { roles: ["PLAYER"] }, shortcut: "E",
    cursors: [{ cursor: "pointer", filter: { activeTools: [DOORJAM_TOOL_ID], activeModes: [DYNAMIC_FOG_EDITOR_MODE_ID] } }],
    onToolClick: () => false,
    onToolDown: (_context, event) => dragStart(event),
    onToolMove: (_context, event) => void dragMove(event),
    onToolUp: () => void dragEnd(),
    onToolDragCancel: () => void dragCancel(),
    onKeyDown: (_context, event) => { if (event.key === "Escape") void dragCancel(); },
    onActivate: (context) => {
      if (!readToolPreferences(context.metadata).dynamicFog) {
        void OBR.tool.activateMode(DOORJAM_TOOL_ID, modeId("operate"));
        return;
      }
      active = true;
      void loadAll();
    },
    onDeactivate: () => { active = false; void clear(); },
  });
  const removeReady = OBR.scene.onReadyChange((ready) => {
    if (!ready) void clear();
    else if (active) void loadAll();
  });
  const removeItems = OBR.scene.items.onChange((items) => {
    if (active && !sessions.some((session) => session.drag)) void loadAll(items);
  });
  return () => { active = false; removeReady(); removeItems(); void clear(); void OBR.tool.removeMode(DYNAMIC_FOG_EDITOR_MODE_ID); };
}
