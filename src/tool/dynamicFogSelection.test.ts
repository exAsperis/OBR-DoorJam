import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activate: vi.fn(), notify: vi.fn(), createMode: vi.fn(), removeMode: vi.fn(), getLocal: vi.fn(), deleteLocal: vi.fn(), addLocal: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", () => ({
  default: {
    tool: { activateMode: mocks.activate, createMode: mocks.createMode, removeMode: mocks.removeMode },
    notification: { show: mocks.notify },
    scene: { local: { getItems: mocks.getLocal, deleteItems: mocks.deleteLocal, addItems: mocks.addLocal }, items: { getItems: vi.fn() } },
    viewport: { getScale: vi.fn().mockResolvedValue(1) },
  },
  buildShape: vi.fn(), isImage: vi.fn(),
}));
vi.mock("../dynamicFog/adapter", () => ({ DYNAMIC_FOG_DOOR_INDEX_KEY: "rodeo.owlbear.dynamic-fog/door-index", enumerateDoors: vi.fn(), resolveManualDoorTarget: vi.fn() }));
vi.mock("../doorJam/linking", () => ({ linkDynamicFogDoor: vi.fn() }));
vi.mock("../doorJam/imagesPopover", () => ({ openDoorImagesPopover: vi.fn() }));

import { beginDynamicFogSelection, clearPendingDynamicFogSelection, getPendingDynamicFogSelection, setupDynamicFogSelectionMode } from "./dynamicFogSelection";

describe("manual Dynamic Fog selection state", () => {
  beforeEach(() => { vi.clearAllMocks(); clearPendingDynamicFogSelection(); mocks.getLocal.mockResolvedValue([]); });

  it("remembers only the DoorJam image id while selection is pending", async () => {
    await beginDynamicFogSelection("door-image");
    expect(getPendingDynamicFogSelection()).toBe("door-image");
    expect(mocks.activate).toHaveBeenCalled();
  });

  it("clears pending selection on cancellation and tool deactivation", async () => {
    await beginDynamicFogSelection("door-image"); clearPendingDynamicFogSelection();
    expect(getPendingDynamicFogSelection()).toBeNull();
    await beginDynamicFogSelection("door-image"); await setupDynamicFogSelectionMode();
    const mode = mocks.createMode.mock.calls[0][0]; mode.onDeactivate();
    expect(getPendingDynamicFogSelection()).toBeNull();
  });
});
