import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ choose: vi.fn(), read: vi.fn(), write: vi.fn(), nearest: vi.fn() }));
const image = { id: "door", type: "IMAGE", image: { url: "closed.png" }, grid: {} } as unknown as Image;

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { scene: { items: {
    getItemBounds: vi.fn().mockResolvedValue({ center: { x: 10, y: 10 } }),
    updateItems: vi.fn(async (_ids, update) => update([image])),
    getItems: vi.fn(async (filter) => Array.isArray(filter) ? [image] : []),
  } } },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../dynamicFog/adapter", () => ({ findNearestDoor: mocks.nearest }));
vi.mock("./artwork", () => ({ chooseOpenArtwork: mocks.choose, snapshotArtwork: vi.fn(() => ({ image: {}, grid: {} })) }));
vi.mock("./metadata", () => ({ readDoorJamMetadata: mocks.read, writeDoorJamMetadata: mocks.write }));

import { linkNearestDoorAndChooseArtwork } from "./linking";

describe("linkNearestDoorAndChooseArtwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nearest.mockResolvedValue({ ref: { fogItemId: "fog", doorIndex: 0 }, distance: 5 });
  });

  it("opens the image picker when a newly linked door has no open artwork", async () => {
    mocks.read.mockReturnValueOnce(null).mockReturnValueOnce({ closedImage: {}, renderedState: "closed" });
    mocks.choose.mockResolvedValue(true);
    const result = await linkNearestDoorAndChooseArtwork(image);
    expect(mocks.choose).toHaveBeenCalledWith("door");
    expect(result).toMatchObject({ ok: true, artworkRequested: true, artworkSet: true });
  });

  it("does not reopen the picker when open artwork is already saved", async () => {
    mocks.read.mockReturnValue({ openImage: {}, closedImage: {}, renderedState: "closed" });
    const result = await linkNearestDoorAndChooseArtwork(image);
    expect(mocks.choose).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
  });
});
