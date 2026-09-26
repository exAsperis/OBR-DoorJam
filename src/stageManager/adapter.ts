import OBR from "@owlbear-rodeo/sdk";

export const ELEVATOR_DISABLED_REQUEST_CHANNEL = "com.ex-asperis.obr-stage-manager/api/v1/elevator/disabled";
export const ELEVATOR_DISABLED_RESULT_CHANNEL = `${ELEVATOR_DISABLED_REQUEST_CHANNEL}/result`;
export const ELEVATOR_LIST_REQUEST_CHANNEL = "com.ex-asperis.obr-stage-manager/api/v1/elevator/list";
export const ELEVATOR_LIST_RESULT_CHANNEL = `${ELEVATOR_LIST_REQUEST_CHANNEL}/result`;
const TIMEOUT_MS = 1_250;

export interface StageManagerElevator { itemId: string; name: string; disabled: boolean }
export type StageManagerFailureReason = "unavailable" | "unauthorized" | "invalid-request" | "item-not-found" | "not-elevator" | "update-failed" | "list-failed";
export type StageManagerResult<T> = { ok: true; value: T } | { ok: false; reason: StageManagerFailureReason; message: string };

function failure(value: Record<string, unknown>): StageManagerResult<never> {
  const reasons: StageManagerFailureReason[] = ["unauthorized", "invalid-request", "item-not-found", "not-elevator", "update-failed", "list-failed"];
  const reason = reasons.includes(value.reason as StageManagerFailureReason) ? value.reason as StageManagerFailureReason : "unavailable";
  return { ok: false, reason, message: typeof value.message === "string" ? value.message : "Stage Manager could not complete the request." };
}

async function request<T>(requestChannel: string, resultChannel: string, payload: Record<string, unknown>, parse: (value: Record<string, unknown>) => T | null): Promise<StageManagerResult<T>> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: StageManagerResult<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      remove();
      resolve(result);
    };
    const remove = OBR.broadcast.onMessage(resultChannel, (event) => {
      const value = event.data;
      if (!value || typeof value !== "object") return;
      const data = value as Record<string, unknown>;
      if (data.requestId !== requestId) return;
      if (data.ok !== true) return finish(failure(data));
      const parsed = parse(data);
      finish(parsed === null
        ? { ok: false, reason: requestChannel === ELEVATOR_LIST_REQUEST_CHANNEL ? "list-failed" : "update-failed", message: "Stage Manager returned an invalid response." }
        : { ok: true, value: parsed });
    });
    timer = setTimeout(() => finish({ ok: false, reason: "unavailable", message: "Stage Manager is unavailable or not responding." }), TIMEOUT_MS);
    void OBR.broadcast.sendMessage(requestChannel, { requestId, ...payload }, { destination: "LOCAL" })
      .catch(() => finish({ ok: false, reason: "unavailable", message: "Stage Manager is unavailable or not responding." }));
  });
}

export function listStageManagerElevators(): Promise<StageManagerResult<StageManagerElevator[]>> {
  return request(ELEVATOR_LIST_REQUEST_CHANNEL, ELEVATOR_LIST_RESULT_CHANNEL, {}, (data) => {
    if (!Array.isArray(data.elevators)) return null;
    const elevators = data.elevators.filter((entry): entry is StageManagerElevator => Boolean(entry) && typeof entry === "object"
      && typeof entry.itemId === "string" && typeof entry.name === "string" && typeof entry.disabled === "boolean");
    return elevators.length === data.elevators.length ? elevators : null;
  });
}

export function setStageManagerElevatorDisabled(itemId: string, disabled: boolean): Promise<StageManagerResult<void>> {
  return request(ELEVATOR_DISABLED_REQUEST_CHANNEL, ELEVATOR_DISABLED_RESULT_CHANNEL, { itemId, disabled }, () => undefined);
}
