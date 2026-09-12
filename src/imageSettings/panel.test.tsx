import { fireEvent, render, waitFor } from "@testing-library/react";
import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOORJAM_METADATA_KEY } from "../constants";

const mocks = vi.hoisted(() => ({ getItems: vi.fn(), choose: vi.fn(), swap: vi.fn(), itemChange: vi.fn(() => vi.fn()), readyChange: vi.fn(() => vi.fn()), themeChange: vi.fn(() => vi.fn()) }));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    onReady: (callback: () => unknown) => void callback(),
    player: { getRole: vi.fn().mockResolvedValue("GM") },
    scene: {
      isReady: vi.fn().mockResolvedValue(true),
      items: { getItems: mocks.getItems, onChange: mocks.itemChange },
      onReadyChange: mocks.readyChange,
    },
    theme: {
      getTheme: vi.fn().mockResolvedValue({ mode: "DARK", primary: { main: "#f90", contrastText: "#fff" }, background: { default: "#111", paper: "#222" }, text: { primary: "#fff", secondary: "#aaa", disabled: "#777" } }),
      onChange: mocks.themeChange,
    },
  },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../doorJam/artwork", () => ({ chooseDoorArtwork: mocks.choose, swapDoorArtwork: mocks.swap }));

import { ImageSettingsPanel } from "./panel";

const closed = { image: { url: "closed.png", mime: "image/png", width: 100, height: 100 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };
const open = { image: { url: "open.png", mime: "image/png", width: 100, height: 100 }, grid: { dpi: 100, offset: { x: 0, y: 0 } } };

describe("ImageSettingsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows both configured door images and selects either state", async () => {
    const image = { id: "door", type: "IMAGE", metadata: { [DOORJAM_METADATA_KEY]: { version: 2, openImage: open, closedImage: closed, renderedState: "closed" } }, ...closed } as unknown as Image;
    mocks.getItems.mockResolvedValue([image]);
    mocks.choose.mockResolvedValue(false);
    const view = render(<ImageSettingsPanel targetImageId="door" />);
    await waitFor(() => expect((view.getByAltText("open door artwork") as HTMLImageElement).getAttribute("src")).toBe("open.png"));
    expect((view.getByAltText("closed door artwork") as HTMLImageElement).getAttribute("src")).toBe("closed.png");
    fireEvent.click(view.getByRole("button", { name: "Set open door image" }));
    await waitFor(() => expect(mocks.choose).toHaveBeenCalledWith("door", "open"));
    const swap = view.getByRole("button", { name: "Swap open and closed door images" }) as HTMLButtonElement;
    expect(swap.disabled).toBe(false);
    fireEvent.click(swap);
    await waitFor(() => expect(mocks.swap).toHaveBeenCalledWith("door"));
  });

  it("uses an ordinary image as the closed preview and leaves Open empty", async () => {
    mocks.getItems.mockResolvedValue([{ id: "plain", type: "IMAGE", metadata: {}, ...closed }]);
    const view = render(<ImageSettingsPanel targetImageId="plain" />);
    await waitFor(() => expect((view.getByAltText("closed door artwork") as HTMLImageElement).getAttribute("src")).toBe("closed.png"));
    expect(view.getByText("No image set")).toBeTruthy();
    expect((view.getByRole("button", { name: "Swap open and closed door images" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables image selection when the target is unavailable", async () => {
    mocks.getItems.mockResolvedValue([]);
    const view = render(<ImageSettingsPanel targetImageId="missing" />);
    await waitFor(() => expect(view.getByText("This door image is no longer available.")).toBeTruthy());
    expect(view.queryAllByRole("button")).toHaveLength(0);
  });
});
