import OBR, { isImage, type Item } from "@owlbear-rodeo/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { lookupDoor } from "../dynamicFog/adapter";
import { readDoorJamMetadata } from "../doorJam/metadata";
import { readDoorJamSettings } from "../doorJam/settings";

export interface DoorListEntry {
  id: string;
  name: string;
  thumbnailUrl: string;
  state: "open" | "closed" | null;
  linkValid: boolean;
  hasFogLink: boolean;
  hasOpenArtwork: boolean;
  locked: boolean;
}

export function buildDoorListEntries(items: Item[]): DoorListEntry[] {
  return items.filter(isImage).flatMap((image) => {
    const metadata = readDoorJamMetadata(image);
    if (!metadata) return [];
    const linkedDoor = metadata.fogDoor ? lookupDoor(items, metadata.fogDoor) : null;
    const state: DoorListEntry["state"] = linkedDoor?.ok ? (linkedDoor.door.open ? "open" : "closed") : metadata.renderedState;
    return [{ id: image.id, name: image.name, thumbnailUrl: image.image.url,
      state,
      linkValid: !metadata.fogDoor || Boolean(linkedDoor?.ok), hasFogLink: Boolean(metadata.fogDoor), hasOpenArtwork: Boolean(metadata.openImage), locked: metadata.locked === true }];
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
