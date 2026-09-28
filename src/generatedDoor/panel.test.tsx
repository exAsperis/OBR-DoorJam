import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), getSettings: vi.fn(), setSettings: vi.fn(), update: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", async (original) => {
  const actual = await original<typeof import("@owlbear-rodeo/sdk")>();
  return { ...actual, default: {
    ...actual.default,
    onReady: (callback: () => void) => callback(),
    theme: { getTheme: vi.fn().mockResolvedValue({ mode: "LIGHT" }), onChange: vi.fn(() => vi.fn()) },
    scene: { grid: { getDpi: vi.fn().mockResolvedValue(100) }, items: { getItems: vi.fn().mockResolvedValue([]) } },
    broadcast: { sendMessage: mocks.send }, popover: { setHeight: vi.fn() },
  } };
});
vi.mock("../generatedDoors/settings", () => ({ getGeneratedDoorSettings: mocks.getSettings, setGeneratedDoorSettings: mocks.setSettings }));
vi.mock("../generatedDoors/createGeneratedDoor", () => ({ updateGeneratedDoor: mocks.update }));
vi.mock("../theme", () => ({ applyOwlbearTheme: vi.fn() }));

import { GeneratedDoorPopover } from "./panel";

describe("generated door popover rotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue({ version: 1, type: "swing", leaves: "single", style: "plain", width: 100, thickness: 25, color: "#8b5a2b", hingeSide: "left", openAngle: 90, showKnob: false, placementRotation: 0 });
  });

  it("rotates both previews and updates the live ghost when rotation is typed", async () => {
    const { container } = render(<GeneratedDoorPopover/>);
    const input = await screen.findByLabelText("Rotation in degrees");
    expect([...container.querySelectorAll(".previews path")].map((path) => path.getAttribute("transform"))).toEqual(["rotate(0)", "rotate(0)"]);
    fireEvent.change(input, { target: { value: "45" } });
    await waitFor(() => expect([...container.querySelectorAll(".previews path")].map((path) => path.getAttribute("transform"))).toEqual(["rotate(45)", "rotate(45)"]));
    expect(mocks.setSettings).toHaveBeenCalledWith(expect.objectContaining({ placementRotation: 45 }), 100);
    expect(mocks.send).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ placementRotation: 45 }), { destination: "LOCAL" });
  });
});
