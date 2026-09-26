import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  openImages: vi.fn(),
  updateItems: vi.fn(),
  removeMetadata: vi.fn(),
  removeFogLink: vi.fn(),
  breakLink: vi.fn(),
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
vi.mock("../doorJam/imagesPopover", () => ({ openDoorImagesPopover: mocks.openImages }));
vi.mock("../doorJam/metadata", () => ({ readDoorJamMetadata: mocks.readMetadata, removeDoorJamMetadata: mocks.removeMetadata, countDoorLinks: (metadata: { links?: object }) => Object.keys(metadata.links ?? {}).length, setDoorLocked: mocks.setLocked }));
vi.mock("../doorJam/breakLink", () => ({ breakDoorLinkInteractive: mocks.breakLink }));
vi.mock("../stageManager/linking", () => ({ discoverAndLinkStageManager: vi.fn() }));
vi.mock("../doorJam/settings", () => ({ getDoorJamSettings: vi.fn().mockResolvedValue({ playersCanOperate: true }), setPlayersCanOperate: vi.fn() }));

import { DOOR_ACTION_SHORTCUTS, DOORJAM_TOOL_SHORTCUT, performDoorAction, PLAYER_OPERATION_SHORTCUT } from "./actions";
import { DYNAMIC_FOG_EDITOR_SHORTCUT } from "./dynamicFogEditor";

const RESERVED_SHORTCUTS: string[] = ["1", "2", "3", "4", "5", "6", "7", "-", "=", "W", "S", "F", "D", "M", "Q", "T", "H"];

const image = { id: "door", type: "IMAGE" } as Image;

describe("DoorJam tool modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readMetadata.mockReturnValue(undefined);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([image]));
  });

  it("operates only configured image targets", async () => {
    mocks.readMetadata.mockReturnValue({ links: {} });
    mocks.toggle.mockResolvedValue({ ok: true });
    await performDoorAction("operate", image);
    expect(mocks.toggle).toHaveBeenCalledWith("door");
  });

  it("links an image and opens unified image setup when open artwork is missing", async () => {
    mocks.link.mockResolvedValue({ ok: true, outcome: "linked-existing", distance: 10, doorCount: 1, needsOpenArtwork: true });
    await performDoorAction("link", image);
    expect(mocks.link).toHaveBeenCalledWith(image, expect.any(Function), "dynamic-fog");
    expect(mocks.openImages).toHaveBeenCalledWith("door");
  });

  it("opens unified image setup on an unconfigured image", async () => {
    await performDoorAction("setImages", image);
    expect(mocks.openImages).toHaveBeenCalledWith("door");
  });

  it("unlinks a fog-backed door without removing DoorJam metadata", async () => {
    const metadata = { links: { dynamicFog: { fogItemId: "fog", doorIndex: 0 } } };
    mocks.readMetadata.mockReturnValue(metadata);
    await performDoorAction("unlink", image);
    expect(mocks.breakLink).toHaveBeenCalledWith("door");
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

  it("does not reuse reserved or duplicate shortcuts", () => {
    const shortcuts = [DOORJAM_TOOL_SHORTCUT, PLAYER_OPERATION_SHORTCUT, DYNAMIC_FOG_EDITOR_SHORTCUT, ...Object.values(DOOR_ACTION_SHORTCUTS)];
    expect(shortcuts.filter((shortcut) => RESERVED_SHORTCUTS.includes(shortcut))).toEqual([]);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });
});
