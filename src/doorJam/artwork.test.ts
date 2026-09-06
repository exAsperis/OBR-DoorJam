import type { Image } from "@owlbear-rodeo/sdk";
import { describe, expect, it } from "vitest";
import { applyArtwork } from "./artwork";

function image(): Image {
  return {
    id: "door", type: "IMAGE", layer: "PROP", name: "Door", visible: true, locked: false,
    createdUserId: "gm", zIndex: 0, lastModified: "", lastModifiedUserId: "gm",
    position: { x: 0, y: 0 }, rotation: 0, scale: { x: 2, y: 3 }, metadata: {},
    image: { url: "closed.png", mime: "image/png", width: 100, height: 200 },
    grid: { dpi: 100, offset: { x: 0, y: 0 } },
    text: {
      type: "PLAIN", plainText: "", richText: [], width: "AUTO", height: "AUTO",
      style: { fillColor: "#fff", fillOpacity: 1, strokeColor: "#000", strokeOpacity: 1, strokeWidth: 0, textAlign: "CENTER", textAlignVertical: "MIDDLE", fontFamily: "Inter", fontSize: 16, fontWeight: 400, lineHeight: 1.2, padding: 0 },
    }, textItemType: "LABEL",
  };
}

describe("artwork swapping", () => {
  it("preserves the scene footprint when image dimensions differ", () => {
    const target = image();
    applyArtwork(target, {
      image: { url: "open.png", mime: "image/png", width: 400, height: 100 },
      grid: { dpi: 100, offset: { x: 0, y: 0 } },
    });
    expect(target.image.url).toBe("open.png");
    expect(target.scale).toEqual({ x: 0.5, y: 6 });
  });
});
