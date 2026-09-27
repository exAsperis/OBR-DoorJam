import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(), setMetadata: vi.fn(), notify: vi.fn(), createMode: vi.fn(), removeMode: vi.fn(),
  getLocal: vi.fn(), deleteLocal: vi.fn(), addLocal: vi.fn(), getItems: vi.fn(), onReadyChange: vi.fn(),
  enumerate: vi.fn(), resolve: vi.fn(), link: vi.fn(), openImages: vi.fn(),
}));

vi.mock("@owlbear-rodeo/sdk", () => {
  const buildShape = () => {
    const item: Record<string, unknown> = { metadata: {}, scale: { x: 1, y: 1 } };
    const builder = new Proxy({}, {
      get: (_target, property) => property === "build" ? () => item : (value: unknown) => {
        if (property === "metadata") item.metadata = value;
        else if (property === "position") item.position = value;
        else if (property === "attachedTo") item.attachedTo = value;
        else if (property === "width") item.width = value;
        else if (property === "height") item.height = value;
        else if (property === "id") item.id = value;
        return builder;
      },
    });
    return builder;
  };
  return {
    default: {
      tool: { activateMode: mocks.activate, setMetadata: mocks.setMetadata, createMode: mocks.createMode, removeMode: mocks.removeMode },
      notification: { show: mocks.notify },
      scene: {
        local: { getItems: mocks.getLocal, deleteItems: mocks.deleteLocal, addItems: mocks.addLocal },
        items: { getItems: mocks.getItems }, onReadyChange: mocks.onReadyChange,
      },
      viewport: { getScale: vi.fn().mockResolvedValue(1) },
    },
    buildShape,
  };
});
vi.mock("../dynamicFog/adapter", () => ({
  DYNAMIC_FOG_DOOR_INDEX_KEY: "rodeo.owlbear.dynamic-fog/door-index",
  enumerateDoors: mocks.enumerate,
  resolveManualDoorTarget: mocks.resolve,
}));
vi.mock("../doorJam/linking", () => ({ linkDynamicFogDoor: mocks.link }));
vi.mock("../doorJam/imagesPopover", () => ({ openDoorImagesPopover: mocks.openImages }));

import { DYNAMIC_FOG_SELECTION_ACTIVE_KEY } from "../constants";
import { DYNAMIC_FOG_SELECTION_MODE_ID, beginDynamicFogSelection, clearPendingDynamicFogSelection, getPendingDynamicFogSelection, setupDynamicFogSelectionMode } from "./dynamicFogSelection";
import { DOORJAM_TOOL_ID } from "./ids";

const markerKey = "com.ex-asperis.doorjam/dynamic-fog-selection-marker";
const doorIndexKey = "rodeo.owlbear.dynamic-fog/door-index";
const fog = { id: "fog", type: "PATH", layer: "FOG", metadata: {} };
const image = { id: "door-image", type: "IMAGE", metadata: {} };
const locatedDoor = { ref: { fogItemId: "fog", doorIndex: 2 }, open: false, geometry: { midpoint: { x: 100, y: 200 } } };

