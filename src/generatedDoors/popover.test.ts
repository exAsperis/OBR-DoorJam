import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), onMessage: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", () => ({ default: {
  viewport: { getWidth: vi.fn().mockResolvedValue(1000), getHeight: vi.fn().mockResolvedValue(800) },
  popover: { open: mocks.open, close: mocks.close }, broadcast: { onMessage: mocks.onMessage },
} }));

import { openGeneratedDoorPopover, setupGeneratedDoorPopoverMovement } from "./popover";

describe("generated door popover placement", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.close.mockResolvedValue(undefined); mocks.open.mockResolvedValue(undefined); });

  it("keeps the popover left of the main tool rail", async () => {
    await openGeneratedDoorPopover();
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ anchorPosition: { left: 928, top: 72 } }));
  });

  it("keeps dragged popovers within the same right-side clearance", async () => {
    setupGeneratedDoorPopoverMovement();
    const handler = mocks.onMessage.mock.calls[0][1];
    handler({ data: { dx: 500, dy: 0 } });
    await vi.waitFor(() => expect(mocks.open).toHaveBeenLastCalledWith(expect.objectContaining({ anchorPosition: { left: 928, top: 72 } })));
  });
});
