import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), bounds: vi.fn(), update: vi.fn(), list: vi.fn(), set: vi.fn(), popover: vi.fn(), images: vi.fn() }));
const door = { id: "door", type: "IMAGE", metadata: {}, image: { url: "closed.png" }, grid: {} } as unknown as Image;
vi.mock("@owlbear-rodeo/sdk", () => ({ default: { scene: { items: { getItems: mocks.get, getItemBounds: mocks.bounds, updateItems: mocks.update } } }, isImage: (item: { type?: string }) => item.type === "IMAGE" }));
vi.mock("./adapter", () => ({ listStageManagerElevators: mocks.list, setStageManagerElevatorDisabled: mocks.set }));
vi.mock("./linkPopover", () => ({ openStageManagerLinkPopover: mocks.popover }));
vi.mock("../doorJam/imagesPopover", () => ({ openDoorImagesPopover: mocks.images }));
import { DOORJAM_METADATA_KEY } from "../constants";
import { discoverAndLinkStageManager, linkStageManagerElevator, unlinkStageManagerElevator } from "./linking";
const box = (x: number) => ({ min: { x, y: 0 }, max: { x: x + 10, y: 10 }, center: { x: x + 5, y: 5 }, width: 10, height: 10 });
describe("Stage Manager linking", () => {
  beforeEach(() => { vi.clearAllMocks(); door.metadata = {}; mocks.get.mockImplementation(async (ids: string[]) => ids.map((id) => id === "door" ? door : ({ id, type: "IMAGE", metadata: {} }))); mocks.bounds.mockImplementation(async ([id]: string[]) => box(id === "door" || id === "overlap" ? 0 : 100)); mocks.update.mockImplementation(async (_ids, fn) => fn([door])); mocks.set.mockResolvedValue({ ok: true, value: undefined }); });
  it("auto-selects the self Elevator", async () => {
    mocks.list.mockResolvedValue({ ok: true, value: [{ itemId: "door", name: "Door", disabled: true }, { itemId: "far", name: "Far", disabled: false }] });
    await expect(discoverAndLinkStageManager(door)).resolves.toMatchObject({ ok: true, needsOpenArtwork: true });
    expect((door.metadata[DOORJAM_METADATA_KEY] as { links: object }).links).toEqual({ stageManager: { itemIds: ["door"] } });
  });
  it("auto-selects exactly one overlapping Elevator and otherwise opens the chooser", async () => {
    mocks.list.mockResolvedValue({ ok: true, value: [{ itemId: "overlap", name: "Near", disabled: false }, { itemId: "far", name: "Far", disabled: false }] });
    await discoverAndLinkStageManager(door); expect(mocks.set).toHaveBeenCalledWith("overlap", true);
    mocks.list.mockResolvedValue({ ok: true, value: [{ itemId: "far", name: "Far", disabled: false }] });
    await expect(discoverAndLinkStageManager(door)).resolves.toEqual({ ok: true, choosing: true }); expect(mocks.popover).toHaveBeenCalledWith("door");
  });
  it("opens the chooser for an already-linked door so more Elevators can be selected", async () => {
    door.metadata[DOORJAM_METADATA_KEY] = { version: 4, links: { stageManager: { itemIds: ["overlap"] } }, closedImage: { image: { url: "x" }, grid: {} }, renderedState: "closed" };
    mocks.list.mockResolvedValue({ ok: true, value: [{ itemId: "overlap", name: "Near", disabled: true }] });
    await expect(discoverAndLinkStageManager(door)).resolves.toEqual({ ok: true, choosing: true });
    expect(mocks.popover).toHaveBeenCalledWith("door"); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("does not create metadata when unavailable or empty", async () => {
    mocks.list.mockResolvedValue({ ok: false, message: "unavailable" }); await discoverAndLinkStageManager(door); expect(door.metadata).toEqual({});
    mocks.list.mockResolvedValue({ ok: true, value: [] }); await discoverAndLinkStageManager(door); expect(door.metadata).toEqual({});
  });
  it("preserves fog links and retains a saved link after initial sync failure", async () => {
    door.metadata[DOORJAM_METADATA_KEY] = { version: 4, links: { dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" } }, closedImage: { image: { url: "x" }, grid: {} }, openImage: { image: { url: "o" }, grid: {} }, renderedState: "open" };
    mocks.set.mockResolvedValue({ ok: false, message: "offline" });
    await expect(linkStageManagerElevator("door", "lift")).resolves.toMatchObject({ ok: true, warning: "offline" });
    expect((door.metadata[DOORJAM_METADATA_KEY] as { links: object }).links).toEqual({ dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" }, stageManager: { itemIds: ["lift"] } });
    expect(mocks.set).toHaveBeenCalledWith("lift", false);
  });
  it("adds multiple Elevators and removes only the chosen Elevator", async () => {
    await linkStageManagerElevator("door", "lift-a");
    await linkStageManagerElevator("door", "lift-b");
    expect((door.metadata[DOORJAM_METADATA_KEY] as { links: { stageManager: object } }).links.stageManager).toEqual({ itemIds: ["lift-a", "lift-b"] });
    expect(await unlinkStageManagerElevator("door", "lift-a")).toBe(true);
    expect((door.metadata[DOORJAM_METADATA_KEY] as { links: { stageManager: object } }).links.stageManager).toEqual({ itemIds: ["lift-b"] });
  });
});
