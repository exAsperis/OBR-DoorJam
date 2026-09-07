import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toggle: vi.fn(),
  link: vi.fn(),
  readMetadata: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    player: { getRole: vi.fn().mockResolvedValue("GM") },
    scene: { isReady: vi.fn().mockResolvedValue(true) },
    notification: { show: mocks.notify },
  },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../doorJam/control", () => ({ toggleLinkedDoorState: mocks.toggle, doorStateErrorMessage: () => "error" }));
vi.mock("../doorJam/linking", () => ({ linkNearestDoorAndChooseArtwork: mocks.link }));
vi.mock("../doorJam/metadata", () => ({ readDoorJamMetadata: mocks.readMetadata }));

import { linkDoorTarget, operateDoorTarget } from "./actions";

const image = { id: "door", type: "IMAGE" } as Image;

describe("DoorJam tool modes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("operates only configured image targets", async () => {
    mocks.readMetadata.mockReturnValue({ fogDoor: {} });
    mocks.toggle.mockResolvedValue({ ok: true });
    await operateDoorTarget(image);
    expect(mocks.toggle).toHaveBeenCalledWith("door");
  });

  it("links an image and reports a cancelled automatic artwork picker", async () => {
    mocks.link.mockResolvedValue({ ok: true, distance: 10, doorCount: 1, artworkRequested: true, artworkSet: false });
    await linkDoorTarget(image);
    expect(mocks.link).toHaveBeenCalledWith(image);
    expect(mocks.notify).toHaveBeenCalledWith(expect.stringContaining("Door linked"), "DEFAULT");
  });
});
