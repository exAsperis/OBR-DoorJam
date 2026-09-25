import { describe, expect, it } from "vitest";
import { areCoincidentDoorSpans } from "./geometry";

describe("areCoincidentDoorSpans", () => {
  it.each([
    ["identical segments", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }], true],
    ["reversed segments", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 10, y: 0 }, { x: 0, y: 0 }], true],
    ["an intermediate point", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], true],
    ["numerically separated segments", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0.002 }, { x: 10, y: 0.002 }], false],
    ["visibly parallel segments", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 1 }, { x: 10, y: 1 }], false],
    ["crossing segments", [{ x: -5, y: 0 }, { x: 5, y: 0 }], [{ x: 0, y: -5 }, { x: 0, y: 5 }], false],
    ["endpoint touching", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 10, y: 0 }, { x: 20, y: 0 }], false],
    ["partial overlap", [{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 5, y: 0 }, { x: 15, y: 0 }], false],
    ["different intermediate geometry", [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 5, y: 2 }, { x: 10, y: 0 }], false],
    ["identical sampled curves", [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 5, y: 2 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 5, y: 2 }, { x: 10, y: 0 }], true],
  ])("classifies %s", (_name, a, b, expected) => {
    expect(areCoincidentDoorSpans(a, b)).toBe(expected);
  });
});
