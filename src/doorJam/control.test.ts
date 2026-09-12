import type { Image } from "@owlbear-rodeo/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), getItems: vi.fn(), getDoorState: vi.fn(), setDoorState: vi.fn(), render: vi.fn(), settings: vi.fn(), read: vi.fn(), broadcast: vi.fn(),
}));

vi.mock("@owlbear-rodeo/sdk", () => ({
  default: { player: { getRole: mocks.role }, scene: { items: { getItems: mocks.getItems } }, broadcast: { sendMessage: mocks.broadcast } },
  isImage: (item: { type?: string }) => item.type === "IMAGE",
}));
vi.mock("../dynamicFog/adapter", () => ({ getDoorState: mocks.getDoorState, setDoorState: mocks.setDoorState }));
vi.mock("./artwork", () => ({ renderDoorImage: mocks.render }));
vi.mock("./metadata", () => ({ readDoorJamMetadata: mocks.read }));
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
});
