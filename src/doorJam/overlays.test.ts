import type { Image, ToolEvent } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), setLocked: vi.fn(), unlink: vi.fn(), link: vi.fn(), getDoorState: vi.fn(), updateItems: vi.fn(), notify: vi.fn(), localItems: vi.fn(), transformPoint: vi.fn(), door: { id: "door", type: "IMAGE", metadata: {} } }));
const door = mocks.door as Image;
const event = (kind: "lock" | "link", active = false) => ({ target: { metadata: { "com.ex-asperis.doorjam/door-overlay": { doorId: "door", kind, active } } } } as unknown as ToolEvent);

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    player: { getRole: vi.fn().mockResolvedValue("GM") },
    scene: { isReady: vi.fn().mockResolvedValue(true), items: { getItems: vi.fn().mockResolvedValue([mocks.door]), updateItems: mocks.updateItems }, local: { getItems: mocks.localItems } },
    viewport: { transformPoint: mocks.transformPoint },
    notification: { show: mocks.notify }, tool: {},
  },
  buildBillboard: vi.fn(),
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("./metadata", () => ({ readDoorJamMetadata: mocks.read, setDoorLocked: mocks.setLocked, removeFogDoorLink: mocks.unlink }));
vi.mock("./linking", () => ({ linkNearbyDoorOrCreate: mocks.link }));
vi.mock("../dynamicFog/adapter", () => ({ getDoorState: mocks.getDoorState }));

import { doorOverlayDefinitions, handleDoorOverlayDoubleClick } from "./overlays";

describe("door status overlay actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateItems.mockImplementation(async (_ids, update) => update([door]));
    mocks.getDoorState.mockResolvedValue({ ok: false, reason: "missing-item" });
  });

  it("toggles the lock glyph's door", async () => {
    const metadata = { version: 2, renderedState: "closed", locked: false };
    mocks.read.mockReturnValue(metadata);
    expect(await handleDoorOverlayDoubleClick(event("lock"))).toBe(true);
    expect(mocks.setLocked).toHaveBeenCalledWith(door, metadata, true);
  });

  it("unlinks a linked door from its link glyph", async () => {
    const metadata = { version: 2, renderedState: "closed", fogDoor: { fogItemId: "fog", doorIndex: 0 } };
    mocks.read.mockReturnValue(metadata);
    mocks.getDoorState.mockResolvedValue({ ok: true, door: { open: false } });
    expect(await handleDoorOverlayDoubleClick(event("link", false))).toBe(true);
    expect(mocks.unlink).toHaveBeenCalledWith(door, metadata);
  });

  it("links or creates from an unlinked glyph", async () => {
    mocks.read.mockReturnValue({ version: 2, renderedState: "closed" });
    mocks.link.mockResolvedValue({ ok: true, outcome: "created-new", distance: 0, doorCount: 1 });
    expect(await handleDoorOverlayDoubleClick(event("link"))).toBe(true);
    expect(mocks.link).toHaveBeenCalledWith(door, expect.any(Function));
  });

  it("maps glyphs to the door's actual lock and link states", () => {
    expect(doorOverlayDefinitions(true, true).map(({ icon }) => icon)).toEqual(["/overlay-locked-billboard.png", "/overlay-unlinked-billboard.png"]);
    expect(doorOverlayDefinitions(false, false).map(({ icon }) => icon)).toEqual(["/overlay-unlocked-billboard.png", "/overlay-linked-billboard.png"]);
  });

  it("resolves a link overlay from its screen-space half when Owlbear reports the underlying image", async () => {
    const metadata = { version: 2, renderedState: "closed", fogDoor: { fogItemId: "fog", doorIndex: 0 } };
    mocks.read.mockReturnValue(metadata);
    mocks.getDoorState.mockResolvedValue({ ok: true, door: { open: false } });
    mocks.localItems.mockResolvedValue([{ position: { x: 10, y: 10 }, metadata: { "com.ex-asperis.doorjam/door-overlay": { doorId: "door", kind: "link", active: true } } }]);
    mocks.transformPoint.mockResolvedValue({ x: 100, y: 100 });
    const pointerEvent = { target: door, pointerPosition: { x: 110, y: 100 } } as unknown as ToolEvent;
    expect(await handleDoorOverlayDoubleClick(pointerEvent)).toBe(true);
    expect(mocks.unlink).toHaveBeenCalledWith(door, metadata);
  });
});
