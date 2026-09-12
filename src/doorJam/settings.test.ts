import { describe, expect, it } from "vitest";
import { DOORJAM_SETTINGS_KEY } from "../constants";
import { readDoorJamSettings } from "./settings";

describe("DoorJam scene settings", () => {
  it("allows player operation by default", () => {
    expect(readDoorJamSettings({}).playersCanOperate).toBe(true);
  });

  it("reads an explicit scene-wide denial", () => {
    expect(readDoorJamSettings({ [DOORJAM_SETTINGS_KEY]: { playersCanOperate: false } }).playersCanOperate).toBe(false);
  });
});
