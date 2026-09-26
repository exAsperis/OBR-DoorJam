import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { INTEGRATION_NAMES, lookupDynamicFogDoor, lookupSmokeLinkedDoor, resolveFogProviderState } from "../doorJam/providers";
import { readDoorJamMetadata } from "../doorJam/metadata";
import { readDoorJamSettings } from "../doorJam/settings";

export interface DoorListEntry {
  id: string;
  name: string;
  thumbnailUrl: string;
  state: "open" | "closed" | null;
  integrations?: string[];
  linkWarning?: string;
  /** Legacy view fields retained for component consumers during migration. */
  linkValid?: boolean;
  hasFogLink?: boolean;
  provider?: string | null;
  hasOpenArtwork: boolean;
  locked: boolean;
}

export function buildDoorListEntries(items: Item[]): DoorListEntry[] {
  return items.filter(isImage).flatMap((image) => {
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return [];
    const resolved = resolveFogProviderState(items, metadata);
    const state: DoorListEntry["state"] = resolved?.ok ? (resolved.open ? "open" : "closed") : metadata.renderedState;
    const integrations = [
      metadata.links?.dynamicFog ? INTEGRATION_NAMES.dynamicFog : null,
      metadata.links?.smoke ? INTEGRATION_NAMES.smoke : null,
      metadata.links?.stageManager ? INTEGRATION_NAMES.stageManager : null,
    ].filter((name): name is string => Boolean(name));
    const stale = [
      metadata.links?.dynamicFog && !lookupDynamicFogDoor(items, metadata.links.dynamicFog).ok ? INTEGRATION_NAMES.dynamicFog : null,
      metadata.links?.smoke && !lookupSmokeLinkedDoor(items, metadata.links.smoke).ok ? INTEGRATION_NAMES.smoke : null,
    ].filter((name): name is string => Boolean(name));
    return [{ id: image.id, name: image.name, thumbnailUrl: image.image.url,
      state,
      integrations, linkWarning: stale.length ? `${stale.join(" and ")} link unavailable — operating standalone` : undefined,
      linkValid: stale.length === 0, hasFogLink: Boolean(metadata.links?.dynamicFog || metadata.links?.smoke),
      provider: integrations[0] ?? null, hasOpenArtwork: Boolean(metadata.openImage), locked: metadata.locked === true }];
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id));
}

export function useDoorJamDoors(enabled: boolean, sceneReady: boolean) {
  const [doors, setDoors] = useState<DoorListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playersCanOperate, setPlayersCanOperate] = useState(true);
  const active = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled || !sceneReady) {
      if (active.current) { setDoors([]); setError(null); setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      if (!(await OBR.scene.isReady())) {
        if (active.current) setDoors([]);
        return;
      }
      const [items, sceneMetadata] = await Promise.all([OBR.scene.items.getItems(), OBR.scene.getMetadata()]);
      if (active.current) { setDoors(buildDoorListEntries(items)); setPlayersCanOperate(readDoorJamSettings(sceneMetadata).playersCanOperate); setError(null); }
    } catch {
      if (active.current) setError("DoorJam could not read the current scene.");
    } finally { if (active.current) setLoading(false); }
  }, [enabled, sceneReady]);

  const renameDoor = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed || await OBR.player.getRole() !== "GM" || !(await OBR.scene.isReady())) return false;
    try {
      let updated = false;
      await OBR.scene.items.updateItems([id], (items) => {
        if (items[0] && readDoorJamMetadata(items[0])) { items[0].name = trimmed; updated = true; }
      });
      if (!updated) return false;
      await refresh();
      return true;
    } catch { return false; }
  }, [refresh]);

  useEffect(() => {
    active.current = true;
    let removeItems: (() => void) | undefined;
    let removeMetadata: (() => void) | undefined;
    if (enabled && sceneReady) {
      void refresh();
      removeItems = OBR.scene.items.onChange(() => void refresh());
      removeMetadata = OBR.scene.onMetadataChange(() => void refresh());
    } else { setDoors([]); setLoading(false); setError(null); }
    return () => { active.current = false; removeItems?.(); removeMetadata?.(); };
  }, [enabled, sceneReady, refresh]);

  return { doors, loading, error, playersCanOperate, refresh, renameDoor };
}