describe("manual Dynamic Fog selection state", () => {
  beforeEach(() => {
    vi.clearAllMocks(); clearPendingDynamicFogSelection();
    mocks.getLocal.mockResolvedValue([]);
    mocks.setMetadata.mockResolvedValue(undefined); mocks.activate.mockResolvedValue(undefined);
    mocks.onReadyChange.mockReturnValue(vi.fn());
    mocks.enumerate.mockResolvedValue({ doors: [locatedDoor], invalidGeometry: false });
    mocks.resolve.mockReturnValue({ ok: true, ref: locatedDoor.ref });
    mocks.link.mockResolvedValue({ ok: true, warning: false, needsOpenArtwork: false });
    mocks.getItems.mockImplementation(async (query: unknown) => typeof query === "function" ? [fog] : (query as string[]).map((id) => id === "fog" ? fog : image));
  });

  it("makes the mode eligible before activating it without a duplicate notification", async () => {
    await beginDynamicFogSelection("door-image");
    expect(getPendingDynamicFogSelection()).toBe("door-image");
    expect(mocks.setMetadata).toHaveBeenCalledWith(DOORJAM_TOOL_ID, { [DYNAMIC_FOG_SELECTION_ACTIVE_KEY]: true });
    expect(mocks.setMetadata.mock.invocationCallOrder[0]).toBeLessThan(mocks.activate.mock.invocationCallOrder[0]);
    expect(mocks.activate).toHaveBeenCalledWith(DOORJAM_TOOL_ID, DYNAMIC_FOG_SELECTION_MODE_ID);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("registers an icon controlled by transient metadata rather than its own active mode", async () => {
    await setupDynamicFogSelectionMode();
    const filter = mocks.createMode.mock.calls[0][0].icons[0].filter;
    expect(filter.activeModes).toBeUndefined();
    expect(filter.metadata).toEqual([{ key: [DYNAMIC_FOG_SELECTION_ACTIVE_KEY], value: true }]);
  });

  it("links a directly targeted local selector and returns to Operate", async () => {
    await setupDynamicFogSelectionMode(); await beginDynamicFogSelection("door-image");
    const mode = mocks.createMode.mock.calls[0][0];
    await mode.onToolClick({}, { pointerPosition: { x: 100, y: 200 }, target: { attachedTo: "fog", metadata: { [markerKey]: true, [doorIndexKey]: 2 } } });
    expect(mocks.resolve).toHaveBeenCalledWith({ attachedTo: "fog", metadata: { [doorIndexKey]: 2 } }, [fog]);
    expect(mocks.link).toHaveBeenCalledWith(image, locatedDoor.ref);
    expect(mocks.activate).toHaveBeenLastCalledWith(DOORJAM_TOOL_ID, expect.stringContaining("/operate"));
  });

  it("uses scene-coordinate marker hit testing when Owlbear supplies no local target", async () => {
    await setupDynamicFogSelectionMode(); await beginDynamicFogSelection("door-image");
    const mode = mocks.createMode.mock.calls[0][0];
    mode.onActivate(); await vi.waitFor(() => expect(mocks.addLocal).toHaveBeenCalled());
    await mode.onToolClick({}, { pointerPosition: { x: 104, y: 198 } });
    expect(mocks.resolve).toHaveBeenCalledWith({ attachedTo: "fog", metadata: { [doorIndexKey]: 2 } }, [fog]);
    expect(mocks.link).toHaveBeenCalledOnce();
  });

  it("ignores clicks outside selectors and keeps selection pending", async () => {
    await setupDynamicFogSelectionMode(); await beginDynamicFogSelection("door-image");
    const mode = mocks.createMode.mock.calls[0][0];
    mode.onActivate(); await vi.waitFor(() => expect(mocks.addLocal).toHaveBeenCalled());
    await mode.onToolClick({}, { pointerPosition: { x: 500, y: 500 }, target: fog });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(getPendingDynamicFogSelection()).toBe("door-image");
  });

  it("clears selection state and selectors on Escape", async () => {
    await setupDynamicFogSelectionMode(); await beginDynamicFogSelection("door-image");
    const mode = mocks.createMode.mock.calls[0][0];
    mode.onKeyDown({}, { key: "Escape" });
    await vi.waitFor(() => expect(getPendingDynamicFogSelection()).toBeNull());
    expect(mocks.setMetadata).toHaveBeenLastCalledWith(DOORJAM_TOOL_ID, { [DYNAMIC_FOG_SELECTION_ACTIVE_KEY]: false });
    expect(mocks.getLocal).toHaveBeenCalled();
  });

  it("clears state on mode deactivation, scene loss, and cleanup", async () => {
    const cleanup = await setupDynamicFogSelectionMode();
    const mode = mocks.createMode.mock.calls[0][0];
    await beginDynamicFogSelection("door-image"); mode.onDeactivate();
    await vi.waitFor(() => expect(getPendingDynamicFogSelection()).toBeNull());
    await beginDynamicFogSelection("door-image"); mocks.onReadyChange.mock.calls[0][0](false);
    await vi.waitFor(() => expect(getPendingDynamicFogSelection()).toBeNull());
    await beginDynamicFogSelection("door-image"); cleanup();
    await vi.waitFor(() => expect(getPendingDynamicFogSelection()).toBeNull());
    expect(mocks.removeMode).toHaveBeenLastCalledWith(DYNAMIC_FOG_SELECTION_MODE_ID);
  });
});
