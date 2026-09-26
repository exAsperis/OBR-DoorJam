import { describe, expect, it } from "vitest";
import { DOORJAM_TOOL_PREFERENCES_KEY } from "../constants";
import { readToolPreferences } from "./preferences";

describe("DoorJam tool preferences", () => {
  it("shows both provider tool sets by default", () => {
    expect(readToolPreferences({})).toEqual({ dynamicFog: true, smoke: true });
  });

  it("allows either provider tool set to be hidden independently", () => {
    expect(readToolPreferences({ [DOORJAM_TOOL_PREFERENCES_KEY]: { dynamicFog: false, smoke: true } }))
      .toEqual({ dynamicFog: false, smoke: true });
    expect(readToolPreferences({ [DOORJAM_TOOL_PREFERENCES_KEY]: { dynamicFog: true, smoke: false } }))
      .toEqual({ dynamicFog: true, smoke: false });
  });

  it("fails open for malformed or partial metadata", () => {
    expect(readToolPreferences({ [DOORJAM_TOOL_PREFERENCES_KEY]: { dynamicFog: "no", smoke: false } }))
      .toEqual({ dynamicFog: true, smoke: false });
  });
});
