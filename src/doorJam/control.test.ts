import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), getItems: vi.fn(), updateItems: vi.fn(), getDoorState: vi.fn(), setDoorState: vi.fn(), render: vi.fn(), settings: vi.fn(), read: vi.fn(), write: vi.fn(), readGenerated: vi.fn(), applyGenerated: vi.fn(), broadcast: vi.fn(),
}));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { player: { getRole: mocks.role }, scene: { grid: { getDpi: vi.fn().mockResolvedValue(100) }, items: { getItems: mocks.getItems, updateItems: mocks.updateItems } }, broadcast: { sendMessage: mocks.broadcast } },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../dynamicFog/adapter", () => ({ getDoorState: mocks.getDoorState, setDoorState: mocks.setDoorState }));
vi.mock("./artwork", () => ({ renderDoorImage: mocks.render }));
vi.mock("./metadata", () => ({ readDoorJamMetadata: mocks.read, writeDoorJamMetadata: mocks.write }));
vi.mock("../generatedDoors/metadata", () => ({ readGeneratedDoorSpec: mocks.readGenerated }));
vi.mock("../generatedDoors/createGeneratedDoor", () => ({ applyGeneratedDoorGeometry: mocks.applyGenerated }));
vi.mock("./settings", () => ({ getDoorJamSettings: mocks.settings }));

import { handlePlayerDoorOperation, toggleLinkedDoorState } from "./control";

const image = { id: "door", type: "IMAGE" } as Image;

describe("door operation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getItems.mockResolvedValue([image]);
    mocks.role.mockResolvedValue("PLAYER");
    mocks.settings.mockResolvedValue({ playersCanOperate: true });
    mocks.read.mockReturnValue({ version: 2, closedImage: {}, openImage: {}, renderedState: "closed", locked: false });
    mocks.render.mockResolvedValue("updated");
    mocks.readGenerated.mockReturnValue(null);
    mocks.updateItems.mockImplementation(async (_ids, update) => update([image]));
  });

  it("allows a player to operate an unlocked door by default", async () => {
    expect(await toggleLinkedDoorState("door")).toEqual({ ok: true });
    expect(mocks.broadcast).toHaveBeenCalledWith(expect.stringContaining("/operate"), { imageId: "door", open: true }, { destination: "REMOTE" });
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("rejects player operation of a locked door before rendering", async () => {
    mocks.read.mockReturnValue({ version: 2, closedImage: {}, openImage: {}, renderedState: "closed", locked: true });
    expect(await toggleLinkedDoorState("door")).toEqual({ ok: false, reason: "locked" });
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("rejects player operation when disabled for the scene", async () => {
    mocks.settings.mockResolvedValue({ playersCanOperate: false });
    expect(await toggleLinkedDoorState("door")).toEqual({ ok: false, reason: "player-operation-disabled" });
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("lets the GM operate a locked door regardless of the scene setting", async () => {
    mocks.role.mockResolvedValue("GM");
    mocks.settings.mockResolvedValue({ playersCanOperate: false });
    mocks.read.mockReturnValue({ version: 2, closedImage: {}, openImage: {}, renderedState: "closed", locked: true });
    expect(await toggleLinkedDoorState("door")).toEqual({ ok: true });
  });

  it("rechecks player policy in the GM-side request handler", async () => {
    mocks.role.mockResolvedValue("GM");
    expect(await handlePlayerDoorOperation("door")).toEqual({ ok: true });
    expect(mocks.render).toHaveBeenCalledWith("door", true);
    mocks.read.mockReturnValue({ version: 2, closedImage: {}, openImage: {}, renderedState: "closed", locked: true });
    expect(await handlePlayerDoorOperation("door")).toEqual({ ok: false, reason: "locked" });
  });

  it("regenerates generated swing doors when operated", async () => {
    const generated = { id: "generated", type: "PATH", metadata: {} };
    const metadata = { version: 4, renderedState: "closed" as const };
    const spec = { version: 1, type: "swing", leaves: "single", style: "plain", width: 100, thickness: 25, color: "#8b5a2b", hingeSide: "left", openAngle: 90, placementRotation: 0 };
    mocks.role.mockResolvedValue("GM"); mocks.getItems.mockResolvedValue([generated]); mocks.read.mockReturnValue(metadata); mocks.readGenerated.mockReturnValue(spec); mocks.updateItems.mockImplementation(async (_ids, update) => update([generated]));
    await expect(toggleLinkedDoorState("generated")).resolves.toEqual({ ok: true });
    expect(mocks.applyGenerated).toHaveBeenCalledWith(generated, expect.objectContaining({ openAngle: 90 }), 100, true);
    expect(mocks.write).toHaveBeenCalledWith(generated, expect.objectContaining({ renderedState: "open" }));
  });
});
