import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  choose: vi.fn(),
  updateItems: vi.fn(),
  removeMetadata: vi.fn(),
  removeFogLink: vi.fn(),
  setLocked: vi.fn(),
  link: vi.fn(),
  getDoorState: vi.fn(),
  readMetadata: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    player: { getRole: vi.fn().mockResolvedValue("GM") },
    scene: { isReady: vi.fn().mockResolvedValue(true), items: { updateItems: mocks.updateItems } },
    notification: { show: mocks.notify },
  },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../doorJam/control", () => ({ toggleLinkedDoorState: mocks.toggle, doorStateErrorMessage: () => "error" }));
vi.mock("../doorJam/linking", () => ({ linkNearbyDoorOrCreate: mocks.link }));
vi.mock("../dynamicFog/adapter", () => ({ getDoorState: mocks.getDoorState }));
vi.mock("../doorJam/artwork", () => ({ chooseDoorArtwork: mocks.choose }));
vi.mock("../doorJam/metadata", () => ({ readDoorJamMetadata: mocks.readMetadata, removeDoorJamMetadata: mocks.removeMetadata, removeFogDoorLink: mocks.removeFogLink, setDoorLocked: mocks.setLocked }));
vi.mock("../doorJam/settings", () => ({ getDoorJamSettings: vi.fn().mockResolvedValue({ playersCanOperate: true }), setPlayersCanOperate: vi.fn() }));

import { DOOR_ACTION_SHORTCUTS, DOORJAM_TOOL_SHORTCUT, performDoorAction, PLAYER_OPERATION_SHORTCUT } from "./actions";

const image = { id: "door", type: "IMAGE" } as Image;

describe("DoorJam tool modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readMetadata.mockReturnValue(undefined);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([image]));
  });

  it("operates only configured image targets", async () => {
    mocks.readMetadata.mockReturnValue({ fogDoor: {} });
    mocks.toggle.mockResolvedValue({ ok: true });
    await performDoorAction("operate", image);
    expect(mocks.toggle).toHaveBeenCalledWith("door");
  });

  it("links an image and reports a cancelled automatic artwork picker", async () => {
    mocks.link.mockResolvedValue({ ok: true, outcome: "linked-existing", distance: 10, doorCount: 1, artworkRequested: true, artworkSet: false });
    await performDoorAction("link", image);
    expect(mocks.link).toHaveBeenCalledWith(image, expect.any(Function));
    expect(mocks.notify).toHaveBeenCalledWith(expect.stringContaining("Door linked"), "DEFAULT");
  });

  it("sets closed artwork through its tool action", async () => {
    mocks.readMetadata.mockReturnValue({ fogDoor: {} });
    mocks.choose.mockResolvedValue(true);
    await performDoorAction("setClosed", image);
    expect(mocks.choose).toHaveBeenCalledWith("door", "closed");
  });

  it("sets open artwork on an unconfigured image", async () => {
    mocks.choose.mockResolvedValue(true);
    await performDoorAction("setOpen", image);
    expect(mocks.choose).toHaveBeenCalledWith("door", "open");
  });

  it("unlinks a fog-backed door without removing DoorJam metadata", async () => {
    const metadata = { fogDoor: { fogItemId: "fog", doorIndex: 0 } };
    mocks.readMetadata.mockReturnValue(metadata);
    await performDoorAction("unlink", image);
    expect(mocks.removeFogLink).toHaveBeenCalledWith(image, metadata);
    expect(mocks.removeMetadata).not.toHaveBeenCalled();
  });

  it("removes DoorJam metadata from a standalone door", async () => {
    mocks.readMetadata.mockReturnValue({ renderedState: "closed" });
    await performDoorAction("remove", image);
    expect(mocks.removeMetadata).toHaveBeenCalledWith(image);
    expect(mocks.removeFogLink).not.toHaveBeenCalled();
  });

  it("toggles the lock state of a configured door", async () => {
    const metadata = { renderedState: "closed", locked: false };
    mocks.readMetadata.mockReturnValue(metadata);
    await performDoorAction("lock", image);
    expect(mocks.setLocked).toHaveBeenCalledWith(image, metadata, true);
  });

  it("assigns the requested shortcuts without overloading a key", () => {
    expect(DOOR_ACTION_SHORTCUTS).toEqual({
      operate: "O",
      lock: "L",
      setOpen: "I",
      setClosed: "C",
      link: "&",
      unlink: "?",
      remove: "R",
    });
    expect(PLAYER_OPERATION_SHORTCUT).toBe("X");

    const shortcuts = [DOORJAM_TOOL_SHORTCUT, PLAYER_OPERATION_SHORTCUT, ...Object.values(DOOR_ACTION_SHORTCUTS)];
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});
