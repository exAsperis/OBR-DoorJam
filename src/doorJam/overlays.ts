import OBR, { buildBillboard, isImage, type Image, type Item, type ToolEvent } from "@owlbear-rodeo/sdk";
import { EXTENSION_ID } from "../constants";
import { getDoorState } from "../dynamicFog/adapter";
import { linkNearbyDoorOrCreate } from "./linking";
import { openDoorImagesPopover } from "./imagesPopover";
import { readDoorJamMetadata, removeFogDoorLink, setDoorLocked } from "./metadata";

const OVERLAY_KEY = `${EXTENSION_ID}/door-overlay`;
const OVERLAY_PREFIX = `${EXTENSION_ID}/overlay/`;
const PILL_WIDTH_PIXELS = 56;
const PILL_HEIGHT_PIXELS = 32;
const CONTROL_HALF_WIDTH_PIXELS = 28;
const CONTROL_HEIGHT_PIXELS = 32;

type OverlayKind = "lock" | "link";
export type LinkOverlayState = "unlinked" | "linked" | "missing";
interface OverlayMetadata { doorId: string; kind: OverlayKind; active: boolean }

function overlayMetadata(item: Item | undefined): OverlayMetadata | null {
  const value = item?.metadata[OVERLAY_KEY];
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<OverlayMetadata>;
  return typeof data.doorId === "string" && (data.kind === "lock" || data.kind === "link") && typeof data.active === "boolean"
    ? data as OverlayMetadata
    : null;
}

async function resolveOverlay(event: ToolEvent): Promise<OverlayMetadata | null> {
  const direct = overlayMetadata(event.target);
  if (direct) return direct;
  if (!event.pointerPosition) return null;
  const overlays = await OBR.scene.local.getItems((item) => Boolean(overlayMetadata(item)));
  for (const item of overlays) {
    const metadata = overlayMetadata(item);
    if (!metadata) continue;
    const center = await OBR.viewport.transformPoint(item.position);
    const left = metadata.kind === "lock" ? center.x - CONTROL_HALF_WIDTH_PIXELS : center.x;
    const top = center.y - CONTROL_HEIGHT_PIXELS / 2;
    if (event.pointerPosition.x >= left && event.pointerPosition.x <= left + CONTROL_HALF_WIDTH_PIXELS
      && event.pointerPosition.y >= top && event.pointerPosition.y <= top + CONTROL_HEIGHT_PIXELS) return metadata;
  }
  return null;
}

function overlayId(doorId: string, kind: OverlayKind): string {
  return `${OVERLAY_PREFIX}${doorId}/${kind}`;
}

function iconUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

export function doorOverlayDefinitions(locked: boolean, linkState: LinkOverlayState) {
  return [
    { kind: "lock" as const, active: locked, icon: locked ? "/overlay-locked-billboard.png" : "/overlay-unlocked-billboard.png", name: locked ? "Unlock Door" : "Lock Door" },
    {
      kind: "link" as const,
      active: linkState === "linked",
      icon: linkState === "linked"
        ? "/overlay-unlinked-billboard.png"
        : linkState === "missing"
          ? "/overlay-linked-warning-billboard.png"
          : "/overlay-linked-billboard.png",
      name: linkState === "linked" ? "Unlink Door" : "Link Door",
    },
  ];
}

