import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoorRow } from "./DoorRow";

vi.mock("../doorJam/highlight", () => ({ showDoorHighlight: vi.fn(), clearDoorHighlight: vi.fn() }));

const door = { id: "door", name: "North Door", thumbnailUrl: "door.png", state: "closed" as const, linkValid: true, hasOpenArtwork: true };

describe("DoorRow", () => {
  it("shows the compact action and scene-selection state", () => {
    const view = render(<DoorRow door={door} selected busy={false} onRename={vi.fn()} onToggle={vi.fn()} />);
    expect(view.getByRole("listitem").className).toContain("selected");
    expect(view.getByRole("button", { name: "Open" })).toBeTruthy();
  });

  it("saves a changed name on Enter", async () => {
    const rename = vi.fn().mockResolvedValue(true);
    const view = render(<DoorRow door={door} busy={false} onRename={rename} onToggle={vi.fn()} />);
    const input = view.getByLabelText("Name for North Door") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Library Door" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(rename).toHaveBeenCalledWith("door", "Library Door"));
  });

  it("cancels a changed name on Escape", async () => {
    const rename = vi.fn().mockResolvedValue(true);
    const view = render(<DoorRow door={door} busy={false} onRename={rename} onToggle={vi.fn()} />);
    const input = view.getByLabelText("Name for North Door") as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: "Nope" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(input.value).toBe("North Door"));
    expect(rename).not.toHaveBeenCalled();
  });
});
