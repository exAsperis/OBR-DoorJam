import { Command, type Image, type Item, type Path } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import { DOORJAM_METADATA_KEY } from "../constants";
import { DYNAMIC_FOG_DOORS_KEY } from "../dynamicFog/adapter";
import { buildDoorListEntries } from "./useDoorJamDoors";

const artwork = { image: { url: "closed.png", width: 10, height: 10, mime: "image/png" }, grid: { dpi: 150, offset: { x: 0, y: 0 } } };

function image(id: string, name: string, fogItemId: string): Image {
  return { id, type: "IMAGE", name, layer: "PROP", visible: true, locked: true, createdUserId: "gm", zIndex: 1,
    lastModified: "", lastModifiedUserId: "gm", position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 },
    metadata: { [DOORJAM_METADATA_KEY]: { version: 1, fogDoor: { fogItemId, doorIndex: 0 }, closedImage: artwork, openImage: artwork, renderedState: "closed" } },
    image: artwork.image, grid: artwork.grid, text: {}, textItemType: "PLAIN" } as unknown as Image;
}

function fog(): Path {
  return { id: "fog", type: "PATH", name: "Fog", layer: "FOG", visible: true, locked: false, createdUserId: "gm", zIndex: 0,
    lastModified: "", lastModifiedUserId: "gm", position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 },
    metadata: { [DYNAMIC_FOG_DOORS_KEY]: [{ open: true, start: { index: 0, distance: 0 }, end: { index: 0, distance: 10 } }] },
    commands: [[Command.MOVE, 0, 0], [Command.LINE, 10, 0]], fillRule: "NONZERO", style: { fillColor: "", fillOpacity: 0, strokeColor: "", strokeOpacity: 1, strokeWidth: 1, strokeDash: [] } };
}

describe("buildDoorListEntries", () => {
  it("sorts linked images by name and keeps invalid links visible", () => {
    const entries = buildDoorListEntries([image("b", "Zulu", "missing"), fog(), image("a", "alpha", "fog")] as Item[]);
    expect(entries.map(({ name, state, linkValid }) => ({ name, state, linkValid }))).toEqual([
      { name: "alpha", state: "open", linkValid: true },
      { name: "Zulu", state: "closed", linkValid: false },
    ]);
  });

  it("treats standalone doors as valid and operable", () => {
    const standalone = image("standalone", "Standalone", "unused");
    standalone.metadata[DOORJAM_METADATA_KEY] = { version: 2, closedImage: artwork, openImage: artwork, renderedState: "open" };
    expect(buildDoorListEntries([standalone])).toEqual([
      expect.objectContaining({ id: "standalone", state: "open", linkValid: true, hasFogLink: false, hasOpenArtwork: true }),
    ]);
  });
});
