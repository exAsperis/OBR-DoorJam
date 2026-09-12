import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bounds: vi.fn(), transform: vi.fn(), close: vi.fn(), open: vi.fn() }));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    scene: { items: { getItemBounds: mocks.bounds } },
    viewport: { transformPoint: mocks.transform },
    popover: { close: mocks.close, open: mocks.open },
  },
}));

import { DOOR_IMAGES_POPOVER_ID, openDoorImagesPopover } from "./imagesPopover";

describe("openDoorImagesPopover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bounds.mockResolvedValue({ center: { x: 50, y: 75 } });
    mocks.transform.mockResolvedValue({ x: 150, y: 275 });
    mocks.close.mockResolvedValue(undefined);
  });

  it("opens the unified image form for the targeted door at its viewport position", async () => {
    await openDoorImagesPopover("door / one");
    expect(mocks.close).toHaveBeenCalledWith(DOOR_IMAGES_POPOVER_ID);
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({
      id: DOOR_IMAGES_POPOVER_ID,
      url: "/image-settings.html?imageId=door%20%2F%20one",
      width: 320,
      height: 230,
      anchorReference: "POSITION",
      anchorPosition: { left: 150, top: 275 },
      transformOrigin: { horizontal: "RIGHT", vertical: "BOTTOM" },
    }));
  });
});
