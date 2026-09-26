import { describe, expect, it, vi } from "vitest";
vi.mock("../dynamicFog/adapter", () => ({ lookupDoor: vi.fn((_items, link) => link.fogItemId === "missing" ? { ok: false, reason: "missing-item" } : { ok: true, door: { open: link.fogItemId === "open" } }), setDoorState: vi.fn() }));
vi.mock("../smoke/adapter", () => ({ lookupSmokeDoor: vi.fn((_items, link) => link.doorItemId === "missing" ? { ok: false, reason: "missing-item" } : { ok: true, open: link.doorItemId === "open" }), setSmokeDoorState: vi.fn() }));
import { resolveFogProviderState } from "./providers";
const metadata = (dynamicFog?: string, smoke?: string) => ({ version: 4 as const, closedImage: {} as never, renderedState: "closed" as const,
  links: { ...(dynamicFog ? { dynamicFog: { fogItemId: dynamicFog, doorIndex: 0 } } : {}), ...(smoke ? { smoke: { doorItemId: smoke } } : {}) } });
describe("fog reverse synchronization resolution", () => {
  it("uses one valid provider", () => expect(resolveFogProviderState([], metadata("open"))).toEqual({ ok: true, open: true }));
  it("uses the valid provider when the other is missing", () => expect(resolveFogProviderState([], metadata("missing", "open"))).toEqual({ ok: true, open: true }));
  it("uses an agreed state", () => expect(resolveFogProviderState([], metadata("open", "open"))).toEqual({ ok: true, open: true }));
  it("does not choose when valid providers disagree", () => expect(resolveFogProviderState([], metadata("open", "closed"))).toBeNull());
  it("ignores Stage Manager for reverse synchronization", () => expect(resolveFogProviderState([], { ...metadata(), links: { stageManager: { itemIds: ["lift"] } } })).toBeNull());
});
