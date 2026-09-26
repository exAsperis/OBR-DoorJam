import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), nearest: vi.fn(), automatic: vi.fn(), create: vi.fn(), creating: vi.fn(), set: vi.fn() }));
const image = { id: "door", type: "IMAGE", image: { url: "closed.png" }, grid: {} } as unknown as Image;

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { scene: { items: {
    getItemBounds: vi.fn().mockResolvedValue({ center: { x: 10, y: 10 } }),
    updateItems: vi.fn(async (_ids, update) => update([image])),
    getItems: vi.fn(async (filter) => Array.isArray(filter) ? [image] : []),
  } } },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../dynamicFog/adapter", () => ({ findNearestDoor: mocks.nearest, findAutomaticDoor: mocks.automatic, createDynamicFogDoor: mocks.create, setDoorState: mocks.set }));
vi.mock("./artwork", () => ({ snapshotArtwork: vi.fn(() => ({ image: {}, grid: {} })) }));
vi.mock("./metadata", () => ({ readDoorJamMetadata: mocks.read, writeDoorJamMetadata: mocks.write }));

import { createAndLinkDoor, linkNearbyDoorOrCreate, linkNearestDoor } from "./linking";

describe("DoorJam linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.nearest.mockResolvedValue({ ref: { fogItemId: "fog", doorIndex: 0 }, distance: 5 });
    mocks.automatic.mockResolvedValue({ ok: false, reason: "none" });
    mocks.set.mockResolvedValue({ ok: true, door: { open: false } });
  });

  it("reports that unified image setup is needed when a newly linked door has no open artwork", async () => {
    mocks.read.mockReturnValue(null);
    const result = await linkNearestDoor(image);
    expect(result).toMatchObject({ ok: true, outcome: "linked-existing", needsOpenArtwork: true });
  });

  it("does not request image setup when open artwork is already saved", async () => {
    mocks.read.mockReturnValue({ openImage: {}, closedImage: {}, renderedState: "closed" });
    const result = await linkNearestDoor(image);
    expect(result).toMatchObject({ ok: true, outcome: "linked-existing", needsOpenArtwork: false });
  });

  it("creates a fog door and links the image to its new index", async () => {
    mocks.create.mockResolvedValue({ ok: true, ref: { fogItemId: "fog", doorIndex: 2 } });
    mocks.read.mockReturnValue(null);
    const result = await createAndLinkDoor(image);
    expect(mocks.write).toHaveBeenCalledWith(image, expect.objectContaining({ links: { dynamicFog: { fogItemId: "fog", doorIndex: 2 } } }));
    expect(result).toMatchObject({ ok: true, outcome: "created-new", needsOpenArtwork: true });
  });

  it("offers a choice and does not create when automatic matching fails", async () => {
    expect(await linkNearbyDoorOrCreate(image, mocks.creating)).toMatchObject({ ok: false, action: "choose", reason: "none" });
    expect(mocks.creating).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
