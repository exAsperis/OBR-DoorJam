import type { Item } from "@owlbear-rodeo/sdk";
import { lookupDoor as lookupDynamic, setDoorState as setDynamicState } from "../dynamicFog/adapter";
import { lookupSmokeDoor, setSmokeDoorState } from "../smoke/adapter";
import type { DoorJamMetadata, DoorLinkKind, DynamicFogLink, SmokeLink } from "./metadata";

export const INTEGRATION_NAMES: Record<DoorLinkKind, string> = {
  dynamicFog: "Dynamic Fog",
  smoke: "Smoke & Spectre!",
  stageManager: "Stage Manager Elevator",
};
export type ProviderDoorLookup = { ok: true; open: boolean } | { ok: false; reason: string };
export function lookupDynamicFogDoor(items: Item[], link: DynamicFogLink): ProviderDoorLookup {
  const result = lookupDynamic(items, link);
  return result.ok ? { ok: true, open: result.door.open } : result;
}
export function lookupSmokeLinkedDoor(items: Item[], link: SmokeLink): ProviderDoorLookup { return lookupSmokeDoor(items, link); }
export async function setDynamicFogDoorState(link: DynamicFogLink, open: boolean): Promise<ProviderDoorLookup> {
  const result = await setDynamicState(link, open);
  // updateItems callback values may be Immer proxies that are revoked once the
  // transaction completes. The requested state is authoritative on success.
  return result.ok ? { ok: true, open } : result;
}
export async function setSmokeLinkedDoorState(link: SmokeLink, open: boolean): Promise<ProviderDoorLookup> { return setSmokeDoorState(link, open); }

export function resolveFogProviderState(items: Item[], metadata: DoorJamMetadata): ProviderDoorLookup | null {
  const results = [
    metadata.links?.dynamicFog ? lookupDynamicFogDoor(items, metadata.links.dynamicFog) : null,
    metadata.links?.smoke ? lookupSmokeLinkedDoor(items, metadata.links.smoke) : null,
  ].filter((value): value is ProviderDoorLookup => value !== null);
  const valid = results.filter((value): value is { ok: true; open: boolean } => value.ok);
  if (!results.length || !valid.length) return null;
  if (valid.length === 2 && valid[0].open !== valid[1].open) return null;
  return valid[0];
}
