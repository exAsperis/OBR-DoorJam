import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOORJAM_METADATA_KEY } from "../constants";

const mocks = vi.hoisted(() => ({ downloadImages: vi.fn(), updateItems: vi.fn() }));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { assets: { downloadImages: mocks.downloadImages }, scene: { items: { updateItems: mocks.updateItems } } },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));

import { chooseDoorArtwork, swapDoorArtwork } from "./artwork";

const closed = { image: { url: "closed.png", mime: "image/png", width: 100, height: 200 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
const open = { image: { url: "open.png", mime: "image/png", width: 200, height: 100 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
const image = () => ({ id: "door", type: "IMAGE", metadata: {}, scale: { x: 2, y: 3 }, ...closed } as unknown as Image);
const configuredImage = (renderedState: "open" | "closed") => {
  const target = image();
  target.metadata[DOORJAM_METADATA_KEY] = { version: 2, closedImage: closed, openImage: open, renderedState };
  if (renderedState === "open") Object.assign(target, open);
  return target;
};

describe("open artwork selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a closed standalone door from an ordinary image", async () => {
    const target = image();
    mocks.downloadImages.mockResolvedValue([open]);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));
    expect(await chooseDoorArtwork(target.id, "open")).toBe(true);
    expect(target.metadata[DOORJAM_METADATA_KEY]).toEqual({ version: 2, closedImage: closed, openImage: open, renderedState: "closed" });
    expect(target.image.url).toBe("closed.png");
  });

  it("leaves an ordinary image unconfigured when selection is cancelled", async () => {
    const target = image();
    mocks.downloadImages.mockResolvedValue([]);
    expect(await chooseDoorArtwork(target.id, "open")).toBe(false);
    expect(mocks.updateItems).not.toHaveBeenCalled();
    expect(target.metadata).toEqual({});
  });

  it("immediately renders replacement closed artwork while the door is closed", async () => {
    const target = configuredImage("closed");
    const replacement = { image: { url: "new-closed.png", mime: "image/png", width: 400, height: 100 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
    mocks.downloadImages.mockResolvedValue([replacement]);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));

    expect(await chooseDoorArtwork(target.id, "closed")).toBe(true);
    expect(target.image.url).toBe("new-closed.png");
    expect(target.scale).toEqual({ x: 0.5, y: 6 });
    expect((target.metadata[DOORJAM_METADATA_KEY] as { closedImage: typeof replacement }).closedImage).toEqual(replacement);
  });

  it("immediately renders replacement open artwork while the door is open", async () => {
    const target = configuredImage("open");
    const replacement = { image: { url: "new-open.png", mime: "image/png", width: 100, height: 200 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
    mocks.downloadImages.mockResolvedValue([replacement]);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));

    expect(await chooseDoorArtwork(target.id, "open")).toBe(true);
    expect(target.image.url).toBe("new-open.png");
    expect((target.metadata[DOORJAM_METADATA_KEY] as { openImage: typeof replacement }).openImage).toEqual(replacement);
  });

  it("stores inactive-state artwork without changing the visible image", async () => {
    const target = configuredImage("closed");
    const replacement = { image: { url: "new-open.png", mime: "image/png", width: 300, height: 300 }, grid: { dpi: 150, offset: { x: 0, y: 0 } } };
    mocks.downloadImages.mockResolvedValue([replacement]);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));

    expect(await chooseDoorArtwork(target.id, "open")).toBe(true);
    expect(target.image.url).toBe("closed.png");
    expect(target.scale).toEqual({ x: 2, y: 3 });
    expect((target.metadata[DOORJAM_METADATA_KEY] as { openImage: typeof replacement }).openImage).toEqual(replacement);
  });

  it("replaces an ordinary image selected as closed artwork without configuring a door", async () => {
    const target = image();
    const replacement = { image: { url: "new-closed.png", mime: "image/png", width: 400, height: 100 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
    mocks.downloadImages.mockResolvedValue([replacement]);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));

    expect(await chooseDoorArtwork(target.id, "closed")).toBe(true);
    expect(target.image.url).toBe("new-closed.png");
    expect(target.scale).toEqual({ x: 0.5, y: 6 });
    expect(target.metadata).toEqual({});
  });

  it("swaps both artworks and immediately renders the replacement for the current state", async () => {
    const target = configuredImage("closed");
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));

    expect(await swapDoorArtwork(target.id)).toBe(true);
    expect(target.image.url).toBe("open.png");
    expect(target.metadata[DOORJAM_METADATA_KEY]).toEqual({
      version: 2,
      closedImage: open,
      openImage: closed,
      renderedState: "closed",
    });
  });

  it("does not swap when either artwork is missing", async () => {
    const target = image();
    target.metadata[DOORJAM_METADATA_KEY] = { version: 2, closedImage: closed, renderedState: "closed" };
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));

    expect(await swapDoorArtwork(target.id)).toBe(false);
    expect(target.image.url).toBe("closed.png");
  });
});
