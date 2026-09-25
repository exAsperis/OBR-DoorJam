import type { Item } from "@owlbear-rodeo/sdk";
import { getDoorState as getDynamicState, lookupDoor as lookupDynamic, setDoorState as setDynamicState } from "../dynamicFog/adapter";
import { lookupSmokeDoor, getSmokeDoorState, setSmokeDoorState } from "../smoke/adapter";
import type { FogDoorLink } from "./metadata";

export type ProviderDoorLookup = { ok: true; open: boolean } | { ok: false; reason: string };

export function providerName(link: FogDoorLink): string {
  return link.provider === "smoke" ? "Smoke & Spectre" : "Dynamic Fog";
}

export function lookupProviderDoor(items: Item[], link: FogDoorLink): ProviderDoorLookup {
  if (link.provider === "smoke") return lookupSmokeDoor(items, link);
  const result = lookupDynamic(items, link);
  return result.ok ? { ok: true, open: result.door.open } : result;
}

export async function getProviderDoorState(link: FogDoorLink): Promise<ProviderDoorLookup> {
  if (link.provider === "smoke") return getSmokeDoorState(link);
  const result = await getDynamicState(link);
  return result.ok ? { ok: true, open: result.door.open } : result;
}

export async function setProviderDoorState(link: FogDoorLink, open: boolean): Promise<ProviderDoorLookup> {
  if (link.provider === "smoke") return setSmokeDoorState(link, open);
  const result = await setDynamicState(link, open);
  return result.ok ? { ok: true, open: result.door.open } : result;
}
