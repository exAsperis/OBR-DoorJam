import { describe, expect, it } from "vitest";
import { chooseDoorEditHandle, doorSpansOverlap, proposeDoorEdit } from "./editGeometry";
import type { DynamicFogDoor } from "./types";

const door = (start = 20, end = 40, index = 0): DynamicFogDoor => ({ open: false, start: { index, distance: start }, end: { index, distance: end } });

describe("Dynamic Fog edit geometry", () => {
  it("resizes either endpoint without moving the other", () => {
    expect(proposeDoorEdit(door(), "start", 10, 20, 100)).toMatchObject({ ok: true, proposal: { start: { distance: 10 }, end: { distance: 40 } } });
    expect(proposeDoorEdit(door(), "end", 55, 40, 100)).toMatchObject({ ok: true, proposal: { start: { distance: 20 }, end: { distance: 55 } } });
  });
  it("moves the entire span, preserves length, and clamps at both ends", () => {
    expect(proposeDoorEdit(door(), "move", 50, 30, 100)).toMatchObject({ ok: true, proposal: { start: { distance: 40 }, end: { distance: 60 } } });
    expect(proposeDoorEdit(door(), "move", -100, 30, 100)).toMatchObject({ ok: true, proposal: { start: { distance: 0 }, end: { distance: 20 } } });
    expect(proposeDoorEdit(door(), "move", 200, 30, 50)).toMatchObject({ ok: true, proposal: { start: { distance: 30 }, end: { distance: 50 } } });
  });
  it("preserves reversed orientation and prevents crossing", () => {
    expect(proposeDoorEdit(door(40, 20), "move", 50, 30, 100)).toMatchObject({ ok: true, proposal: { start: { distance: 60 }, end: { distance: 40 } } });
    expect(proposeDoorEdit(door(40, 20), "start", 0, 40, 100)).toMatchObject({ ok: true, proposal: { start: { distance: 22 }, end: { distance: 20 } } });
  });
  it("rejects invalid contours, distances, and lengths", () => {
    expect(proposeDoorEdit({ ...door(), end: { index: 1, distance: 40 } }, "move", 1, 1, 100)).toEqual({ ok: false, reason: "invalid-contour" });
    expect(proposeDoorEdit(door(), "move", Number.NaN, 1, 100)).toEqual({ ok: false, reason: "invalid-distance" });
    expect(proposeDoorEdit(door(20, 21), "move", 1, 1, 100)).toEqual({ ok: false, reason: "invalid-length" });
    expect(proposeDoorEdit(door(), "move", 1, 1, 1)).toEqual({ ok: false, reason: "invalid-distance" });
  });
  it("does not mutate the original door", () => {
    const original = door();
    const snapshot = structuredClone(original);
    proposeDoorEdit(original, "start", 5, 20, 100);
    expect(original).toEqual(snapshot);
  });
  it("detects overlap only on the same contour", () => {
    expect(doorSpansOverlap(door(), door(30, 50))).toBe(true);
    expect(doorSpansOverlap(door(), door(40, 60))).toBe(false);
    expect(doorSpansOverlap(door(), door(42, 60), 3)).toBe(true);
    expect(doorSpansOverlap(door(), door(30, 50, 1))).toBe(false);
  });
  it("selects a unique nearby handle and rejects ambiguous hits", () => {
    const handles = [{ handle: "start" as const, position: { x: 0, y: 0 } }, { handle: "move" as const, position: { x: 10, y: 0 } }];
    expect(chooseDoorEditHandle({ x: 1, y: 0 }, handles, 6)).toBe("start");
    expect(chooseDoorEditHandle({ x: 5, y: 0 }, handles, 6)).toBeNull();
    expect(chooseDoorEditHandle({ x: 20, y: 0 }, handles, 6)).toBeNull();
  });
});
