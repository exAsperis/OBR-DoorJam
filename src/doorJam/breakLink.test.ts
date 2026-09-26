import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ item: { id: "door", metadata: {} as Record<string, unknown> }, update: vi.fn(), get: vi.fn(), notify: vi.fn(), open: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", () => ({ default: { scene: { items: { getItems: mocks.get, updateItems: mocks.update } }, notification: { show: mocks.notify } } }));
vi.mock("./breakLinkPopover", () => ({ openBreakLinkPopover: mocks.open }));
import { DOORJAM_METADATA_KEY } from "../constants"; import { breakDoorLink, breakDoorLinkInteractive } from "./breakLink";
const core = { version: 4, closedImage: { image: { url: "x" }, grid: {} }, renderedState: "closed" };
describe("selective Break Link", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue([mocks.item]); mocks.update.mockImplementation(async (_ids, fn) => fn([mocks.item])); });
  it("removes only one of three links without external calls", async () => {
    mocks.item.metadata[DOORJAM_METADATA_KEY] = { ...core, links: { dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" }, stageManager: { itemIds: ["e", "e2"] } } };
    expect(await breakDoorLink("door", "stageManager")).toBe(true);
    expect((mocks.item.metadata[DOORJAM_METADATA_KEY] as { links: object }).links).toEqual({ dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" } });
  });
  it("opens the chooser for multiple links", async () => {
    mocks.item.metadata[DOORJAM_METADATA_KEY] = { ...core, links: { smoke: { doorItemId: "s" }, stageManager: { itemIds: ["e"] } } };
    await breakDoorLinkInteractive("door"); expect(mocks.open).toHaveBeenCalledWith("door");
  });
});