async function buildDoorOverlays(image: Image): Promise<Item[]> {
  const metadata = readDoorJamMetadata(image);
  if (!metadata) return [];
  const bounds = await OBR.scene.items.getItemBounds([image.id]);
  const sceneDpi = await OBR.scene.grid.getDpi();
  const linkState: LinkOverlayState = !metadata.fogDoor
    ? "unlinked"
    : (await getDoorState(metadata.fogDoor)).ok
      ? "linked"
      : "missing";
  const definitions = doorOverlayDefinitions(metadata.locked === true, linkState);
  const pill = buildBillboard(
    { url: iconUrl("/door-overlay-billboard.png"), mime: "image/png", width: PILL_WIDTH_PIXELS, height: PILL_HEIGHT_PIXELS },
    { dpi: sceneDpi, offset: { x: PILL_WIDTH_PIXELS / 2, y: PILL_HEIGHT_PIXELS / 2 } },
  )
    .id(`${OVERLAY_PREFIX}${image.id}/pill`).name("DoorJam door controls")
    .position(bounds.center)
    .layer("CONTROL").locked(true).disableHit(true).disableAutoZIndex(true).zIndex(9_999).build();
  const glyphs = definitions.map((definition, index) => {
    const glyph = buildBillboard(
      { url: iconUrl(definition.icon), mime: "image/png", width: CONTROL_HALF_WIDTH_PIXELS, height: CONTROL_HEIGHT_PIXELS },
      { dpi: sceneDpi, offset: { x: index === 0 ? CONTROL_HALF_WIDTH_PIXELS : 0, y: CONTROL_HEIGHT_PIXELS / 2 } },
    )
      .id(overlayId(image.id, definition.kind))
      .name(`DoorJam: ${definition.name}`)
      .position(bounds.center)
      .metadata({ [OVERLAY_KEY]: { doorId: image.id, kind: definition.kind, active: definition.active } })
      .layer("CONTROL").locked(true).disableHit(false).disableAutoZIndex(true).zIndex(10_000).build();
    return glyph;
  });
  return [pill, ...glyphs];
}

async function clearOverlays(): Promise<void> {
  const overlays = await OBR.scene.local.getItems((item) => item.id.startsWith(OVERLAY_PREFIX));
  if (overlays.length) await OBR.scene.local.deleteItems(overlays.map((item) => item.id));
}

let refreshRequest = 0;

export async function refreshDoorOverlays(): Promise<void> {
  const request = ++refreshRequest;
  try {
    await clearOverlays();
    if (await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady()) || await OBR.tool.getActiveTool() !== `${EXTENSION_ID}/tool`) return;
    const sceneItems = await OBR.scene.items.getItems();
    const doors = sceneItems.filter((item): item is Image => isImage(item) && Boolean(readDoorJamMetadata(item)));
    const overlays = (await Promise.all(doors.map(buildDoorOverlays))).flat();
    if (request !== refreshRequest) return;
    if (overlays.length) await OBR.scene.local.addItems(overlays);
  } catch {
    // Status overlays are optional and must never interrupt door operation.
  }
}

export async function handleDoorOverlayDoubleClick(event: ToolEvent): Promise<boolean> {
  const overlay = await resolveOverlay(event);
  if (!overlay || await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) return false;
  const door = (await OBR.scene.items.getItems([overlay.doorId]))[0];
  if (!door || !isImage(door)) return false;
  const metadata = readDoorJamMetadata(door);
  if (!metadata) return false;

  if (overlay.kind === "lock") {
    await OBR.scene.items.updateItems([door.id], (items) => {
      const item = items[0];
      if (!item) return;
      const current = readDoorJamMetadata(item);
      if (current) setDoorLocked(item, current, current.locked !== true);
    });
    return true;
  }

  if (metadata.fogDoor && (await getDoorState(metadata.fogDoor)).ok) {
    await OBR.scene.items.updateItems([door.id], (items) => {
      const item = items[0];
      if (!item) return;
      const current = readDoorJamMetadata(item);
      if (current) removeFogDoorLink(item, current);
    });
    await OBR.notification.show("Dynamic Fog link removed. DoorJam artwork was preserved.", "DEFAULT");
    return true;
  }

  const result = await linkNearbyDoorOrCreate(door, () => OBR.notification.show("No existing Dynamic Fog door found in range. Attempting to create new Dynamic Fog door.", "DEFAULT"));
  if (!result.ok) await OBR.notification.show(result.message, "ERROR");
  else {
    await OBR.notification.show(result.outcome === "linked-existing" ? "Door image linked to Dynamic Fog door." : "New Dynamic Fog door created. Door image linked.", "DEFAULT");
    if (result.needsOpenArtwork) await openDoorImagesPopover(door.id);
  }
  return true;
}

export async function setupDoorOverlays(): Promise<() => void> {
  const removeTool = OBR.tool.onToolChange(() => void refreshDoorOverlays());
  const removeItems = OBR.scene.items.onChange(() => void refreshDoorOverlays());
  const removeReady = OBR.scene.onReadyChange(() => void refreshDoorOverlays());
  await refreshDoorOverlays();
  return () => {
    refreshRequest += 1;
    removeTool();
    removeItems();
    removeReady();
    void clearOverlays();
  };
}
