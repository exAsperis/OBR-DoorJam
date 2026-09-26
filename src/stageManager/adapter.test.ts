import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ on: vi.fn(), send: vi.fn(), listener: undefined as undefined | ((event: { data: unknown }) => void), remove: vi.fn() }));
vi.mock("@owlbear-rodeo/sdk", () => ({ default: { broadcast: {
  onMessage: mocks.on.mockImplementation((_channel, listener) => { mocks.listener = listener; return mocks.remove; }),
  sendMessage: mocks.send,
} } }));
import { ELEVATOR_DISABLED_REQUEST_CHANNEL, ELEVATOR_DISABLED_RESULT_CHANNEL, ELEVATOR_LIST_REQUEST_CHANNEL, ELEVATOR_LIST_RESULT_CHANNEL, listStageManagerElevators, setStageManagerElevatorDisabled } from "./adapter";
describe("Stage Manager public API adapter", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.listener = undefined; mocks.send.mockImplementation(async (_channel, request) => {
    mocks.listener?.({ data: { requestId: "unrelated", ok: true, elevators: [] } });
    mocks.listener?.({ data: { requestId: request.requestId, ok: true, elevators: [] } });
  }); });
  it("registers before sending, correlates list results, and uses LOCAL", async () => {
    await expect(listStageManagerElevators()).resolves.toEqual({ ok: true, value: [] });
    expect(mocks.on).toHaveBeenCalledWith(ELEVATOR_LIST_RESULT_CHANNEL, expect.any(Function));
    expect(mocks.send).toHaveBeenCalledWith(ELEVATOR_LIST_REQUEST_CHANNEL, expect.objectContaining({ requestId: expect.any(String) }), { destination: "LOCAL" });
    expect(mocks.on.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
  it("uses the disabled endpoint and maps failures", async () => {
    mocks.send.mockImplementation(async (_channel, request) => mocks.listener?.({ data: { requestId: request.requestId, ok: false, reason: "not-elevator", message: "No elevator" } }));
    await expect(setStageManagerElevatorDisabled("lift", true)).resolves.toEqual({ ok: false, reason: "not-elevator", message: "No elevator" });
    expect(mocks.on).toHaveBeenCalledWith(ELEVATOR_DISABLED_RESULT_CHANNEL, expect.any(Function));
    expect(mocks.send).toHaveBeenCalledWith(ELEVATOR_DISABLED_REQUEST_CHANNEL, expect.objectContaining({ itemId: "lift", disabled: true }), { destination: "LOCAL" });
  });
  it("times out and removes its listener", async () => {
    vi.useFakeTimers(); mocks.send.mockResolvedValue(undefined);
    const pending = listStageManagerElevators(); await vi.advanceTimersByTimeAsync(1_251);
    await expect(pending).resolves.toMatchObject({ ok: false, reason: "unavailable" });
    expect(mocks.remove).toHaveBeenCalledOnce(); vi.useRealTimers();
  });
});
