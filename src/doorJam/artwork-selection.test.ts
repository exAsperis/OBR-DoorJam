import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOORJAM_METADATA_KEY } from "../constants";

const mocks = vi.hoisted(() => ({ downloadImages: vi.fn(), updateItems: vi.fn() }));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { assets: { downloadImages: mocks.downloadImages }, scene: { items: { updateItems: mocks.updateItems } } },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));

import { chooseOpenArtwork } from "./artwork";

const closed = { image: { url: "closed.png", mime: "image/png", width: 100, height: 200 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
const open = { image: { url: "open.png", mime: "image/png", width: 200, height: 100 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
const image = () => ({ id: "door", type: "IMAGE", metadata: {}, ...closed } as unknown as Image);

describe("open artwork selection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a closed standalone door from an ordinary image", async () => {
    const target = image();
    mocks.downloadImages.mockResolvedValue([open]);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([target]));
    expect(await chooseOpenArtwork(target.id)).toBe(true);
    expect(target.metadata[DOORJAM_METADATA_KEY]).toEqual({ version: 2, closedImage: closed, openImage: open, renderedState: "closed" });
    expect(target.image.url).toBe("closed.png");
  });

  it("leaves an ordinary image unconfigured when selection is cancelled", async () => {
    const target = image();
    mocks.downloadImages.mockResolvedValue([]);
    expect(await chooseOpenArtwork(target.id)).toBe(false);
    expect(mocks.updateItems).not.toHaveBeenCalled();
    expect(target.metadata).toEqual({});
  });
});
