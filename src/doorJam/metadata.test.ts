import type { Item } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import { DOORJAM_METADATA_KEY } from "../constants";
import { countDoorLinks, readDoorJamMetadata, removeDoorLink, writeDoorJamMetadata, type DoorJamMetadata } from "./metadata";
const artwork = { image: { url: "door.png", width: 10, height: 10, mime: "image/png" }, grid: { dpi: 150, offset: { x: 0, y: 0 } } };
const item = (metadata: unknown): Item => ({ metadata: { [DOORJAM_METADATA_KEY]: metadata } } as unknown as Item);
const core = { closedImage: artwork, openImage: artwork, renderedState: "open" as const };

describe("DoorJam metadata v4", () => {
  it.each([
    [1, { fogItemId: "fog", doorIndex: 0 }],
    [2, { provider: "dynamic-fog", fogItemId: "fog", doorIndex: 0 }],
    [3, { provider: "dynamic-fog", fogItemId: "fog", doorIndex: 0 }],
  ])("migrates v%s Dynamic Fog metadata", (version, fogDoor) => {
    expect(readDoorJamMetadata(item({ version, fogDoor, ...core }))).toEqual(expect.objectContaining({ version: 4, links: { dynamicFog: { fogItemId: "fog", doorIndex: 0 } } }));
  });
  it("migrates v3 Smoke metadata", () => {
    expect(readDoorJamMetadata(item({ version: 3, fogDoor: { provider: "smoke", doorItemId: "smoke" }, ...core }))?.links).toEqual({ smoke: { doorItemId: "smoke" } });
  });
  it.each([2, 3])("migrates standalone v%s", (version) => expect(readDoorJamMetadata(item({ version, ...core }))?.links).toBeUndefined());
  it("retains every valid v4 link while dropping a malformed optional link", () => {
    const metadata = readDoorJamMetadata(item({ version: 4, links: { dynamicFog: { fogItemId: "fog", doorIndex: 1 }, smoke: { doorItemId: 4 }, stageManager: { itemId: "lift" } }, ...core }));
    expect(metadata?.links).toEqual({ dynamicFog: { fogItemId: "fog", doorIndex: 1 }, stageManager: { itemIds: ["lift"] } });
  });
  it("writes all three links and removes only the selected one", () => {
    const target = item({});
    const metadata: DoorJamMetadata = { version: 4, links: { dynamicFog: { fogItemId: "fog", doorIndex: 1 }, smoke: { doorItemId: "smoke" }, stageManager: { itemIds: ["lift", "lift-2"] } }, ...core };
    writeDoorJamMetadata(target, metadata); removeDoorLink(target, metadata, "smoke");
    expect(readDoorJamMetadata(target)?.links).toEqual({ dynamicFog: { fogItemId: "fog", doorIndex: 1 }, stageManager: { itemIds: ["lift", "lift-2"] } });
  });
  it("counts zero through three links", () => {
    for (const [links, count] of [[undefined, 0], [{ dynamicFog: { fogItemId: "f", doorIndex: 0 } }, 1], [{ dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" } }, 2], [{ dynamicFog: { fogItemId: "f", doorIndex: 0 }, smoke: { doorItemId: "s" }, stageManager: { itemIds: ["e", "e2"] } }, 3]] as const)
      expect(countDoorLinks({ version: 4, links, ...core })).toBe(count);
  });
  it("normalizes the initial single-Elevator v4 shape", () => {
    expect(readDoorJamMetadata(item({ version: 4, links: { stageManager: { itemId: "legacy-lift" } }, ...core }))?.links)
      .toEqual({ stageManager: { itemIds: ["legacy-lift"] } });
  });
});
