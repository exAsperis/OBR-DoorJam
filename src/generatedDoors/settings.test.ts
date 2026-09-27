import { describe, expect, it } from "vitest";
import { GENERATED_DOOR_SETTINGS_KEY } from "../constants";
import { readGeneratedDoorSettings } from "./settings";
import { DEFAULT_GENERATED_DOOR_SPEC } from "./types";

describe("generated door settings", () => {
  it("creates defaults from the current grid DPI", () => {
    expect(readGeneratedDoorSettings({}, 150)).toMatchObject({ width: 150, thickness: 37.5, openAngle: 90 });
  });

  it("migrates settings saved before a DPI basis was recorded", () => {
    const metadata = { [GENERATED_DOOR_SETTINGS_KEY]: { ...DEFAULT_GENERATED_DOOR_SPEC } };
    expect(readGeneratedDoorSettings(metadata, 150)).toMatchObject({ width: 150, thickness: 37.5 });
  });

  it("preserves grid-cell dimensions across scenes with different DPI", () => {
    const metadata = { [GENERATED_DOOR_SETTINGS_KEY]: { ...DEFAULT_GENERATED_DOOR_SPEC, width: 300, thickness: 75, settingsDpi: 150 } };
    expect(readGeneratedDoorSettings(metadata, 100)).toMatchObject({ width: 200, thickness: 50 });
  });

  it("repairs the minimum thickness accidentally persisted by the old controlled input", () => {
    const metadata = { [GENERATED_DOOR_SETTINGS_KEY]: { ...DEFAULT_GENERATED_DOOR_SPEC, thickness: 4, settingsDpi: 100 } };
    expect(readGeneratedDoorSettings(metadata, 150).thickness).toBe(37.5);
  });
});
