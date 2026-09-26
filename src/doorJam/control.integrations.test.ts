import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), role: vi.fn(), render: vi.fn(), dynamic: vi.fn(), smoke: vi.fn(), stage: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", () => ({ default: { player: { getRole: mocks.role }, scene: { items: { getItems: mocks.get } }, broadcast: { sendMessage: vi.fn() } }, isImage: (item: { type?: string }) => item.type === "IMAGE" }));
vi.mock("./artwork", () => ({ renderDoorImage: mocks.render }));
vi.mock("./providers", () => ({ setDynamicFogDoorState: mocks.dynamic, setSmokeLinkedDoorState: mocks.smoke }));
vi.mock("../stageManager/adapter", () => ({ setStageManagerElevatorDisabled: mocks.stage }));
vi.mock("./settings", () => ({ getDoorJamSettings: vi.fn().mockResolvedValue({ playersCanOperate: true }) }));
import { DOORJAM_METADATA_KEY } from "../constants"; import { setLinkedDoorState, toggleLinkedDoorState } from "./control";
const image = { id: "door", type: "IMAGE", metadata: { [DOORJAM_METADATA_KEY]: { version: 4, links: { dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" }, stageManager: { itemIds: ["e", "e2"] } }, closedImage: { image: { url: "c" }, grid: {} }, openImage: { image: { url: "o" }, grid: {} }, renderedState: "closed" } } };
describe("multi-integration door operations", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.role.mockResolvedValue("GM"); mocks.get.mockResolvedValue([image]); mocks.render.mockResolvedValue("updated"); mocks.dynamic.mockResolvedValue({ ok: true }); mocks.smoke.mockResolvedValue({ ok: true }); mocks.stage.mockResolvedValue({ ok: true }); });
  it("renders first, opens both fog doors, and enables the Elevator", async () => {
    const order: string[] = []; mocks.render.mockImplementation(async () => { order.push("render"); return "updated"; }); mocks.dynamic.mockImplementation(async () => { order.push("dynamic"); return { ok: true }; });
    await expect(setLinkedDoorState("door", true)).resolves.toEqual({ ok: true });
    expect(order[0]).toBe("render"); expect(mocks.dynamic).toHaveBeenCalledWith({ fogItemId: "f", doorIndex: 0 }, true); expect(mocks.smoke).toHaveBeenCalledWith({ doorItemId: "s" }, true); expect(mocks.stage).toHaveBeenCalledWith("e", false); expect(mocks.stage).toHaveBeenCalledWith("e2", false);
  });
  it("attempts every integration and returns warnings when one fails", async () => {
    mocks.smoke.mockResolvedValue({ ok: false }); const result = await setLinkedDoorState("door", false);
    expect(result).toMatchObject({ ok: true, warnings: [{ integration: "smoke" }] }); expect(mocks.dynamic).toHaveBeenCalled(); expect(mocks.stage).toHaveBeenCalledWith("e", true);
  });
  it("uses renderedState rather than querying a provider to choose direction", async () => {
    await toggleLinkedDoorState("door"); expect(mocks.render).toHaveBeenCalledWith("door", true);
  });
});
