import type { Item } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import { DOORJAM_METADATA_KEY } from "../constants";
import { readDoorJamMetadata, removeFogDoorLink, writeDoorJamMetadata } from "./metadata";

const artwork = { image: { url: "door.png", width: 10, height: 10, mime: "image/png" }, grid: { dpi: 150, offset: { x: 0, y: 0 } } };
const item = (metadata: unknown): Item => ({ metadata: { [DOORJAM_METADATA_KEY]: metadata } } as unknown as Item);

describe("DoorJam metadata", () => {
  it("normalizes version 1 linked metadata to version 2", () => {
    const metadata = readDoorJamMetadata(item({ version: 1, fogDoor: { fogItemId: "fog", doorIndex: 0 }, closedImage: artwork, renderedState: "closed" }));
    expect(metadata).toEqual(expect.objectContaining({ version: 2, fogDoor: { fogItemId: "fog", doorIndex: 0 } }));
  });

  it("reads and writes standalone version 2 metadata", () => {
    const target = item({});
    writeDoorJamMetadata(target, { version: 2, closedImage: artwork, openImage: artwork, renderedState: "open" });
    expect(readDoorJamMetadata(target)).toEqual(expect.objectContaining({ version: 2, renderedState: "open" }));
  });

  it("removes only the optional fog reference", () => {
    const target = item({});
    const metadata = { version: 2 as const, fogDoor: { fogItemId: "missing", doorIndex: 2 }, closedImage: artwork, openImage: artwork, renderedState: "open" as const };
    removeFogDoorLink(target, metadata);
    expect(readDoorJamMetadata(target)).toEqual({ version: 2, closedImage: artwork, openImage: artwork, renderedState: "open" });
  });
});
